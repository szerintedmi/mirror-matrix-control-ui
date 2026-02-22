/**
 * Step Test Calculations Module
 *
 * Pure functions for step test computations during calibration.
 * Handles displacement calculations, per-step ratios, and alignment target computation.
 */

import { MOTOR_MAX_POSITION_STEPS } from '@/constants/control';
import type { ArrayRotation, BlobMeasurement, StagingPosition } from '@/types';
import { getStepTestJogDirection } from '@/utils/arrayRotation';

import {
    clampSteps,
    computeNearestCornerTarget,
    type GridSize,
    type TilePosition,
} from './stagingCalculations';

// =============================================================================
// TYPES
// =============================================================================

export type Axis = 'x' | 'y';

/** Result of a single axis step test */
export interface AxisStepTestResult {
    /** Displacement in centered coordinates */
    displacement: number;
    /** Displacement per motor step */
    perStep: number | null;
    /** Size change during step test */
    sizeDelta: number | null;
}

/** Combined step test results for both axes */
export interface StepTestResults {
    stepToDisplacement: { x: number | null; y: number | null };
    sizeDeltaAtStepTest: number | null;
}

// =============================================================================
// STEP DELTA CALCULATION
// =============================================================================

/**
 * Calculate the motor step delta for a given axis during step testing.
 * Takes into account the array rotation to determine jog direction.
 *
 * @param axis - The axis being tested ('x' or 'y')
 * @param deltaSteps - Base number of steps to move
 * @param arrayRotation - Current array rotation (0, 90, 180, 270)
 * @returns Clamped step delta with correct sign, or null if invalid
 */
export function getAxisStepDelta(
    axis: Axis,
    deltaSteps: number,
    arrayRotation: ArrayRotation,
): number | null {
    if (deltaSteps <= 0) {
        return null;
    }
    const jogDirection = getStepTestJogDirection(axis, arrayRotation);
    return clampSteps(deltaSteps * jogDirection);
}

/**
 * Compute an adaptive step delta that jogs away from the tile's staging corner.
 *
 * With nearest-corner staging, tiles park at the corner matching their grid quadrant.
 * If the default jog direction would move the blob towards that same corner, flip it
 * so the step test blob doesn't overlap with parked tiles.
 *
 * For other staging modes or when the default direction already goes away from
 * the staging corner, returns the standard delta unchanged.
 */
export function getAdaptiveStepDelta(
    axis: Axis,
    deltaSteps: number,
    arrayRotation: ArrayRotation,
    tile: TilePosition,
    gridSize: GridSize,
    stagingPosition: StagingPosition,
): number | null {
    const baseDelta = getAxisStepDelta(axis, deltaSteps, arrayRotation);
    if (baseDelta === null || stagingPosition !== 'nearest-corner') {
        return baseDelta;
    }

    // Determine where this tile's quadrant parks
    const cornerTarget = computeNearestCornerTarget(tile, gridSize, arrayRotation);
    const stagingValue = axis === 'x' ? cornerTarget.x : cornerTarget.y;

    // If the jog goes in the same direction as the staging corner, flip it
    if (Math.sign(baseDelta) === Math.sign(stagingValue) && stagingValue !== 0) {
        return clampSteps(-baseDelta);
    }

    return baseDelta;
}

// =============================================================================
// DISPLACEMENT CALCULATIONS
// =============================================================================

/**
 * Compute the displacement and per-step ratio from step test measurements.
 *
 * @param homeMeasurement - Measurement at home position
 * @param stepMeasurement - Measurement after moving by delta steps
 * @param axis - Which axis was moved ('x' or 'y')
 * @param deltaSteps - Number of steps moved
 * @returns Step test result with displacement, per-step ratio, and size delta
 */
export function computeAxisStepTestResult(
    homeMeasurement: BlobMeasurement,
    stepMeasurement: BlobMeasurement,
    axis: Axis,
    deltaSteps: number,
): AxisStepTestResult {
    const displacement =
        axis === 'x'
            ? stepMeasurement.x - homeMeasurement.x
            : stepMeasurement.y - homeMeasurement.y;

    const perStep = deltaSteps !== 0 ? displacement / deltaSteps : null;
    const validPerStep = perStep !== null && Number.isFinite(perStep) ? perStep : null;

    const sizeDelta = stepMeasurement.size - homeMeasurement.size;
    const validSizeDelta = Number.isFinite(sizeDelta) ? sizeDelta : null;

    return {
        displacement,
        perStep: validPerStep,
        sizeDelta: validSizeDelta,
    };
}

/**
 * Compute the average size delta from multiple step test results.
 *
 * @param sizeDeltas - Array of size deltas from step tests
 * @returns Average size delta, or null if no valid deltas
 */
export function computeAverageSizeDelta(sizeDeltas: number[]): number | null {
    if (sizeDeltas.length === 0) {
        return null;
    }
    const sum = sizeDeltas.reduce((acc, value) => acc + value, 0);
    return sum / sizeDeltas.length;
}

// =============================================================================
// ALIGNMENT TARGET CALCULATION
// =============================================================================

/**
 * Compute the number of motor steps needed to move by a given displacement.
 * Used for grid alignment after calibration.
 *
 * @param displacement - Desired displacement in centered coordinates
 * @param perStep - Displacement per motor step (from step test)
 * @returns Number of steps needed, clamped to valid range, or null if invalid
 */
export function computeAlignmentTargetSteps(
    displacement: number,
    perStep: number | null,
): number | null {
    if (
        perStep === null ||
        perStep === 0 ||
        !Number.isFinite(perStep) ||
        Math.abs(perStep) < 1e-6
    ) {
        return null;
    }
    const rawSteps = displacement / perStep;
    if (!Number.isFinite(rawSteps) || Math.abs(rawSteps) > MOTOR_MAX_POSITION_STEPS) {
        return null;
    }
    return clampSteps(Math.round(rawSteps));
}

// =============================================================================
// COMBINED STEP TEST COMPUTATION
// =============================================================================

/**
 * Combine individual axis step test results into a complete step test result.
 *
 * @param xResult - X axis step test result (or null if not tested)
 * @param yResult - Y axis step test result (or null if not tested)
 * @returns Combined step test results
 */
export function combineStepTestResults(
    xResult: AxisStepTestResult | null,
    yResult: AxisStepTestResult | null,
): StepTestResults {
    const sizeDeltas: number[] = [];

    if (xResult?.sizeDelta !== null && xResult?.sizeDelta !== undefined) {
        sizeDeltas.push(xResult.sizeDelta);
    }
    if (yResult?.sizeDelta !== null && yResult?.sizeDelta !== undefined) {
        sizeDeltas.push(yResult.sizeDelta);
    }

    return {
        stepToDisplacement: {
            x: xResult?.perStep ?? null,
            y: yResult?.perStep ?? null,
        },
        sizeDeltaAtStepTest: computeAverageSizeDelta(sizeDeltas),
    };
}
