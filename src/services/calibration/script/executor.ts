/**
 * Calibration Executor
 *
 * Drives the calibration generator script, handling:
 * - IO command execution via adapters
 * - State command application to internal state
 * - Pause/resume/abort control flow
 * - Retries for CAPTURE commands
 * - Step mode (waiting at CHECKPOINTs)
 * - State emission to subscribers
 */

import {
    DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    type CalibrationRunnerSettings,
} from '@/constants/calibration';
import type { CommandFailure } from '@/services/pendingCommandTracker';
import type {
    ArrayRotation,
    MirrorAssignment,
    MirrorConfig,
    NormalizedRoi,
    StagingPosition,
} from '@/types';
import type { CommandErrorContext } from '@/types/commandError';
import { extractCommandErrorDetail } from '@/utils/commandErrors';

import {
    computePoseTargets,
    clampSteps,
    roundSteps,
    type StagingConfig,
} from '../math/stagingCalculations';
import {
    type CalibrationRunnerPhase,
    type CalibrationRunnerState,
    type CalibrationRunSummary,
    type CalibrationCommandLogEntry,
    type CalibrationStepState,
    type CalibrationStepDescriptor,
    type TileAddress,
    type TileRunState,
    createBaselineRunnerState,
} from '../types';

import type {
    CalibrationCommand,
    CommandResult,
    ExecutorAdapters,
    CaptureCommand,
    AwaitDecisionCommand,
    DecisionOption,
} from './commands';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for the executor.
 */
export interface ExecutorConfig {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    settings: CalibrationRunnerSettings;
    arrayRotation: ArrayRotation;
    stagingPosition: StagingPosition;
    roi: NormalizedRoi;
    /** 'auto' runs continuously; 'step' waits at CHECKPOINTs for advance() */
    mode: 'auto' | 'step';
}

/**
 * Pending decision state for the UI to display.
 */
export interface PendingDecision {
    kind: 'tile-failure' | 'step-test-failure' | 'command-failure';
    /** Tile context, may be null for global commands like HOME_ALL */
    tile: TileAddress | null;
    error: string;
    options: DecisionOption[];
}

/**
 * Callbacks for executor events.
 */
export interface ExecutorCallbacks {
    onStateChange?: (state: CalibrationRunnerState) => void;
    onStepStateChange?: (state: CalibrationStepState) => void;
    onCommandLog?: (entry: CalibrationCommandLogEntry) => void;
    onCommandError?: (context: CommandErrorContext) => void;
    onTileError?: (row: number, col: number, message: string) => void;
    onExpectedPositionChange?: (
        position: { x: number; y: number } | null,
        tolerance: number,
    ) => void;
    /** Called when a decision is needed from the user */
    onPendingDecision?: (decision: PendingDecision | null) => void;
}

/**
 * Script generator type.
 */
export type CalibrationScript = Generator<CalibrationCommand, void, CommandResult>;

/**
 * Script factory type.
 */
export type CalibrationScriptFactory = (config: ExecutorConfig) => CalibrationScript;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Type guard for motor command failures.
 */
const isCommandFailure = (error: unknown): error is CommandFailure =>
    error !== null &&
    typeof error === 'object' &&
    'kind' in error &&
    'command' in error &&
    typeof (error as CommandFailure).kind === 'string';

/**
 * Check if a command is a motor command (can fail due to hardware issues).
 */
const isMotorCommand = (command: CalibrationCommand): boolean =>
    command.type === 'HOME_ALL' ||
    command.type === 'MOVE_AXIS' ||
    command.type === 'MOVE_AXES_BATCH' ||
    command.type === 'MOVE_TILE_POSE' ||
    command.type === 'MOVE_TILES_BATCH';

/**
 * Get tile context from a command if available.
 */
