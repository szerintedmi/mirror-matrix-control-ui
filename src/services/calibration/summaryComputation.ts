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
import { asCentered } from '@/coords';
import type {
    BlobMeasurement,
    CalibrationGridBlueprint,
    CalibrationProfileBounds,
    CalibrationSnapshot,
} from '@/types';

import { RobustMaxSizingStrategy, type TileEntry } from './math/blueprintStrategies';
import { computeBlueprintFootprintBounds, computeLiveTileBounds } from './math/boundsComputation';
import {
    buildStepScale,
    computeAxisPitch,
    computeGridOrigin,
    computeImpliedOrigin,
    computeCameraOriginOffset,
    computeHomeOffset,
    computeAdjustedCenter,
} from './math/gridBlueprintMath';

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
    status: 'measuring' | 'completed' | 'partial' | 'failed' | 'skipped';
    error?: string;
    warnings?: string[];
    homeMeasurement?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number };
    adjustedHome?: { x: number; y: number };
    stepToDisplacement?: { x: number | null; y: number | null };
    sizeDeltaAtStepTest?: number | null;
    stepScale?: { x: number | null; y: number | null };
    /** Motor-range bounds computed from step tests */
    motorReachBounds?: CalibrationProfileBounds | null;
    /** Footprint bounds derived from blueprint (if available) */
    footprintBounds?: CalibrationProfileBounds | null;
    /** Combined bounds: union of motorReachBounds and footprintBounds */
    combinedBounds?: CalibrationProfileBounds | null;
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
export type CalibrationRunSummary = CalibrationSnapshot;

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

    // Get camera dimensions
    const firstMeasurement = measuredTiles[0]?.homeMeasurement;
    const sourceWidth = firstMeasurement?.sourceWidth ?? 1920;
    const sourceHeight = firstMeasurement?.sourceHeight ?? 1080;

    // Spacing for offset computation (Centered Coords)

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

    let tileWidth = tileSize;
    let tileHeight = tileSize;

    // Compute pitch (spacing) from measured centroids in ISOTROPIC space.
    // This ensures that for a physically square grid, pitchX ≈ pitchY, allowing
    // us to average them for uniform tile dimensions (no visual gaps).
    const deltasX: number[] = [];
    const deltasY: number[] = [];

    // Isotropic conversion factors: convert centered coords to isotropic space
    // where equal physical distances have equal values.
    // For a wide camera (1920x1080): avgDim=1500, isoFactorX=1.28, isoFactorY=0.72
    // This EXPANDS X deltas and SHRINKS Y deltas to make them comparable.
    const avgDim = (sourceWidth + sourceHeight) / 2;
    const isoFactorX = sourceWidth / avgDim;
    const isoFactorY = sourceHeight / avgDim;

    // Create lookup by row-col for reliable adjacency checks
    const tileMapByRowCol = new Map<string, BlobMeasurement>();
    for (const entry of measuredTiles) {
        tileMapByRowCol.set(`${entry.tile.row}-${entry.tile.col}`, entry.homeMeasurement);
    }

    // Collect horizontal and vertical deltas in ISOTROPIC space
    for (const entry of measuredTiles) {
        const { row, col } = entry.tile;

        // Check right neighbor (X pitch)
        const rightMeas = tileMapByRowCol.get(`${row}-${col + 1}`);
        if (rightMeas) {
            // Use axis-specific delta in isotropic space.
            // Euclidean distance inflates pitch when tiles are slightly misaligned.
            const dx = (rightMeas.x - entry.homeMeasurement.x) * isoFactorX;
            deltasX.push(Math.abs(dx));
        }

        // Check bottom neighbor (Y pitch)
        const downMeas = tileMapByRowCol.get(`${row + 1}-${col}`);
        if (downMeas) {
            const dy = (downMeas.y - entry.homeMeasurement.y) * isoFactorY;
            deltasY.push(Math.abs(dy));
        }
    }

    let gapX: number;
    let gapY: number;

    // Config fallback / Fixed Gap
    const clampedGap = Math.max(
        GRID_GAP_MIN_NORMALIZED,
        Math.min(GRID_GAP_MAX_NORMALIZED, config.gridGapNormalized),
    );
    const normalizedGap = clampedGap * 2;

    // We enforce the Configured Gap (stable)
    // and derive the Tile Size from the measured Pitch.
    // This allows the visual tile to shrink/grow to fit the pitch perfectly
    // without the gap jittering due to blob size noise.
    gapX = normalizedGap;
    gapY = normalizedGap;

    let computedTileWidth = tileWidth; // Fallback to max blob size
    let computedTileHeight = tileHeight; // Fallback to max blob size

    // Use computed pitch if available (via extracted math function)
    // Pitches are now in ISOTROPIC space
    let isoPitchX = computeAxisPitch(deltasX);
    let isoPitchY = computeAxisPitch(deltasY);

    // If we don't have vertical neighbors yet, use X pitch directly
    // (in isotropic space, pitchX ≈ pitchY for a square physical grid)
    if (isoPitchY <= 0 && isoPitchX > 0) {
        isoPitchY = isoPitchX;
    }

    // Average the isotropic pitches for uniform tile dimensions.
    // For a square physical grid, isoPitchX ≈ isoPitchY; averaging handles noise.
    let isoPitch: number;
    if (isoPitchX > 0 && isoPitchY > 0) {
        isoPitch = (isoPitchX + isoPitchY) / 2;
    } else if (isoPitchX > 0) {
        isoPitch = isoPitchX;
    } else {
        isoPitch = isoPitchY > 0 ? isoPitchY : 0;
    }

    // Convert isotropic pitch back to centered coords for each axis.
    // This produces different tileWidth/tileHeight values, but when projected
    // per-axis by the renderer, they will result in equal visual sizes.
    // tileWidth * sourceWidth = tileHeight * sourceHeight = isoPitch * avgDim
    if (isoPitch > 0) {
        // Convert gap to isotropic (same value since gapX == gapY)
        const isoGap = gapX;
        const isoTileSize = isoPitch - isoGap;
        // Convert back to centered coords for each axis
        computedTileWidth = isoTileSize / isoFactorX;
        computedTileHeight = isoTileSize / isoFactorY;
    }

    // When pitch is available, prefer spacing-derived sizes to preserve grid alignment.

    // If we only have single tile or no deltas, we stick to the MaxBlobSize logic (fallback)
    // implicitly via initialization of computedTileWidth/Height above.

    const baseSpacingX = computedTileWidth + gapX;
    const baseSpacingY = computedTileHeight + gapY;

    // Update blueprint with computed dimensions
    tileWidth = computedTileWidth;
    tileHeight = computedTileHeight;
    const halfTileX = tileWidth / 2;
    const halfTileY = tileHeight / 2;

    // Dimensions in Centered Coords
    const totalWidth = config.gridSize.cols * baseSpacingX - gapX; // (cols-1)*gap + cols*width = cols*(width+gap) - gap
    const totalHeight = config.gridSize.rows * baseSpacingY - gapY;

    // Compute origin using median of implied origins (via extracted math functions)
    const spacing = { spacingX: baseSpacingX, spacingY: baseSpacingY };
    const halfTile = { x: halfTileX, y: halfTileY };

    const impliedOrigins = measuredTiles.map((entry) =>
        computeImpliedOrigin(
            asCentered(entry.homeMeasurement.x, entry.homeMeasurement.y),
            { row: entry.tile.row, col: entry.tile.col },
            spacing,
            halfTile,
        ),
    );

    const gridOrigin = computeGridOrigin(impliedOrigins);
    const originX = gridOrigin.x;
    const originY = gridOrigin.y;

    // Center the grid (via extracted math function)
    const cameraOriginOffset = computeCameraOriginOffset(gridOrigin, {
        width: totalWidth,
        height: totalHeight,
    });

    // Store origin relative to camera center
    const finalOriginX = originX - cameraOriginOffset.x;
    const finalOriginY = originY - cameraOriginOffset.y;

    const blueprint: CalibrationGridBlueprint = {
        adjustedTileFootprint: {
            width: tileWidth,
            height: tileHeight,
        },
        tileGap: { x: gapX, y: gapY },
        gridOrigin: { x: finalOriginX, y: finalOriginY },
        cameraOriginOffset,
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
 * @param tileResults - Map of tile key to calibration result
 * @param config - Summary configuration
 * @returns Complete calibration run summary
 */
export function computeCalibrationSummary(
    tileResults: Map<string, TileCalibrationResult>,
    config: SummaryConfig,
): CalibrationRunSummary {
    // Filter to tiles with valid home measurements
    // Include 'partial' tiles (step test failures with inferred values) since they have valid home measurements
    const measuredTiles = Array.from(tileResults.values())
        .filter(
            (entry): entry is TileCalibrationResult & { homeMeasurement: BlobMeasurement } =>
                (entry.status === 'completed' ||
                    entry.status === 'partial' ||
                    entry.status === 'measuring') &&
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

    const firstMeasurement = measuredTiles[0]?.homeMeasurement;
    const sourceWidth = firstMeasurement?.sourceWidth ?? 1920;
    const sourceHeight = firstMeasurement?.sourceHeight ?? 1080;

    // Spacing for offset computation (Centered Coords)
    const baseSpacingX = gridBlueprint
        ? gridBlueprint.adjustedTileFootprint.width + gridBlueprint.tileGap.x
        : 0;
    const baseSpacingY = gridBlueprint
        ? gridBlueprint.adjustedTileFootprint.height + gridBlueprint.tileGap.y
        : 0;

    const halfTileX = gridBlueprint ? gridBlueprint.adjustedTileFootprint.width / 2 : 0;
    const halfTileY = gridBlueprint ? gridBlueprint.adjustedTileFootprint.height / 2 : 0;

    // Process each tile result
    const summaryTiles: CalibrationSnapshot['tiles'] = {};

    const cameraMeta: CalibrationSnapshot['camera'] = firstMeasurement
        ? {
              sourceWidth,
              sourceHeight,
          }
        : null;

    for (const [key, result] of tileResults.entries()) {
        // Recenter measurement if we have a grid blueprint
        const normalizedMeasurement =
            gridBlueprint && result.homeMeasurement
                ? recenterMeasurement(result.homeMeasurement, gridBlueprint.cameraOriginOffset)
                : (result.homeMeasurement ?? null);

        let tileSummary: TileCalibrationResult = normalizedMeasurement
            ? { ...result, homeMeasurement: normalizedMeasurement }
            : result;

        const motorReachBounds =
            normalizedMeasurement && result.stepToDisplacement
                ? computeLiveTileBounds(
                      { x: normalizedMeasurement.x, y: normalizedMeasurement.y },
                      result.stepToDisplacement,
                  )
                : (result.motorReachBounds ?? result.combinedBounds ?? null);

        const stepScale = result.stepScale ?? buildStepScale(result.stepToDisplacement);

        // Compute footprint bounds from blueprint for consistency
        const footprintBounds =
            result.footprintBounds ??
            (gridBlueprint
                ? computeBlueprintFootprintBounds(gridBlueprint, result.tile.row, result.tile.col)
                : null);

        // Note: combinedBounds is computed in buildProfileTiles via mergeWithBlueprintFootprint
        tileSummary = {
            ...tileSummary,
            motorReachBounds,
            footprintBounds: footprintBounds ?? undefined,
            stepScale: stepScale ?? undefined,
        };

        // Calculate offset from ideal grid position
        if (result.status !== 'completed' || !normalizedMeasurement || !gridBlueprint) {
            summaryTiles[key] = tileSummary;
            continue;
        }

        // Compute adjusted center and home offset (via extracted math functions)
        const tile = result.tile;
        const spacing = { spacingX: baseSpacingX, spacingY: baseSpacingY };
        const halfTile = { x: halfTileX, y: halfTileY };

        const adjustedCenter = computeAdjustedCenter(
            gridBlueprint.gridOrigin,
            { row: tile.row, col: tile.col },
            spacing,
            halfTile,
        );

        const homeOffset = computeHomeOffset(
            asCentered(normalizedMeasurement.x, normalizedMeasurement.y),
            adjustedCenter,
        );

        tileSummary = {
            ...tileSummary,
            homeOffset,
            adjustedHome: adjustedCenter,
        };

        summaryTiles[key] = tileSummary;
    }

    return {
        gridBlueprint,
        camera: cameraMeta,
        stepTestSettings: {
            deltaSteps: config.deltaSteps,
        },
        tiles: summaryTiles,
        outlierAnalysis,
    };
}
