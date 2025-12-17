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
    type CalibrationRunnerPhase,
    type CalibrationRunnerState,
    type CalibrationCommandLogEntry,
    type CalibrationStepState,
    type CalibrationStepDescriptor,
    type TileAddress,
    type TileRunState,
    createBaselineRunnerState,
} from '../../calibrationRunner';
import {
    computePoseTargets,
    clampSteps,
    roundSteps,
    type StagingConfig,
} from '../math/stagingCalculations';

import type {
    CalibrationCommand,
    CommandResult,
    ExecutorAdapters,
    CaptureCommand,
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

    // Axis position tracking
    private readonly axisPositions = new Map<string, number>();

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

            case 'MOVE_TILE_POSE':
                return this.executeMoveTilePose(command.tile, command.pose);

            case 'CAPTURE':
                return this.executeCapture(command);

            case 'DELAY':
                return this.executeDelay(command.ms);

            case 'UPDATE_PHASE':
                return this.executeUpdatePhase(command.phase);

            case 'UPDATE_TILE':
                return this.executeUpdateTile(command.key, command.patch);

            case 'CHECKPOINT':
                return this.executeCheckpoint(command.step);

            case 'LOG':
                return this.executeLog(command.hint, command.tile, command.group, command.metadata);
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

    private async executeCapture(command: CaptureCommand): Promise<CommandResult> {
        const { settings } = this.config;
        let lastError: string | undefined;

        // Show expected position overlay
        if (command.expectedPosition) {
            this.callbacks.onExpectedPositionChange?.(command.expectedPosition, command.tolerance);
        }

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

        // Emit tile error callback when a tile is marked as failed
        if (patch.status === 'failed' && patch.error) {
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
