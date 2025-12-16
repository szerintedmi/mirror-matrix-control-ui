import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';

import { showCommandErrorToast } from '@/components/common/StyledToast';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import { useCommandFeedback } from '@/hooks/useCommandFeedback';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import { computePoseTargets, type StagingConfig } from '@/services/calibration';
import type {
    CalibrationRunnerState,
    CalibrationRunSummary,
    TileRunState,
} from '@/services/calibrationRunner';
import type { ArrayRotation, Motor, StagingPosition } from '@/types';
import type { CommandErrorDetail } from '@/types/commandError';
import { extractCommandErrorDetail } from '@/utils/commandErrors';

interface AxisTargetCommand {
    key: string;
    motor: Motor;
    steps: number;
}

const clampAxisSteps = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const rounded = Math.round(value);
    return Math.min(MOTOR_MAX_POSITION_STEPS, Math.max(MOTOR_MIN_POSITION_STEPS, rounded));
};

const computeAxisTargetSteps = (
    displacement: number,
    perStep: number | null | undefined,
): number | null => {
    if (perStep === null || perStep === undefined) {
        return null;
    }
    if (!Number.isFinite(perStep) || Math.abs(perStep) < 1e-6) {
        return null;
    }
    const rawSteps = displacement / perStep;
    if (!Number.isFinite(rawSteps)) {
        return null;
    }
    return clampAxisSteps(rawSteps);
};

const buildUniqueAxisTargets = (
    tiles: TileRunState[],
    resolveSteps: (entry: TileRunState, axis: 'x' | 'y') => number | null,
): AxisTargetCommand[] => {
    const axisMap = new Map<string, AxisTargetCommand>();
    tiles.forEach((entry) => {
        (['x', 'y'] as const).forEach((axis) => {
            const motor = entry.assignment[axis];
            if (!motor) {
                return;
            }
            const steps = resolveSteps(entry, axis);
            if (steps === null) {
                return;
            }
            const key = `${motor.nodeMac}:${motor.motorIndex}`;
            if (!axisMap.has(key)) {
                axisMap.set(key, { key, motor, steps: clampAxisSteps(steps) });
            }
        });
    });
    return Array.from(axisMap.values());
};

const buildCalibratedAxisTargets = (
    summary: CalibrationRunnerState['summary'],
    tiles: TileRunState[],
): AxisTargetCommand[] => {
    if (!summary?.gridBlueprint) {
        return [];
    }
    return buildUniqueAxisTargets(tiles, (entry, axis) => {
        const result = summary.tiles[entry.tile.key];
        if (!result || result.status !== 'completed' || !result.homeOffset) {
            return null;
        }
        const perStep =
            axis === 'x'
                ? (result.stepToDisplacement?.x ?? entry.metrics?.stepToDisplacement?.x ?? null)
                : (result.stepToDisplacement?.y ?? entry.metrics?.stepToDisplacement?.y ?? null);
        const displacement = axis === 'x' ? -result.homeOffset.dx : -result.homeOffset.dy;
        return computeAxisTargetSteps(displacement, perStep);
    });
};

const buildPhysicalAxisTargets = (tiles: TileRunState[]): AxisTargetCommand[] =>
    buildUniqueAxisTargets(tiles, () => 0);

const buildStagingAxisTargets = (
    tiles: TileRunState[],
    config: StagingConfig,
): AxisTargetCommand[] =>
    buildUniqueAxisTargets(tiles, (entry, axis) => {
        const targets = computePoseTargets(
            { row: entry.tile.row, col: entry.tile.col },
            'aside',
            config,
        );
        return axis === 'x' ? targets.x : targets.y;
    });

interface MoveActionsDropdownProps {
    runnerState: CalibrationRunnerState;
    tileEntries: TileRunState[];
    isRunnerBusy: boolean;
    loadedProfileSummary?: CalibrationRunSummary | null;
    gridSize: { rows: number; cols: number };
    arrayRotation: ArrayRotation;
    stagingPosition: StagingPosition;
}

