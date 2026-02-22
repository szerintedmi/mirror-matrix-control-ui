/**
 * Alignment Script (Generator)
 *
 * Pure generator function implementing the alignment convergence workflow.
 * Yields commands to the executor which handles all IO.
 *
 * Workflow:
 * 1. Stage all tiles aside
 * 2. Move reference tile (first) to home, measure baseline
 * 3. For each remaining tile: move to home, converge X then Y
 * 4. Deploy all tiles to final corrected positions
 *
 * Checkpoint placement varies by granularity (per-axis vs per-step).
 */

import type { AlignmentSettings } from '@/hooks/useAlignmentController';
import { resolveAxisRange } from '@/services/alignmentAxisTarget';
import type { ShapeMetrics } from '@/services/opencvWorkerClient';
import type { Axis, MirrorAssignment, TileCalibrationResults } from '@/types';

import type { AlignmentGranularity, ConvergenceStatus } from '../types';
import type {
    AlignmentCommand,
    AlignmentCommandResult,
    AwaitDecisionCommand,
    CaptureCommand,
    CheckpointCommand,
    DelayCommand,
    MoveMotorCommand,
    MoveTilePoseCommand,
    UpdateConvergenceStatusCommand,
    UpdatePhaseCommand,
    UpdateTileCommand,
} from './commands';

// =============================================================================
// SCRIPT CONFIG
// =============================================================================

export interface AlignmentTileInfo {
    key: string;
    row: number;
    col: number;
    assignment: MirrorAssignment;
    initialStepsX: number;
    initialStepsY: number;
    tileCalibration: TileCalibrationResults;
}

export interface AlignmentScriptConfig {
    tiles: AlignmentTileInfo[];
    settings: AlignmentSettings;
    granularity: AlignmentGranularity;
    needsPositioning: boolean;
}

// =============================================================================
// COMMAND BUILDERS
// =============================================================================

function moveMotor(mac: string, motorId: number, positionSteps: number): MoveMotorCommand {
    return { type: 'MOVE_MOTOR', mac, motorId, positionSteps };
}

function moveTilePose(
    tileKey: string,
    row: number,
    col: number,
    pose: 'home' | 'aside',
): MoveTilePoseCommand {
    return { type: 'MOVE_TILE_POSE', tileKey, row, col, pose };
}

function capture(): CaptureCommand {
    return { type: 'CAPTURE' };
}

function delay(ms: number): DelayCommand {
    return { type: 'DELAY', ms };
}

function updatePhase(phase: UpdatePhaseCommand['phase']): UpdatePhaseCommand {
    return { type: 'UPDATE_PHASE', phase };
}

function updateTile(tileKey: string, patch: UpdateTileCommand['patch']): UpdateTileCommand {
    return { type: 'UPDATE_TILE', tileKey, patch };
}

function updateConvergenceStatus(status: ConvergenceStatus | null): UpdateConvergenceStatusCommand {
    return { type: 'UPDATE_CONVERGENCE_STATUS', status };
}

function checkpoint(
    kind: CheckpointCommand['step']['kind'],
    label: string,
    tile?: string | null,
): CheckpointCommand {
    return { type: 'CHECKPOINT', step: { kind, label, tile } };
}

function awaitDecision(
    tile: string | null,
    error: string,
    options: AwaitDecisionCommand['options'],
): AwaitDecisionCommand {
    return { type: 'AWAIT_DECISION', tile, error, options };
}

// =============================================================================
// HELPERS (transplanted from useAlignmentController)
// =============================================================================

function computeAreaGap(currentArea: number, baselineArea: number, insertionArea: number): number {
    const range = Math.max(1, insertionArea - baselineArea);
    const gap = (currentArea - baselineArea) / range;
    return Math.max(0, Math.min(1, gap));
}

function computeProportionalStep(
    areaGap: number,
    maxStepSize: number,
    minStepSize: number,
): number {
    return Math.max(minStepSize, Math.round(maxStepSize * areaGap));
}

function improved(
    trial: ShapeMetrics,
    best: ShapeMetrics,
    settings: AlignmentSettings,
    baselineArea: number,
    insertionArea: number,
): boolean {
    const areaImproved = trial.area < best.area * (1 - settings.areaThreshold);
    const areaGap = computeAreaGap(trial.area, baselineArea, insertionArea);

    if (areaGap < 0.1) {
        const eccNotRegressed = trial.eccentricity <= best.eccentricity * 1.02;
        return areaImproved && eccNotRegressed;
    }
    return areaImproved;
}

