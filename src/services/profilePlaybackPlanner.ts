import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import { rotateVector } from '@/utils/arrayRotation';
import { convertDeltaToSteps } from '@/utils/calibrationMath';

import { getMirrorAssignment } from '../utils/grid';

import type {
    ArrayRotation,
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

    // Removed strict grid mismatch check to allow playback on subsets of the array
    // if the profile covers the necessary tiles.
    // if (profile.gridSize.rows !== gridSize.rows || profile.gridSize.cols !== gridSize.cols) {
    //    ...
    // }

    const totalMirrors = gridSize.rows * gridSize.cols;
    const globalErrors: ProfilePlaybackValidationError[] = [];

    // Apply array rotation to pattern points.
    // This transforms pattern coordinates to match the calibrated coordinate space.
    const arrayRotation: ArrayRotation = profile.arrayRotation ?? 0;
    // Default to 16:9 if aspect ratio is missing, as that's the standard camera aspect
    const aspect = profile.calibrationCameraAspect ?? 16 / 9;

    const rotatedPoints: PatternPoint[] = pattern.points.map((point) => {
        const rotated =
            arrayRotation === 0
                ? { x: point.x, y: point.y }
                : rotateVector({ x: point.x, y: point.y }, arrayRotation);

        // Convert Isotropic Pattern coordinates to Anisotropic Centered coordinates
        // We use "Fit Width" strategy where Pattern X [-1, 1] maps to Centered X [-1, 1].
        // Since Centered Y [-1, 1] covers a smaller physical distance than Centered X [-1, 1],
        // we must scale Pattern Y by the aspect ratio to preserve circularity.
        // This means Pattern Y=1 maps to Centered Y=aspect (e.g. 1.77), which may be outside the image.
        return {
            ...point,
            x: rotated.x,
            y: rotated.y * aspect,
        };
    });

    if (rotatedPoints.length > totalMirrors) {
        globalErrors.push(
            createError(
                'pattern_exceeds_mirrors',
                `Pattern has ${rotatedPoints.length} points, but the array only exposes ${totalMirrors} mirrors.`,
            ),
        );
    }

    // 1. Identify all available (calibrated) tiles
    const availableTiles: {
        key: string;
        row: number;
        col: number;
        tile: TileCalibrationResults;
        assignment: MirrorAssignment;
        idealX: number;
        idealY: number;
    }[] = [];

    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const key = getTileKey(row, col);
            const tile = profile.tiles[key];
            const assignment = getMirrorAssignment(mirrorConfig, row, col);
            if (isTileCalibrated(tile) && assignment.x && assignment.y) {
                // Calculate ideal normalized position [-1, 1]
                // If cols=1, x=0. Else map 0..cols-1 to -1..1
                const idealX = gridSize.cols > 1 ? (col / (gridSize.cols - 1)) * 2 - 1 : 0;
                const idealY = gridSize.rows > 1 ? (row / (gridSize.rows - 1)) * 2 - 1 : 0;

                availableTiles.push({
                    key,
                    row,
                    col,
                    tile,
                    assignment,
                    idealX,
                    idealY,
                });
            }
        }
    }

    if (rotatedPoints.length > availableTiles.length) {
        globalErrors.push(
            createError(
                'insufficient_calibrated_tiles',
                `Pattern needs ${rotatedPoints.length} calibrated mirrors, but only ${availableTiles.length} are available.`,
            ),
        );
    }

    // 2. Pre-calculate valid tiles for each point (using rotated coordinates)
    // We want to assign points that have FEWER options first.
    const pointOptions = rotatedPoints.map((point) => {
        const validTiles = availableTiles.filter((t) => {
            const bounds = t.tile.combinedBounds;
            if (!bounds) return true; // No bounds = assume valid
            // Check X
            if (point.x < bounds.x.min || point.x > bounds.x.max) return false;
            // Check Y
            if (point.y < bounds.y.min || point.y > bounds.y.max) return false;
            return true;
        });
        return {
            point,
            validTiles,
        };
    });

    // 3. Sort points by flexibility (ascending number of valid tiles)
    // This ensures we handle constrained points first.
    pointOptions.sort((a, b) => a.validTiles.length - b.validTiles.length);

    // 4. Assign tiles
    const assignedTileKeys = new Set<string>();
    const pointAssignments = new Map<string, string>(); // pointId -> tileKey

    for (const { point, validTiles } of pointOptions) {
        // Filter out already assigned tiles
        const candidates = validTiles.filter((t) => !assignedTileKeys.has(t.key));

        if (candidates.length === 0) {
            // Cannot assign this point
            // We will handle the error generation when constructing the final plan
            continue;
        }

        // Find the "closest" candidate
        let bestCandidate = candidates[0];
        let minDistanceSq = Number.POSITIVE_INFINITY;

        for (const candidate of candidates) {
            const dx = point.x - candidate.idealX;
            const dy = point.y - candidate.idealY;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                bestCandidate = candidate;
            }
        }

        assignedTileKeys.add(bestCandidate.key);
        pointAssignments.set(point.id, bestCandidate.key);
    }

    // 5. Construct the result
    const tiles: ProfilePlaybackTilePlan[] = [];

    // We need to iterate over ALL grid positions to produce the full plan
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const key = getTileKey(row, col);
            const assignment = getMirrorAssignment(mirrorConfig, row, col);
            const tileCalibration = profile.tiles[key];

            // Find if this tile was assigned to a point
            // We need to reverse lookup from pointAssignments, or just find which point maps to this key
            // Since pointAssignments is pointId -> tileKey, we can search it.
            // Optimization: build a reverse map? Or just iterate. N is small.
            let assignedPointId: string | null = null;
            for (const [pid, tKey] of pointAssignments.entries()) {
                if (tKey === key) {
                    assignedPointId = pid;
                    break;
                }
            }

            // Use rotatedPoints to get the transformed coordinates
            const patternPoint = assignedPointId
                ? (rotatedPoints.find((p) => p.id === assignedPointId) ?? null)
                : null;

            const tileErrors: ProfilePlaybackValidationError[] = [];
            const axisTargets: ProfilePlaybackTilePlan['axisTargets'] = {};

            if (patternPoint) {
                // This block is similar to previous logic, but now we know the assignment is valid-ish
                // We still run the detailed checks (bounds, calibration existence) to generate specific errors if needed
                // although our pre-filter should have caught bounds issues.

                if (!isTileCalibrated(tileCalibration)) {
                    // Should not happen if our availableTiles logic is correct, but good for safety
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

    // Check for unassigned points to report errors
    // If a point was not assigned, it means we ran out of valid tiles or it was impossible
    const unassignedPoints = rotatedPoints.filter((p) => !pointAssignments.has(p.id));
    for (const p of unassignedPoints) {
        // We need to attach this error somewhere.
        // The interface puts errors on tiles or global.
        // Since it's not assigned to a tile, it's a global error or we just report it.
        globalErrors.push(
            createError(
                'insufficient_calibrated_tiles', // Or a new error code 'point_unassignable'
                `Unable to assign pattern point ${p.id} to any valid tile (constraints or capacity).`,
                { patternPointId: p.id },
            ),
        );
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