const getCommandTileContext = (command: CalibrationCommand): TileAddress | null => {
    if (command.type === 'MOVE_TILE_POSE') {
        return command.tile;
    }
    if (command.type === 'MOVE_TILES_BATCH' && command.moves.length === 1) {
        return command.moves[0].tile;
    }
    if (command.type === 'MOVE_AXIS') {
        // MOVE_AXIS doesn't have tile context directly, but caller can provide via active tile
        return null;
    }
    return null;
};

// =============================================================================
// EXECUTOR CLASS
// =============================================================================

/**
 * Error thrown when executor is aborted.
 */
export class ExecutorAbortError extends Error {
    constructor(message = 'Executor aborted') {
        super(message);
        this.name = 'ExecutorAbortError';
    }
}

/**
 * Calibration executor that drives a generator script.
 */
export class CalibrationExecutor {
    private readonly config: ExecutorConfig;
    private readonly adapters: ExecutorAdapters;
    private readonly callbacks: ExecutorCallbacks;

    private state: CalibrationRunnerState;
    private readonly abortController = new AbortController();

    // Pause/resume control
    private paused = false;
    private pauseGateResolve: (() => void) | null = null;

    // Step mode control
    private stepGateResolve: (() => void) | null = null;
    private stepGateReject: ((err: Error) => void) | null = null;
    private activeStep: CalibrationStepState | null = null;

    // Decision gate control
    private pendingDecision: PendingDecision | null = null;
    private decisionGateResolve: ((decision: DecisionOption) => void) | null = null;
    private decisionGateReject: ((err: Error) => void) | null = null;

    // Axis position tracking
    private readonly axisPositions = new Map<string, number>();

    // Tiles skipped due to command failures (to skip subsequent commands)
    private readonly skippedTiles = new Set<string>();

    // Command log counter
    private commandLogCounter = 0;

