/**
 * Calibration Script
 *
 * Pure generator function that yields calibration commands.
 * Implements the full calibration flow:
 * - Homing all motors
 * - Staging tiles aside
 * - Measuring each tile (home position + step tests)
 * - Computing summary and alignment
 */

import { asCentered } from '@/coords';
import type { BlobMeasurement, Motor } from '@/types';
import { centeredToView } from '@/utils/coordinates';

import { computeExpectedBlobPosition, type TileMeasurement } from '../math/expectedPosition';
import {
    getAxisStepDelta,
    computeAxisStepTestResult,
    combineStepTestResults,
    computeAlignmentTargetSteps,
    type AxisStepTestResult,
} from '../math/stepTestCalculations';
import {
    computeCalibrationSummary,
    type TileCalibrationResult,
    type SummaryConfig,
} from '../summaryComputation';

import type {
    AwaitDecisionCommand,
    CalibrationCommand,
    CaptureCommand,
    CheckpointCommand,
    CommandResult,
    DecisionOption,
    HomeAllCommand,
    HomeTileCommand,
    LogCommand,
    MoveAxesBatchCommand,
    MoveAxisCommand,
    MoveTilePoseCommand,
    MoveTilesBatchCommand,
    UpdateExpectedPositionCommand,
    UpdatePhaseCommand,
    UpdateProgressCommand,
    UpdateSummaryCommand,
    UpdateTileCommand,
} from './commands';
import type { ExecutorConfig } from './executor';
import type { CalibrationRunSummary, TileAddress, TileRunState } from '../types';

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

