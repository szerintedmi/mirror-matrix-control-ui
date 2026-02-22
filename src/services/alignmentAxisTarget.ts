import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import { convertDeltaToSteps } from '@/utils/calibrationMath';

import type {
    Axis,
    CalibrationProfileBounds,
    MirrorAssignment,
    Motor,
    TileCalibrationResults,
} from '../types';

export type AxisTargetErrorCode =
    | 'missing_motor'
    | 'missing_axis_calibration'
    | 'target_out_of_bounds'
    | 'steps_out_of_range';

export interface AxisTargetError {
    code: AxisTargetErrorCode;
    message: string;
    mirrorId?: string;
    axis?: Axis;
}

export interface AxisTargetResult {
    key: string;
    mirrorId: string;
    row: number;
    col: number;
    axis: Axis;
    motor: Motor;
    normalizedTarget: number;
    targetSteps: number;
}

export const axisCoordKey: Record<Axis, 'x' | 'y'> = {
    x: 'x',
    y: 'y',
};

export const axisStepsKey: Record<Axis, 'stepsX' | 'stepsY'> = {
    x: 'stepsX',
    y: 'stepsY',
};

export const isTileCalibrated = (
    tile: TileCalibrationResults | undefined,
): tile is TileCalibrationResults =>
    Boolean(
        tile &&
        tile.status === 'completed' &&
        tile.adjustedHome &&
        typeof tile.adjustedHome.stepsX === 'number' &&
        typeof tile.adjustedHome.stepsY === 'number' &&
        tile.stepToDisplacement.x !== null &&
        tile.stepToDisplacement.y !== null,
    );

export const resolveAxisBounds = (
    bounds: CalibrationProfileBounds | null,
    axis: Axis,
): { min: number; max: number } | null => bounds?.[axis] ?? null;

export const resolveAxisRange = (
    tile: TileCalibrationResults,
    axis: Axis,
): { min: number; max: number } => {
    const range = tile.axes?.[axis]?.stepRange;
    if (range) {
        return { min: range.minSteps, max: range.maxSteps };
    }
    return { min: MOTOR_MIN_POSITION_STEPS, max: MOTOR_MAX_POSITION_STEPS };
};

/**
 * Compute the target motor steps for a single axis of a tile.
 *
 * Accepts a raw `normalizedTarget` value (in centered space) instead of a full PatternPoint,
 * making it reusable by both playback (which derives normalizedTarget from pattern points)
 * and alignment (which uses a fixed 0 target for center).
 */
export const computeAxisTarget = ({
    axis,
    tile,
    assignment,
    normalizedTarget,
    mirrorId,
    row,
    col,
}: {
    axis: Axis;
    tile: TileCalibrationResults;
    assignment: MirrorAssignment;
    normalizedTarget: number;
    mirrorId: string;
    row: number;
    col: number;
}): { target: AxisTargetResult } | { error: AxisTargetError } => {
    const motor = assignment[axis];
    if (!motor) {
        return {
            error: {
                code: 'missing_motor',
                message: `Mirror ${mirrorId} is missing a motor on axis ${axis}.`,
                mirrorId,
                axis,
            },
        };
    }

    const perStep = tile.stepToDisplacement?.[axis] ?? null;
    const adjustedHome = tile.adjustedHome;
    if (
        perStep === null ||
        !adjustedHome ||
        typeof adjustedHome[axisCoordKey[axis]] !== 'number' ||
        typeof adjustedHome[axisStepsKey[axis]] !== 'number'
    ) {
        return {
            error: {
                code: 'missing_axis_calibration',
                message: `Tile ${mirrorId} is missing step calibration on axis ${axis}.`,
                mirrorId,
                axis,
            },
        };
    }

    const bounds = resolveAxisBounds(tile.combinedBounds, axis);
    if (bounds && (normalizedTarget < bounds.min || normalizedTarget > bounds.max)) {
        return {
            error: {
                code: 'target_out_of_bounds',
                message:
                    `Target ${normalizedTarget.toFixed(3)} is outside calibrated ${axis.toUpperCase()} bounds ` +
                    `[${bounds.min.toFixed(3)}, ${bounds.max.toFixed(3)}].`,
                mirrorId,
                axis,
            },
        };
    }

    const delta = normalizedTarget - (adjustedHome[axisCoordKey[axis]] as number);
    const deltaSteps = convertDeltaToSteps(delta, perStep);
    if (deltaSteps === null) {
        return {
            error: {
                code: 'missing_axis_calibration',
                message: `Unable to convert normalized delta to steps for axis ${axis}.`,
                mirrorId,
                axis,
            },
        };
    }

    const baseSteps = adjustedHome[axisStepsKey[axis]] as number;
    const rawTargetSteps = baseSteps + deltaSteps;
    const axisRange = resolveAxisRange(tile, axis);

    if (rawTargetSteps < axisRange.min || rawTargetSteps > axisRange.max) {
        return {
            error: {
                code: 'steps_out_of_range',
                message:
                    `Target steps ${rawTargetSteps.toFixed(1)} exceed allowed range ` +
                    `[${axisRange.min}, ${axisRange.max}] on axis ${axis}.`,
                mirrorId,
                axis,
            },
        };
    }

    return {
        target: {
            key: `${mirrorId}:${axis}:${motor.nodeMac}:${motor.motorIndex}`,
            axis,
            mirrorId,
            row,
            col,
            motor,
            normalizedTarget,
            targetSteps: Math.round(rawTargetSteps),
        },
    };
};
