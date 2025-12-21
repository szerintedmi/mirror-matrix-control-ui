import { convertNormalizedToSteps } from '@/components/calibration/calibrationMetricsFormatters';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { TileCalibrationResult, TileRunState } from '@/services/calibration/types';

/**
 * Input metrics extracted from TileRunState and TileCalibrationResult
 */
export interface TileMetricsInput {
    entry: TileRunState;
    summaryTile: TileCalibrationResult | null;
    deltaSteps: number;
}

/**
 * Home measurement data
 */
export interface HomeMeasurement {
    x: number;
    y: number;
    size?: number | null;
    response?: number | null;
    capturedAt?: number | null;
    stats?: {
        sampleCount: number;
        passed: boolean;
        nMad: { x: number; y: number; size: number };
        thresholds: {
            minSamples: number;
            maxMedianDeviationPt: number;
        };
    } | null;
}

/**
 * Offset values
 */
export interface HomeOffset {
    dx: number;
    dy: number;
}

/**
 * Step-to-displacement values per axis
 */
export interface StepToDisplacement {
    x: number | null;
    y: number | null;
}

/**
 * Step scale values per axis
 */
export interface AxisStepScale {
    x?: number | null;
    y?: number | null;
}

/**
 * Combined bounds from calibration (union of motor reach and footprint)
 */
export interface CombinedBounds {
    x: { min: number; max: number };
    y: { min: number; max: number };
}

/**
 * Computed tile metrics used for display
 */
export interface TileMetrics {
    home: HomeMeasurement | null;
    adjustedHome: { x: number; y: number } | null;
    homeOffset: HomeOffset | null;
    stepToDisplacement: StepToDisplacement | null;
    sizeDeltaAtStepTest: number | null;
    combinedBounds: CombinedBounds | null;
    axisStepScale: AxisStepScale | null;
    perStepX: number | null;
    perStepY: number | null;
    fallbackStepScaleX: number | null;
    fallbackStepScaleY: number | null;
    stepScaleX: number | null;
    stepScaleY: number | null;
    alignmentStepsX: number | null;
    alignmentStepsY: number | null;
    measuredShiftX: number | null;
    measuredShiftY: number | null;
    sizeAfterStep: number | null;
    hasMetrics: boolean;
    homeTimestamp: number | null;
    measurementStats: HomeMeasurement['stats'];
}

/**
 * Extract and compute all tile metrics from raw input data.
 */
export function computeTileMetrics(input: TileMetricsInput): TileMetrics {
    const { entry, summaryTile, deltaSteps } = input;
    const metrics = entry.metrics ?? {};

    // Extract raw measurements with fallback to summary tile
    const home = (metrics.home ?? summaryTile?.homeMeasurement ?? null) as HomeMeasurement | null;
    const adjustedHome = (metrics.adjustedHome ?? summaryTile?.adjustedHome ?? null) as {
        x: number;
        y: number;
    } | null;
    const homeOffset = (metrics.homeOffset ?? summaryTile?.homeOffset ?? null) as HomeOffset | null;
    const stepToDisplacement = (metrics.stepToDisplacement ??
        summaryTile?.stepToDisplacement ??
        null) as StepToDisplacement | null;
    const sizeDeltaAtStepTest = (metrics.sizeDeltaAtStepTest ??
        summaryTile?.sizeDeltaAtStepTest ??
        null) as number | null;
    const combinedBounds = (summaryTile?.combinedBounds ?? null) as CombinedBounds | null;
    const axisStepScale = (summaryTile?.stepScale ?? null) as AxisStepScale | null;

    // Per-step values
    const perStepX = stepToDisplacement?.x ?? null;
    const perStepY = stepToDisplacement?.y ?? null;

    // Fallback step scale (1 / stepToDisplacement)
    const fallbackStepScaleX = perStepX && Math.abs(perStepX) > 1e-9 ? 1 / perStepX : null;
    const fallbackStepScaleY = perStepY && Math.abs(perStepY) > 1e-9 ? 1 / perStepY : null;

    // Step scale with fallback
    const stepScaleX = axisStepScale?.x ?? fallbackStepScaleX;
    const stepScaleY = axisStepScale?.y ?? fallbackStepScaleY;

    // Alignment steps (motor steps needed to align to target)
    const alignmentStepsX = homeOffset
        ? convertNormalizedToSteps(
              -homeOffset.dx,
              perStepX,
              MOTOR_MIN_POSITION_STEPS,
              MOTOR_MAX_POSITION_STEPS,
          )
        : null;
    const alignmentStepsY = homeOffset
        ? convertNormalizedToSteps(
              -homeOffset.dy,
              perStepY,
              MOTOR_MIN_POSITION_STEPS,
              MOTOR_MAX_POSITION_STEPS,
          )
        : null;

    // Measured shift during step test
    const measuredShiftX =
        perStepX !== null && Number.isFinite(perStepX) && deltaSteps > 0
            ? perStepX * deltaSteps
            : null;
    const measuredShiftY =
        perStepY !== null && Number.isFinite(perStepY) && deltaSteps > 0
            ? perStepY * deltaSteps
            : null;

    // Size after step test
    const sizeAfterStep =
        home?.size !== null && home?.size !== undefined && sizeDeltaAtStepTest !== null
            ? home.size + sizeDeltaAtStepTest
            : null;

    // Whether any meaningful metrics exist
    const hasMetrics = Boolean(
        home ||
        adjustedHome ||
        homeOffset ||
        combinedBounds ||
        (stepToDisplacement && (stepToDisplacement.x || stepToDisplacement.y)) ||
        (axisStepScale && (axisStepScale.x || axisStepScale.y)),
    );

    return {
        home,
        adjustedHome,
        homeOffset,
        stepToDisplacement,
        sizeDeltaAtStepTest,
        combinedBounds,
        axisStepScale,
        perStepX,
        perStepY,
        fallbackStepScaleX,
        fallbackStepScaleY,
        stepScaleX,
        stepScaleY,
        alignmentStepsX,
        alignmentStepsY,
        measuredShiftX,
        measuredShiftY,
        sizeAfterStep,
        hasMetrics,
        homeTimestamp: home?.capturedAt ?? null,
        measurementStats: home?.stats ?? null,
    };
}

/**
 * Get a human-readable label for an axis assignment.
 */
export function getAxisAssignmentLabel(entry: TileRunState, axis: 'x' | 'y'): string {
    const motor = entry.assignment[axis];
    if (!motor) {
        return 'Unassigned';
    }
    return `${motor.nodeMac} · M${motor.motorIndex}`;
}