function homeTile(tile: TileAddress): HomeTileCommand {
    return { type: 'HOME_TILE', tile };
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

function moveAxis(motor: Motor, target: number): MoveAxisCommand {
    return { type: 'MOVE_AXIS', motor, target };
}

function moveAxesBatch(moves: Array<{ motor: Motor; target: number }>): MoveAxesBatchCommand {
    return { type: 'MOVE_AXES_BATCH', moves };
}

function log(
    hint: string,
    tile?: TileAddress | null,
    group?: string,
    metadata?: Record<string, unknown>,
): LogCommand {
    return { type: 'LOG', hint, tile, group, metadata };
}

function awaitDecision(
    kind: 'tile-failure' | 'step-test-failure' | 'command-failure',
    tile: TileAddress | null,
    error: string,
    options: DecisionOption[] = ['retry', 'skip', 'abort'],
): AwaitDecisionCommand {
    return { type: 'AWAIT_DECISION', kind, tile, error, options };
}

function moveTilesBatch(
    moves: Array<{ tile: TileAddress; pose: 'home' | 'aside' }>,
): MoveTilesBatchCommand {
    return { type: 'MOVE_TILES_BATCH', moves };
}

function updateSummary(summary: CalibrationRunSummary): UpdateSummaryCommand {
    return { type: 'UPDATE_SUMMARY', summary };
}

function updateExpectedPosition(
    position: { x: number; y: number } | null,
    tolerance: number,
): UpdateExpectedPositionCommand {
    return { type: 'UPDATE_EXPECTED_POSITION', position, tolerance };
}

function updateProgress(
    completed: number,
    failed: number,
    skipped: number,
    total: number,
): UpdateProgressCommand {
    return { type: 'UPDATE_PROGRESS', progress: { completed, failed, skipped, total } };
}

/**
 * Get decision result from command result.
 */
function getDecisionResult(result: CommandResult): DecisionOption {
    if (result.type !== 'AWAIT_DECISION') {
        throw new Error(`Expected AWAIT_DECISION result, got ${result.type}`);
    }
    return result.decision;
}

// =============================================================================
// HELPER GENERATORS
// =============================================================================

/** Result of measureHome when skipping */
interface MeasureHomeSkip {
    status: 'skip';
    error: string;
}

/** Type guard for MeasureHomeSkip */
function isMeasureHomeSkip(
    result: BlobMeasurement | MeasureHomeSkip | 'abort',
): result is MeasureHomeSkip {
    return typeof result === 'object' && 'status' in result && result.status === 'skip';
}

/**
 * Measure home position with retry/skip/abort decision loop.
 * Returns the measurement, or skip/abort signal.
 */
function* measureHome(
    tile: TileDescriptor,
    expectedPos: { x: number; y: number },
    tolerance: number,
): Generator<CalibrationCommand, BlobMeasurement | MeasureHomeSkip | 'abort', CommandResult> {
    const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
    const tileLabel = `R${tile.row}C${tile.col}`;

    // Update expected position before capture
    yield updateExpectedPosition({ x: expectedPos.x, y: expectedPos.y }, tolerance);

    while (true) {
        const homeCaptureResult: CommandResult = yield capture(
            `Home measurement ${tileLabel}`,
            tolerance,
            { x: expectedPos.x, y: expectedPos.y },
        );

        const { measurement, error: captureError } = getCaptureResult(homeCaptureResult);

        if (measurement) {
            // Measurements are in CENTERED coordinate space [-1, 1]
            // Positions use full-frame context, sizes use ROI context when ROI is active
            const maxDim = Math.max(measurement.sourceWidth || 1, measurement.sourceHeight || 1);
            const pixelX = measurement.x * maxDim;
            const pixelY = measurement.y * maxDim;

            // Size is in centered delta space (range is 2 instead of 1)
            // When ROI is active, size was normalized and converted using ROI dimensions
            // Convert to pixels: (centered_size / 2) * context_max_dim
            const hasRoi =
                measurement.roiWidth !== undefined && measurement.roiHeight !== undefined;
            const sizeContextDim = hasRoi
                ? Math.max(measurement.roiWidth!, measurement.roiHeight!)
                : maxDim;
            const pixelSize = (measurement.size / 2) * sizeContextDim;

            // Build ROI info string if ROI is active
            const roiInfo = hasRoi
                ? ` ROI=${Math.round(measurement.roiWidth!)}x${Math.round(measurement.roiHeight!)}`
                : '';

            // Log successful measurement with blob size and coordinate system
            yield log(
                `Home measurement ${tileLabel}: blob=${pixelSize.toFixed(1)}px at (${pixelX.toFixed(1)}, ${pixelY.toFixed(1)})px [centered: x=${measurement.x.toFixed(3)}, y=${measurement.y.toFixed(3)}, size=${measurement.size.toFixed(3)}] src=${measurement.sourceWidth}x${measurement.sourceHeight}${roiInfo}`,
                tileAddress,
                'measure',
            );
            return measurement;
        }

        // Home measurement failed - ask user what to do
        const errorMessage = captureError ?? 'Unable to detect blob at home position';
        yield log(`Home measurement failed for ${tileLabel}`, tileAddress, 'measure', {
            error: captureError,
        });

        const decisionResult: CommandResult = yield awaitDecision(
            'tile-failure',
            tileAddress,
            errorMessage,
            ['retry', 'home-retry', 'skip', 'abort'],
        );
        const decision = getDecisionResult(decisionResult);

        if (decision === 'retry') {
            yield log(`Retrying home measurement for ${tileLabel}`, tileAddress, 'measure');
            // Loop will continue
        } else if (decision === 'home-retry') {
            yield log(`Homing tile ${tileLabel} before retry`, tileAddress, 'measure');
            yield homeTile(tileAddress);
            yield log(
                `Retrying home measurement for ${tileLabel} after homing`,
                tileAddress,
                'measure',
            );
            // Loop will continue
        } else if (decision === 'skip') {
            yield log(`Skipping tile ${tileLabel}`, tileAddress, 'measure');
            return { status: 'skip', error: errorMessage };
        } else if (decision === 'abort') {
            yield log('Calibration aborted by user', null, 'abort');
            return 'abort';
        }
    }
}

/** Result from axis step test */
interface AxisStepTestOutcome {
    result: AxisStepTestResult | null;
    ignored: boolean;
    interimPerStep: number | null;
    warnings: string[];
}

/**
 * Run step test for a single axis (X or Y).
 * Handles interim step (for first tile) and full step with retry/ignore/abort.
 */
function* runAxisStepTest(
    axis: 'x' | 'y',
    tile: TileDescriptor,
    homeMeasurement: BlobMeasurement,
    isFirstTile: boolean,
    firstTilePerStep: number | null,
    config: ExecutorConfig,
): Generator<CalibrationCommand, AxisStepTestOutcome | 'abort', CommandResult> {
    const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
    const tileLabel = `R${tile.row}C${tile.col}`;
    const axisLabel = axis.toUpperCase();

    const motor = axis === 'x' ? tile.xMotor : tile.yMotor;
    if (!motor) {
        return { result: null, ignored: false, interimPerStep: null, warnings: [] };
    }

    const { deltaSteps, firstTileInterimStepDelta, tileTolerance, firstTileTolerance } =
        config.settings;

    // Home position in viewport coords
    const homeViewX = centeredToView(homeMeasurement.x);
    const homeViewY = centeredToView(homeMeasurement.y);

    let interimPerStep: number | null = null;
    let result: AxisStepTestResult | null = null;
    let ignored = false;
    const warnings: string[] = [];

    // --- INTERIM STEP TEST (first tile only) ---
    if (isFirstTile) {
        const interimDelta = getAxisStepDelta(
            axis,
            firstTileInterimStepDelta,
            config.arrayRotation,
        );
        if (interimDelta !== null) {
            yield log(
                `${axisLabel} interim step test (${interimDelta} steps)`,
                tileAddress,
                'step-test',
            );

            // Expected position: home position (no displacement estimate yet for first tile)
            const interimExpected = { x: homeViewX, y: homeViewY };
            yield updateExpectedPosition(interimExpected, firstTileTolerance);
            yield moveAxis(motor, interimDelta);

            const interimCaptureResult: CommandResult = yield capture(
                `${axisLabel} interim step ${tileLabel}`,
                firstTileTolerance,
                interimExpected,
            );
            const { measurement: interimMeas } = getCaptureResult(interimCaptureResult);

            if (interimMeas) {
                const interimResult = computeAxisStepTestResult(
                    homeMeasurement,
                    interimMeas,
                    axis,
                    interimDelta,
                );
                interimPerStep = interimResult.perStep;
                const maxDim = Math.max(
                    interimMeas.sourceWidth || 1,
                    interimMeas.sourceHeight || 1,
                );
                yield log(
                    `${axisLabel} interim: perStep=${interimResult.perStep?.toFixed(6)}, blob=${(interimMeas.size * maxDim).toFixed(1)}px at (${(interimMeas.x * maxDim).toFixed(1)}, ${(interimMeas.y * maxDim).toFixed(1)})px`,
                    tileAddress,
                    'step-test',
                );
                yield checkpoint(
                    axis === 'x' ? 'step-test-x-interim' : 'step-test-y-interim',
                    `${axisLabel} interim step ${tileLabel}`,
                    tileAddress,
                );
            }
        }
    }

    // --- FULL STEP TEST ---
    const fullDelta = getAxisStepDelta(axis, deltaSteps, config.arrayRotation);
    if (fullDelta !== null) {
        yield log(`${axisLabel} full step test (${fullDelta} steps)`, tileAddress, 'step-test');

        // Expected position: estimate displacement using interim perStep or first tile's perStep
        const displacementEstimate =
            interimPerStep !== null
                ? fullDelta * interimPerStep
                : firstTilePerStep !== null
                  ? fullDelta * firstTilePerStep
                  : 0;

        const homeCoord = axis === 'x' ? homeMeasurement.x : homeMeasurement.y;
        const fullExpected =
            axis === 'x'
                ? { x: centeredToView(homeCoord + displacementEstimate), y: homeViewY }
                : { x: homeViewX, y: centeredToView(homeCoord + displacementEstimate) };

        yield updateExpectedPosition(fullExpected, tileTolerance);

        // For Y axis on non-first tiles, parallel move X back to 0
        if (axis === 'y' && !isFirstTile && tile.xMotor) {
            yield moveAxesBatch([
                { motor: tile.xMotor, target: 0 },
                { motor, target: fullDelta },
            ]);
        } else if (axis === 'y' && isFirstTile) {
            // First tile: X is already at 0 after interim Y test, parallel move
            const yInterimMoves: Array<{ motor: Motor; target: number }> = [
                { motor, target: fullDelta },
            ];
            if (tile.xMotor) {
                yInterimMoves.push({ motor: tile.xMotor, target: 0 });
            }
            yield moveAxesBatch(yInterimMoves);
        } else {
            yield moveAxis(motor, fullDelta);
        }

        // Retry/decision loop for full step test capture
        while (result === null && !ignored) {
            const fullCaptureResult: CommandResult = yield capture(
                `${axisLabel} full step ${tileLabel}`,
                tileTolerance,
                fullExpected,
            );
            const { measurement: fullMeas, error: captureError } =
                getCaptureResult(fullCaptureResult);

            if (fullMeas) {
                result = computeAxisStepTestResult(homeMeasurement, fullMeas, axis, fullDelta);
                const maxDim = Math.max(fullMeas.sourceWidth || 1, fullMeas.sourceHeight || 1);
                yield log(
                    `${axisLabel} full: displacement=${result.displacement.toFixed(4)}, perStep=${result.perStep?.toFixed(6)}, blob=${(fullMeas.size * maxDim).toFixed(1)}px at (${(fullMeas.x * maxDim).toFixed(1)}, ${(fullMeas.y * maxDim).toFixed(1)})px`,
                    tileAddress,
                    'step-test',
                );
            } else {
                // Step test failed - ask user what to do
                const errorMessage =
                    captureError ?? `${axisLabel} step test failed: unable to detect blob`;
                yield log(
                    `${axisLabel} step test failed for ${tileLabel}`,
                    tileAddress,
                    'step-test',
                    {
                        error: captureError,
                    },
                );

                const decisionResult: CommandResult = yield awaitDecision(
                    'step-test-failure',
                    tileAddress,
                    errorMessage,
                    ['retry', 'home-retry', 'ignore', 'abort'],
                );
                const decision = getDecisionResult(decisionResult);

                if (decision === 'retry') {
                    yield log(
                        `Retrying ${axisLabel} step test for ${tileLabel}`,
                        tileAddress,
                        'step-test',
                    );
                    // Loop will continue
                } else if (decision === 'home-retry') {
                    yield log(
                        `Homing tile ${tileLabel} before ${axisLabel} step test retry`,
                        tileAddress,
                        'step-test',
                    );
                    yield homeTile(tileAddress);
                    // Re-issue the step test move since motors are now at home
                    yield log(
                        `Re-issuing ${axisLabel} step test move for ${tileLabel}`,
                        tileAddress,
                        'step-test',
                    );
                    // For Y axis on non-first tiles, parallel move X back to 0
                    if (axis === 'y' && !isFirstTile && tile.xMotor) {
                        yield moveAxesBatch([
                            { motor: tile.xMotor, target: 0 },
                            { motor, target: fullDelta },
                        ]);
                    } else if (axis === 'y' && isFirstTile) {
                        const yInterimMoves: Array<{ motor: Motor; target: number }> = [
                            { motor, target: fullDelta },
                        ];
                        if (tile.xMotor) {
                            yInterimMoves.push({ motor: tile.xMotor, target: 0 });
                        }
                        yield moveAxesBatch(yInterimMoves);
                    } else {
                        yield moveAxis(motor, fullDelta);
                    }
                    // Loop will continue to capture
                } else if (decision === 'ignore') {
                    ignored = true;
                    // Infer perStep from first tile
                    if (firstTilePerStep !== null) {
                        result = {
                            displacement: 0, // Unknown, inferred
                            perStep: firstTilePerStep,
                            sizeDelta: null, // Unknown, inferred
                        };
                        yield log(
                            `${axisLabel} step test ignored for ${tileLabel}, using inferred perStep=${firstTilePerStep.toFixed(6)}`,
                            tileAddress,
                            'step-test',
                        );
                    }
                    warnings.push(`${axisLabel} step test failed: ${errorMessage}`);
                } else if (decision === 'abort') {
                    yield log('Calibration aborted by user', null, 'abort');
                    return 'abort';
                }
            }
        }

        yield checkpoint(
            axis === 'x' ? 'step-test-x' : 'step-test-y',
            `${axisLabel} step test ${tileLabel}`,
            tileAddress,
        );
    }

    return { result, ignored, interimPerStep, warnings };
}

/**
 * Transition from current tile to next: parallel move current aside + next to home.
 * Also updates the expected position overlay for the next tile.
 */
function* transitionToNextTile(
    currentTile: TileAddress,
    nextTile: TileDescriptor,
    completedMeasurements: TileMeasurement[],
    config: ExecutorConfig,
): Generator<CalibrationCommand, void, CommandResult> {
    const nextTileAddress: TileAddress = {
        row: nextTile.row,
        col: nextTile.col,
        key: nextTile.key,
    };

    // Show expected position for next tile BEFORE moving it to home
    const nextTileExpectedPos = computeExpectedBlobPosition(
        nextTile.row,
        nextTile.col,
        completedMeasurements,
        {
            gridSize: config.gridSize,
            arrayRotation: config.arrayRotation,
            roi: config.roi,
        },
    );
    yield updateExpectedPosition(
        { x: nextTileExpectedPos.x, y: nextTileExpectedPos.y },
        config.settings.tileTolerance,
    );

    // Parallel: move current tile aside + move next tile to home
    yield moveTilesBatch([
        { tile: currentTile, pose: 'aside' },
        { tile: nextTileAddress, pose: 'home' },
    ]);
}

/**
 * Align completed tiles to their ideal grid positions.
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
// SCRIPT GENERATOR
// =============================================================================

/**
 * Internal state tracked during calibration.
 */
interface ScriptState {
    /** Completed tile measurements for expected position calculation */
    completedMeasurements: TileMeasurement[];
    /** First tile's perStep values for estimating subsequent tile positions */
    firstTilePerStep: { x: number | null; y: number | null };
    /** Count of completed tiles */
    completedCount: number;
    /** Count of failed tiles */
    failedCount: number;
    /** Count of skipped tiles */
    skippedCount: number;
    /** Tile results for summary computation */
    tileResults: Map<string, TileCalibrationResult>;
}

/**
 * Full calibration script.
 * Implements: home all → stage all → measure all tiles (with step tests) → complete
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

    // Initialize script state
    const state: ScriptState = {
        completedMeasurements: [],
        firstTilePerStep: { x: null, y: null },
        completedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        tileResults: new Map(),
    };

    // === HOMING PHASE ===
    yield updatePhase('homing');
    yield log('Homing all motors', null, 'homing', { macAddresses });
    yield homeAll(macAddresses);
    yield checkpoint('home-all', 'Home all tiles');

    // === STAGING PHASE ===
    yield updatePhase('staging');
    yield log('Moving tiles aside', null, 'staging');

    // Move all calibratable tiles aside (in parallel)
    const stagingMoves = calibratableTiles.map((tile) => ({
        tile: { row: tile.row, col: tile.col, key: tile.key } as TileAddress,
        pose: 'aside' as const,
    }));
    yield moveTilesBatch(stagingMoves);

    // Update tile statuses after all moves complete
    for (const tile of calibratableTiles) {
        yield updateTile(tile.key, { status: 'staged' });
    }
    yield checkpoint('stage-all', 'Move tiles aside');

    // === MEASURING PHASE ===
    yield updatePhase('measuring');

    // Move first tile to home before loop starts
    const firstTile = calibratableTiles[0];
    const firstTileAddress: TileAddress = {
        row: firstTile.row,
        col: firstTile.col,
        key: firstTile.key,
    };

    // Show expected position for first tile BEFORE moving to home
    const firstTileExpectedPos = computeExpectedBlobPosition(
        firstTile.row,
        firstTile.col,
        [], // No completed measurements yet
        {
            gridSize: config.gridSize,
            arrayRotation: config.arrayRotation,
            roi: config.roi,
        },
    );
    yield updateExpectedPosition(
        { x: firstTileExpectedPos.x, y: firstTileExpectedPos.y },
        config.settings.firstTileTolerance,
    );

    yield moveTilePose(firstTileAddress, 'home');

    for (let tileIndex = 0; tileIndex < calibratableTiles.length; tileIndex++) {
        const tile = calibratableTiles[tileIndex];
        const isFirstTile = tileIndex === 0;
        const isLastTile = tileIndex === calibratableTiles.length - 1;
        const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
        const tileLabel = `R${tile.row}C${tile.col}`;

        yield updateTile(tile.key, { status: 'measuring' });
        yield log(`Measuring tile ${tileLabel}`, tileAddress, 'measure');

        // Note: tile is already at home position (moved before loop or by parallel transition)

        // === HOME MEASUREMENT ===
        // Calculate expected position
        const expectedPos = computeExpectedBlobPosition(
            tile.row,
            tile.col,
            state.completedMeasurements,
            {
                gridSize: config.gridSize,
                arrayRotation: config.arrayRotation,
                roi: config.roi,
            },
        );

        const tolerance = isFirstTile
            ? config.settings.firstTileTolerance
            : config.settings.tileTolerance;

        // Home measurement with retry/skip/abort decision loop
        const homeResult = yield* measureHome(tile, expectedPos, tolerance);

        // Handle abort
        if (homeResult === 'abort') {
            yield updatePhase('aborted');
            return;
        }

        // Handle skip
        if (isMeasureHomeSkip(homeResult)) {
            yield updateTile(tile.key, {
                status: 'skipped',
                error: homeResult.error,
            });
            // Transition to next tile (parallel) or just move aside if last
            if (!isLastTile) {
                const nextTile = calibratableTiles[tileIndex + 1];
                yield* transitionToNextTile(
                    tileAddress,
                    nextTile,
                    state.completedMeasurements,
                    config,
                );
            } else {
                yield moveTilePose(tileAddress, 'aside');
            }
            state.skippedCount++;
            yield updateProgress(
                state.completedCount,
                state.failedCount,
                state.skippedCount,
                calibratableTiles.length,
            );
            continue;
        }

        // At this point, homeResult is the BlobMeasurement
        const homeMeasurement = homeResult;

        yield log(`Home captured for ${tileLabel}`, tileAddress, 'measure', {
            x: homeMeasurement.x,
            y: homeMeasurement.y,
            size: homeMeasurement.size,
        });

        // Store partial tile result for WIP summary (before step tests)
        state.tileResults.set(tile.key, {
            tile: tileAddress,
            status: 'measuring',
            homeMeasurement,
        });

        // Publish progressive WIP summary right after home measurement
        // This enables the blueprint grid overlay during calibration
        const wipSummaryConfig: SummaryConfig = {
            gridSize: config.gridSize,
            gridGapNormalized: config.settings.gridGapNormalized,
            deltaSteps: config.settings.deltaSteps,
            robustTileSize: config.settings.robustTileSize,
        };
        const wipSummary = computeCalibrationSummary(state.tileResults, wipSummaryConfig);
        yield updateSummary(wipSummary);

        yield checkpoint('measure-home', `Home measurement ${tileLabel}`, tileAddress);

        // === STEP TESTS ===
        // X axis step test
        const xOutcome = yield* runAxisStepTest(
            'x',
            tile,
            homeMeasurement,
            isFirstTile,
            state.firstTilePerStep.x,
            config,
        );
        if (xOutcome === 'abort') {
            yield updatePhase('aborted');
            return;
        }

        // Y axis step test
        const yOutcome = yield* runAxisStepTest(
            'y',
            tile,
            homeMeasurement,
            isFirstTile,
            state.firstTilePerStep.y,
            config,
        );
        if (yOutcome === 'abort') {
            yield updatePhase('aborted');
            return;
        }

        // Extract results from outcomes
        const xResult = xOutcome.result;
        const yResult = yOutcome.result;
        const xStepIgnored = xOutcome.ignored;
        const yStepIgnored = yOutcome.ignored;
        const tileWarnings = [...xOutcome.warnings, ...yOutcome.warnings];

        // Combine step test results
        const stepTestResults = combineStepTestResults(xResult, yResult);

        // Determine final status: 'partial' if any step test was ignored
        const hasInferredValues = xStepIgnored || yStepIgnored;
        const tileStatus = hasInferredValues ? 'partial' : 'completed';

        // Store first tile's perStep for expected position estimation
        // Only store if values are NOT inferred (partial tiles shouldn't contribute to estimation)
        if (isFirstTile && !hasInferredValues) {
            state.firstTilePerStep = stepTestResults.stepToDisplacement;
        }

        // Update tile with completed/partial metrics
        yield updateTile(tile.key, {
            status: tileStatus,
            warnings: tileWarnings.length > 0 ? tileWarnings : undefined,
            metrics: {
                home: homeMeasurement,
                homeOffset: null, // Computed in summary phase
                adjustedHome: null, // Computed in summary phase
                stepToDisplacement: stepTestResults.stepToDisplacement,
                sizeDeltaAtStepTest: stepTestResults.sizeDeltaAtStepTest,
            },
        });

        // Store tile result for summary computation
        state.tileResults.set(tile.key, {
            tile: tileAddress,
            status: tileStatus,
            warnings: tileWarnings.length > 0 ? tileWarnings : undefined,
            homeMeasurement,
            stepToDisplacement: stepTestResults.stepToDisplacement,
            sizeDeltaAtStepTest: stepTestResults.sizeDeltaAtStepTest,
        });

        // Add to completed measurements for expected position calculation
        state.completedMeasurements.push({
            row: tile.row,
            col: tile.col,
            position: asCentered(homeMeasurement.x, homeMeasurement.y),
        });
        state.completedCount++;

        // Update progress counter
        yield updateProgress(
            state.completedCount,
            state.failedCount,
            state.skippedCount,
            calibratableTiles.length,
        );

        // Publish progressive summary (WIP blueprint) for overlay display
        const progressiveSummaryConfig: SummaryConfig = {
            gridSize: config.gridSize,
            gridGapNormalized: config.settings.gridGapNormalized,
            deltaSteps: config.settings.deltaSteps,
            robustTileSize: config.settings.robustTileSize,
        };
        const progressiveSummary = computeCalibrationSummary(
            state.tileResults,
            progressiveSummaryConfig,
        );
        yield updateSummary(progressiveSummary);

        // Transition to next tile (parallel move) or move aside if last tile
        if (!isLastTile) {
            const nextTile = calibratableTiles[tileIndex + 1];
            yield* transitionToNextTile(tileAddress, nextTile, state.completedMeasurements, config);
        } else {
            yield moveTilePose(tileAddress, 'aside');
        }

        yield log(`Tile ${tileLabel} complete`, tileAddress, 'measure');
    }

    // === SUMMARY & ALIGNMENT PHASE ===
    if (state.completedCount > 0) {
        // Compute calibration summary
        const summaryConfig: SummaryConfig = {
            gridSize: config.gridSize,
            gridGapNormalized: config.settings.gridGapNormalized,
            deltaSteps: config.settings.deltaSteps,
            robustTileSize: config.settings.robustTileSize,
        };
        const summary = computeCalibrationSummary(state.tileResults, summaryConfig);

        // Emit summary to update WIP blueprint display
        yield updateSummary(summary);

        // Apply summary data to tile states
        for (const [key, tileSummary] of Object.entries(summary.tiles)) {
            if (tileSummary.status === 'completed' && tileSummary.homeOffset) {
                yield updateTile(key, {
                    metrics: {
                        homeOffset: tileSummary.homeOffset,
                        adjustedHome: tileSummary.adjustedHome,
                    },
                });
            }
        }

        // Alignment phase - move tiles to ideal grid positions (in parallel)
        yield* alignTiles(calibratableTiles, summary);
    }

    // === COMPLETED ===
    yield updatePhase('completed');
    yield log('Calibration complete', null, 'complete', {
        completed: state.completedCount,
        failed: state.failedCount,
        total: calibratableTiles.length,
    });
}

/**
 * Script factory that returns the calibration generator.
 */
export function createCalibrationScript(config: ExecutorConfig) {
    return calibrationScript(config);
}
