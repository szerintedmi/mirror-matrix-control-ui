/**
 * Bounds Computation Module
 *
 * Pure functions for computing and merging calibration bounds.
 *
 * ## Coordinate Space
 *
 * All bounds use **centered normalized coordinates** where:
 * - X axis: [-1, 1] maps to camera width (left to right)
 * - Y axis: [-1, 1] maps to camera height (top to bottom)
 *
 * ## Bounds Types
 *
 * - **motorReachBounds**: Physical motor limits projected to centered coords.
 *   Derived from motor step limits and step-to-displacement ratios.
 * - **footprintBounds**: Tile footprint from grid blueprint dimensions.
 *   Represents the physical extent of the tile on the canvas.
 * - **combinedBounds**: Union of motorReachBounds and footprintBounds.
 *   Used for pattern validation and UI overlays.
 */

import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type {
    CalibrationGridBlueprint,
    CalibrationProfileBounds,
    CalibrationTilePosition,
} from '@/types';
import { STEP_EPSILON, clampNormalized } from '@/utils/calibrationMath';

/**
 * Step-to-displacement vector for X and Y axes.
 * Values are in centered coordinates per motor step.
 */
export type StepVector = {
    x: number | null;
    y: number | null;
};

/**
 * Compute bounds for a single axis.
 * Returns the min/max normalized position the tile can reach based on motor limits.
 *
 * @param center - Current position in centered coordinates
 * @param centerSteps - Motor step position at the center position
 * @param perStep - Displacement per motor step (centered coords per step)
 * @returns Bounds { min, max } or null if data is insufficient
 */
export function computeAxisBounds(
    center: number | null,
    centerSteps: number | null,
    perStep: number | null,
): { min: number; max: number } | null {
    if (
        center == null ||
        centerSteps == null ||
        perStep == null ||
        Math.abs(perStep) < STEP_EPSILON
    ) {
        return null;
    }
    const deltaMin = MOTOR_MIN_POSITION_STEPS - centerSteps;
    const deltaMax = MOTOR_MAX_POSITION_STEPS - centerSteps;
    const candidateA = clampNormalized(center + deltaMin * perStep);
    const candidateB = clampNormalized(center + deltaMax * perStep);
    return {
        min: Math.min(candidateA, candidateB),
        max: Math.max(candidateA, candidateB),
    };
}

/**
 * Compute tile bounds from adjusted home position and step-to-displacement ratios.
 * Uses the full CalibrationTilePosition which includes stepsX/stepsY.
 *
 * @param adjustedHome - Calibrated home position with motor step values
 * @param stepToDisplacement - Displacement per step for each axis
 * @returns Bounds in centered coordinates or null if data is insufficient
 */
export function computeTileBounds(
    adjustedHome: CalibrationTilePosition | null,
    stepToDisplacement: StepVector,
): CalibrationProfileBounds | null {
    if (!adjustedHome) {
        return null;
    }
    const boundsX = computeAxisBounds(adjustedHome.x, adjustedHome.stepsX, stepToDisplacement.x);
    const boundsY = computeAxisBounds(adjustedHome.y, adjustedHome.stepsY, stepToDisplacement.y);
    if (!boundsX || !boundsY) {
        return null;
    }
    return {
        x: boundsX,
        y: boundsY,
    };
}

/**
 * Compute tile bounds during live calibration.
 * Uses raw home measurement position with motor at step 0 (homed state).
 * This is suitable for showing bounds during calibration before the
 * adjusted home position with step offsets is computed.
 *
 * @param homePosition - Raw home measurement position (centered coords)
 * @param stepToDisplacement - Displacement per step for each axis (from step tests)
 * @returns Bounds in centered coordinates or null if data is insufficient
 */
export function computeLiveTileBounds(
    homePosition: { x: number; y: number },
    stepToDisplacement: StepVector,
): CalibrationProfileBounds | null {
    // Motors are at step 0 when home measurement is taken (after homing)
    const boundsX = computeAxisBounds(homePosition.x, 0, stepToDisplacement.x);
    const boundsY = computeAxisBounds(homePosition.y, 0, stepToDisplacement.y);
    if (!boundsX || !boundsY) {
        return null;
    }
    return {
        x: boundsX,
        y: boundsY,
    };
}

/**
 * Compute the footprint bounds of a tile using the grid blueprint.
 * Converts tile footprint and gap into isotropic centered coordinates so
 * downstream consumers (planner, overlays) see consistent ranges.
 */