// =============================================================================
// RESULT EXTRACTORS
// =============================================================================

function getCaptureMetrics(result: AlignmentCommandResult): ShapeMetrics | null {
    if (result.type !== 'CAPTURE') {
        throw new Error(`Expected CAPTURE result, got ${result.type}`);
    }
    return result.metrics;
}

function getDecision(result: AlignmentCommandResult): 'retry' | 'skip' | 'abort' {
    if (result.type !== 'AWAIT_DECISION') {
        throw new Error(`Expected AWAIT_DECISION result, got ${result.type}`);
    }
    return result.decision;
}

// =============================================================================
// SCRIPT GENERATOR
// =============================================================================

const AXES: Axis[] = ['x', 'y'];

export function* alignmentScript(
    config: AlignmentScriptConfig,
): Generator<AlignmentCommand, void, AlignmentCommandResult> {
    const { tiles, settings, granularity, needsPositioning } = config;

    if (tiles.length === 0) {
        yield updatePhase('idle');
        return;
    }

    // Track corrections for deploy phase
    const corrections: Record<string, { x: number; y: number }> = {};

    // === STAGING PHASE ===
    if (needsPositioning) {
        yield updatePhase('staging');

        // Stage all tiles to aside positions
        for (const t of tiles) {
            yield moveTilePose(t.key, t.row, t.col, 'aside');
        }
        yield delay(500);

        // Move reference tile (first) to calibrated home
        const first = tiles[0];
        if (first.assignment.x) {
            yield moveMotor(
                first.assignment.x.nodeMac,
                first.assignment.x.motorIndex,
                first.initialStepsX,
            );
        }
        if (first.assignment.y) {
            yield moveMotor(
                first.assignment.y.nodeMac,
                first.assignment.y.motorIndex,
                first.initialStepsY,
            );
        }
        yield delay(500);
    }

    // Checkpoint: staging complete
    yield checkpoint('stage-all', 'All tiles staged');

    // === BASELINE MEASUREMENT ===
    yield updatePhase('measuring-baseline');
    const baselineResult: AlignmentCommandResult = yield capture();
    const baselineMetrics = getCaptureMetrics(baselineResult);

    if (!baselineMetrics) {
        yield updatePhase('idle');
        return;
    }

    // Checkpoint: baseline measured
    yield checkpoint('measure-baseline', 'Baseline measured');

    // Mark first tile as converged (it's the reference point)
    yield updateTile(tiles[0].key, {
        status: 'converged',
        axisStatus: { axis: 'x', status: 'converged' },
    });
    yield updateTile(tiles[0].key, {
        axisStatus: { axis: 'y', status: 'converged' },
    });

    yield updatePhase('converging');

    // === PER-TILE CONVERGENCE ===
    for (let tileIdx = 1; tileIdx < tiles.length; tileIdx++) {
        const t = tiles[tileIdx];

        yield updateTile(t.key, { status: 'in-progress' });

        // Measure pre-insert baseline (cluster without this candidate)
        const preInsertResult: AlignmentCommandResult = yield capture();
        const preInsertBaseline = getCaptureMetrics(preInsertResult);

        // Move tile from staging to calibrated home
        const movePromises: AlignmentCommand[] = [];
        if (t.assignment.x) {
            movePromises.push(
                moveMotor(t.assignment.x.nodeMac, t.assignment.x.motorIndex, t.initialStepsX),
            );
        }
        if (t.assignment.y) {
            movePromises.push(
                moveMotor(t.assignment.y.nodeMac, t.assignment.y.motorIndex, t.initialStepsY),
            );
        }

        let moveError = false;
        for (const cmd of movePromises) {
            const result: AlignmentCommandResult = yield cmd;
            if (result.type === 'MOVE_MOTOR' && !result.success) {
                moveError = true;
            }
        }

        if (moveError) {
            yield updateTile(t.key, {
                status: 'error',
                error: 'Failed to move tile to home position',
            });
            continue;
        }

        yield delay(settings.settlingDelayMs);

        // Checkpoint: tile positioned at home
        yield checkpoint('position-tile', `Tile ${t.key} at home`, t.key);

        // === CONVERGE X AND Y AXES ===
        let tileHasConvergedAxis = false;
        let tileHasError = false;
        const tileCorrection = { x: 0, y: 0 };

        for (const axis of AXES) {
            const motor = axis === 'x' ? t.assignment.x : t.assignment.y;
            if (!motor) continue;

            yield updateTile(t.key, {
                axisStatus: { axis, status: 'in-progress' },
            });

            // Initial measurement for this axis
            const initialResult: AlignmentCommandResult = yield capture();
            let bestMetrics = getCaptureMetrics(initialResult);

            if (!bestMetrics) {
                tileHasError = true;
                yield updateTile(t.key, {
                    axisStatus: { axis, status: 'error', error: 'No shape detected' },
                });
                continue;
            }

            // Compute area-proportional initial step
            const insertionArea = bestMetrics.area;
            const baseArea = preInsertBaseline?.area ?? insertionArea;
            let areaGap = computeAreaGap(insertionArea, baseArea, insertionArea);
            let currentStep = computeProportionalStep(
                areaGap,
                settings.stepSize,
                settings.minStepSize,
            );

            let direction = 1;
            let iteration = 0;
            let consecutiveRejections = 0;
            let totalCorrection = 0;
            let axisStatus: 'converged' | 'max-iterations' | 'error' = 'max-iterations';
            let axisError: string | null = null;

            while (iteration < settings.maxIterations) {
                iteration++;

                // Update convergence status
                yield updateConvergenceStatus({
                    tile: t.key,
                    axis,
                    iteration,
                    maxIterations: settings.maxIterations,
                    referenceArea: baseArea,
                    currentArea: bestMetrics.area,
                    areaDifference: bestMetrics.area - baseArea,
                    areaGap,
                    activeStepSize: currentStep,
                    convergenceThreshold: settings.areaConvergenceThreshold,
                });

                // Compute trial position
                const currentStepsForAxis =
                    (axis === 'x' ? t.initialStepsX : t.initialStepsY) + totalCorrection;
                const trialPosition = currentStepsForAxis + direction * currentStep;

                // Bounds check
                const axisRange = resolveAxisRange(t.tileCalibration, axis);
                if (trialPosition < axisRange.min || trialPosition > axisRange.max) {
                    if (granularity === 'per-step') {
                        yield updateConvergenceStatus({
                            tile: t.key,
                            axis,
                            iteration,
                            maxIterations: settings.maxIterations,
                            referenceArea: baseArea,
                            currentArea: bestMetrics.area,
                            areaDifference: bestMetrics.area - baseArea,
                            areaGap,
                            activeStepSize: currentStep,
                            convergenceThreshold: settings.areaConvergenceThreshold,
                            trialPosition,
                            direction,
                            stepOutcome: 'bounds-exceeded',
                            consecutiveRejections,
                        });
                        yield checkpoint(
                            'trial-move',
                            `${t.key} ${axis.toUpperCase()} iter ${iteration}: bounds-exceeded`,
                            t.key,
                        );
                    }
                    axisStatus = 'error';
                    axisError = 'steps_out_of_range';
                    break;
                }

                // Trial move
                const moveResult: AlignmentCommandResult = yield moveMotor(
                    motor.nodeMac,
                    motor.motorIndex,
                    trialPosition,
                );

                if (moveResult.type === 'MOVE_MOTOR' && !moveResult.success) {
                    // Motor command failed — present decision
                    const decResult: AlignmentCommandResult = yield awaitDecision(
                        t.key,
                        'Motor command failed during convergence',
                        ['retry', 'skip', 'abort'],
                    );
                    const decision = getDecision(decResult);
                    if (decision === 'abort') {
                        yield updatePhase('idle');
                        return;
                    }
                    if (decision === 'skip') {
                        axisStatus = 'error';
                        axisError = 'Motor command failed';
                        break;
                    }
                    // retry — redo this iteration
                    iteration--;
                    continue;
                }

                yield delay(settings.settlingDelayMs);

                // Measure trial
                const trialResult: AlignmentCommandResult = yield capture();
                const trialMetrics = getCaptureMetrics(trialResult);

                if (!trialMetrics) {
                    // No contour detected — undo and stop
                    yield moveMotor(motor.nodeMac, motor.motorIndex, currentStepsForAxis);
                    yield delay(settings.settlingDelayMs);
                    axisStatus = 'error';
                    axisError = 'No shape detected during convergence';
                    break;
                }

                let stepOutcome: 'accepted' | 'rejected' | 'converged' = 'rejected';
                let shouldBreak = false;

                if (improved(trialMetrics, bestMetrics, settings, baseArea, insertionArea)) {
                    // Accept the move
                    bestMetrics = trialMetrics;
                    totalCorrection += direction * currentStep;
                    consecutiveRejections = 0;

                    // Recompute area-proportional step
                    areaGap = computeAreaGap(trialMetrics.area, baseArea, insertionArea);
                    currentStep = computeProportionalStep(
                        areaGap,
                        settings.stepSize,
                        settings.minStepSize,
                    );

                    // Update tile state
                    yield updateTile(t.key, {
                        currentSteps: {
                            [axis]:
                                (axis === 'x' ? t.initialStepsX : t.initialStepsY) +
                                totalCorrection,
                        },
                        correction: { [axis]: totalCorrection },
                        iterations: { [axis]: iteration },
                        axisCorrection: {
                            axis,
                            correctionSteps: totalCorrection,
                            iterations: iteration,
                        },
                    });

                    // Check convergence
                    if (areaGap <= settings.areaConvergenceThreshold) {
                        axisStatus = 'converged';
                        tileHasConvergedAxis = true;
                        stepOutcome = 'converged';
                        shouldBreak = true;
                    } else {
                        stepOutcome = 'accepted';
                    }
                } else {
                    // Undo the move
                    yield moveMotor(motor.nodeMac, motor.motorIndex, currentStepsForAxis);
                    yield delay(settings.settlingDelayMs);

                    // Flip direction
                    direction = -direction;
                    consecutiveRejections++;
                    stepOutcome = 'rejected';

                    // Both directions failed at current step
                    if (consecutiveRejections >= 2) {
                        shouldBreak = true;
                    }
                }

                // Per-step checkpoint: update convergence with trial result, then pause
                if (granularity === 'per-step') {
                    yield updateConvergenceStatus({
                        tile: t.key,
                        axis,
                        iteration,
                        maxIterations: settings.maxIterations,
                        referenceArea: baseArea,
                        currentArea: bestMetrics.area,
                        areaDifference: bestMetrics.area - baseArea,
                        areaGap,
                        activeStepSize: currentStep,
                        convergenceThreshold: settings.areaConvergenceThreshold,
                        trialArea: trialMetrics.area,
                        trialPosition,
                        direction,
                        stepOutcome,
                        consecutiveRejections,
                    });
                    yield checkpoint(
                        'trial-move',
                        `${t.key} ${axis.toUpperCase()} iter ${iteration}: ${stepOutcome}`,
                        t.key,
                    );
                }

                if (shouldBreak) break;
            }

            // Final axis status
            yield updateTile(t.key, {
                axisStatus: { axis, status: axisStatus, error: axisError },
                axisCorrection: { axis, correctionSteps: totalCorrection, iterations: iteration },
                correction: { [axis]: totalCorrection },
                iterations: { [axis]: iteration },
            });

            // Clear convergence status between axes
            yield updateConvergenceStatus(null);

            tileCorrection[axis] = totalCorrection;

            // Per-axis checkpoint
            yield checkpoint(
                axis === 'x' ? 'converge-axis-x' : 'converge-axis-y',
                `${t.key} ${axis.toUpperCase()} done`,
                t.key,
            );
        }

        corrections[t.key] = tileCorrection;

        // Final eccentricity measurement
        const finalResult: AlignmentCommandResult = yield capture();
        const finalMetrics = getCaptureMetrics(finalResult);
        const finalEcc = finalMetrics?.eccentricity ?? null;

        // Determine tile status
        let tileStatus: 'converged' | 'partial' | 'error';
        if (tileHasError) {
            tileStatus = 'error';
        } else if (tileHasConvergedAxis) {
            tileStatus = 'converged';
        } else {
            tileStatus = 'partial';
        }

        yield updateTile(t.key, { status: tileStatus, finalEccentricity: finalEcc });

        // Tile complete checkpoint
        yield checkpoint('tile-complete', `Tile ${t.key} complete`, t.key);

        // If isolating, move tile back to staging
        if (settings.isolateTiles) {
            yield moveTilePose(t.key, t.row, t.col, 'aside');
            yield delay(settings.settlingDelayMs);
        }
    }

    // === DEPLOY PHASE ===
    if (settings.isolateTiles) {
        for (const t of tiles) {
            const corr = corrections[t.key] ?? { x: 0, y: 0 };
            if (t.assignment.x) {
                yield moveMotor(
                    t.assignment.x.nodeMac,
                    t.assignment.x.motorIndex,
                    t.initialStepsX + corr.x,
                );
            }
            if (t.assignment.y) {
                yield moveMotor(
                    t.assignment.y.nodeMac,
                    t.assignment.y.motorIndex,
                    t.initialStepsY + corr.y,
                );
            }
        }
        yield delay(500);
    }

    yield checkpoint('deploy-all', 'All tiles deployed');
    yield updateConvergenceStatus(null);
    yield updatePhase('complete');
}
