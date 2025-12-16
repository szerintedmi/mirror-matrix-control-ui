/**
 * Bounds Computation Module
 *
 * Pure functions for computing motor-range bounds for calibration tiles.
 * Determines the reachable position range based on motor step limits
 * and step-to-displacement ratios from calibration.
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
