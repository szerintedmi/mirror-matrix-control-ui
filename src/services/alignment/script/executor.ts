/**
 * Alignment Executor
 *
 * Drives the alignment generator script, handling:
 * - IO command execution via adapters
 * - State command callbacks
 * - Step mode (waiting at CHECKPOINTs)
 * - Decision gates for failure handling
 * - Retry tile (restarts current tile convergence)
 *
 * Modeled on the calibration executor pattern.
 */

import type {
    AlignmentPhase,
    AxisAlignmentStatus,
    TileAlignmentStatus,
} from '@/hooks/useAlignmentController';
import type { ShapeMetrics } from '@/services/opencvWorkerClient';
import type { Axis } from '@/types';

import { alignmentScript } from './script';

import type {
    AlignmentGranularity,
    AlignmentMode,
    AlignmentStepState,
    AlignmentPendingDecision,
    AlignmentDecisionOption,
    ConvergenceStatus,
} from '../types';
import type {
    AlignmentAdapters,
    AlignmentCommand,
    AlignmentCommandResult,
    CheckpointCommand,
} from './commands';
import type { AlignmentScriptConfig } from './script';

// =============================================================================
// TYPES
// =============================================================================

export type AlignmentScript = Generator<AlignmentCommand, void, AlignmentCommandResult>;
export type AlignmentScriptFactory = (config: AlignmentScriptConfig) => AlignmentScript;

export interface AlignmentExecutorCallbacks {
    onPhaseChange?: (phase: AlignmentPhase) => void;
    onTileUpdate?: (
        tileKey: string,
        patch: {
            status?: TileAlignmentStatus;
            currentSteps?: Partial<{ x: number; y: number }>;
            correction?: Partial<{ x: number; y: number }>;
            iterations?: Partial<{ x: number; y: number }>;
            axisStatus?: { axis: Axis; status: AxisAlignmentStatus; error?: string | null };
            axisCorrection?: { axis: Axis; correctionSteps: number; iterations: number };
            finalEccentricity?: number | null;
            error?: string | null;
        },
    ) => void;
    onStepStateChange?: (state: AlignmentStepState | null) => void;
    onConvergenceStatusChange?: (status: ConvergenceStatus | null) => void;
    onPendingDecisionChange?: (decision: AlignmentPendingDecision | null) => void;
    onBaselineMetrics?: (metrics: ShapeMetrics) => void;
    onCurrentMetrics?: (metrics: ShapeMetrics) => void;
    onPositioningComplete?: () => void;
}

// =============================================================================
// EXECUTOR
// =============================================================================

export class AlignmentExecutorAbortError extends Error {
    constructor(message = 'Alignment executor aborted') {
        super(message);
        this.name = 'AlignmentExecutorAbortError';
    }
}

export class AlignmentExecutor {
    private readonly adapters: AlignmentAdapters;
    private readonly callbacks: AlignmentExecutorCallbacks;

    private mode: AlignmentMode;
    private granularity: AlignmentGranularity;
    private aborted = false;

    // Step gate
    private stepGateResolve: (() => void) | null = null;
    private stepGateReject: ((err: Error) => void) | null = null;

    // Decision gate
    private decisionGateResolve: ((d: AlignmentDecisionOption) => void) | null = null;
    private decisionGateReject: ((err: Error) => void) | null = null;

    // Retry flag: when set, the executor signals the script to restart the current tile
    private retryRequested = false;