    constructor(
        config: ExecutorConfig,
        adapters: ExecutorAdapters,
        callbacks: ExecutorCallbacks = {},
    ) {
        this.config = {
            ...config,
            settings: { ...DEFAULT_CALIBRATION_RUNNER_SETTINGS, ...config.settings },
        };
        this.adapters = adapters;
        this.callbacks = callbacks;
        this.state = createBaselineRunnerState(config.gridSize, config.mirrorConfig);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Get current executor state.
     */
    getState(): CalibrationRunnerState {
        return this.state;
    }

    /**
     * Run the calibration script to completion.
     */
    async run(scriptFactory: CalibrationScriptFactory): Promise<void> {
        const script = scriptFactory(this.config);
        await this.driveGenerator(script);
    }

    /**
     * Pause execution (will pause at next yield point).
     */
    pause(): void {
        if (this.paused || this.abortController.signal.aborted) {
            return;
        }
        this.paused = true;
    }

    /**
     * Resume execution after pause.
     */
    resume(): void {
        if (!this.paused) {
            return;
        }
        this.paused = false;
        if (this.pauseGateResolve) {
            this.pauseGateResolve();
            this.pauseGateResolve = null;
        }
    }

    /**
     * Advance to next step (step mode only).
     */
    advance(): void {
        if (this.stepGateResolve) {
            this.stepGateResolve();
            this.stepGateResolve = null;
            this.stepGateReject = null;
        }
    }

    /**
     * Get the current pending decision, if any.
     */
    getPendingDecision(): PendingDecision | null {
        return this.pendingDecision;
    }

    /**
     * Submit a decision to continue after AWAIT_DECISION command.
     */
    submitDecision(decision: DecisionOption): void {
        if (this.decisionGateResolve) {
            this.decisionGateResolve(decision);
            this.decisionGateResolve = null;
            this.decisionGateReject = null;
            this.pendingDecision = null;
            this.callbacks.onPendingDecision?.(null);
        }
    }

    /**
     * Abort execution.
     */
    abort(): void {
        this.abortController.abort();
        // Release any gates
        if (this.pauseGateResolve) {
            this.pauseGateResolve();
            this.pauseGateResolve = null;
        }
        if (this.stepGateReject) {
            this.stepGateReject(new ExecutorAbortError());
            this.stepGateResolve = null;
            this.stepGateReject = null;
        }
        if (this.decisionGateReject) {
            this.decisionGateReject(new ExecutorAbortError());
            this.decisionGateResolve = null;
            this.decisionGateReject = null;
            this.pendingDecision = null;
            this.callbacks.onPendingDecision?.(null);
        }
    }

    /**
     * Check if executor is aborted.
     */
    get isAborted(): boolean {
        return this.abortController.signal.aborted;
    }

    // =========================================================================
    // GENERATOR DRIVER
    // =========================================================================

    private async driveGenerator(script: CalibrationScript): Promise<void> {
        let result: CommandResult = { type: 'LOG', success: true }; // Initial dummy result

        while (true) {
            // Check abort
            if (this.abortController.signal.aborted) {
                this.updateState({ phase: 'aborted', activeTile: null, error: null });
                return;
            }

            // Check pause
            await this.checkPause();

            // Get next command
            const { value: command, done } = script.next(result);

            if (done || command === undefined) {
                break;
            }

            // Motor commands get retry/skip/ignore/abort handling
            if (isMotorCommand(command)) {
                // Check if this command is for a tile that was already skipped
                const tileContext = getCommandTileContext(command) ?? this.state.activeTile ?? null;
                if (tileContext && this.skippedTiles.has(tileContext.key)) {
                    // Skip commands for already-skipped tiles
                    result = this.getSuccessResultForCommand(command);
                    continue;
                }

                const motorResult = await this.executeMotorCommandWithRetry(command);
                if (motorResult === 'abort') {
                    this.updateState({ phase: 'aborted', activeTile: null, error: null });
                    return;
                }
                if (motorResult === 'skip' && tileContext) {
                    // Track skipped tile to skip subsequent commands
                    this.skippedTiles.add(tileContext.key);
                    // Mark tile as skipped in state
                    this.executeUpdateTile(tileContext.key, {
                        status: 'skipped',
                        error: 'Motor command failed - skipped by user',
                    });
                }
                // For 'success', 'skip', or 'ignore', continue with success result
                // (skip has already marked the tile, ignore just proceeds)
                result = this.getSuccessResultForCommand(command);
                continue;
            }

            try {
                result = await this.executeCommand(command);
            } catch (error) {
                if (error instanceof ExecutorAbortError) {
                    this.updateState({ phase: 'aborted', activeTile: null, error: null });
                    return;
                }

                const errorMessage = error instanceof Error ? error.message : String(error);
                this.updateState({ phase: 'error', activeTile: null, error: errorMessage });

                // Emit structured error for toast display if it's a motor command failure
                if (isCommandFailure(error)) {
                    const detail = extractCommandErrorDetail(error);
                    this.callbacks.onCommandError?.({
                        title: 'Calibration',
                        totalCount: 1,
                        errors: [detail],
                    });
                }

                throw error;
            }
        }
    }

    /**
     * Execute a motor command with retry/skip/ignore/abort handling.
     * Returns 'success', 'skip', 'ignore', or 'abort'.
     */
    private async executeMotorCommandWithRetry(
        command: CalibrationCommand,
    ): Promise<'success' | 'skip' | 'ignore' | 'abort'> {
        while (true) {
            // Check abort before each attempt
            if (this.abortController.signal.aborted) {
                return 'abort';
            }

            try {
                await this.executeCommand(command);
                return 'success';
            } catch (error) {
                if (error instanceof ExecutorAbortError) {
                    return 'abort';
                }

                const errorMessage = error instanceof Error ? error.message : String(error);

                // Emit structured error for toast display
                if (isCommandFailure(error)) {
                    const detail = extractCommandErrorDetail(error);
                    this.callbacks.onCommandError?.({
                        title: 'Calibration',
                        totalCount: 1,
                        errors: [detail],
                    });
                }

                // Get tile context - from command or fall back to active tile
                const tileContext = getCommandTileContext(command) ?? this.state.activeTile;

                // Determine options based on whether we have tile context
                // - With tile context during measuring: can ignore (keep home, infer) or skip
                // - With tile context before measuring: can skip the tile
                // - Without tile context (e.g., HOME_ALL): can only retry or abort
                const inMeasuringPhase = this.state.phase === 'measuring';
                const options: DecisionOption[] = tileContext
                    ? inMeasuringPhase
                        ? ['retry', 'ignore', 'skip', 'abort'] // During step test, ignore keeps home data
                        : ['retry', 'skip', 'abort']
                    : ['retry', 'abort'];

                // Present decision to user
                const decisionResult = await this.executeAwaitDecision({
                    type: 'AWAIT_DECISION',
                    kind: 'command-failure',
                    tile: tileContext,
                    error: `${command.type} failed: ${errorMessage}`,
                    options,
                });

                const decision =
                    decisionResult.type === 'AWAIT_DECISION' ? decisionResult.decision : 'abort';

                if (decision === 'retry') {
                    // Loop will retry
                    continue;
                }
                if (decision === 'ignore') {
                    // Continue as if command succeeded (motor may be in wrong position)
                    return 'ignore';
                }
                if (decision === 'skip') {
                    return 'skip';
                }
                // decision === 'abort'
                return 'abort';
            }
        }
    }

    /**
     * Get the success result for a command type.
     */
    private getSuccessResultForCommand(command: CalibrationCommand): CommandResult {
        switch (command.type) {
            case 'HOME_ALL':
                return { type: 'HOME_ALL', success: true };
            case 'MOVE_AXIS':
                return { type: 'MOVE_AXIS', success: true };
            case 'MOVE_AXES_BATCH':
                return { type: 'MOVE_AXES_BATCH', success: true };
            case 'MOVE_TILE_POSE':
                return { type: 'MOVE_TILE_POSE', success: true };
            case 'MOVE_TILES_BATCH':
                return { type: 'MOVE_TILES_BATCH', success: true };
            default:
                return { type: 'LOG', success: true };
        }
    }

    private async checkPause(): Promise<void> {
        if (!this.paused) {
            return;
        }

        const previousPhase = this.state.phase;
        this.updateState({ phase: 'paused' });

        await new Promise<void>((resolve) => {
            this.pauseGateResolve = resolve;
        });

        if (this.abortController.signal.aborted) {
            throw new ExecutorAbortError();
        }

        this.updateState({ phase: previousPhase });
    }

    // =========================================================================
    // COMMAND EXECUTION
    // =========================================================================

    private async executeCommand(command: CalibrationCommand): Promise<CommandResult> {
        switch (command.type) {
            case 'HOME_ALL':
                return this.executeHomeAll(command.macAddresses);

            case 'MOVE_AXIS':
                return this.executeMoveAxis(command.motor, command.target);

            case 'MOVE_AXES_BATCH':
                return this.executeMoveAxesBatch(command.moves);

            case 'MOVE_TILE_POSE':
                return this.executeMoveTilePose(command.tile, command.pose);

            case 'MOVE_TILES_BATCH':
                return this.executeMoveTilesBatch(command.moves);

            case 'CAPTURE':
                return this.executeCapture(command);

            case 'DELAY':
                return this.executeDelay(command.ms);

            case 'AWAIT_DECISION':
                return this.executeAwaitDecision(command);

            case 'UPDATE_PHASE':
                return this.executeUpdatePhase(command.phase);

            case 'UPDATE_TILE':
                return this.executeUpdateTile(command.key, command.patch);

            case 'CHECKPOINT':
                return this.executeCheckpoint(command.step);

            case 'LOG':
                return this.executeLog(command.hint, command.tile, command.group, command.metadata);

            case 'UPDATE_SUMMARY':
                return this.executeUpdateSummary(command.summary);

            case 'UPDATE_EXPECTED_POSITION':
                return this.executeUpdateExpectedPosition(command.position, command.tolerance);

            case 'UPDATE_PROGRESS':
                return this.executeUpdateProgress(command.progress);
        }
    }

    // -------------------------------------------------------------------------
    // IO Commands
    // -------------------------------------------------------------------------

    private async executeHomeAll(macAddresses: string[]): Promise<CommandResult> {
        await this.adapters.motor.homeAll(macAddresses);
        // Reset axis positions
        this.axisPositions.clear();
        return { type: 'HOME_ALL', success: true };
    }

    private async executeMoveAxis(
        motor: { nodeMac: string; motorIndex: number },
        target: number,
    ): Promise<CommandResult> {
        const roundedTarget = roundSteps(target);
        const clamped = clampSteps(roundedTarget);
        const axisKey = `${motor.nodeMac}:${motor.motorIndex}`;

        const current = this.axisPositions.get(axisKey);
        if (current === clamped) {
            // Already at target, skip move
            return { type: 'MOVE_AXIS', success: true };
        }

        await this.adapters.motor.moveMotor(motor.nodeMac, motor.motorIndex, clamped);
        this.axisPositions.set(axisKey, clamped);
        return { type: 'MOVE_AXIS', success: true };
    }

    private async executeMoveAxesBatch(
        moves: Array<{ motor: { nodeMac: string; motorIndex: number }; target: number }>,
    ): Promise<CommandResult> {
        const allMoves: Promise<void>[] = [];

        for (const { motor, target } of moves) {
            const roundedTarget = roundSteps(target);
            const clamped = clampSteps(roundedTarget);
            const axisKey = `${motor.nodeMac}:${motor.motorIndex}`;

            const current = this.axisPositions.get(axisKey);
            if (current === clamped) {
                // Already at target, skip move
                continue;
            }

            allMoves.push(
                this.adapters.motor.moveMotor(motor.nodeMac, motor.motorIndex, clamped).then(() => {
                    this.axisPositions.set(axisKey, clamped);
                }),
            );
        }

        await Promise.all(allMoves);
        return { type: 'MOVE_AXES_BATCH', success: true };
    }

    private async executeMoveTilePose(
        tile: TileAddress,
        pose: 'home' | 'aside',
    ): Promise<CommandResult> {
        const assignment = this.getTileAssignment(tile.key);
        if (!assignment) {
            return { type: 'MOVE_TILE_POSE', success: true };
        }

        const stagingConfig: StagingConfig = {
            gridSize: this.config.gridSize,
            arrayRotation: this.config.arrayRotation,
            stagingPosition: this.config.stagingPosition,
        };

        const targets = computePoseTargets({ row: tile.row, col: tile.col }, pose, stagingConfig);

        // Move both axes in parallel
        const moves: Promise<void>[] = [];
        if (assignment.x) {
            moves.push(
                this.adapters.motor
                    .moveMotor(
                        assignment.x.nodeMac,
                        assignment.x.motorIndex,
                        clampSteps(roundSteps(targets.x)),
                    )
                    .then(() => {
                        const key = `${assignment.x!.nodeMac}:${assignment.x!.motorIndex}`;
                        this.axisPositions.set(key, clampSteps(roundSteps(targets.x)));
                    }),
            );
        }
        if (assignment.y) {
            moves.push(
                this.adapters.motor
                    .moveMotor(
                        assignment.y.nodeMac,
                        assignment.y.motorIndex,
                        clampSteps(roundSteps(targets.y)),
                    )
                    .then(() => {
                        const key = `${assignment.y!.nodeMac}:${assignment.y!.motorIndex}`;
                        this.axisPositions.set(key, clampSteps(roundSteps(targets.y)));
                    }),
            );
        }

        await Promise.all(moves);
        return { type: 'MOVE_TILE_POSE', success: true };
    }

    private async executeMoveTilesBatch(
        moves: Array<{ tile: TileAddress; pose: 'home' | 'aside' }>,
    ): Promise<CommandResult> {
        const stagingConfig: StagingConfig = {
            gridSize: this.config.gridSize,
            arrayRotation: this.config.arrayRotation,
            stagingPosition: this.config.stagingPosition,
        };

        // Collect all individual axis moves
        const allMoves: Promise<void>[] = [];

        for (const { tile, pose } of moves) {
            const assignment = this.getTileAssignment(tile.key);
            if (!assignment) {
                continue;
            }

            const targets = computePoseTargets(
                { row: tile.row, col: tile.col },
                pose,
                stagingConfig,
            );

            if (assignment.x) {
                const xTarget = clampSteps(roundSteps(targets.x));
                allMoves.push(
                    this.adapters.motor
                        .moveMotor(assignment.x.nodeMac, assignment.x.motorIndex, xTarget)
                        .then(() => {
                            const key = `${assignment.x!.nodeMac}:${assignment.x!.motorIndex}`;
                            this.axisPositions.set(key, xTarget);
                        }),
                );
            }
            if (assignment.y) {
                const yTarget = clampSteps(roundSteps(targets.y));
                allMoves.push(
                    this.adapters.motor
                        .moveMotor(assignment.y.nodeMac, assignment.y.motorIndex, yTarget)
                        .then(() => {
                            const key = `${assignment.y!.nodeMac}:${assignment.y!.motorIndex}`;
                            this.axisPositions.set(key, yTarget);
                        }),
                );
            }
        }

        await Promise.all(allMoves);
        return { type: 'MOVE_TILES_BATCH', success: true };
    }

    private async executeCapture(command: CaptureCommand): Promise<CommandResult> {
        const { settings } = this.config;
        let lastError: string | undefined;

        // Note: Expected position overlay is now controlled by UPDATE_EXPECTED_POSITION commands
        // from the script. CAPTURE.expectedPosition is only used for blob selection validation.

        // Retry loop
        for (let attempt = 0; attempt < settings.maxDetectionRetries; attempt++) {
            if (this.abortController.signal.aborted) {
                throw new ExecutorAbortError();
            }

            try {
                const measurement = await this.adapters.camera.capture({
                    timeoutMs: settings.sampleTimeoutMs,
                    signal: this.abortController.signal,
                    expectedPosition: command.expectedPosition,
                    maxDistance: command.tolerance,
                });

                if (measurement) {
                    return { type: 'CAPTURE', measurement };
                }

                lastError = command.expectedPosition
                    ? `No blob detected within ${command.tolerance.toFixed(2)} of expected position`
                    : 'No blob detected';
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new ExecutorAbortError();
                }
                lastError = error instanceof Error ? error.message : String(error);
            }

            // Wait before retry (except on last attempt)
            if (attempt < settings.maxDetectionRetries - 1) {
                try {
                    await this.adapters.clock.delay(
                        settings.retryDelayMs,
                        this.abortController.signal,
                    );
                } catch (error) {
                    if (error instanceof Error && error.name === 'AbortError') {
                        throw new ExecutorAbortError();
                    }
                    throw error;
                }
            }
        }

        return { type: 'CAPTURE', measurement: null, error: lastError };
    }

