/**
 * Calibration Script Commands
 *
 * Defines the command vocabulary for the calibration generator script.
 * Commands are split into two categories:
 *
 * 1. IO Commands - require adapter calls, return results to the script
 * 2. State Commands - update executor state, no external IO
 *
 * This separation keeps the executor small and focused: it dispatches IO commands
 * to adapters and applies state commands to its internal state machine.
 */

import type { BlobMeasurement, Motor } from '@/types';

import type {
    CalibrationRunnerPhase,
    CalibrationStepDescriptor,
    TileAddress,
    TileRunState,
} from '../../calibrationRunner';

// =============================================================================
// COMMAND TYPES
// =============================================================================

/**
 * Home all motors on the specified MAC addresses.
 * Executor calls motor.homeAll() and waits for completion.
 */
export interface HomeAllCommand {
    type: 'HOME_ALL';
    macAddresses: string[];
}

/**
 * Move a single motor axis to an absolute step position.
 * Executor calls motor.moveMotor() and waits for completion.
 */
export interface MoveAxisCommand {
    type: 'MOVE_AXIS';
    motor: Motor;
    target: number;
}

/**
 * Move a tile to a named pose (home or aside).
 * Executor computes actual step targets using computePoseTargets() and moves both axes.
 * This keeps rotation/staging math centralized in the executor.
 */
export interface MoveTilePoseCommand {
    type: 'MOVE_TILE_POSE';
    tile: TileAddress;
    pose: 'home' | 'aside';
}

/**
 * Capture a blob measurement from the camera.
 * Executor calls camera.capture() with retries (configurable).
 * Returns BlobMeasurement on success, null on failure after retries.
 */
export interface CaptureCommand {
    type: 'CAPTURE';
    /** Expected blob position in viewport coordinates (0-1). Used for closest-blob selection. */
    expectedPosition?: { x: number; y: number };
    /** Maximum distance from expected position to accept (viewport units). */
    tolerance: number;
    /** Human-readable label for logging (e.g., "home measurement R0C0"). */
    label: string;
}

/**
 * Wait for a specified duration.
 * Script controls when delays happen; executor just waits.
 */
export interface DelayCommand {
    type: 'DELAY';
    ms: number;
}

/** IO commands that require adapter calls */
export type IOCommand =
    | HomeAllCommand
    | MoveAxisCommand
    | MoveTilePoseCommand
    | CaptureCommand
    | DelayCommand;

// -----------------------------------------------------------------------------
// State/Event Commands
// -----------------------------------------------------------------------------

/**
 * Update the current calibration phase.
 * Executor updates internal state and notifies subscribers.
 */
export interface UpdatePhaseCommand {
    type: 'UPDATE_PHASE';
    phase: CalibrationRunnerPhase;
}

/**
 * Update a tile's run state (status, metrics, errors, warnings).
 * Executor applies patch to the tile's state and notifies subscribers.
 */
export interface UpdateTileCommand {
    type: 'UPDATE_TILE';
    key: string;
    patch: Partial<TileRunState>;
}

/**
 * Checkpoint for step mode. In auto mode, this is a no-op.
 * In step mode, executor waits for advance() call before continuing.
 */
export interface CheckpointCommand {
    type: 'CHECKPOINT';
    step: CalibrationStepDescriptor;
}

/**
 * Log a command or event for debugging/UI display.
 * Executor emits to command log subscribers.
 */
export interface LogCommand {
    type: 'LOG';
    hint: string;
    tile?: TileAddress | null;
    group?: string;
    metadata?: Record<string, unknown>;
}

/** State commands that update executor state without IO */
export type StateCommand = UpdatePhaseCommand | UpdateTileCommand | CheckpointCommand | LogCommand;

// -----------------------------------------------------------------------------
// Combined Command Type
// -----------------------------------------------------------------------------

/** All calibration commands the script can yield */
export type CalibrationCommand = IOCommand | StateCommand;

// =============================================================================
// COMMAND RESULTS
// =============================================================================

/**
 * Results returned to the script after command execution.
 * Only IO commands return meaningful results; state commands return void.
 */
export type CommandResult =
    | { type: 'HOME_ALL'; success: true }
    | { type: 'MOVE_AXIS'; success: true }
    | { type: 'MOVE_TILE_POSE'; success: true }
    | { type: 'CAPTURE'; measurement: BlobMeasurement | null; error?: string }
    | { type: 'DELAY'; success: true }
    | { type: 'UPDATE_PHASE'; success: true }
    | { type: 'UPDATE_TILE'; success: true }
    | { type: 'CHECKPOINT'; success: true }
    | { type: 'LOG'; success: true };

// =============================================================================
// ADAPTER INTERFACES
// =============================================================================

/**
 * Parameters for camera capture.
 */
export interface CaptureParams {
    timeoutMs: number;
    signal?: AbortSignal;
    expectedPosition?: { x: number; y: number };
    maxDistance?: number;
}

/**
 * Motor adapter interface.
 * Real implementation wraps MotorCommandApi from useMotorCommands hook.
 */
export interface MotorAdapter {
    /**
     * Home all motors on the specified MAC addresses.
     * @throws on motor command failure
     */
    homeAll(macAddresses: string[]): Promise<void>;

    /**
     * Move a single motor to an absolute step position.
     * @throws on motor command failure
     */
    moveMotor(mac: string, motorId: number, positionSteps: number): Promise<void>;
}

/**
 * Camera adapter interface.
 * Real implementation wraps the captureMeasurement callback.
 */
export interface CameraAdapter {
    /**
     * Capture a blob measurement.
     * @returns BlobMeasurement on success, null if no blob detected
     * @throws on measurement error (e.g., unstable blob)
     */
    capture(params: CaptureParams): Promise<BlobMeasurement | null>;
}

/**
 * Clock adapter interface for time-related operations.
 * Allows deterministic testing with fake timers.
 */
export interface ClockAdapter {
    /**
     * Wait for the specified duration.
     * Can be aborted via AbortSignal in the executor.
     */
    delay(ms: number, signal?: AbortSignal): Promise<void>;

    /**
     * Get the current timestamp (for logging).
     */
    now(): number;
}

/**
 * All adapters required by the executor.
 * Tests inject fake implementations; production uses real adapters.
 */
export interface ExecutorAdapters {
    motor: MotorAdapter;
    camera: CameraAdapter;
    clock: ClockAdapter;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Check if a command is an IO command (requires adapter call) */
export function isIOCommand(cmd: CalibrationCommand): cmd is IOCommand {
    return (
        cmd.type === 'HOME_ALL' ||
        cmd.type === 'MOVE_AXIS' ||
        cmd.type === 'MOVE_TILE_POSE' ||
        cmd.type === 'CAPTURE' ||
        cmd.type === 'DELAY'
    );
}

/** Check if a command is a state command (internal state update only) */
export function isStateCommand(cmd: CalibrationCommand): cmd is StateCommand {
    return (
        cmd.type === 'UPDATE_PHASE' ||
        cmd.type === 'UPDATE_TILE' ||
        cmd.type === 'CHECKPOINT' ||
        cmd.type === 'LOG'
    );
}