export const computeBlueprintFootprintBounds = (
    blueprint: CalibrationGridBlueprint,
    row: number,
    col: number,
): CalibrationProfileBounds => {
    const sourceWidth = blueprint.sourceWidth ?? 1920;
    const sourceHeight = blueprint.sourceHeight ?? 1080;
    const avgDim = (sourceWidth + sourceHeight) / 2;

    const isoFactorX = avgDim / sourceWidth;
    const isoFactorY = avgDim / sourceHeight;

    const tileWidth = blueprint.adjustedTileFootprint.width;
    const tileHeight = blueprint.adjustedTileFootprint.height;
    const gapX = blueprint.tileGap?.x ?? 0;
    const gapY = blueprint.tileGap?.y ?? gapX;

    const baseSpacingX = tileWidth + gapX;
    const baseSpacingY = tileHeight + gapY;

    const spacingXCentered = baseSpacingX * isoFactorX;
    const spacingYCentered = baseSpacingY * isoFactorY;

    const tileSizeXCentered = tileWidth * isoFactorX;
    const tileSizeYCentered = tileHeight * isoFactorY;

    const minX = blueprint.gridOrigin.x + col * spacingXCentered;
    const minY = blueprint.gridOrigin.y + row * spacingYCentered;

    return {
        x: {
            min: minX,
            max: minX + tileSizeXCentered,
        },
        y: {
            min: minY,
            max: minY + tileSizeYCentered,
        },
    };
};

// ============================================================================
// Bounds Merge Helpers
// ============================================================================

/**
 * Compute the intersection of two bounds (AND operation).
 *
 * Returns the overlapping region of current and candidate bounds.
 * If current is null, returns a copy of candidate.
 * If there is no overlap, returns null.
 *
 * Use case: Computing global bounds across all tiles (joint constraint).
 *
 * @param current - Existing bounds to merge into, or null
 * @param candidate - New bounds to intersect with
 * @returns Intersection bounds, or null if no overlap
 */
export const mergeBoundsIntersection = (
    current: CalibrationProfileBounds | null,
    candidate: CalibrationProfileBounds,
): CalibrationProfileBounds | null => {
    if (!current) {
        return {
            x: { ...candidate.x },
            y: { ...candidate.y },
        };
    }
    const minX = Math.max(current.x.min, candidate.x.min);
    const maxX = Math.min(current.x.max, candidate.x.max);
    const minY = Math.max(current.y.min, candidate.y.min);
    const maxY = Math.min(current.y.max, candidate.y.max);
    if (minX > maxX || minY > maxY) {
        return null;
    }
    return {
        x: { min: minX, max: maxX },
        y: { min: minY, max: maxY },
    };
};

/**
 * Compute the union of two bounds (OR operation).
 *
 * Returns the outer envelope encompassing both bounds.
 * If current is null, returns a copy of candidate.
 *
 * Use case: Combining motor reach bounds with footprint bounds.
 *
 * @param current - Existing bounds to merge into, or null
 * @param candidate - New bounds to union with
 * @returns Union bounds (outer envelope)
 */
export const mergeBoundsUnion = (
    current: CalibrationProfileBounds | null,
    candidate: CalibrationProfileBounds,
): CalibrationProfileBounds => {
    if (!current) {
        return {
            x: { ...candidate.x },
            y: { ...candidate.y },
        };
    }
    return {
        x: {
            min: Math.min(current.x.min, candidate.x.min),
            max: Math.max(current.x.max, candidate.x.max),
        },
        y: {
            min: Math.min(current.y.min, candidate.y.min),
            max: Math.max(current.y.max, candidate.y.max),
        },
    };
};

/**
 * Merge bounds with blueprint footprint using union.
 *
 * Expands the input bounds to include the tile's blueprint footprint.
 * If bounds is null, returns the blueprint footprint.
 * If blueprint is null, returns the original bounds.
 *
 * Use case: Computing combinedBounds from motorReachBounds.
 *
 * @param bounds - Motor reach bounds, or null
 * @param blueprint - Grid blueprint for footprint calculation, or null
 * @param row - Tile row index
 * @param col - Tile column index
 * @returns Merged bounds (union of bounds and footprint)
 */
export const mergeWithBlueprintFootprint = (
    bounds: CalibrationProfileBounds | null,
    blueprint: CalibrationGridBlueprint | null,
    row: number,
    col: number,
): CalibrationProfileBounds | null => {
    if (!blueprint) {
        return bounds;
    }
    const footprint = computeBlueprintFootprintBounds(blueprint, row, col);
    if (!bounds) {
        return footprint;
    }
    return mergeBoundsUnion(bounds, footprint);
};
