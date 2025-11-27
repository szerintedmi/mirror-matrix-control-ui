import { useCallback, useRef, useState } from 'react';

import { useLogStore } from '@/context/LogContext';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import { planAnimation } from '@/services/animationPlanner';
import type { CalibrationProfile, MirrorConfig } from '@/types';
import type {
    Animation,
    AnimationPlaybackPlan,
    AnimationPlaybackResult,
    AnimationPlaybackState,
    AnimationSegmentPlan,
} from '@/types/animation';

// ============================================================================
// Types
// ============================================================================

interface AnimationPlaybackConfig {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

export interface AnimationPlaybackAPI {
    /** Execute animation playback */
    playAnimation: (
        animation: Animation,
        profile: CalibrationProfile,
    ) => Promise<AnimationPlaybackResult>;
    /** Stop currently playing animation */
    stopAnimation: () => void;
    /** Current playback state */
    playbackState: AnimationPlaybackState;
    /** Index of currently executing segment (null if not playing) */
    currentSegment: number | null;
    /** Total number of segments in current animation */
    totalSegments: number | null;
    /** Progress as fraction 0-1 */
    progress: number;
    /** Whether currently playing */
    isPlaying: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAnimationPlayback(config: AnimationPlaybackConfig): AnimationPlaybackAPI {
    const { moveMotor } = useMotorCommands();
    const { logInfo, logError, logWarning } = useLogStore();

    const [playbackState, setPlaybackState] = useState<AnimationPlaybackState>('idle');
    const [currentSegment, setCurrentSegment] = useState<number | null>(null);
    const [totalSegments, setTotalSegments] = useState<number | null>(null);

    // Ref for cancellation
    const stopRequestedRef = useRef(false);

    /**
     * Execute all motor moves for a segment.
     * All moves are dispatched in parallel with the calculated speed.
     */
    const executeSegment = useCallback(
        async (
            segment: AnimationSegmentPlan,
        ): Promise<{ success: boolean; failureCount: number }> => {
            if (segment.axisMoves.length === 0) {
                return { success: true, failureCount: 0 };
            }

            const movePromises = segment.axisMoves.map((move) =>
                moveMotor({
                    mac: move.motor.nodeMac,
                    motorId: move.motor.motorIndex,
                    positionSteps: move.targetSteps,
                    speedSps: segment.speedSps,
                }),
            );

            const results = await Promise.allSettled(movePromises);

            const failures = results.filter(
                (r): r is PromiseRejectedResult => r.status === 'rejected',
            );

            return {
                success: failures.length === 0,
                failureCount: failures.length,
            };
        },
        [moveMotor],
    );

    /**
     * Wait for segment completion (estimated duration + buffer).
     * Returns early if stop is requested.
     */
    const waitForSegmentCompletion = useCallback((durationMs: number): Promise<boolean> => {
        return new Promise((resolve) => {
            const checkInterval = 50; // Check stop flag every 50ms
            let elapsed = 0;

            const interval = setInterval(() => {
                elapsed += checkInterval;

                if (stopRequestedRef.current) {
                    clearInterval(interval);
                    resolve(false); // Stopped
                } else if (elapsed >= durationMs) {
                    clearInterval(interval);
                    resolve(true); // Completed
                }
            }, checkInterval);
        });
    }, []);

    /**
     * Execute animation playback.
     */
    const playAnimation = useCallback(
        async (
            animation: Animation,
            profile: CalibrationProfile,
        ): Promise<AnimationPlaybackResult> => {
            // Reset stop flag
            stopRequestedRef.current = false;

            // Plan the animation
            const plan: AnimationPlaybackPlan = planAnimation({
                animation,
                gridSize: config.gridSize,
                mirrorConfig: config.mirrorConfig,
                profile,
            });

            // Check for planning errors
            if (plan.errors.length > 0) {
                const errorMessage = plan.errors[0].message;
                logError('Animation', errorMessage);
                setPlaybackState('error');
                return {
                    success: false,
                    message: errorMessage,
                    finalState: 'error',
                };
            }

            if (plan.segments.length === 0) {
                const message = 'Animation has no playable segments.';
                logError('Animation', message);
                setPlaybackState('error');
                return {
                    success: false,
                    message,
                    finalState: 'error',
                };
            }

            // Log warnings
            for (const warning of plan.warnings) {
                logWarning('Animation', warning.message);
            }

            // Start playback
            setPlaybackState('playing');
            setTotalSegments(plan.segments.length);
            setCurrentSegment(0);

            logInfo(
                'Animation',
                `Playing "${animation.name}" (${plan.segments.length} segments, ~${Math.round(plan.totalDurationMs / 1000)}s)`,
            );

            try {
                for (let i = 0; i < plan.segments.length; i++) {
                    // Check for stop request
                    if (stopRequestedRef.current) {
                        logInfo('Animation', `Stopped at segment ${i + 1}/${plan.segments.length}`);
                        setPlaybackState('stopped');
                        setCurrentSegment(null);
                        setTotalSegments(null);
                        return {
                            success: false,
                            message: 'Animation stopped by user.',
                            segmentsCompleted: i,
                            totalSegments: plan.segments.length,
                            finalState: 'stopped',
                        };
                    }

                    setCurrentSegment(i);
                    const segment = plan.segments[i];

                    // Execute segment
                    const result = await executeSegment(segment);

                    if (!result.success) {
                        logError(
                            'Animation',
                            `Segment ${i + 1} failed: ${result.failureCount} motor commands failed`,
                        );
                        // Continue anyway - partial execution is better than stopping
                    }

                    // Wait for segment to complete (unless it's the last one)
                    if (i < plan.segments.length - 1) {
                        const completed = await waitForSegmentCompletion(segment.durationMs);
                        if (!completed) {
                            // Stopped during wait
                            logInfo('Animation', `Stopped during segment ${i + 1}`);
                            setPlaybackState('stopped');
                            setCurrentSegment(null);
                            setTotalSegments(null);
                            return {
                                success: false,
                                message: 'Animation stopped by user.',
                                segmentsCompleted: i + 1,
                                totalSegments: plan.segments.length,
                                finalState: 'stopped',
                            };
                        }
                    }
                }

                // Success
                logInfo('Animation', `Completed "${animation.name}"`);
                setPlaybackState('completed');
                setCurrentSegment(null);
                setTotalSegments(null);

                return {
                    success: true,
                    message: `Animation "${animation.name}" completed.`,
                    segmentsCompleted: plan.segments.length,
                    totalSegments: plan.segments.length,
                    finalState: 'completed',
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'Animation playback failed';
                logError('Animation', message);
                setPlaybackState('error');
                setCurrentSegment(null);
                setTotalSegments(null);

                return {
                    success: false,
                    message,
                    segmentsCompleted: currentSegment ?? 0,
                    totalSegments: plan.segments.length,
                    finalState: 'error',
                };
            }
        },
        [
            config.gridSize,
            config.mirrorConfig,
            executeSegment,
            waitForSegmentCompletion,
            logInfo,
            logError,
            logWarning,
            currentSegment,
        ],
    );

    /**
     * Request animation stop.
     */
    const stopAnimation = useCallback(() => {
        stopRequestedRef.current = true;
    }, []);

    // Calculate progress
    const progress =
        totalSegments !== null && currentSegment !== null
            ? (currentSegment + 1) / totalSegments
            : 0;

    const isPlaying = playbackState === 'playing';

    return {
        playAnimation,
        stopAnimation,
        playbackState,
        currentSegment,
        totalSegments,
        progress,
        isPlaying,
    };
}
