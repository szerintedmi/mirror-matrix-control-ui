import { useCallback, useRef, useState, type RefObject } from 'react';

import { showCommandErrorToast } from '@/components/common/StyledToast';
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
    SegmentAxisMove,
} from '@/types/animation';
import type { CommandErrorDetail } from '@/types/commandError';
import { extractCommandErrorDetail } from '@/utils/commandErrors';

// Helper to wait with stop check
const delay = (ms: number, stopRef: RefObject<boolean | null>): Promise<boolean> => {
    return new Promise((resolve) => {
        const checkInterval = 50;
        let elapsed = 0;
        const interval = setInterval(() => {
            elapsed += checkInterval;
            if (stopRef.current) {
                clearInterval(interval);
                resolve(false);
            } else if (elapsed >= ms) {
                clearInterval(interval);
                resolve(true);
            }
        }, checkInterval);
    });
};

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
     * Execute motor moves for given axis moves.
     */
    const executeMoves = useCallback(
        async (
            moves: SegmentAxisMove[],
            speedSps: number,
        ): Promise<{ success: boolean; failures: CommandErrorDetail[] }> => {
            if (moves.length === 0) {
                return { success: true, failures: [] };
            }

            const movePromises = moves.map((move) =>
                moveMotor({
                    mac: move.motor.nodeMac,
                    motorId: move.motor.motorIndex,
                    positionSteps: move.targetSteps,
                    speedSps,
                }),
            );

            const results = await Promise.allSettled(movePromises);

            const failures: CommandErrorDetail[] = [];
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const move = moves[index];
                    failures.push(
                        extractCommandErrorDetail(result.reason, {
                            controller: move.motor.nodeMac,
                            motorId: move.motor.motorIndex,
                        }),
                    );
                }
            });

            return { success: failures.length === 0, failures };
        },
        [moveMotor],
    );

    /**
     * Execute all motor moves for a segment (parallel execution).
     */
    const executeSegment = useCallback(
        async (
            segment: AnimationSegmentPlan,
        ): Promise<{ success: boolean; failureCount: number; failures: CommandErrorDetail[] }> => {
            const result = await executeMoves(segment.axisMoves, segment.speedSps);
            return {
                success: result.success,
                failureCount: result.failures.length,
                failures: result.failures,
            };
        },
        [executeMoves],
    );

    /**
     * Run a single mirror through all segments continuously.
     * Used for sequential mode staggered playback.
     * moveMotor already waits for firmware DONE, so no artificial delay needed.
     */
    const runMirrorPath = useCallback(
        async (
            mirrorId: string,
            plan: AnimationPlaybackPlan,
        ): Promise<{ success: boolean; failures: CommandErrorDetail[] }> => {
            const allFailures: CommandErrorDetail[] = [];

            for (let i = 0; i < plan.segments.length; i++) {
                if (stopRequestedRef.current) break;

                const segment = plan.segments[i];
                const mirrorMoves = segment.axisMoves.filter((m) => m.mirrorId === mirrorId);

                if (mirrorMoves.length === 0) continue;

                // Execute moves - resolves when firmware sends DONE
                const result = await executeMoves(mirrorMoves, segment.speedSps);
                allFailures.push(...result.failures);

                // No delay needed - DONE means motor arrived, proceed immediately
            }

            return { success: allFailures.length === 0, failures: allFailures };
        },
        [executeMoves],
    );

    /**
     * Execute sequential mode with staggered starts.
     * Phase 1: Move all mirrors to starting position simultaneously.
     * Phase 2: Each mirror runs its complete path, starting offsetMs apart.
     */
    const playSequentialAnimation = useCallback(
        async (
            plan: AnimationPlaybackPlan,
        ): Promise<{ success: boolean; failures: CommandErrorDetail[] }> => {
            if (!plan.mirrorOrder || plan.mirrorOrder.length === 0) {
                return { success: false, failures: [] };
            }

            const allFailures: CommandErrorDetail[] = [];

            // PHASE 1: Move all mirrors to starting position (first waypoint)
            const startSegment = plan.segments[0];
            if (startSegment && startSegment.axisMoves.length > 0) {
                // Move all mirrors to their starting positions simultaneously
                const startingMoves = startSegment.axisMoves.map((move) => ({
                    ...move,
                    targetSteps: move.fromSteps, // Move to starting position (waypoint 0)
                }));
                const startResult = await executeMoves(startingMoves, startSegment.speedSps);
                allFailures.push(...startResult.failures);
            }

            if (stopRequestedRef.current) {
                return { success: false, failures: allFailures };
            }

            // PHASE 2: Staggered animation through all segments
            const offsetMs = plan.offsetMs ?? 0;
            const mirrorPromises: Promise<{ success: boolean; failures: CommandErrorDetail[] }>[] =
                [];

            // Launch each mirror's path with staggered starts
            for (let i = 0; i < plan.mirrorOrder.length; i++) {
                if (stopRequestedRef.current) break;

                const mirrorId = plan.mirrorOrder[i];

                // Start this mirror's complete path animation
                mirrorPromises.push(runMirrorPath(mirrorId, plan));

                // Wait offset before starting next mirror (except for last one)
                if (i < plan.mirrorOrder.length - 1 && offsetMs > 0) {
                    const continued = await delay(offsetMs, stopRequestedRef);
                    if (!continued) break;
                }
            }

            // Wait for all mirrors to complete
            const results = await Promise.allSettled(mirrorPromises);
            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    allFailures.push(...result.value.failures);
                }
            });

            return { success: allFailures.length === 0, failures: allFailures };
        },
        [runMirrorPath, executeMoves],
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
                // Sequential mode with offset: use staggered starts
                if (plan.mode === 'sequential' && plan.mirrorOrder && plan.mirrorOrder.length > 0) {
                    const result = await playSequentialAnimation(plan);

                    if (stopRequestedRef.current) {
                        logInfo('Animation', 'Stopped by user');
                        setPlaybackState('stopped');
                        setCurrentSegment(null);
                        setTotalSegments(null);
                        return {
                            success: false,
                            message: 'Animation stopped by user.',
                            finalState: 'stopped',
                        };
                    }

                    if (!result.success && result.failures.length > 0) {
                        showCommandErrorToast({
                            title: 'Animation playback',
                            totalCount: plan.mirrorOrder.length * plan.segments.length,
                            errors: result.failures,
                        });
                    }

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
                }

                // Independent mode: segment-by-segment execution
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
                        showCommandErrorToast({
                            title: `Animation segment ${i + 1}`,
                            totalCount: segment.axisMoves.length,
                            errors: result.failures,
                        });
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
            playSequentialAnimation,
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
