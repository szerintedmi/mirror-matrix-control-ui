import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type {
    Axis,
    CalibrationProfileBounds,
    MirrorAssignment,
    Motor,
    TileCalibrationResults,
} from '@/types';
import { convertDeltaToSteps } from '@/utils/calibrationMath';

export type AxisTargetErrorCode =
    | 'missing_motor'
    | 'missing_axis_calibration'
    | 'target_out_of_bounds'
    | 'steps_out_of_range';

export interface AxisTargetValidationError {
    code: AxisTargetErrorCode;
    message: string;
    mirrorId?: string;
    axis?: Axis;
    patternPointId?: string;
}

export interface AlignmentAxisTarget {
    key: string;
    mirrorId: string;
    row: number;
    col: number;
    axis: Axis;
    motor: Motor;
    patternPointId: string;
    normalizedTarget: number;
    targetSteps: number;
}

export interface ComputeAlignmentAxisTargetParams {
    axis: Axis;
    tile: TileCalibrationResults;
    assignment: MirrorAssignment;
    normalizedTarget: number;
    mirrorId: string;
    row: number;
    col: number;
    patternPointId?: string;
}

const axisCoordKey: Record<Axis, 'x' | 'y'> = {
    x: 'x',
    y: 'y',
};

const axisStepsKey: Record<Axis, 'stepsX' | 'stepsY'> = {
    x: 'stepsX',
    y: 'stepsY',
};

const createError = (
    code: AxisTargetErrorCode,
    message: string,
    context: Partial<AxisTargetValidationError> = {},
): AxisTargetValidationError => ({
    code,
    message,
    ...context,
});

const resolveAxisBounds = (
    bounds: CalibrationProfileBounds | null,
    axis: Axis,
): { min: number; max: number } | null => bounds?.[axis] ?? null;

const resolveAxisRange = (
    tile: TileCalibrationResults,
    axis: Axis,
): { min: number; max: number } => {
    const range = tile.axes?.[axis]?.stepRange;
    if (range) {
        return { min: range.minSteps, max: range.maxSteps };
    }
    return { min: MOTOR_MIN_POSITION_STEPS, max: MOTOR_MAX_POSITION_STEPS };
};

export const computeAlignmentAxisTarget = ({
    axis,
    tile,
    assignment,
    normalizedTarget,
    mirrorId,
    row,
    col,
    patternPointId = 'alignment-target',
}: ComputeAlignmentAxisTargetParams):
    | { target: AlignmentAxisTarget }
    | { error: AxisTargetValidationError } => {
    const motor = assignment[axis];
    if (!motor) {
        return {
            error: createError(
                'missing_motor',
                `Mirror ${mirrorId} is missing a motor on axis ${axis}.`,
                {
                    mirrorId,
                    axis,
                    patternPointId,
                },
            ),
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
            error: createError(
                'missing_axis_calibration',
                `Tile ${mirrorId} is missing step calibration on axis ${axis}.`,
                {
                    mirrorId,
                    axis,
                    patternPointId,
                },
            ),
        };
    }

    const bounds = resolveAxisBounds(tile.combinedBounds, axis);
    if (bounds && (normalizedTarget < bounds.min || normalizedTarget > bounds.max)) {
        return {
            error: createError(
                'target_out_of_bounds',
                `Target ${normalizedTarget.toFixed(3)} is outside calibrated ${axis.toUpperCase()} bounds ` +
                    `[${bounds.min.toFixed(3)}, ${bounds.max.toFixed(3)}].`,
                {
                    mirrorId,
                    axis,
                    patternPointId,
                },
            ),
        };
    }

    const delta = normalizedTarget - (adjustedHome[axisCoordKey[axis]] as number);
    const deltaSteps = convertDeltaToSteps(delta, perStep);
    if (deltaSteps === null) {
        return {
            error: createError(
                'missing_axis_calibration',
                `Unable to convert normalized delta to steps for axis ${axis}.`,
                {
                    mirrorId,
                    axis,
                    patternPointId,
                },
            ),
        };
    }

    const baseSteps = adjustedHome[axisStepsKey[axis]] as number;
    const rawTargetSteps = baseSteps + deltaSteps;
    const axisRange = resolveAxisRange(tile, axis);
    if (rawTargetSteps < axisRange.min || rawTargetSteps > axisRange.max) {
        return {
            error: createError(
                'steps_out_of_range',
                `Target steps ${rawTargetSteps.toFixed(1)} exceed allowed range ` +
                    `[${axisRange.min}, ${axisRange.max}] on axis ${axis}.`,
                {
                    mirrorId,
                    axis,
                    patternPointId,
                },
            ),
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
            patternPointId,
            normalizedTarget,
            targetSteps: Math.round(rawTargetSteps),
        },
    };
};
