/**
 * Expected Position Calculator
 *
 * Computes expected blob positions for calibration tiles.
 * All coordinate conversions are explicit and type-safe.
 *
 * COORDINATE FLOW:
 * - Completed measurements come in as CenteredCoord [-1,1]
 * - Grid estimation works in ViewportCoord [0,1] space
 * - Output is ViewportCoord [0,1] for blob selection API
 */

import type { ArrayRotation, NormalizedRoi } from '@/types';
import {
    type ViewportCoord,
    type CenteredCoord,
    asViewport,
    centeredToViewport,
} from '@/utils/coordinates';

// =============================================================================
// TYPES
// =============================================================================

/** A completed tile measurement with position in centered coordinates */
export interface TileMeasurement {
    row: number;
    col: number;
    /** Position in centered coordinates (-1 to 1) */
    position: CenteredCoord;
}

/** Grid estimate from completed measurements */
export interface GridEstimate {
    /** Grid origin X in viewport coords */
    originX: number;
    /** Grid origin Y in viewport coords */
    originY: number;
    /** Tile spacing in X direction (viewport units) */
    spacingX: number;
    /** Tile spacing in Y direction (viewport units) */
    spacingY: number;
}

/** Configuration for expected position calculation */
export interface ExpectedPositionConfig {
    gridSize: { rows: number; cols: number };
    arrayRotation: ArrayRotation;
    roi: NormalizedRoi;
}

/** Default spacing assumption when only one tile is measured (15% of view) */
const DEFAULT_TILE_SPACING = 0.15;

// =============================================================================
// TILE COORDINATE TRANSFORMATION
// =============================================================================

/**
 * Transforms logical tile (row, col) to camera-view coordinates,
 * accounting for physical array rotation.
 *
 * @param row - Logical tile row
 * @param col - Logical tile column
 * @param gridSize - Grid dimensions
 * @param rotation - Physical array rotation (0, 90, 180, 270 degrees)
 * @returns Camera-view row and column
 */
export function transformTileToCamera(
    row: number,
    col: number,
    gridSize: { rows: number; cols: number },
    rotation: ArrayRotation,
): { camRow: number; camCol: number } {
    switch (rotation) {
        case 0:
            return { camRow: row, camCol: col };
        case 90:
            // 90° CW: row becomes -col, col becomes row
            return { camRow: col, camCol: gridSize.rows - 1 - row };
        case 180:
            // 180°: both inverted
            return {
                camRow: gridSize.rows - 1 - row,
                camCol: gridSize.cols - 1 - col,
            };
        case 270:
            // 270° CW: row becomes col, col becomes -row
            return { camRow: gridSize.cols - 1 - col, camCol: row };
        default:
            return { camRow: row, camCol: col };
    }
}

// =============================================================================
// GRID ESTIMATION
// =============================================================================

/**
 * Estimates grid parameters (origin, spacing) from completed measurements.
 *
 * The measurements are converted from centered coords to viewport coords,
 * transformed to account for array rotation, then used to estimate:
 * - Grid spacing from adjacent tile distances
 * - Grid origin from back-calculating using spacing
 *
 * @param measurements - Completed tile measurements in centered coords
 * @param gridSize - Grid dimensions
 * @param rotation - Physical array rotation
 * @returns Grid estimate with origin and spacing in viewport coords
 */
