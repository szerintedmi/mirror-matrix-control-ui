/**
 * Single Tile Recalibration Script
 *
 * Generator script for recalibrating a single tile within an existing profile.
 *
 * Workflow:
 * 1. Home all motors
 * 2. Stage ALL tiles aside (parallel)
 * 3. Move target tile to home
 * 4. Calibrate target tile (home measurement + step tests)
 * 5. Merge result with existing profile
 * 6. Recompute grid summary
 * 7. Align ALL tiles to updated grid blueprint
 *
 * This script reuses:
 * - calibrateTile generator for single-tile measurement
 * - mergeTileResult for profile update
 * - computeCalibrationSummary for grid recalculation
 */

import type { Motor } from '@/types';

import { computeAlignmentTargetSteps } from '../math/stepTestCalculations';
import {
    mergeTileResult,
    extractFirstTilePerStep,
    extractExistingMeasurements,
} from '../profileMerger';

import { calibrateTile, type TileDescriptor, type TileCalibrationOutcome } from './tileCalibration';

import type { TileMeasurement } from '../math/expectedPosition';
import type {
    CalibrationRunnerPhase,
    CalibrationRunSummary,
    CalibrationStepKind,
    TileAddress,
    TileRunState,
} from '../types';
import type { CalibrationCommand, CommandResult } from './commands';
import type { ExecutorConfig } from './executor';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extended configuration for single-tile recalibration.
 */
export interface SingleTileRecalibrationConfig extends ExecutorConfig {
    /** The tile to recalibrate */
    targetTile: TileAddress;
    /** Existing calibration profile to update */
    existingProfile: CalibrationRunSummary;
}

// =============================================================================
// COMMAND BUILDERS
// =============================================================================

function homeAll(macAddresses: string[]): CalibrationCommand {
    return { type: 'HOME_ALL', macAddresses };
}

function updatePhase(phase: CalibrationRunnerPhase): CalibrationCommand {
    return { type: 'UPDATE_PHASE', phase };
}

function moveTilePose(tile: TileAddress, pose: 'home' | 'aside'): CalibrationCommand {
    return { type: 'MOVE_TILE_POSE', tile, pose };
}

function moveTilesBatch(
    moves: Array<{ tile: TileAddress; pose: 'home' | 'aside' }>,
): CalibrationCommand {
    return { type: 'MOVE_TILES_BATCH', moves };
}

function moveAxesBatch(moves: Array<{ motor: Motor; target: number }>): CalibrationCommand {
    return { type: 'MOVE_AXES_BATCH', moves };
}

function updateTile(key: string, patch: Partial<TileRunState>): CalibrationCommand {
    return { type: 'UPDATE_TILE', key, patch };
}

function updateSummary(summary: CalibrationRunSummary): CalibrationCommand {
    return { type: 'UPDATE_SUMMARY', summary };
}

function updateProgress(
    completed: number,
    failed: number,
    skipped: number,
    total: number,
): CalibrationCommand {
    return { type: 'UPDATE_PROGRESS', progress: { completed, failed, skipped, total } };
}

function log(
    hint: string,
    tile?: TileAddress | null,
    group?: string,
    metadata?: Record<string, unknown>,
): CalibrationCommand {
    return { type: 'LOG', hint, tile, group, metadata };
}

