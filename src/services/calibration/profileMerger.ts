/**
 * Profile Merger Module
 *
 * Pure functions for merging new tile measurements into existing calibration profiles.
 * Used by single-tile recalibration to update profiles without running full calibration.
 */

import { asCentered } from '@/coords';
import type { BlobMeasurement, CalibrationGridBlueprint } from '@/types';

import { computeLiveTileBounds, computeBlueprintFootprintBounds } from './math/boundsComputation';
import { computeHomeOffset, computeAdjustedCenter, buildStepScale } from './math/gridBlueprintMath';
import {
    computeCalibrationSummary,
    type TileCalibrationResult,
    type SummaryConfig,
    type CalibrationRunSummary,
} from './summaryComputation';

import type { TileMeasurement } from './math/expectedPosition';
import type { TileAddress } from './types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of merging a new tile measurement with existing profile.
 */
export interface MergeResult {
    /** Updated tile results map */
    updatedTiles: Map<string, TileCalibrationResult>;
    /** Recomputed summary with updated grid blueprint */
    summary: CalibrationRunSummary;
}

// =============================================================================
// INTERNAL HELPERS
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

/**
 * Compute derived values for a tile using an existing grid blueprint.
 * This allows updating a single tile without recomputing the entire grid.
 */
function computeTileDerivedValues(
    result: TileCalibrationResult,
    blueprint: CalibrationGridBlueprint,
): TileCalibrationResult {
    if (!result.homeMeasurement) {
        return result;
    }

    // Recenter measurement relative to blueprint's camera origin
    const normalizedMeasurement = recenterMeasurement(
        result.homeMeasurement,
        blueprint.cameraOriginOffset,
    );

    // Compute spacing
    const baseSpacingX = blueprint.adjustedTileFootprint.width + blueprint.tileGap.x;
    const baseSpacingY = blueprint.adjustedTileFootprint.height + blueprint.tileGap.y;
    const halfTileX = blueprint.adjustedTileFootprint.width / 2;
    const halfTileY = blueprint.adjustedTileFootprint.height / 2;

    // Compute motor reach bounds from step displacement
    const motorReachBounds = result.stepToDisplacement
        ? computeLiveTileBounds(
              { x: normalizedMeasurement.x, y: normalizedMeasurement.y },
              result.stepToDisplacement,
          )
        : (result.motorReachBounds ?? null);

    // Compute step scale
    const stepScale = result.stepScale ?? buildStepScale(result.stepToDisplacement);

    // Compute footprint bounds from blueprint
    const footprintBounds = computeBlueprintFootprintBounds(
        blueprint,
        result.tile.row,
        result.tile.col,
    );

    // Only compute offset for completed tiles
    if (result.status !== 'completed') {
        return {
            ...result,
            homeMeasurement: normalizedMeasurement,
            motorReachBounds: motorReachBounds ?? undefined,
            footprintBounds: footprintBounds ?? undefined,
            stepScale: stepScale ?? undefined,
        };
    }

    // Compute adjusted center (ideal grid position)
    const adjustedCenter = computeAdjustedCenter(
        blueprint.gridOrigin,
        { row: result.tile.row, col: result.tile.col },
        { spacingX: baseSpacingX, spacingY: baseSpacingY },
        { x: halfTileX, y: halfTileY },
    );

    // Compute home offset (difference from ideal position)
    const homeOffset = computeHomeOffset(
        asCentered(normalizedMeasurement.x, normalizedMeasurement.y),
        adjustedCenter,
    );

    return {
        ...result,
        homeMeasurement: normalizedMeasurement,
        homeOffset,
        adjustedHome: adjustedCenter,
        motorReachBounds: motorReachBounds ?? undefined,
        footprintBounds: footprintBounds ?? undefined,
        stepScale: stepScale ?? undefined,
    };
}

// =============================================================================
// CONVERSION HELPERS
// =============================================================================

/**
 * Convert a summary tile back to TileCalibrationResult format for recomputation.
 */
