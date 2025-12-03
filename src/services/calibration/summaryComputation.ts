/**
 * Summary Computation Module
 *
 * Computes calibration run summary from tile results.
 * Pure functions for grid blueprint calculation and home offset computation.
 */

import type { BlobMeasurement, CalibrationGridBlueprint } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/** Tile address for summary computation */
export interface TileAddress {
    row: number;
    col: number;
    key: string;
}

/** Tile calibration result from measurement phase */
export interface TileCalibrationResult {
    tile: TileAddress;
    status: 'measuring' | 'completed' | 'failed' | 'skipped';
    error?: string;
    warnings?: string[];
    homeMeasurement?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number };
    adjustedHome?: { x: number; y: number };
    stepToDisplacement?: { x: number | null; y: number | null };
    sizeDeltaAtStepTest?: number | null;
}

/** Configuration for summary computation */
export interface SummaryConfig {
    gridSize: { rows: number; cols: number };
    gridGapNormalized: number;
    deltaSteps: number;
}

/** Full calibration run summary */
export interface CalibrationRunSummary {
    gridBlueprint: CalibrationGridBlueprint | null;
    stepTestSettings: {
        deltaSteps: number;
    };
    tiles: Record<string, TileCalibrationResult>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Recenter a measurement relative to the camera origin offset.
 */
function recenterMeasurement(
    measurement: BlobMeasurement,
    cameraOriginOffset: { x: number; y: number },
): BlobMeasurement {
    const recenteredStats = measurement.stats
        ? {
              ...measurement.stats,
              median: {
                  ...measurement.stats.median,
                  x: measurement.stats.median.x - cameraOriginOffset.x,
                  y: measurement.stats.median.y - cameraOriginOffset.y,
              },
          }
        : undefined;
    return {
        ...measurement,
        x: measurement.x - cameraOriginOffset.x,
        y: measurement.y - cameraOriginOffset.y,
        stats: recenteredStats,
    };
}

// =============================================================================
// GRID BLUEPRINT COMPUTATION
// =============================================================================

/**
 * Compute the grid blueprint from measured tiles.
 * Determines tile size, spacing, and grid origin.
 *
 * @param measuredTiles - Tiles with valid home measurements
 * @param config - Grid configuration
 * @returns Grid blueprint or null if no tiles measured
 */
export function computeGridBlueprint(
    measuredTiles: Array<{ tile: TileAddress; homeMeasurement: BlobMeasurement }>,
    config: SummaryConfig,
): CalibrationGridBlueprint | null {
    if (measuredTiles.length === 0) {
        return null;
    }

    // Find largest tile size
    const largestSize = measuredTiles.reduce((max, entry) => {
        const size = entry.homeMeasurement.size ?? 0;
        return size > max ? size : max;
    }, 0);

    const tileWidth = largestSize;
    const tileHeight = largestSize;

    // Calculate gap from normalized setting
    const normalizedGap = Math.max(0, Math.min(1, config.gridGapNormalized)) * 2;
    const gapX = normalizedGap;
    const gapY = normalizedGap;

    const spacingX = tileWidth + gapX;
    const spacingY = tileHeight + gapY;

    const totalWidth = config.gridSize.cols * tileWidth + (config.gridSize.cols - 1) * gapX;
    const totalHeight = config.gridSize.rows * tileHeight + (config.gridSize.rows - 1) * gapY;

    // Compute origin from minimum tile positions
    let minOriginX = Number.POSITIVE_INFINITY;
    let minOriginY = Number.POSITIVE_INFINITY;

    for (const entry of measuredTiles) {
        const measurement = entry.homeMeasurement;
        const candidateX = measurement.x - (entry.tile.col * spacingX + tileWidth / 2);
        const candidateY = measurement.y - (entry.tile.row * spacingY + tileHeight / 2);
        if (candidateX < minOriginX) {
            minOriginX = candidateX;
        }
        if (candidateY < minOriginY) {
            minOriginY = candidateY;
        }
    }

    let originX = Number.isFinite(minOriginX) ? minOriginX : 0;
    let originY = Number.isFinite(minOriginY) ? minOriginY : 0;

    // Center the grid
    const cameraOriginOffset = {
        x: originX + totalWidth / 2,
        y: originY + totalHeight / 2,
    };

    originX -= cameraOriginOffset.x;
    originY -= cameraOriginOffset.y;

    return {
        adjustedTileFootprint: {
            width: tileWidth,
            height: tileHeight,
        },
        tileGap: { x: gapX, y: gapY },
        gridOrigin: { x: originX, y: originY },
        cameraOriginOffset,
    };
}

// =============================================================================
// SUMMARY COMPUTATION
// =============================================================================

/**
 * Compute the full calibration run summary.
 * Calculates grid blueprint and home offsets for each tile.
 *
 * @param tileResults - Map of tile key to calibration result
 * @param config - Summary configuration
 * @returns Complete calibration run summary
 */
export function computeCalibrationSummary(
    tileResults: Map<string, TileCalibrationResult>,
    config: SummaryConfig,
): CalibrationRunSummary {
    // Filter to tiles with valid home measurements
    const measuredTiles = Array.from(tileResults.values())
        .filter(
            (entry): entry is TileCalibrationResult & { homeMeasurement: BlobMeasurement } =>
                (entry.status === 'completed' || entry.status === 'measuring') &&
                entry.homeMeasurement !== undefined,
        )
        .map((entry) => ({
            tile: entry.tile,
            homeMeasurement: entry.homeMeasurement,
        }));

    // Compute grid blueprint
    const gridBlueprint = computeGridBlueprint(measuredTiles, config);

    // Calculate spacing for offset computation
    const spacingX = gridBlueprint
        ? gridBlueprint.adjustedTileFootprint.width + gridBlueprint.tileGap.x
        : 0;
    const spacingY = gridBlueprint
        ? gridBlueprint.adjustedTileFootprint.height + gridBlueprint.tileGap.y
        : 0;

    // Process each tile result
    const summaryTiles: Record<string, TileCalibrationResult> = {};

    for (const [key, result] of tileResults.entries()) {
        // Recenter measurement if we have a grid blueprint
        const normalizedMeasurement =
            gridBlueprint && result.homeMeasurement
                ? recenterMeasurement(result.homeMeasurement, gridBlueprint.cameraOriginOffset)
                : (result.homeMeasurement ?? null);

        let tileSummary: TileCalibrationResult = normalizedMeasurement
            ? { ...result, homeMeasurement: normalizedMeasurement }
            : result;

        // Skip offset calculation for incomplete tiles
        if (result.status !== 'completed' || !normalizedMeasurement || !gridBlueprint) {
            summaryTiles[key] = tileSummary;
            continue;
        }

        // Calculate home offset (difference from ideal grid position)
        const tile = result.tile;
        const adjustedCenterX =
            gridBlueprint.gridOrigin.x +
            tile.col * spacingX +
            gridBlueprint.adjustedTileFootprint.width / 2;
        const adjustedCenterY =
            gridBlueprint.gridOrigin.y +
            tile.row * spacingY +
            gridBlueprint.adjustedTileFootprint.height / 2;

        const dx = normalizedMeasurement.x - adjustedCenterX;
        const dy = normalizedMeasurement.y - adjustedCenterY;

        tileSummary = {
            ...tileSummary,
            homeOffset: { dx, dy },
            adjustedHome: { x: adjustedCenterX, y: adjustedCenterY },
        };

        summaryTiles[key] = tileSummary;
    }

    return {
        gridBlueprint,
        stepTestSettings: {
            deltaSteps: config.deltaSteps,
        },
        tiles: summaryTiles,
    };
}
