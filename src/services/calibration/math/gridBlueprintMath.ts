/**
 * Grid Blueprint Math Module
 *
 * Pure mathematical functions for grid blueprint calculations.
 * Handles pitch computation, grid origin calculation, and home offset computation.
 *
 * ## Coordinate Space Contract
 *
 * All `CenteredPoint` values in this module are in **Centered Coordinates**:
 * - Range: [-1, 1] for both x and y axes
 * - Origin: (0, 0) is center of camera frame
 * - Positive X: right, Positive Y: down
 *
 * All spacing/pitch/gap values are in **Centered Coordinate units** (same scale).
 *
 * Boundary functions that accept external inputs use `CenteredPoint` (branded type alias)
 * to prevent accidental mixing of coordinate spaces. Internal helpers use plain numbers
 * for simplicity.
 */

import { type CenteredCoord } from '@/coords';
import { STEP_EPSILON } from '@/utils/calibrationMath';

import { computeMedian } from './robustStatistics';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A point in Centered Coordinates [-1, 1].
 * Alias for CenteredCoord to make the coordinate space explicit at boundaries.
 */
export type CenteredPoint = CenteredCoord;

/**
 * Internal point type for computations within this module.
 * Use CenteredPoint at module boundaries; Point for internal helpers.
 */
interface Point {
    x: number;
    y: number;
}

/** Grid position with row and column indices */
export interface GridPosition {
    row: number;
    col: number;
}

/** Tile spacing (pitch) for both axes, in centered coordinate units */
export interface GridSpacing {
    spacingX: number;
    spacingY: number;
}

// =============================================================================
// STEP SCALE CONVERSION
// =============================================================================

/**
 * Compute step scale from displacement per step.
 * Step scale is the inverse of displacement per step.
 *
 * @param perStep - Displacement per motor step (centered coords per step)
 * @returns Steps per unit displacement, or null if perStep is too small
 */
export function computeStepScaleFromDisplacement(
    perStep: number | null | undefined,
): number | null {
    if (perStep == null || Math.abs(perStep) < STEP_EPSILON) {
        return null;
    }
    return 1 / perStep;
}

/**
 * Build step scale object from step-to-displacement vector.
 *
 * @param stepToDisplacement - Displacement per step for each axis
 * @returns Step scale for each axis, or null if both are null
 */
export function buildStepScale(
    stepToDisplacement: { x: number | null; y: number | null } | undefined,
): { x: number | null; y: number | null } | null {
    if (!stepToDisplacement) {
        return null;
    }
    const x = computeStepScaleFromDisplacement(stepToDisplacement.x);
    const y = computeStepScaleFromDisplacement(stepToDisplacement.y);
    if (x === null && y === null) {
        return null;
    }
    return { x, y };
}

// =============================================================================
// PITCH COMPUTATION
// =============================================================================

/**
 * Compute the axis pitch (spacing) from adjacent tile deltas.
 * Uses median for robustness against outliers.
 *
 * @param deltas - Array of absolute position differences between adjacent tiles
 * @returns Median pitch, or 0 if no deltas provided
 */
export function computeAxisPitch(deltas: number[]): number {
    if (deltas.length === 0) {
        return 0;
    }
    return computeMedian(deltas);
}

// =============================================================================
// GRID ORIGIN
// =============================================================================

/**
 * Compute the implied grid origin from a single tile's position.
 * The implied origin is where the grid origin would be if this tile
 * were exactly at its expected grid position.
 *
 * BOUNDARY FUNCTION: Accepts external input (from BlobMeasurement).
 *
 * @param tileCenter - Measured tile center position (centered coords)
 * @param gridPosition - Tile's row and column in the grid
 * @param spacing - Grid spacing (pitch) for each axis
 * @param halfTile - Half tile dimensions for centering
 * @returns Implied grid origin position
 */
export function computeImpliedOrigin(
    tileCenter: CenteredPoint,
    gridPosition: GridPosition,
    spacing: GridSpacing,
    halfTile: { x: number; y: number },
): Point {
    // Origin = tileCenter - (col * spacingX + halfTileX)
    const impliedOriginX = tileCenter.x - (gridPosition.col * spacing.spacingX + halfTile.x);
    const impliedOriginY = tileCenter.y - (gridPosition.row * spacing.spacingY + halfTile.y);
    return { x: impliedOriginX, y: impliedOriginY };
}

/**
 * Compute the grid origin from multiple implied origins.
 * Uses median of each axis for robustness.
 *
 * @param impliedOrigins - Array of implied origins from each tile
 * @returns Median grid origin, or (0, 0) if empty
 */
export function computeGridOrigin(impliedOrigins: Point[]): Point {
    if (impliedOrigins.length === 0) {
        return { x: 0, y: 0 };
    }

    const xValues = impliedOrigins.map((p) => p.x);
    const yValues = impliedOrigins.map((p) => p.y);

    return {
        x: computeMedian(xValues),
        y: computeMedian(yValues),
    };
}

/**
 * Compute the camera origin offset to center the grid.
 * This offset is used to recenter measurements relative to the grid center.
 *
 * @param gridOrigin - Computed grid origin
 * @param totalGridSize - Total grid dimensions (width, height)
 * @returns Camera origin offset
 */
export function computeCameraOriginOffset(
    gridOrigin: Point,
    totalGridSize: { width: number; height: number },
): Point {
    return {
        x: gridOrigin.x + totalGridSize.width / 2,
        y: gridOrigin.y + totalGridSize.height / 2,
    };
}

// =============================================================================
// HOME OFFSET
// =============================================================================

/**
 * Compute the home offset (deviation from ideal grid position).
 *
 * BOUNDARY FUNCTION: Accepts external input (from recentered BlobMeasurement).
 *
 * @param measurement - Actual measured position (centered coords)
 * @param adjustedCenter - Expected/ideal grid position
 * @returns Offset as { dx, dy } in centered coordinate units
 */
export function computeHomeOffset(
    measurement: CenteredPoint,
    adjustedCenter: Point,
): { dx: number; dy: number } {
    return {
        dx: measurement.x - adjustedCenter.x,
        dy: measurement.y - adjustedCenter.y,
    };
}

/**
 * Compute the adjusted center (ideal grid position) for a tile.
 *
 * @param gridOrigin - Grid origin position
 * @param gridPosition - Tile's row and column
 * @param spacing - Grid spacing (pitch)
 * @param halfTile - Half tile dimensions
 * @returns Adjusted center position
 */
export function computeAdjustedCenter(
    gridOrigin: Point,
    gridPosition: GridPosition,
    spacing: GridSpacing,
    halfTile: { x: number; y: number },
): Point {
    return {
        x: gridOrigin.x + gridPosition.col * spacing.spacingX + halfTile.x,
        y: gridOrigin.y + gridPosition.row * spacing.spacingY + halfTile.y,
    };
}