    private async executeDelay(ms: number): Promise<CommandResult> {
        try {
            await this.adapters.clock.delay(ms, this.abortController.signal);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ExecutorAbortError();
            }
            throw error;
        }
        return { type: 'DELAY', success: true };
    }

    private async executeAwaitDecision(command: AwaitDecisionCommand): Promise<CommandResult> {
        // Set pending decision state
        this.pendingDecision = {
            kind: command.kind,
            tile: command.tile,
            error: command.error,
            options: command.options,
        };

        // Notify UI
        this.callbacks.onPendingDecision?.(this.pendingDecision);

        // Wait for user decision
        const decision = await new Promise<DecisionOption>((resolve, reject) => {
            if (this.abortController.signal.aborted) {
                reject(new ExecutorAbortError());
                return;
            }
            this.decisionGateResolve = resolve;
            this.decisionGateReject = reject;
        });

        return { type: 'AWAIT_DECISION', decision };
    }

    // -------------------------------------------------------------------------
    // State Commands
    // -------------------------------------------------------------------------

    private executeUpdatePhase(phase: CalibrationRunnerPhase): CommandResult {
        this.updateState({ phase });
        return { type: 'UPDATE_PHASE', success: true };
    }

    private executeUpdateTile(key: string, patch: Partial<TileRunState>): CommandResult {
        const current = this.state.tiles[key];
        if (!current) {
            return { type: 'UPDATE_TILE', success: true };
        }

        const next: TileRunState = {
            ...current,
            ...patch,
            tile: current.tile,
        };

        // Derive activeTile from status changes
        let activeTile = this.state.activeTile;
        if (patch.status === 'measuring') {
            activeTile = current.tile;
        } else if (
            patch.status === 'completed' ||
            patch.status === 'failed' ||
            patch.status === 'skipped'
        ) {
            // Clear activeTile when tile finishes
            if (activeTile?.key === key) {
                activeTile = null;
            }
        }

        this.state = {
            ...this.state,
            activeTile,
            tiles: {
                ...this.state.tiles,
                [key]: next,
            },
        };
        this.emitState();

        // Emit tile error callback when a tile is marked as failed or skipped
        if ((patch.status === 'failed' || patch.status === 'skipped') && patch.error) {
            this.callbacks.onTileError?.(current.tile.row, current.tile.col, patch.error);
        }

        return { type: 'UPDATE_TILE', success: true };
    }

    private async executeCheckpoint(step: CalibrationStepDescriptor): Promise<CommandResult> {
        // Emit step state
        const stepState: CalibrationStepState = {
            step,
            status: this.config.mode === 'step' ? 'waiting' : 'completed',
        };
        this.activeStep = stepState;
        this.callbacks.onStepStateChange?.(stepState);

        // In step mode, wait for advance()
        if (this.config.mode === 'step') {
            await new Promise<void>((resolve, reject) => {
                if (this.abortController.signal.aborted) {
                    reject(new ExecutorAbortError());
                    return;
                }
                this.stepGateResolve = resolve;
                this.stepGateReject = reject;
            });
        }

        // Emit completed state
        const completedState: CalibrationStepState = {
            step,
            status: 'completed',
        };
        this.activeStep = completedState;
        this.callbacks.onStepStateChange?.(completedState);

        return { type: 'CHECKPOINT', success: true };
    }

    private executeLog(
        hint: string,
        tile?: TileAddress | null,
        group?: string,
        metadata?: Record<string, unknown>,
    ): CommandResult {
        this.commandLogCounter++;
        const entry: CalibrationCommandLogEntry = {
            id: `cmd-${this.adapters.clock.now()}-${this.commandLogCounter}`,
            hint,
            phase: this.state.phase,
            tile,
            timestamp: this.adapters.clock.now(),
            sequence: this.commandLogCounter,
            group,
            metadata,
        };
        this.callbacks.onCommandLog?.(entry);
        return { type: 'LOG', success: true };
    }

    private executeUpdateSummary(summary: CalibrationRunSummary): CommandResult {
        this.updateState({ summary });
        return { type: 'UPDATE_SUMMARY', success: true };
    }

    private executeUpdateExpectedPosition(
        position: { x: number; y: number } | null,
        tolerance: number,
    ): CommandResult {
        this.callbacks.onExpectedPositionChange?.(position, tolerance);
        return { type: 'UPDATE_EXPECTED_POSITION', success: true };
    }

    private executeUpdateProgress(progress: {
        completed: number;
        failed: number;
        skipped: number;
        total: number;
    }): CommandResult {
        this.updateState({ progress });
        return { type: 'UPDATE_PROGRESS', success: true };
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private getTileAssignment(key: string): MirrorAssignment | undefined {
        return this.config.mirrorConfig.get(key);
    }

    private updateState(patch: Partial<CalibrationRunnerState>): void {
        this.state = {
            ...this.state,
            ...patch,
            tiles: patch.tiles ?? this.state.tiles,
            progress: patch.progress ?? this.state.progress,
        };
        this.emitState();
    }

    private emitState(): void {
        this.callbacks.onStateChange?.(this.state);
    }
}
