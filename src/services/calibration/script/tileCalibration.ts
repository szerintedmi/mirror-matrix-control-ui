/**
 * Tile Calibration Module
 *
 * Reusable generator for calibrating a single tile.
 * Extracted from calibrationScript to enable:
 * - Full grid calibration (loop over tiles)
 * - Single-tile recalibration
 * - Future: multi-tile batch recalibration
 *
 * The calibrateTile generator orchestrates:
 * 1. Home measurement with retry/skip/abort
 * 2. X axis step test (interim + full for first tile)
 * 3. Y axis step test (interim + full for first tile)
 * 4. Returns complete tile result or abort signal
 */

import type { BlobMeasurement, Motor } from '@/types';
import { centeredToView } from '@/utils/coordinates';

import { computeExpectedBlobPosition, type TileMeasurement } from '../math/expectedPosition';
import {
    getAxisStepDelta,
    computeAxisStepTestResult,
    combineStepTestResults,
    type AxisStepTestResult,
} from '../math/stepTestCalculations';

import type { CalibrationCommand, CommandResult, DecisionOption } from './commands';
import type { ExecutorConfig } from './executor';
import type { CalibrationStepKind, TileAddress, TileCalibrationResult } from '../types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Tile descriptor with motor assignment info.
 */
export interface TileDescriptor {
    row: number;
    col: number;
    key: string;
    xMotor: Motor | null;
    yMotor: Motor | null;
    calibratable: boolean;
}

/**
 * Parameters for calibrating a single tile.
 */
export interface TileCalibrationParams {
    /** The tile to calibrate */
    tile: TileDescriptor;
    /** Whether this is the first tile in the calibration run */
    isFirstTile: boolean;
    /** First tile's perStep values (for subsequent tile estimation) */
    firstTilePerStep: { x: number | null; y: number | null };
    /** Completed measurements from prior tiles (for expected position) */
    completedMeasurements: TileMeasurement[];
    /** Executor configuration */
    config: ExecutorConfig;
}

/**
 * Outcome of calibrating a single tile.
 */
export interface TileCalibrationOutcome {
    /** Final status of the tile */
    status: 'completed' | 'partial' | 'skipped';
    /** Complete tile result for summary computation */
    result: TileCalibrationResult;
    /** Home measurement (if captured) */
    homeMeasurement: BlobMeasurement | null;
    /** Step test results for X and Y axes */
    stepTestResults: {
        x: AxisStepTestResult | null;
        y: AxisStepTestResult | null;
    };
    /** Warnings from step test failures (if ignored) */
    warnings: string[];
    /** Interim perStep values from first tile (for estimation) */
    interimPerStep: { x: number | null; y: number | null };
}

/** Result of measureHome when skipping */
interface MeasureHomeSkip {
    status: 'skip';
    error: string;
}

/** Result from axis step test */
interface AxisStepTestOutcome {
    result: AxisStepTestResult | null;
    ignored: boolean;
    interimPerStep: number | null;
    warnings: string[];
}

// =============================================================================
// COMMAND BUILDERS
// =============================================================================

function homeTile(tile: TileAddress): CalibrationCommand {
    return { type: 'HOME_TILE', tile };
}

