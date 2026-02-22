import { getMirrorAssignment } from '../utils/grid';

import {
    computeAxisTarget as computeSharedAxisTarget,
    isTileCalibrated,
} from './alignmentAxisTarget';
import { maxBipartiteMatching } from './bipartiteMatching';
import { getSpaceParams, patternToCentered } from './spaceConversion';

import type {
    Axis,
    CalibrationProfile,
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
    | 'no_valid_tile_for_point'
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

/**
 * Compute axis target for playback by delegating to the shared helper.
 * Wraps the shared result to include `patternPointId` in both target and error.
 */
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
    tile: Parameters<typeof computeSharedAxisTarget>[0]['tile'];
    assignment: Parameters<typeof computeSharedAxisTarget>[0]['assignment'];
    patternPoint: PatternPoint;
    mirrorId: string;
    row: number;
    col: number;
}): { target: ProfilePlaybackAxisTarget } | { error: ProfilePlaybackValidationError } => {
    const result = computeSharedAxisTarget({
        axis,
        tile,
        assignment,
        normalizedTarget: patternPoint[axis],
        mirrorId,
        row,
        col,
    });

    if ('error' in result) {
        return {
            error: {
                ...result.error,
                patternPointId: patternPoint.id,
            },
        };
    }

    return {
        target: {
            ...result.target,
            patternPointId: patternPoint.id,
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

    // Transform pattern points from isotropic pattern space to camera-centered space
    // using shared space conversion helpers (rotation + aspect ratio scaling)
    const spaceParams = getSpaceParams(profile);
    const rotatedPoints: PatternPoint[] = pattern.points.map((point) => {
        const centered = patternToCentered(point, spaceParams);
        return {
            ...point,
            x: centered.x,
            y: centered.y,
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
    // Stable tie-break on point ID for deterministic results.
    pointOptions.sort((a, b) => {
        const flexDiff = a.validTiles.length - b.validTiles.length;
        if (flexDiff !== 0) return flexDiff;
        return a.point.id.localeCompare(b.point.id);
    });

    // 4. Assign tiles using maximum bipartite matching (augmenting-path)
    // This guarantees maximum cardinality — greedy can miss valid assignments.
    const adjacency = new Map<string, string[]>();
    for (const { point, validTiles } of pointOptions) {
        adjacency.set(
            point.id,
            validTiles.map((t) => t.key),
        );
    }
    const pointAssignments = maxBipartiteMatching(adjacency);

    // Distance-based refinement: try pairwise swaps to reduce total distance
    // while preserving matching cardinality.
    const tileByKey = new Map(availableTiles.map((t) => [t.key, t]));
    const rotatedById = new Map(rotatedPoints.map((p) => [p.id, p]));

    const distSq = (pointId: string, tileKey: string): number => {
        const pt = rotatedById.get(pointId)!;
        const tile = tileByKey.get(tileKey)!;
        const dx = pt.x - tile.idealX;
        const dy = pt.y - tile.idealY;
        return dx * dx + dy * dy;
    };

    // Keep swapping until stable
    let improved = true;
    while (improved) {
        improved = false;
        const entries = [...pointAssignments.entries()];
        for (let i = 0; i < entries.length; i += 1) {
            for (let j = i + 1; j < entries.length; j += 1) {
                const [pA, tA] = entries[i];
                const [pB, tB] = entries[j];
                // Check if swap is valid (both points must accept the other's tile)
                const adjA = adjacency.get(pA)!;
                const adjB = adjacency.get(pB)!;
                if (!adjA.includes(tB) || !adjB.includes(tA)) continue;
                // Check if swap reduces total distance
                const currentCost = distSq(pA, tA) + distSq(pB, tB);
                const swappedCost = distSq(pA, tB) + distSq(pB, tA);
                if (swappedCost < currentCost) {
                    pointAssignments.set(pA, tB);
                    pointAssignments.set(pB, tA);
                    entries[i] = [pA, tB];
                    entries[j] = [pB, tA];
                    improved = true;
                }
            }
        }
    }

    // 5. Construct the result
    // Pre-build reverse maps for O(1) lookups
    const tileToPointId = new Map<string, string>();
    for (const [pid, tKey] of pointAssignments.entries()) {
        tileToPointId.set(tKey, pid);
    }
    const pointOptionsById = new Map(pointOptions.map((opt) => [opt.point.id, opt]));

    const tiles: ProfilePlaybackTilePlan[] = [];

    // We need to iterate over ALL grid positions to produce the full plan
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const key = getTileKey(row, col);
            const assignment = getMirrorAssignment(mirrorConfig, row, col);
            const tileCalibration = profile.tiles[key];

            const assignedPointId = tileToPointId.get(key) ?? null;
            const patternPoint = assignedPointId
                ? (rotatedById.get(assignedPointId) ?? null)
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
    // Distinguish between "no valid tiles" (outside bounds) vs "no remaining tiles" (capacity)
    const unassignedPoints = rotatedPoints.filter((p) => !pointAssignments.has(p.id));
    for (const p of unassignedPoints) {
        const options = pointOptionsById.get(p.id);
        const hadValidTiles = options && options.validTiles.length > 0;

        if (hadValidTiles) {
            // Point had valid tiles but they were all taken by other points
            globalErrors.push(
                createError(
                    'insufficient_calibrated_tiles',
                    `No remaining tile for point "${p.id}" - all compatible tiles already assigned.`,
                    { patternPointId: p.id },
                ),
            );
        } else {
            // Point has no valid tiles (outside all tile bounds)
            globalErrors.push(
                createError(
                    'no_valid_tile_for_point',
                    `Point "${p.id}" at (${p.x.toFixed(3)}, ${p.y.toFixed(3)}) is outside all tile bounds.`,
                    { patternPointId: p.id },
                ),
            );
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
