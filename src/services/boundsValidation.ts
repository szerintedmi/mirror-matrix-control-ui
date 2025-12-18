/**
 * Bounds Validation Module
 *
 * Provides validation of pattern points and animation waypoints against
 * calibration profile bounds. This is "Pass A" of the planner split -
 * pure validation without tile assignment or step conversion.
 */

import type { CalibrationProfile, PatternPoint } from '@/types';
import type { AnimationWaypoint } from '@/types/animation';

import { getSpaceParams, patternToCentered } from './spaceConversion';

/**
 * Parameters for bounds validation.
 */
export interface ValidationParams {
    /** Calibration profile containing tile bounds */
    profile: CalibrationProfile;
}

/**
 * Error indicating a point has no valid tiles.
 */
export interface BoundsValidationError {
    /** Error code for programmatic handling */
    code: 'no_valid_tile_for_point';
    /** Human-readable error message */
    message: string;
    /** ID of the invalid point */
    pointId: string;
}

/**
 * Validation result for a single point.
 */
export interface PointValidationResult {
    /** ID of the point */
    pointId: string;
    /** Whether the point is valid (has at least one valid tile) */
    isValid: boolean;
    /** Tile keys that can accommodate this point (in centered space) */
    validTileKeys: string[];
    /** Error if point is invalid */
    error?: BoundsValidationError;
}

/**
 * Aggregated validation result for all points.
 */
export interface PatternValidationResult {
    /** Whether all points are valid */
    isValid: boolean;
    /** Set of invalid point IDs for quick lookup */
    invalidPointIds: Set<string>;
    /** Detailed results per point */
    pointResults: Map<string, PointValidationResult>;
    /** List of all validation errors */
    errors: BoundsValidationError[];
}

/**
 * Check if a point (in centered space) is within bounds.
 */
function isPointInBounds(
    point: { x: number; y: number },
    bounds: { x: { min: number; max: number }; y: { min: number; max: number } },
): boolean {
    if (point.x < bounds.x.min || point.x > bounds.x.max) return false;
    if (point.y < bounds.y.min || point.y > bounds.y.max) return false;
    return true;
}

/**
 * Core validation logic shared between pattern points and waypoints.
 */
function validatePointsAgainstBounds(
    points: Array<{ id: string; x: number; y: number }>,
    params: ValidationParams,
): PatternValidationResult {
    const { profile } = params;
    const spaceParams = getSpaceParams(profile);

    const pointResults = new Map<string, PointValidationResult>();
    const invalidPointIds = new Set<string>();
    const errors: BoundsValidationError[] = [];

    // Get all calibrated tiles with bounds
    const tilesWithBounds = Object.entries(profile.tiles)
        .filter(([, tile]) => tile.combinedBounds !== null && tile.combinedBounds !== undefined)
        .map(([key, tile]) => ({
            key,
            bounds: tile.combinedBounds!,
        }));

    for (const point of points) {
        // Transform point from pattern space to centered space
        const centered = patternToCentered({ x: point.x, y: point.y }, spaceParams);

        // Find all tiles that can accommodate this point
        const validTileKeys = tilesWithBounds
            .filter(({ bounds }) => isPointInBounds(centered, bounds))
            .map(({ key }) => key);

        const isValid = validTileKeys.length > 0;

        const result: PointValidationResult = {
            pointId: point.id,
            isValid,
            validTileKeys,
        };

        if (!isValid) {
            const error: BoundsValidationError = {
                code: 'no_valid_tile_for_point',
                message: `Point "${point.id}" at (${point.x.toFixed(3)}, ${point.y.toFixed(3)}) is outside all tile bounds`,
                pointId: point.id,
            };
            result.error = error;
            errors.push(error);
            invalidPointIds.add(point.id);
        }

        pointResults.set(point.id, result);
    }

    return {
        isValid: invalidPointIds.size === 0,
        invalidPointIds,
        pointResults,
        errors,
    };
}

/**
 * Validate pattern points against calibration bounds.
 *
 * Transforms each point from pattern space to centered space (applying
 * rotation and aspect ratio), then checks against each tile's combinedBounds.
 *
 * @param points - Pattern points to validate
 * @param params - Validation parameters containing the calibration profile
 * @returns Validation result with per-point details and aggregated errors
 */
export function validatePatternInProfile(
    points: PatternPoint[],
    params: ValidationParams,
): PatternValidationResult {
    return validatePointsAgainstBounds(points, params);
}

/**
 * Validate animation waypoints against calibration bounds.
 *
 * Same logic as validatePatternInProfile, but accepts AnimationWaypoint array.
 *
 * @param waypoints - Animation waypoints to validate
 * @param params - Validation parameters containing the calibration profile
 * @returns Validation result with per-point details and aggregated errors
 */
export function validateWaypointsInProfile(
    waypoints: AnimationWaypoint[],
    params: ValidationParams,
): PatternValidationResult {
    return validatePointsAgainstBounds(waypoints, params);
}
