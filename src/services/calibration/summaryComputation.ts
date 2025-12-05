/**
 * Summary Computation Module
 *
 * Computes calibration run summary from tile results.
 * Pure functions for grid blueprint calculation and home offset computation.
 */

import {
    GRID_GAP_MIN_NORMALIZED,
    GRID_GAP_MAX_NORMALIZED,
    type RobustTileSizeConfig,
} from '@/constants/calibration';
import type { BlobMeasurement, CalibrationGridBlueprint, CalibrationProfileBounds } from '@/types';

import { computeLiveTileBounds } from './boundsComputation';
import { RobustMaxSizingStrategy, type TileEntry } from './math/blueprintStrategies';

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
    /** Motor-range bounds computed from step tests (for live display during calibration) */
    inferredBounds?: CalibrationProfileBounds | null;
}

/** Configuration for summary computation */
export interface SummaryConfig {
    gridSize: { rows: number; cols: number };
    gridGapNormalized: number;
    deltaSteps: number;
    /** Configuration for robust tile sizing (outlier detection). */
    robustTileSize?: RobustTileSizeConfig;
}

/**
 * Outlier analysis results from robust tile sizing.
 */
export interface OutlierAnalysis {
    /** Whether robust sizing was enabled */
    enabled: boolean;
    /** Tile keys identified as outliers */
    outlierTileKeys: string[];
    /** Number of outliers detected */
    outlierCount: number;
    /** Median blob size across all tiles */
    median: number;
    /** Median Absolute Deviation (non-normalized) */
    mad: number;
    /** Normalized MAD (comparable to standard deviation) */
    nMad: number;
    /** Upper threshold for outlier detection (median + madThreshold * nMad) */
    upperThreshold: number;
    /** Tile size computed (robust max or regular max) */
    computedTileSize: number;
}

