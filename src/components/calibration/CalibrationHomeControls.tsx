import React, { useCallback, useMemo } from 'react';

import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import { useCommandFeedback } from '@/hooks/useCommandFeedback';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import type { CalibrationRunnerState, TileRunState } from '@/services/calibrationRunner';
import type { Motor } from '@/types';
import { normalizeCommandError } from '@/utils/commandErrors';

const ACTION_BUTTON_BASE_CLASS =
    'rounded-md border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

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

interface CalibrationHomeControlsProps {
    runnerState: CalibrationRunnerState;
    tileEntries: TileRunState[];
    isRunnerBusy: boolean;
}

const CalibrationHomeControls: React.FC<CalibrationHomeControlsProps> = ({
    runnerState,
    tileEntries,
    isRunnerBusy,
}) => {
    const { moveMotor } = useMotorCommands();
    const calibratedHomeFeedback = useCommandFeedback();
    const physicalHomeFeedback = useCommandFeedback();

    const calibratedAxisTargets = useMemo(
        () => buildCalibratedAxisTargets(runnerState.summary, tileEntries),
        [runnerState.summary, tileEntries],
    );
    const physicalAxisTargets = useMemo(() => buildPhysicalAxisTargets(tileEntries), [tileEntries]);

    const calibratedButtonDisabled =
        isRunnerBusy ||
        calibratedAxisTargets.length === 0 ||
        calibratedHomeFeedback.feedback.state === 'pending';
    const physicalButtonDisabled =
        isRunnerBusy ||
        physicalAxisTargets.length === 0 ||
        physicalHomeFeedback.feedback.state === 'pending';

    const handleHomeToPhysical = useCallback(async () => {
        if (isRunnerBusy) {
            physicalHomeFeedback.fail('Pause calibration before moving mirrors.');
            return;
        }
        if (!physicalAxisTargets.length) {
            physicalHomeFeedback.fail('No motors assigned to this grid.');
            return;
        }
        physicalHomeFeedback.begin('Moving mirrors to physical home…');
        try {
            await Promise.all(
                physicalAxisTargets.map((target) =>
                    moveMotor({
                        mac: target.motor.nodeMac,
                        motorId: target.motor.motorIndex,
                        positionSteps: 0,
                    }),
                ),
            );
            physicalHomeFeedback.succeed('Physical home applied.');
        } catch (error) {
            const details = normalizeCommandError(error);
            physicalHomeFeedback.fail(details.message, details.code);
        }
    }, [isRunnerBusy, moveMotor, physicalAxisTargets, physicalHomeFeedback]);

    const handleHomeToCalibrated = useCallback(async () => {
        if (isRunnerBusy) {
            calibratedHomeFeedback.fail('Pause calibration before moving mirrors.');
            return;
        }
        if (!runnerState.summary?.gridBlueprint) {
            calibratedHomeFeedback.fail('Run calibration to compute an ideal grid first.');
            return;
        }
        if (calibratedAxisTargets.length === 0) {
            calibratedHomeFeedback.fail('No calibrated tiles are ready yet.');
            return;
        }
        calibratedHomeFeedback.begin('Moving mirrors to calibrated home…');
        try {
            await Promise.all(
                calibratedAxisTargets.map((target) =>
                    moveMotor({
                        mac: target.motor.nodeMac,
                        motorId: target.motor.motorIndex,
                        positionSteps: target.steps,
                    }),
                ),
            );
            calibratedHomeFeedback.succeed('Calibrated home applied.');
        } catch (error) {
            const details = normalizeCommandError(error);
            calibratedHomeFeedback.fail(details.message, details.code);
        }
    }, [
        calibratedAxisTargets,
        calibratedHomeFeedback,
        isRunnerBusy,
        moveMotor,
        runnerState.summary,
    ]);

    const actionFeedbackMessages = useMemo(() => {
        const entries = [
            { label: 'Move to calibrated home', feedback: calibratedHomeFeedback.feedback },
            { label: 'Move to physical home', feedback: physicalHomeFeedback.feedback },
        ];
        return entries
            .map(({ label, feedback }) => {
                if (feedback.state === 'idle' || !feedback.message) {
                    return null;
                }
                const color =
                    feedback.state === 'error'
                        ? 'text-rose-200'
                        : feedback.state === 'pending'
                          ? 'text-amber-200'
                          : 'text-emerald-200';
                return (
                    <p key={label} className={`text-xs ${color}`}>
                        <span className="font-semibold">{label}:</span> {feedback.message}
                        {feedback.code && (
                            <span className="ml-1 font-mono text-[10px] text-gray-300">
                                ({feedback.code})
                            </span>
                        )}
                    </p>
                );
            })
            .filter(Boolean);
    }, [calibratedHomeFeedback.feedback, physicalHomeFeedback.feedback]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleHomeToCalibrated}
                    disabled={calibratedButtonDisabled}
                    className={`${ACTION_BUTTON_BASE_CLASS} border-emerald-500/60 text-emerald-100 hover:bg-emerald-500/10`}
                    title="Move all calibrated tiles to their aligned home positions"
                >
                    Move to calibrated home
                </button>
                <button
                    type="button"
                    onClick={handleHomeToPhysical}
                    disabled={physicalButtonDisabled}
                    className={`${ACTION_BUTTON_BASE_CLASS} border-gray-500/60 text-gray-100 hover:bg-gray-500/10`}
                    title="Move every motor back to its mechanical zero"
                >
                    Move to physical home
                </button>
            </div>
            {actionFeedbackMessages.length > 0 && (
                <div className="space-y-1">{actionFeedbackMessages}</div>
            )}
        </div>
    );
};

export default CalibrationHomeControls;