function checkpoint(
    kind: CalibrationStepKind,
    label: string,
    tile?: TileAddress | null,
): CalibrationCommand {
    return {
        type: 'CHECKPOINT',
        step: { kind, label, tile },
    };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build tile descriptors from grid config.
 */
function buildTileDescriptors(config: ExecutorConfig): TileDescriptor[] {
    const descriptors: TileDescriptor[] = [];
    for (let row = 0; row < config.gridSize.rows; row++) {
        for (let col = 0; col < config.gridSize.cols; col++) {
            const key = `${row}-${col}`;
            const assignment = config.mirrorConfig.get(key);
            const xMotor = assignment?.x ?? null;
            const yMotor = assignment?.y ?? null;
            const calibratable = Boolean(xMotor && yMotor);
            descriptors.push({ row, col, key, xMotor, yMotor, calibratable });
        }
    }
    return descriptors;
}

/**
 * Extract unique MAC addresses from tiles.
 */
function extractMacAddresses(tiles: TileDescriptor[]): string[] {
    const macs = new Set<string>();
    for (const tile of tiles) {
        if (tile.calibratable) {
            if (tile.xMotor) macs.add(tile.xMotor.nodeMac);
            if (tile.yMotor) macs.add(tile.yMotor.nodeMac);
        }
    }
    return Array.from(macs);
}

// =============================================================================
// ALIGN TILES GENERATOR
// =============================================================================

/**
 * Align tiles to their ideal grid positions based on calibration summary.
 */
function* alignTiles(
    tiles: TileDescriptor[],
    summary: CalibrationRunSummary,
): Generator<CalibrationCommand, void, CommandResult> {
    if (!summary.gridBlueprint) {
        return;
    }

    yield updatePhase('aligning');
    yield log('Aligning tiles to grid', null, 'align');

    // Collect all alignment moves
    const alignmentMoves: Array<{ motor: Motor; target: number }> = [];

    for (const tile of tiles) {
        const tileSummary = summary.tiles[tile.key];
        if (!tileSummary || tileSummary.status !== 'completed' || !tileSummary.homeOffset) {
            continue;
        }

        const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };

        // Compute alignment targets (negative offset = move in opposite direction)
        const targetX = computeAlignmentTargetSteps(
            -tileSummary.homeOffset.dx,
            tileSummary.stepToDisplacement?.x ?? null,
        );
        const targetY = computeAlignmentTargetSteps(
            -tileSummary.homeOffset.dy,
            tileSummary.stepToDisplacement?.y ?? null,
        );

        if ((targetX !== null || targetY !== null) && tile.xMotor && tile.yMotor) {
            yield log(
                `Aligning R${tile.row}C${tile.col}: X=${targetX ?? 0}, Y=${targetY ?? 0}`,
                tileAddress,
                'align',
            );

            if (targetX !== null && tile.xMotor) {
                alignmentMoves.push({ motor: tile.xMotor, target: targetX });
            }
            if (targetY !== null && tile.yMotor) {
                alignmentMoves.push({ motor: tile.yMotor, target: targetY });
            }
        }
    }

    // Execute all alignment moves in parallel
    if (alignmentMoves.length > 0) {
        yield moveAxesBatch(alignmentMoves);
    }

    yield checkpoint('align-grid', 'Align tiles to grid');
}

// =============================================================================
// SINGLE TILE RECALIBRATION SCRIPT
// =============================================================================

/**
 * Recalibrate a single tile within an existing calibration profile.
 *
 * This generator:
 * 1. Stages all tiles aside to avoid interference
 * 2. Calibrates only the target tile
 * 3. Merges the new measurement with existing profile
 * 4. Recalculates the grid blueprint
 * 5. Aligns all tiles to the updated grid
 *
 * @param config - Extended configuration with target tile and existing profile
 * @yields CalibrationCommand - Commands for the executor
 */