/** Full calibration run summary */
export interface CalibrationRunSummary {
    gridBlueprint: CalibrationGridBlueprint | null;
    stepTestSettings: {
        deltaSteps: number;
    };
    tiles: Record<string, TileCalibrationResult>;
    /** Outlier analysis results (present when robust tile sizing is enabled) */
    outlierAnalysis?: OutlierAnalysis;
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
 * Result of grid blueprint computation including outlier analysis.
 */
export interface GridBlueprintResult {
    blueprint: CalibrationGridBlueprint | null;
    outlierAnalysis: OutlierAnalysis;
}

/**
 * Compute the grid blueprint from measured tiles.
 * Determines tile size, spacing, and grid origin.
 *
 * Uses isotropic spacing conversion to ensure uniform pixel spacing across both axes,
 * accounting for different X/Y scales in centered coordinates.
 *
 * When robust tile sizing is enabled (default), outlier measurements are excluded
 * from the tile size calculation to prevent a single oversized mirror from
 * inflating the entire grid.
 *
 * @param measuredTiles - Tiles with valid home measurements
 * @param config - Grid configuration
 * @returns Grid blueprint result with blueprint and outlier analysis
 */
export function computeGridBlueprint(
    measuredTiles: Array<{ tile: TileAddress; homeMeasurement: BlobMeasurement }>,
    config: SummaryConfig,
): GridBlueprintResult {
    const emptyAnalysis: OutlierAnalysis = {
        enabled: config.robustTileSize?.enabled ?? true,
        outlierTileKeys: [],
        outlierCount: 0,
        median: 0,
        mad: 0,
        nMad: 0,
        upperThreshold: 0,
        computedTileSize: 0,
    };

    if (measuredTiles.length === 0) {
        return { blueprint: null, outlierAnalysis: emptyAnalysis };
    }

    // Get camera dimensions from first measurement for isotropic conversion
    const firstMeasurement = measuredTiles[0].homeMeasurement;
    const sourceWidth = firstMeasurement.sourceWidth ?? 1920;
    const sourceHeight = firstMeasurement.sourceHeight ?? 1080;
    const avgDim = (sourceWidth + sourceHeight) / 2;

    // Isotropic conversion factors: multiply centered deltas by these to get
    // centered values that produce uniform pixel spacing
    const isoFactorX = avgDim / sourceWidth;
    const isoFactorY = avgDim / sourceHeight;

    // Compute tile size using robust max (excluding outliers) or regular max
    const robustEnabled = config.robustTileSize?.enabled ?? true;
    const madThreshold = config.robustTileSize?.madThreshold ?? 3.0;

    let tileSize: number;
    let outlierAnalysis: OutlierAnalysis;

    if (robustEnabled && measuredTiles.length > 1) {
        // Use robust max sizing strategy
        const strategy = new RobustMaxSizingStrategy(madThreshold);
        const entries: TileEntry[] = measuredTiles.map((entry) => ({
            key: entry.tile.key,
            size: entry.homeMeasurement.size ?? 0,
        }));

        const { result, outlierDetection } = strategy.computeWithKeys(entries);
        tileSize = result.tileSize;

        outlierAnalysis = {
            enabled: true,
            outlierTileKeys: outlierDetection.outliers.map((e) => e.key),
            outlierCount: outlierDetection.outliers.length,
            median: outlierDetection.median,
            mad: outlierDetection.mad,
            nMad: outlierDetection.nMad,
            upperThreshold: outlierDetection.upperThreshold,
            computedTileSize: tileSize,
        };
    } else {
        // Use regular max (legacy behavior or single tile)
        tileSize = measuredTiles.reduce((max, entry) => {
            const size = entry.homeMeasurement.size ?? 0;
            return size > max ? size : max;
        }, 0);

        outlierAnalysis = {
            enabled: false,
            outlierTileKeys: [],
            outlierCount: 0,
            median: tileSize,
            mad: 0,
            nMad: 0,
            upperThreshold: tileSize,
            computedTileSize: tileSize,
        };
    }

    const tileWidth = tileSize;
    const tileHeight = tileSize;

    // Calculate gap from normalized setting (allow negative values for overlap)
    const clampedGap = Math.max(
        GRID_GAP_MIN_NORMALIZED,
        Math.min(GRID_GAP_MAX_NORMALIZED, config.gridGapNormalized),
    );
    const normalizedGap = clampedGap * 2; // Convert to centered coordinate scale
    const gapX = normalizedGap;
    const gapY = normalizedGap;

    // Base spacing in centered coords (stored in blueprint for reference)
    const baseSpacing = tileWidth + gapX;
    const halfTile = tileWidth / 2;

    // Isotropic spacing: converts to centered coords that produce same pixel distance
    const spacingXCentered = baseSpacing * isoFactorX;
    const spacingYCentered = baseSpacing * isoFactorY;
    const halfTileXCentered = halfTile * isoFactorX;
    const halfTileYCentered = halfTile * isoFactorY;

    // Total grid dimensions in isotropic centered coords
    const totalWidth =
        config.gridSize.cols * tileWidth * isoFactorX +
        (config.gridSize.cols - 1) * gapX * isoFactorX;
    const totalHeight =
        config.gridSize.rows * tileHeight * isoFactorY +
        (config.gridSize.rows - 1) * gapY * isoFactorY;

    // Compute origin from minimum tile positions using isotropic spacing
    let minOriginX = Number.POSITIVE_INFINITY;
    let minOriginY = Number.POSITIVE_INFINITY;

    for (const entry of measuredTiles) {
        const measurement = entry.homeMeasurement;
        const candidateX = measurement.x - (entry.tile.col * spacingXCentered + halfTileXCentered);
        const candidateY = measurement.y - (entry.tile.row * spacingYCentered + halfTileYCentered);
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

    const blueprint: CalibrationGridBlueprint = {
        adjustedTileFootprint: {
            width: tileWidth,
            height: tileHeight,
        },
        tileGap: { x: gapX, y: gapY },
        gridOrigin: { x: originX, y: originY },
        cameraOriginOffset,
        // Store camera dimensions for isotropic spacing calculations
        sourceWidth,
        sourceHeight,
    };

    return { blueprint, outlierAnalysis };
}

// =============================================================================
// SUMMARY COMPUTATION
// =============================================================================

/**
 * Compute the full calibration run summary.
 * Calculates grid blueprint and home offsets for each tile.
 *
 * Uses isotropic spacing conversion to ensure uniform pixel spacing across both axes.
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

    // Compute grid blueprint with outlier analysis
    const { blueprint: gridBlueprint, outlierAnalysis } = computeGridBlueprint(
        measuredTiles,
        config,
    );

    // Get camera dimensions for isotropic conversion (must match computeGridBlueprint)
    const firstMeasurement = measuredTiles[0]?.homeMeasurement;
    const sourceWidth = firstMeasurement?.sourceWidth ?? 1920;
    const sourceHeight = firstMeasurement?.sourceHeight ?? 1080;
    const avgDim = (sourceWidth + sourceHeight) / 2;

    // Isotropic conversion factors
    const isoFactorX = avgDim / sourceWidth;
    const isoFactorY = avgDim / sourceHeight;

    // Calculate isotropic spacing for offset computation
    const baseSpacing = gridBlueprint
        ? gridBlueprint.adjustedTileFootprint.width + gridBlueprint.tileGap.x
        : 0;
    const spacingXCentered = baseSpacing * isoFactorX;
    const spacingYCentered = baseSpacing * isoFactorY;

    const halfTile = gridBlueprint ? gridBlueprint.adjustedTileFootprint.width / 2 : 0;
    const halfTileXCentered = halfTile * isoFactorX;
    const halfTileYCentered = halfTile * isoFactorY;

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
        // Uses isotropic spacing to ensure uniform pixel spacing
        const tile = result.tile;
        const adjustedCenterX =
            gridBlueprint.gridOrigin.x + tile.col * spacingXCentered + halfTileXCentered;
        const adjustedCenterY =
            gridBlueprint.gridOrigin.y + tile.row * spacingYCentered + halfTileYCentered;

        const dx = normalizedMeasurement.x - adjustedCenterX;
        const dy = normalizedMeasurement.y - adjustedCenterY;

        // Compute inferred bounds for live display during calibration
        // Uses normalized home measurement (recentered) so bounds are relative to grid origin
        // This matches how homeMeasurement is stored in the summary
        const inferredBounds =
            normalizedMeasurement && result.stepToDisplacement
                ? computeLiveTileBounds(
                      { x: normalizedMeasurement.x, y: normalizedMeasurement.y },
                      result.stepToDisplacement,
                  )
                : null;

        tileSummary = {
            ...tileSummary,
            homeOffset: { dx, dy },
            adjustedHome: { x: adjustedCenterX, y: adjustedCenterY },
            inferredBounds,
        };

        summaryTiles[key] = tileSummary;
    }

    return {
        gridBlueprint,
        stepTestSettings: {
            deltaSteps: config.deltaSteps,
        },
        tiles: summaryTiles,
        outlierAnalysis,
    };
}