const MoveActionsDropdown: React.FC<MoveActionsDropdownProps> = ({
    runnerState,
    tileEntries,
    isRunnerBusy,
    loadedProfileSummary,
    gridSize,
    arrayRotation,
    stagingPosition,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { moveMotor } = useMotorCommands();
    const calibratedHomeFeedback = useCommandFeedback();
    const physicalHomeFeedback = useCommandFeedback();
    const stagingFeedback = useCommandFeedback();

    const effectiveSummary = runnerState.summary ?? loadedProfileSummary ?? undefined;

    const stagingConfig: StagingConfig = useMemo(
        () => ({
            gridSize,
            arrayRotation,
            stagingPosition,
        }),
        [gridSize, arrayRotation, stagingPosition],
    );

    const calibratedAxisTargets = useMemo(
        () => buildCalibratedAxisTargets(effectiveSummary, tileEntries),
        [effectiveSummary, tileEntries],
    );
    const physicalAxisTargets = useMemo(() => buildPhysicalAxisTargets(tileEntries), [tileEntries]);
    const stagingAxisTargets = useMemo(
        () => buildStagingAxisTargets(tileEntries, stagingConfig),
        [tileEntries, stagingConfig],
    );

    const calibratedButtonDisabled =
        isRunnerBusy ||
        calibratedAxisTargets.length === 0 ||
        calibratedHomeFeedback.feedback.state === 'pending';
    const physicalButtonDisabled =
        isRunnerBusy ||
        physicalAxisTargets.length === 0 ||
        physicalHomeFeedback.feedback.state === 'pending';
    const stagingButtonDisabled =
        isRunnerBusy ||
        stagingAxisTargets.length === 0 ||
        stagingFeedback.feedback.state === 'pending';

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const executeMove = useCallback(
        async (
            targets: AxisTargetCommand[],
            feedback: ReturnType<typeof useCommandFeedback>,
            label: string,
            beginMsg: string,
            successMsg: string,
        ) => {
            if (isRunnerBusy) {
                feedback.fail('Pause calibration before moving mirrors.');
                return;
            }
            if (!targets.length) {
                feedback.fail('No motors available for this action.');
                return;
            }
            feedback.begin(beginMsg);
            setIsOpen(false);

            const settled = await Promise.allSettled(
                targets.map((target) =>
                    moveMotor({
                        mac: target.motor.nodeMac,
                        motorId: target.motor.motorIndex,
                        positionSteps: target.steps,
                    }),
                ),
            );

            const errors: CommandErrorDetail[] = [];
            settled.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const target = targets[index];
                    errors.push(
                        extractCommandErrorDetail(result.reason, {
                            controller: target.motor.nodeMac,
                            motorId: target.motor.motorIndex,
                        }),
                    );
                }
            });

            if (errors.length > 0) {
                feedback.fail(`${errors.length} motors failed`);
                showCommandErrorToast({
                    title: label,
                    totalCount: targets.length,
                    errors,
                });
            } else {
                feedback.succeed(successMsg);
            }
        },
        [isRunnerBusy, moveMotor],
    );

    const handleCalibratedHome = useCallback(() => {
        if (!effectiveSummary?.gridBlueprint) {
            calibratedHomeFeedback.fail('Load or run calibration first.');
            return;
        }
        executeMove(
            calibratedAxisTargets,
            calibratedHomeFeedback,
            'Calibrated home',
            'Moving to calibrated home…',
            'Calibrated home applied.',
        );
    }, [calibratedAxisTargets, calibratedHomeFeedback, effectiveSummary, executeMove]);

    const handlePhysicalHome = useCallback(() => {
        executeMove(
            physicalAxisTargets,
            physicalHomeFeedback,
            'Physical home',
            'Moving to physical home…',
            'Physical home applied.',
        );
    }, [executeMove, physicalAxisTargets, physicalHomeFeedback]);

    const handleStaging = useCallback(() => {
        executeMove(
            stagingAxisTargets,
            stagingFeedback,
            'Stage position',
            'Moving to stage position…',
            'Stage position applied.',
        );
    }, [executeMove, stagingAxisTargets, stagingFeedback]);

    const activeFeedback = useMemo(() => {
        const feedbacks = [
            calibratedHomeFeedback.feedback,
            physicalHomeFeedback.feedback,
            stagingFeedback.feedback,
        ];
        return feedbacks.find((f) => f.state !== 'idle' && f.message);
    }, [calibratedHomeFeedback.feedback, physicalHomeFeedback.feedback, stagingFeedback.feedback]);

    const feedbackColor =
        activeFeedback?.state === 'error'
            ? 'text-rose-300'
            : activeFeedback?.state === 'pending'
              ? 'text-amber-300'
              : 'text-emerald-300';

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-gray-700"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                </svg>
                Move
                <svg
                    className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded-md border border-gray-700 bg-gray-900 py-1 shadow-lg">
                    <button
                        type="button"
                        onClick={handleCalibratedHome}
                        disabled={calibratedButtonDisabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Move all calibrated tiles to their aligned home positions"
                    >
                        <span
                            className={`h-2 w-2 rounded-full ${calibratedAxisTargets.length > 0 ? 'bg-emerald-500' : 'bg-gray-600'}`}
                        />
                        To calibrated home
                    </button>
                    <button
                        type="button"
                        onClick={handlePhysicalHome}
                        disabled={physicalButtonDisabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Move every motor back to its mechanical zero"
                    >
                        <span className="h-2 w-2 rounded-full bg-gray-400" />
                        To physical home
                    </button>
                    <button
                        type="button"
                        onClick={handleStaging}
                        disabled={stagingButtonDisabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Move tiles to staging position based on calibration settings"
                    >
                        <span className="h-2 w-2 rounded-full bg-sky-500" />
                        To stage position
                    </button>
                </div>
            )}

            {activeFeedback && activeFeedback.message && (
                <p className={`mt-1 text-[10px] ${feedbackColor}`}>{activeFeedback.message}</p>
            )}
        </div>
    );
};

export default MoveActionsDropdown;
