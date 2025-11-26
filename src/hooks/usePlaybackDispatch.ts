import { useCallback, useState } from 'react';

import { useLogStore } from '@/context/LogContext';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import {
    planProfilePlayback,
    type ProfilePlaybackAxisTarget,
} from '@/services/profilePlaybackPlanner';
import type { CalibrationProfile, MirrorConfig, Pattern } from '@/types';

export interface PlaybackResult {
    success: boolean;
    message: string;
    axisCount?: number;
}

interface PlaybackConfig {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

export function usePlaybackDispatch(config: PlaybackConfig) {
    const { moveMotor } = useMotorCommands();
    const { logInfo, logError } = useLogStore();
    const [isPlaying, setIsPlaying] = useState(false);

    const dispatchTargets = useCallback(
        async (targets: ProfilePlaybackAxisTarget[], patternName: string): Promise<void> => {
            if (targets.length === 0) {
                throw new Error('No playable motors found for this pattern.');
            }
            const settled = await Promise.allSettled(
                targets.map((target) =>
                    moveMotor({
                        mac: target.motor.nodeMac,
                        motorId: target.motor.motorIndex,
                        positionSteps: target.targetSteps,
                    }),
                ),
            );
            const failures = settled.filter(
                (entry): entry is PromiseRejectedResult => entry.status === 'rejected',
            );
            if (failures.length > 0) {
                const message = `${failures.length}/${targets.length} motor commands failed for "${patternName}".`;
                logError('Playback', message);
                throw new Error(message);
            }
            logInfo('Playback', `Sent ${targets.length} axis moves for "${patternName}".`);
        },
        [logError, logInfo, moveMotor],
    );

    const playSinglePattern = useCallback(
        async (pattern: Pattern, profile: CalibrationProfile): Promise<PlaybackResult> => {
            const plan = planProfilePlayback({
                gridSize: config.gridSize,
                mirrorConfig: config.mirrorConfig,
                profile,
                pattern,
            });

            if (plan.errors.length > 0) {
                logError('Playback', plan.errors[0].message);
                return { success: false, message: plan.errors[0].message };
            }

            try {
                setIsPlaying(true);
                await dispatchTargets(plan.playableAxisTargets, pattern.name);
                return {
                    success: true,
                    message: `Played "${pattern.name}"`,
                    axisCount: plan.playableAxisTargets.length,
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Playback failed';
                return { success: false, message };
            } finally {
                setIsPlaying(false);
            }
        },
        [config.gridSize, config.mirrorConfig, dispatchTargets, logError],
    );

    const playPatternSequence = useCallback(
        async (
            patterns: Pattern[],
            profile: CalibrationProfile,
            delayMs = 500,
        ): Promise<PlaybackResult> => {
            if (patterns.length === 0) {
                return { success: false, message: 'No patterns in sequence.' };
            }

            setIsPlaying(true);
            try {
                for (let i = 0; i < patterns.length; i++) {
                    const pattern = patterns[i];
                    const plan = planProfilePlayback({
                        gridSize: config.gridSize,
                        mirrorConfig: config.mirrorConfig,
                        profile,
                        pattern,
                    });

                    if (plan.errors.length > 0) {
                        throw new Error(`Pattern "${pattern.name}": ${plan.errors[0].message}`);
                    }

                    await dispatchTargets(plan.playableAxisTargets, pattern.name);

                    if (i < patterns.length - 1) {
                        await new Promise((resolve) => setTimeout(resolve, delayMs));
                    }
                }
                return { success: true, message: 'Sequence completed successfully.' };
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Sequence playback failed';
                logError('Playback', message);
                return { success: false, message };
            } finally {
                setIsPlaying(false);
            }
        },
        [config.gridSize, config.mirrorConfig, dispatchTargets, logError],
    );

    return {
        playSinglePattern,
        playPatternSequence,
        isPlaying,
    };
}