function convertSummaryTileToResult(
    summaryTile: CalibrationRunSummary['tiles'][string],
    key: string,
): TileCalibrationResult {
    const [rowStr, colStr] = key.split('-');
    const row = parseInt(rowStr, 10);
    const col = parseInt(colStr, 10);

    return {
        tile: { row, col, key },
        status: summaryTile.status,
        error: summaryTile.error,
        warnings: summaryTile.warnings,
        homeMeasurement: summaryTile.homeMeasurement,
        homeOffset: summaryTile.homeOffset,
        adjustedHome: summaryTile.adjustedHome,
        stepToDisplacement: summaryTile.stepToDisplacement,
        sizeDeltaAtStepTest: summaryTile.sizeDeltaAtStepTest,
        stepScale: summaryTile.stepScale,
        motorReachBounds: summaryTile.motorReachBounds,
        footprintBounds: summaryTile.footprintBounds,
        combinedBounds: summaryTile.combinedBounds,
    };
}

// =============================================================================
// EXTRACTION HELPERS
// =============================================================================

/**
 * Extract first tile's perStep values from an existing profile.
 * Used for expected position estimation during recalibration.
 */
export function extractFirstTilePerStep(profile: CalibrationRunSummary): {
    x: number | null;
    y: number | null;
} {
    // Find the first completed tile (row-major order)
    const sortedKeys = Object.keys(profile.tiles).sort((a, b) => {
        const [rowA, colA] = a.split('-').map(Number);
        const [rowB, colB] = b.split('-').map(Number);
        if (rowA !== rowB) return rowA - rowB;
        return colA - colB;
    });

    for (const key of sortedKeys) {
        const tile = profile.tiles[key];
        if ((tile.status === 'completed' || tile.status === 'partial') && tile.stepToDisplacement) {
            return {
                x: tile.stepToDisplacement.x ?? null,
                y: tile.stepToDisplacement.y ?? null,
            };
        }
    }

    return { x: null, y: null };
}

/**
 * Extract existing measurements from profile for expected position calculation.
 * Excludes the target tile being recalibrated.
 *
 * IMPORTANT: Profile measurements are stored with cameraOriginOffset subtracted
 * (to center the grid at origin). For expected position calculation, we need
 * the original raw coordinates, so we add the offset back.
 */
export function extractExistingMeasurements(
    profile: CalibrationRunSummary,
    excludeTileKey?: string,
): TileMeasurement[] {
    const measurements: TileMeasurement[] = [];

    // Get the camera origin offset that was subtracted from measurements during summary computation
    const offset = profile.gridBlueprint?.cameraOriginOffset ?? { x: 0, y: 0 };

    for (const [key, tile] of Object.entries(profile.tiles)) {
        // Skip the tile being recalibrated
        if (key === excludeTileKey) continue;

        // Only include tiles with valid home measurements
        if ((tile.status === 'completed' || tile.status === 'partial') && tile.homeMeasurement) {
            const [rowStr, colStr] = key.split('-');
            // Add back cameraOriginOffset to get original raw coordinates
            // (measurements in profile have offset subtracted for centered storage)
            measurements.push({
                row: parseInt(rowStr, 10),
                col: parseInt(colStr, 10),
                position: asCentered(
                    tile.homeMeasurement.x + offset.x,
                    tile.homeMeasurement.y + offset.y,
                ),
            });
        }
    }

    return measurements;
}

/**
 * Extract all tile addresses from a profile.
 */
export function extractTileAddresses(profile: CalibrationRunSummary): TileAddress[] {
    return Object.keys(profile.tiles).map((key) => {
        const [rowStr, colStr] = key.split('-');
        return {
            row: parseInt(rowStr, 10),
            col: parseInt(colStr, 10),
            key,
        };
    });
}

// =============================================================================
// MERGE FUNCTIONS
// =============================================================================

/**
 * Merge a new tile calibration result into an existing profile.
 *
 * This function preserves the existing grid blueprint and only updates the
 * target tile's derived values. This prevents the entire grid from shifting
 * when a single tile is recalibrated.
 *
 * Workflow:
 * 1. Keep the existing grid blueprint (tile size, spacing, origin)
 * 2. Update the target tile with new measurements
 * 3. Recompute only the target tile's offset relative to existing blueprint
 * 4. Keep all other tiles unchanged
 *
 * @param existingProfile - The current calibration summary
 * @param newTileResult - New measurement for the recalibrated tile
 * @param _summaryConfig - Configuration (unused, kept for API compatibility)
 * @returns Merged result with updated tiles and preserved grid blueprint
 */