    constructor(
        adapters: AlignmentAdapters,
        callbacks: AlignmentExecutorCallbacks,
        mode: AlignmentMode,
        granularity: AlignmentGranularity,
    ) {
        this.adapters = adapters;
        this.callbacks = callbacks;
        this.mode = mode;
        this.granularity = granularity;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    async run(config: AlignmentScriptConfig): Promise<void> {
        const script = alignmentScript({ ...config, granularity: this.granularity });
        try {
            await this.driveGenerator(script);
        } catch (error) {
            if (error instanceof AlignmentExecutorAbortError) {
                this.callbacks.onPhaseChange?.('idle');
                return;
            }
            throw error;
        }
    }

    /** Advance past the current checkpoint (step mode) */
    advance(): void {
        if (this.stepGateResolve) {
            this.stepGateResolve();
            this.stepGateResolve = null;
            this.stepGateReject = null;
        }
    }

    /** Switch to auto mode and advance */
    runToEnd(): void {
        this.mode = 'auto';
        this.advance();
    }

    /** Set retry flag and advance past current checkpoint */
    retryTile(): void {
        this.retryRequested = true;
        this.advance();
    }

    /** Submit a user decision for AWAIT_DECISION */
    submitDecision(decision: AlignmentDecisionOption): void {
        if (this.decisionGateResolve) {
            this.decisionGateResolve(decision);
            this.decisionGateResolve = null;
            this.decisionGateReject = null;
            this.callbacks.onPendingDecisionChange?.(null);
        }
    }

    /** Abort execution */
    abort(): void {
        this.aborted = true;
        if (this.stepGateReject) {
            this.stepGateReject(new AlignmentExecutorAbortError());
            this.stepGateResolve = null;
            this.stepGateReject = null;
        }
        if (this.decisionGateReject) {
            this.decisionGateReject(new AlignmentExecutorAbortError());
            this.decisionGateResolve = null;
            this.decisionGateReject = null;
            this.callbacks.onPendingDecisionChange?.(null);
        }
    }

    get isAborted(): boolean {
        return this.aborted;
    }

    /** Check if retry was requested (called from script restart logic) */
    consumeRetryRequest(): boolean {
        if (this.retryRequested) {
            this.retryRequested = false;
            return true;
        }
        return false;
    }

    // =========================================================================
    // GENERATOR DRIVER
    // =========================================================================

    private async driveGenerator(script: AlignmentScript): Promise<void> {
        // Initial dummy result
        let result: AlignmentCommandResult = { type: 'CHECKPOINT', success: true };

        while (true) {
            if (this.aborted) {
                throw new AlignmentExecutorAbortError();
            }

            const { value: command, done } = script.next(result);
            if (done || command === undefined) {
                break;
            }

            result = await this.executeCommand(command);
        }
    }

    // =========================================================================
    // COMMAND EXECUTION
    // =========================================================================

    private async executeCommand(command: AlignmentCommand): Promise<AlignmentCommandResult> {
        switch (command.type) {
            case 'MOVE_MOTOR':
                return this.executeMoveMotor(command.mac, command.motorId, command.positionSteps);

            case 'MOVE_TILE_POSE':
                return this.executeMoveTilePose(
                    command.tileKey,
                    command.row,
                    command.col,
                    command.pose,
                );

            case 'CAPTURE':
                return this.executeCapture();

            case 'DELAY':
                return this.executeDelay(command.ms);

            case 'AWAIT_DECISION':
                return this.executeAwaitDecision(command);

            case 'UPDATE_PHASE':
                return this.executeUpdatePhase(command.phase);

            case 'UPDATE_TILE':
                return this.executeUpdateTile(command.tileKey, command.patch);

            case 'UPDATE_CONVERGENCE_STATUS':
                return this.executeUpdateConvergenceStatus(command.status);

            case 'CHECKPOINT':
                return this.executeCheckpoint(command);
        }
    }

    // IO Commands

    private async executeMoveMotor(
        mac: string,
        motorId: number,
        positionSteps: number,
    ): Promise<AlignmentCommandResult> {
        try {
            await this.adapters.motor.moveMotor(mac, motorId, positionSteps);
        } catch (e) {
            console.warn(`Motor command failed: ${mac}:${motorId} -> ${positionSteps}`, e);
            // Return success anyway; script handles failures via capture results
        }
        return { type: 'MOVE_MOTOR', success: true };
    }

    private async executeMoveTilePose(
        tileKey: string,
        row: number,
        col: number,
        pose: 'home' | 'aside',
    ): Promise<AlignmentCommandResult> {
        try {
            await this.adapters.motor.moveTilePose(tileKey, row, col, pose);
        } catch (e) {
            console.warn(`Tile pose move failed: ${tileKey} -> ${pose}`, e);
        }
        return { type: 'MOVE_TILE_POSE', success: true };
    }

    private async executeCapture(): Promise<AlignmentCommandResult> {
        const metrics = await this.adapters.shape.measureShape();
        if (metrics) {
            this.callbacks.onCurrentMetrics?.(metrics);
        }
        return { type: 'CAPTURE', metrics };
    }

    private async executeDelay(ms: number): Promise<AlignmentCommandResult> {
        await this.adapters.clock.delay(ms);
        return { type: 'DELAY', success: true };
    }

    private async executeAwaitDecision(
        command: AlignmentCommand & { type: 'AWAIT_DECISION' },
    ): Promise<AlignmentCommandResult> {
        const pending: AlignmentPendingDecision = {
            tile: command.tile,
            error: command.error,
            options: command.options,
        };
        this.callbacks.onPendingDecisionChange?.(pending);

        const decision = await new Promise<AlignmentDecisionOption>((resolve, reject) => {
            if (this.aborted) {
                reject(new AlignmentExecutorAbortError());
                return;
            }
            this.decisionGateResolve = resolve;
            this.decisionGateReject = reject;
        });

        return { type: 'AWAIT_DECISION', decision };
    }

    // State Commands

    private executeUpdatePhase(phase: AlignmentPhase): AlignmentCommandResult {
        this.callbacks.onPhaseChange?.(phase);
        return { type: 'UPDATE_PHASE', success: true };
    }

    private executeUpdateTile(
        tileKey: string,
        patch: (AlignmentCommand & { type: 'UPDATE_TILE' })['patch'],
    ): AlignmentCommandResult {
        this.callbacks.onTileUpdate?.(tileKey, patch);
        return { type: 'UPDATE_TILE', success: true };
    }

    private executeUpdateConvergenceStatus(
        status: ConvergenceStatus | null,
    ): AlignmentCommandResult {
        this.callbacks.onConvergenceStatusChange?.(status);
        return { type: 'UPDATE_CONVERGENCE_STATUS', success: true };
    }

    private async executeCheckpoint(command: CheckpointCommand): Promise<AlignmentCommandResult> {
        const stepState: AlignmentStepState = {
            step: command.step,
            status: this.mode === 'step' ? 'waiting' : 'completed',
        };
        this.callbacks.onStepStateChange?.(stepState);

        if (this.mode === 'step') {
            await new Promise<void>((resolve, reject) => {
                if (this.aborted) {
                    reject(new AlignmentExecutorAbortError());
                    return;
                }
                this.stepGateResolve = resolve;
                this.stepGateReject = reject;
            });
        }

        // Emit completed state
        this.callbacks.onStepStateChange?.({
            step: command.step,
            status: 'completed',
        });

        return { type: 'CHECKPOINT', success: true };
    }
}