export function* singleTileRecalibrationScript(
    config: SingleTileRecalibrationConfig,
): Generator<CalibrationCommand, void, CommandResult> {
    const { targetTile, existingProfile } = config;

    const tiles = buildTileDescriptors(config);
    const calibratableTiles = tiles.filter((t) => t.calibratable);
    const targetTileDescriptor = tiles.find((t) => t.key === targetTile.key);

    // Validate target tile
    if (!targetTileDescriptor) {
        yield log(`Target tile ${targetTile.key} not found in grid`, null, 'error');
        yield updatePhase('error');
        return;
    }

    if (!targetTileDescriptor.calibratable) {
        yield log(
            `Target tile ${targetTile.key} is not calibratable (missing motors)`,
            null,
            'error',
        );
        yield updatePhase('error');
        return;
    }

    const macAddresses = extractMacAddresses(calibratableTiles);

    // Initialize tile states from existing profile
    for (const tile of calibratableTiles) {
        const existingTile = existingProfile.tiles[tile.key];
        if (existingTile) {
            yield updateTile(tile.key, {
                status: tile.key === targetTile.key ? 'pending' : existingTile.status,
                metrics: {
                    home: existingTile.homeMeasurement,
                    homeOffset: existingTile.homeOffset,
                    adjustedHome: existingTile.adjustedHome,
                    stepToDisplacement: existingTile.stepToDisplacement,
                    sizeDeltaAtStepTest: existingTile.sizeDeltaAtStepTest,
                },
            });
        }
    }

    // === HOMING PHASE ===
    yield updatePhase('homing');
    yield log('Homing all motors for recalibration', null, 'homing', { macAddresses });
    yield homeAll(macAddresses);
    yield checkpoint('home-all', 'Home all tiles');

    // === STAGING PHASE ===
    yield updatePhase('staging');
    yield log('Moving all tiles aside for recalibration', null, 'staging');

    // Move all calibratable tiles aside (in parallel)
    const stagingMoves = calibratableTiles.map((tile) => ({
        tile: { row: tile.row, col: tile.col, key: tile.key } as TileAddress,
        pose: 'aside' as const,
    }));
    yield moveTilesBatch(stagingMoves);

    // Update tile statuses after staging
    for (const tile of calibratableTiles) {
        yield updateTile(tile.key, { status: 'staged' });
    }
    yield checkpoint('stage-all', 'Move tiles aside');

    // === MEASURING PHASE ===
    yield updatePhase('measuring');
    yield log(`Recalibrating tile ${targetTile.key}`, targetTile, 'measure');

    // Move target tile to home position
    yield moveTilePose(targetTile, 'home');

    // Extract estimation data from existing profile
    const firstTilePerStep = extractFirstTilePerStep(existingProfile);
    const completedMeasurements: TileMeasurement[] = extractExistingMeasurements(
        existingProfile,
        targetTile.key, // Exclude target tile from measurements
    );

    // Calibrate the target tile
    const outcome: TileCalibrationOutcome | 'abort' = yield* calibrateTile({
        tile: targetTileDescriptor,
        isFirstTile: false, // Use existing profile's perStep for estimation
        firstTilePerStep,
        completedMeasurements,
        config,
    });

    if (outcome === 'abort') {
        yield updatePhase('aborted');
        yield log('Recalibration aborted by user', targetTile, 'abort');
        return;
    }

    // Handle skipped tile
    if (outcome.status === 'skipped') {
        yield updatePhase('error');
        yield log(`Recalibration skipped for tile ${targetTile.key}`, targetTile, 'error');
        return;
    }

    // Move target tile aside after measurement
    yield moveTilePose(targetTile, 'aside');

    // === SUMMARY & ALIGNMENT PHASE ===
    yield log('Recomputing grid with updated measurements', null, 'summary');

    // Merge the new tile result with existing profile
    const summaryConfig = {
        gridSize: config.gridSize,
        gridGapNormalized: config.settings.gridGapNormalized,
        deltaSteps: config.settings.deltaSteps,
        robustTileSize: config.settings.robustTileSize,
    };

    const mergeResult = mergeTileResult(existingProfile, outcome.result, summaryConfig);
    const updatedSummary = mergeResult.summary;

    // Emit updated summary
    yield updateSummary(updatedSummary);

    // Update all tiles with recomputed offsets from new summary
    for (const [key, tileSummary] of Object.entries(updatedSummary.tiles)) {
        yield updateTile(key, {
            status: tileSummary.status,
            metrics: {
                home: tileSummary.homeMeasurement,
                homeOffset: tileSummary.homeOffset,
                adjustedHome: tileSummary.adjustedHome,
                stepToDisplacement: tileSummary.stepToDisplacement,
                sizeDeltaAtStepTest: tileSummary.sizeDeltaAtStepTest,
            },
        });
    }

    // Align ALL tiles to updated grid
    yield* alignTiles(calibratableTiles, updatedSummary);

    // Update progress
    const completedCount = outcome.status === 'completed' ? 1 : 0;
    const partialCount = outcome.status === 'partial' ? 1 : 0;
    yield updateProgress(completedCount + partialCount, 0, 0, 1);

    // === COMPLETED ===
    yield updatePhase('completed');
    yield log(`Recalibration complete for tile ${targetTile.key}`, targetTile, 'complete', {
        status: outcome.status,
    });
}