export function mergeTileResult(
    existingProfile: CalibrationRunSummary,
    newTileResult: TileCalibrationResult,
    _summaryConfig: SummaryConfig,
): MergeResult {
    const existingBlueprint = existingProfile.gridBlueprint;

    // If no blueprint exists, fall back to full recomputation
    if (!existingBlueprint) {
        const tileResults = new Map<string, TileCalibrationResult>();
        for (const [key, summaryTile] of Object.entries(existingProfile.tiles)) {
            tileResults.set(key, convertSummaryTileToResult(summaryTile, key));
        }
        tileResults.set(newTileResult.tile.key, newTileResult);
        const summary = computeCalibrationSummary(tileResults, _summaryConfig);
        return { updatedTiles: tileResults, summary };
    }

    // Preserve existing tiles and update only the target tile
    const tileResults = new Map<string, TileCalibrationResult>();
    const summaryTiles: CalibrationRunSummary['tiles'] = {};

    for (const [key, summaryTile] of Object.entries(existingProfile.tiles)) {
        const result = convertSummaryTileToResult(summaryTile, key);
        tileResults.set(key, result);
        // Keep existing tiles as-is (they're already computed against this blueprint)
        summaryTiles[key] = summaryTile;
    }

    // Replace target tile with new measurement and compute derived values
    tileResults.set(newTileResult.tile.key, newTileResult);
    const updatedTileResult = computeTileDerivedValues(newTileResult, existingBlueprint);
    summaryTiles[newTileResult.tile.key] = updatedTileResult;

    // Build the merged summary preserving the existing blueprint
    const summary: CalibrationRunSummary = {
        gridBlueprint: existingBlueprint,
        camera: existingProfile.camera,
        stepTestSettings: existingProfile.stepTestSettings,
        tiles: summaryTiles,
        outlierAnalysis: existingProfile.outlierAnalysis,
    };

    return {
        updatedTiles: tileResults,
        summary,
    };
}

/**
 * Merge multiple tile calibration results into an existing profile.
 * Used for batch recalibration of multiple tiles.
 *
 * This function preserves the existing grid blueprint and only updates the
 * target tiles' derived values.
 *
 * @param existingProfile - The current calibration summary
 * @param newTileResults - Array of new measurements for recalibrated tiles
 * @param _summaryConfig - Configuration (unused, kept for API compatibility)
 * @returns Merged result with updated tiles and preserved grid blueprint
 */
export function mergeTileResults(
    existingProfile: CalibrationRunSummary,
    newTileResults: TileCalibrationResult[],
    _summaryConfig: SummaryConfig,
): MergeResult {
    const existingBlueprint = existingProfile.gridBlueprint;

    // If no blueprint exists, fall back to full recomputation
    if (!existingBlueprint) {
        const tileResults = new Map<string, TileCalibrationResult>();
        for (const [key, summaryTile] of Object.entries(existingProfile.tiles)) {
            tileResults.set(key, convertSummaryTileToResult(summaryTile, key));
        }
        for (const newResult of newTileResults) {
            tileResults.set(newResult.tile.key, newResult);
        }
        const summary = computeCalibrationSummary(tileResults, _summaryConfig);
        return { updatedTiles: tileResults, summary };
    }

    // Build set of tiles being recalibrated for quick lookup
    const recalibratedKeys = new Set(newTileResults.map((r) => r.tile.key));

    // Preserve existing tiles and update only the target tiles
    const tileResults = new Map<string, TileCalibrationResult>();
    const summaryTiles: CalibrationRunSummary['tiles'] = {};

    for (const [key, summaryTile] of Object.entries(existingProfile.tiles)) {
        const result = convertSummaryTileToResult(summaryTile, key);
        tileResults.set(key, result);
        // Keep tiles not being recalibrated as-is
        if (!recalibratedKeys.has(key)) {
            summaryTiles[key] = summaryTile;
        }
    }

    // Replace target tiles with new measurements and compute derived values
    for (const newResult of newTileResults) {
        tileResults.set(newResult.tile.key, newResult);
        const updatedTileResult = computeTileDerivedValues(newResult, existingBlueprint);
        summaryTiles[newResult.tile.key] = updatedTileResult;
    }

    // Build the merged summary preserving the existing blueprint
    const summary: CalibrationRunSummary = {
        gridBlueprint: existingBlueprint,
        camera: existingProfile.camera,
        stepTestSettings: existingProfile.stepTestSettings,
        tiles: summaryTiles,
        outlierAnalysis: existingProfile.outlierAnalysis,
    };

    return {
        updatedTiles: tileResults,
        summary,
    };
}