export function estimateGridFromMeasurements(
    measurements: TileMeasurement[],
    gridSize: { rows: number; cols: number },
    rotation: ArrayRotation,
): GridEstimate {
    // Convert centered coords to viewport and transform to camera coords
    const camMeasurements = measurements.map((m) => {
        const { camRow, camCol } = transformTileToCamera(m.row, m.col, gridSize, rotation);
        // Convert centered (-1 to 1) -> viewport (0 to 1)
        const viewport = centeredToViewport(m.position);
        return { row: camRow, col: camCol, x: viewport.x, y: viewport.y };
    });

    if (camMeasurements.length === 1) {
        // Only one tile measured - use default spacing assumption
        const m = camMeasurements[0];
        return {
            originX: m.x - m.col * DEFAULT_TILE_SPACING,
            originY: m.y - m.row * DEFAULT_TILE_SPACING,
            spacingX: DEFAULT_TILE_SPACING,
            spacingY: DEFAULT_TILE_SPACING,
        };
    }

    // Multiple tiles - calculate actual spacing from adjacent tiles
    let sumSpacingX = 0;
    let countX = 0;
    let sumSpacingY = 0;
    let countY = 0;

    for (let i = 0; i < camMeasurements.length; i++) {
        for (let j = i + 1; j < camMeasurements.length; j++) {
            const a = camMeasurements[i];
            const b = camMeasurements[j];

            // Adjacent in column direction (same row)
            if (a.row === b.row && Math.abs(a.col - b.col) === 1) {
                sumSpacingX += Math.abs(a.x - b.x);
                countX++;
            }
            // Adjacent in row direction (same column)
            if (a.col === b.col && Math.abs(a.row - b.row) === 1) {
                sumSpacingY += Math.abs(a.y - b.y);
                countY++;
            }
        }
    }

    const spacingX = countX > 0 ? sumSpacingX / countX : DEFAULT_TILE_SPACING;
    const spacingY = countY > 0 ? sumSpacingY / countY : DEFAULT_TILE_SPACING;

    // Calculate grid origin by averaging back-calculated origins
    let sumOriginX = 0;
    let sumOriginY = 0;
    for (const m of camMeasurements) {
        sumOriginX += m.x - m.col * spacingX;
        sumOriginY += m.y - m.row * spacingY;
    }

    return {
        originX: sumOriginX / camMeasurements.length,
        originY: sumOriginY / camMeasurements.length,
        spacingX,
        spacingY,
    };
}

// =============================================================================
// EXPECTED POSITION CALCULATION
// =============================================================================

/**
 * Computes expected blob position for first tile.
 * Returns position at the left edge of ROI, vertically centered.
 *
 * The first tile calibrated is (0,0) - top-left in logical coordinates.
 * This typically appears at the left side of the camera view.
 *
 * @param roi - Region of interest bounds (viewport coords)
 * @returns Expected position at ROI left edge, vertically centered
 */
export function computeFirstTileExpected(roi: NormalizedRoi): ViewportCoord {
    // First tile (0,0) expected at left edge of ROI, centered vertically
    const roiLeftX = roi.x;
    const roiCenterY = roi.y + roi.height / 2;
    return asViewport(roiLeftX, roiCenterY);
}

/**
 * Computes expected blob position for a tile based on grid estimate.
 * Returns position in viewport coordinates.
 *
 * @param row - Tile row
 * @param col - Tile column
 * @param gridEstimate - Grid parameters from prior measurements
 * @param gridSize - Grid dimensions
 * @param rotation - Physical array rotation
 * @returns Expected position in viewport coords
 */
export function computeExpectedFromGrid(
    row: number,
    col: number,
    gridEstimate: GridEstimate,
    gridSize: { rows: number; cols: number },
    rotation: ArrayRotation,
): ViewportCoord {
    const { camRow, camCol } = transformTileToCamera(row, col, gridSize, rotation);

    // Calculate expected position from grid origin and spacing
    const x = gridEstimate.originX + camCol * gridEstimate.spacingX;
    const y = gridEstimate.originY + camRow * gridEstimate.spacingY;

    return asViewport(x, y);
}

/**
 * Main entry point: computes expected blob position for a tile.
 *
 * Strategy:
 * - First tile (no prior measurements): Use ROI center
 * - Subsequent tiles: Derive from grid estimate based on measured tiles
 *
 * @param row - Tile row
 * @param col - Tile column
 * @param completedMeasurements - Prior tile measurements in centered coords
 * @param config - Configuration (grid size, rotation, ROI, camera)
 * @returns Expected position in viewport coordinates [0, 1]
 */
export function computeExpectedBlobPosition(
    row: number,
    col: number,
    completedMeasurements: TileMeasurement[],
    config: ExpectedPositionConfig,
): ViewportCoord {
    if (completedMeasurements.length === 0) {
        // FIRST TILE: Use ROI center
        return computeFirstTileExpected(config.roi);
    }

    // SUBSEQUENT TILES: Estimate grid from prior measurements
    const gridEstimate = estimateGridFromMeasurements(
        completedMeasurements,
        config.gridSize,
        config.arrayRotation,
    );

    return computeExpectedFromGrid(row, col, gridEstimate, config.gridSize, config.arrayRotation);
}
