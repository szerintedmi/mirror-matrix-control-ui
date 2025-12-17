/**
 * Calibration Script
 *
 * Pure generator function that yields calibration commands.
 * This is a skeleton implementation for validation - it handles:
 * - Homing all motors
 * - Measuring one tile (home position only)
 *
 * The full implementation will be added in phase 5.
 */

import type { BlobMeasurement, Motor } from '@/types';

import type {
    CalibrationCommand,
    CaptureCommand,
    CheckpointCommand,
    CommandResult,
    HomeAllCommand,
    LogCommand,
    MoveTilePoseCommand,
    UpdatePhaseCommand,
    UpdateTileCommand,
} from './commands';
import type { ExecutorConfig } from './executor';
import type { TileAddress, TileRunState } from '../../calibrationRunner';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Tile descriptor with assignment info.
 */
interface TileDescriptor {
    row: number;
    col: number;
    key: string;
    xMotor: Motor | null;
    yMotor: Motor | null;
    calibratable: boolean;
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
 * Extract unique MAC addresses from calibratable tiles.
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

/**
 * Get capture result from command result.
 */
function getCaptureResult(result: CommandResult): {
    measurement: BlobMeasurement | null;
    error?: string;
} {
    if (result.type !== 'CAPTURE') {
        throw new Error(`Expected CAPTURE result, got ${result.type}`);
    }
    return { measurement: result.measurement, error: result.error };
}

// =============================================================================
// COMMAND BUILDERS
// =============================================================================

function homeAll(macAddresses: string[]): HomeAllCommand {
    return { type: 'HOME_ALL', macAddresses };
}

function updatePhase(phase: UpdatePhaseCommand['phase']): UpdatePhaseCommand {
    return { type: 'UPDATE_PHASE', phase };
}

function moveTilePose(tile: TileAddress, pose: 'home' | 'aside'): MoveTilePoseCommand {
    return { type: 'MOVE_TILE_POSE', tile, pose };
}

function capture(
    label: string,
    tolerance: number,
    expectedPosition?: { x: number; y: number },
): CaptureCommand {
    return { type: 'CAPTURE', label, tolerance, expectedPosition };
}

function checkpoint(
    kind: CheckpointCommand['step']['kind'],
    label: string,
    tile?: TileAddress | null,
): CheckpointCommand {
    return {
        type: 'CHECKPOINT',
        step: { kind, label, tile },
    };
}

function updateTile(key: string, patch: Partial<TileRunState>): UpdateTileCommand {
    return { type: 'UPDATE_TILE', key, patch };
}

function log(
    hint: string,
    tile?: TileAddress | null,
    group?: string,
    metadata?: Record<string, unknown>,
): LogCommand {
    return { type: 'LOG', hint, tile, group, metadata };
}

// =============================================================================
// SCRIPT GENERATOR
// =============================================================================

/**
 * Skeleton calibration script.
 * Implements: home all → measure first tile → complete
 */
export function* calibrationScript(
    config: ExecutorConfig,
): Generator<CalibrationCommand, void, CommandResult> {
    const tiles = buildTileDescriptors(config);
    const calibratableTiles = tiles.filter((t) => t.calibratable);

    if (calibratableTiles.length === 0) {
        yield updatePhase('error');
        return;
    }

    const macAddresses = extractMacAddresses(tiles);

    // === HOMING PHASE ===
    yield updatePhase('homing');
    yield log('Homing all motors', null, 'homing', { macAddresses });
    yield homeAll(macAddresses);
    yield checkpoint('home-all', 'Home all tiles');

    // === STAGING PHASE ===
    yield updatePhase('staging');
    yield log('Moving tiles aside', null, 'staging');

    // Move all calibratable tiles aside
    for (const tile of calibratableTiles) {
        const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
        yield moveTilePose(tileAddress, 'aside');
        yield updateTile(tile.key, { status: 'staged' });
    }
    yield checkpoint('stage-all', 'Move tiles aside');

    // === MEASURING PHASE (first tile only for skeleton) ===
    yield updatePhase('measuring');

    const firstTile = calibratableTiles[0];
    const tileAddress: TileAddress = {
        row: firstTile.row,
        col: firstTile.col,
        key: firstTile.key,
    };

    yield updateTile(firstTile.key, { status: 'measuring' });
    yield log('Measuring home position', tileAddress, 'measure');

    // Move to home and capture
    yield moveTilePose(tileAddress, 'home');

    const captureResult: CommandResult = yield capture(
        `Home measurement R${firstTile.row}C${firstTile.col}`,
        config.settings.firstTileTolerance,
    );

    const { measurement, error } = getCaptureResult(captureResult);

    if (!measurement) {
        // Failed to capture
        yield updateTile(firstTile.key, {
            status: 'failed',
            error: error ?? 'Unable to detect blob at home position',
        });
        yield log('Home measurement failed', tileAddress, 'measure', { error });
        yield moveTilePose(tileAddress, 'aside');
        yield updatePhase('error');
        return;
    }

    // Success - update tile with metrics
    yield log('Home measurement captured', tileAddress, 'measure', {
        x: measurement.x,
        y: measurement.y,
        size: measurement.size,
    });

    yield updateTile(firstTile.key, {
        status: 'completed',
        metrics: {
            home: measurement,
            homeOffset: null,
            adjustedHome: null,
            stepToDisplacement: { x: null, y: null },
            sizeDeltaAtStepTest: null,
        },
    });

    yield checkpoint(
        'measure-home',
        `Home measurement R${firstTile.row}C${firstTile.col}`,
        tileAddress,
    );

    // Move back aside
    yield moveTilePose(tileAddress, 'aside');

    // === COMPLETED ===
    yield updatePhase('completed');
    yield log('Calibration complete (skeleton)', null, 'complete');
}

/**
 * Script factory that returns the calibration generator.
 */
export function createCalibrationScript(config: ExecutorConfig) {
    return calibrationScript(config);
}