function capture(
    label: string,
    tolerance: number,
    expectedPosition?: { x: number; y: number },
): CalibrationCommand {
    return { type: 'CAPTURE', label, tolerance, expectedPosition };
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

function updateTile(key: string, patch: Record<string, unknown>): CalibrationCommand {
    return { type: 'UPDATE_TILE', key, patch };
}

function moveAxis(motor: Motor, target: number): CalibrationCommand {
    return { type: 'MOVE_AXIS', motor, target };
}

function moveAxesBatch(moves: Array<{ motor: Motor; target: number }>): CalibrationCommand {
    return { type: 'MOVE_AXES_BATCH', moves };
}

function log(
    hint: string,
    tile?: TileAddress | null,
    group?: string,
    metadata?: Record<string, unknown>,
): CalibrationCommand {
    return { type: 'LOG', hint, tile, group, metadata };
}

function awaitDecision(
    kind: 'tile-failure' | 'step-test-failure' | 'command-failure',
    tile: TileAddress | null,
    error: string,
    options: DecisionOption[] = ['retry', 'skip', 'abort'],
): CalibrationCommand {
    return { type: 'AWAIT_DECISION', kind, tile, error, options };
}

function updateExpectedPosition(
    position: { x: number; y: number } | null,
    tolerance: number,
): CalibrationCommand {
    return { type: 'UPDATE_EXPECTED_POSITION', position, tolerance };
}

// =============================================================================
// RESULT HELPERS
// =============================================================================

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

/**
 * Get decision result from command result.
 */
function getDecisionResult(result: CommandResult): DecisionOption {
    if (result.type !== 'AWAIT_DECISION') {
        throw new Error(`Expected AWAIT_DECISION result, got ${result.type}`);
    }
    return result.decision;
}

/**
 * Type guard for MeasureHomeSkip.
 */
function isMeasureHomeSkip(
    result: BlobMeasurement | MeasureHomeSkip | 'abort',
): result is MeasureHomeSkip {
    return typeof result === 'object' && 'status' in result && result.status === 'skip';
}

// =============================================================================
// MEASURE HOME GENERATOR
// =============================================================================

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
            const maxDim = Math.max(measurement.sourceWidth || 1, measurement.sourceHeight || 1);
            const pixelX = measurement.x * maxDim;
            const pixelY = measurement.y * maxDim;

            // Size is in centered delta space (range is 2 instead of 1)
            const hasRoi =
                measurement.roiWidth !== undefined && measurement.roiHeight !== undefined;
            const sizeContextDim = hasRoi
                ? Math.max(measurement.roiWidth!, measurement.roiHeight!)
                : maxDim;
            const pixelSize = (measurement.size / 2) * sizeContextDim;

            const roiInfo = hasRoi
                ? ` ROI=${Math.round(measurement.roiWidth!)}x${Math.round(measurement.roiHeight!)}`
                : '';

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

// =============================================================================
// AXIS STEP TEST GENERATOR
// =============================================================================

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

// =============================================================================
// CALIBRATE TILE GENERATOR
// =============================================================================

/**
 * Calibrate a single tile: home measurement + X/Y step tests.
 *
 * This generator encapsulates the complete calibration workflow for one tile,
 * enabling reuse for:
 * - Full grid calibration (called in a loop)
 * - Single-tile recalibration
 * - Future: multi-tile batch recalibration
 *
 * @param params - Tile calibration parameters
 * @returns Tile calibration outcome or 'abort' signal
 */
export function* calibrateTile(
    params: TileCalibrationParams,
): Generator<CalibrationCommand, TileCalibrationOutcome | 'abort', CommandResult> {
    const { tile, isFirstTile, firstTilePerStep, completedMeasurements, config } = params;
    const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
    const tileLabel = `R${tile.row}C${tile.col}`;

    yield updateTile(tile.key, { status: 'measuring' });
    yield log(`Measuring tile ${tileLabel}`, tileAddress, 'measure');

    // Calculate expected position
    const expectedPos = computeExpectedBlobPosition(tile.row, tile.col, completedMeasurements, {
        gridSize: config.gridSize,
        arrayRotation: config.arrayRotation,
        roi: config.roi,
    });

    const tolerance = isFirstTile
        ? config.settings.firstTileTolerance
        : config.settings.tileTolerance;

    // === HOME MEASUREMENT ===
    const homeResult = yield* measureHome(tile, expectedPos, tolerance);

    // Handle abort
    if (homeResult === 'abort') {
        return 'abort';
    }

    // Handle skip
    if (isMeasureHomeSkip(homeResult)) {
        yield updateTile(tile.key, {
            status: 'skipped',
            error: homeResult.error,
        });
        return {
            status: 'skipped',
            result: {
                tile: tileAddress,
                status: 'skipped',
                error: homeResult.error,
            },
            homeMeasurement: null,
            stepTestResults: { x: null, y: null },
            warnings: [],
            interimPerStep: { x: null, y: null },
        };
    }

    const homeMeasurement = homeResult;

    yield log(`Home captured for ${tileLabel}`, tileAddress, 'measure', {
        x: homeMeasurement.x,
        y: homeMeasurement.y,
        size: homeMeasurement.size,
    });

    yield checkpoint('measure-home', `Home measurement ${tileLabel}`, tileAddress);

    // === STEP TESTS ===
    // X axis step test
    const xOutcome = yield* runAxisStepTest(
        'x',
        tile,
        homeMeasurement,
        isFirstTile,
        firstTilePerStep.x,
        config,
    );
    if (xOutcome === 'abort') {
        return 'abort';
    }

    // Y axis step test
    const yOutcome = yield* runAxisStepTest(
        'y',
        tile,
        homeMeasurement,
        isFirstTile,
        firstTilePerStep.y,
        config,
    );
    if (yOutcome === 'abort') {
        return 'abort';
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

    yield log(`Tile ${tileLabel} complete`, tileAddress, 'measure');

    return {
        status: tileStatus,
        result: {
            tile: tileAddress,
            status: tileStatus,
            warnings: tileWarnings.length > 0 ? tileWarnings : undefined,
            homeMeasurement,
            stepToDisplacement: stepTestResults.stepToDisplacement,
            sizeDeltaAtStepTest: stepTestResults.sizeDeltaAtStepTest,
        },
        homeMeasurement,
        stepTestResults: { x: xResult, y: yResult },
        warnings: tileWarnings,
        interimPerStep: {
            x: xOutcome.interimPerStep,
            y: yOutcome.interimPerStep,
        },
    };
}

// =============================================================================
// EXPORTS FOR SCRIPT.TS
// =============================================================================

export { isMeasureHomeSkip };
export type { MeasureHomeSkip };
