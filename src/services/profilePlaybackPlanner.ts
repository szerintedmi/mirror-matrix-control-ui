import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import { convertDeltaToSteps } from '@/utils/calibrationMath';

import { getMirrorAssignment } from '../utils/grid';

import type {
    Axis,
    CalibrationProfile,
    CalibrationProfileBounds,
    MirrorAssignment,
    MirrorConfig,
    Motor,
    Pattern,
    PatternPoint,
    TileCalibrationResults,
} from '../types';

export interface ProfilePlaybackParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    profile: CalibrationProfile | null;
    pattern: Pattern | null;
}

export type ProfilePlaybackErrorCode =
    | 'missing_profile'
    | 'missing_pattern'
    | 'profile_missing_blueprint'
    | 'profile_grid_mismatch'
    | 'pattern_exceeds_mirrors'
    | 'insufficient_calibrated_tiles'
    | 'tile_not_calibrated'
    | 'missing_motor'
    | 'missing_axis_calibration'
    | 'target_out_of_bounds'
    | 'steps_out_of_range';

export interface ProfilePlaybackValidationError {
    code: ProfilePlaybackErrorCode;
    message: string;
    mirrorId?: string;
    axis?: Axis;
    patternPointId?: string;
}

export interface ProfilePlaybackAxisTarget {
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

export interface ProfilePlaybackTilePlan {
    mirrorId: string;
    row: number;
    col: number;
    patternPointId: string | null;
    target: { x: number; y: number } | null;
    axisTargets: Partial<Record<Axis, ProfilePlaybackAxisTarget>>;
    errors: ProfilePlaybackValidationError[];
}

export interface ProfilePlaybackPlanResult {
    patternId: string | null;
    tiles: ProfilePlaybackTilePlan[];
    playableAxisTargets: ProfilePlaybackAxisTarget[];
    errors: ProfilePlaybackValidationError[];
}

const AXES: Axis[] = ['x', 'y'];

const axisCoordKey: Record<Axis, 'x' | 'y'> = {
    x: 'x',
    y: 'y',
};

const axisStepsKey: Record<Axis, 'stepsX' | 'stepsY'> = {
    x: 'stepsX',
    y: 'stepsY',
};

const getTileKey = (row: number, col: number): string => `${row}-${col}`;

const createError = (
    code: ProfilePlaybackErrorCode,
    message: string,
    context: Partial<ProfilePlaybackValidationError> = {},
): ProfilePlaybackValidationError => ({
    code,
    message,
    ...context,
});

const isTileCalibrated = (
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

const computeAxisTarget = ({
    axis,
    tile,
    assignment,
    patternPoint,
    mirrorId,
    row,
    col,
}: {
    axis: Axis;
    tile: TileCalibrationResults;
    assignment: MirrorAssignment;
    patternPoint: PatternPoint;
    mirrorId: string;
    row: number;
    col: number;
}): { target: ProfilePlaybackAxisTarget } | { error: ProfilePlaybackValidationError } => {
    const motor = assignment[axis];
    if (!motor) {
        return {
            error: createError(
                'missing_motor',
                `Mirror ${mirrorId} is missing a motor on axis ${axis}.`,
                {
                    mirrorId,
                    axis,
                    patternPointId: patternPoint.id,
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
                    patternPointId: patternPoint.id,
                },
            ),
        };
    }

    const normalizedTarget = patternPoint[axis];
    const bounds = resolveAxisBounds(tile.inferredBounds, axis);
    if (bounds && (normalizedTarget < bounds.min || normalizedTarget > bounds.max)) {
        return {
            error: createError(
                'target_out_of_bounds',
                `Target ${normalizedTarget.toFixed(3)} is outside calibrated ${axis.toUpperCase()} bounds ` +
                    `[${bounds.min.toFixed(3)}, ${bounds.max.toFixed(3)}].`,
                {
                    mirrorId,
                    axis,
                    patternPointId: patternPoint.id,
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
                    patternPointId: patternPoint.id,
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
                    patternPointId: patternPoint.id,
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
            patternPointId: patternPoint.id,
            normalizedTarget,
            targetSteps: Math.round(rawTargetSteps),
        },
    };
};

export const planProfilePlayback = ({
    gridSize,
    mirrorConfig,
    profile,
    pattern,
}: ProfilePlaybackParams): ProfilePlaybackPlanResult => {
    if (!pattern) {
        return {
            patternId: null,
            tiles: [],
            playableAxisTargets: [],
            errors: [createError('missing_pattern', 'Select a pattern to start playback.')],
        };
    }
    if (!profile) {
        return {
            patternId: pattern.id,
            tiles: [],
            playableAxisTargets: [],
            errors: [createError('missing_profile', 'Select a calibration profile to continue.')],
        };
    }
    if (!profile.gridBlueprint) {
        return {
            patternId: pattern.id,
            tiles: [],
            playableAxisTargets: [],
            errors: [
                createError(
                    'profile_missing_blueprint',
                    'Selected profile is missing grid blueprint data. Run calibration again.',
                ),
            ],
        };
    }

    if (profile.gridSize.rows !== gridSize.rows || profile.gridSize.cols !== gridSize.cols) {
        return {
            patternId: pattern.id,
            tiles: [],
            playableAxisTargets: [],
            errors: [
                createError(
                    'profile_grid_mismatch',
                    'Profile grid size does not match the current array configuration.',
                ),
            ],
        };
    }

    const totalMirrors = gridSize.rows * gridSize.cols;
    const globalErrors: ProfilePlaybackValidationError[] = [];

    if (pattern.points.length > totalMirrors) {
        globalErrors.push(
            createError(
                'pattern_exceeds_mirrors',
                `Pattern has ${pattern.points.length} points, but the array only exposes ${totalMirrors} mirrors.`,
            ),
        );
    }

    let playableCapacity = 0;
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const key = getTileKey(row, col);
            const tile = profile.tiles[key];
            const assignment = getMirrorAssignment(mirrorConfig, row, col);
            if (isTileCalibrated(tile) && assignment.x && assignment.y) {
                playableCapacity += 1;
            }
        }
    }
    if (pattern.points.length > playableCapacity) {
        globalErrors.push(
            createError(
                'insufficient_calibrated_tiles',
                `Pattern needs ${pattern.points.length} calibrated mirrors, but only ${playableCapacity} are available.`,
            ),
        );
    }

    const tiles: ProfilePlaybackTilePlan[] = [];
    let patternIndex = 0;

    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const key = getTileKey(row, col);
            const assignment = getMirrorAssignment(mirrorConfig, row, col);
            const tileCalibration = profile.tiles[key];
            const patternPoint = pattern.points[patternIndex] ?? null;
            const tileErrors: ProfilePlaybackValidationError[] = [];
            const axisTargets: ProfilePlaybackTilePlan['axisTargets'] = {};

            if (patternPoint) {
                if (!isTileCalibrated(tileCalibration)) {
                    tileErrors.push(
                        createError(
                            'tile_not_calibrated',
                            `Tile ${key} is not calibrated for playback.`,
                            { mirrorId: key, patternPointId: patternPoint.id },
                        ),
                    );
                } else {
                    AXES.forEach((axis) => {
                        const result = computeAxisTarget({
                            axis,
                            tile: tileCalibration,
                            assignment,
                            patternPoint,
                            mirrorId: key,
                            row,
                            col,
                        });
                        if ('error' in result) {
                            tileErrors.push(result.error);
                        } else {
                            axisTargets[axis] = result.target;
                        }
                    });
                }
                patternIndex += 1;
            }

            tiles.push({
                mirrorId: key,
                row,
                col,
                patternPointId: patternPoint?.id ?? null,
                target: patternPoint ? { x: patternPoint.x, y: patternPoint.y } : null,
                axisTargets,
                errors: tileErrors,
            });
        }
    }

    const playableAxisTargets = tiles
        .flatMap((tile) => AXES.map((axis) => tile.axisTargets[axis]).filter(Boolean))
        .map((entry) => entry!) as ProfilePlaybackAxisTarget[];

    return {
        patternId: pattern.id,
        tiles,
        playableAxisTargets,
        errors: [...globalErrors, ...tiles.flatMap((tile) => tile.errors)],
    };
};
