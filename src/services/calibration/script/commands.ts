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
    CalibrationRunSummary,
    CalibrationStepDescriptor,
    TileAddress,
    TileRunState,
} from '../types';

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
 * Home both motors (X and Y) for a single tile.
 * Executor calls motor.homeTile() and waits for completion.
 * Used for home-retry recovery and single-tile recalibration.
 */
export interface HomeTileCommand {
    type: 'HOME_TILE';
    tile: TileAddress;
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
 * Move multiple motor axes in parallel.
 * Used for alignment phase where multiple tiles need adjustment.
 * Executor runs all moves concurrently with Promise.all().
 */
export interface MoveAxesBatchCommand {
    type: 'MOVE_AXES_BATCH';
    moves: Array<{ motor: Motor; target: number }>;
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
 * Move multiple tiles to poses in parallel.
 * Used for staging (move all aside) and alignment phases.
 * Executor runs all moves concurrently with Promise.all().
 */
export interface MoveTilesBatchCommand {
    type: 'MOVE_TILES_BATCH';
    moves: Array<{ tile: TileAddress; pose: 'home' | 'aside' }>;
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

/**
 * Decision options for user choices during calibration.
 * - retry: Try the command again
 * - home-retry: Home tile motors, then retry the command
 * - skip: Skip the entire tile (used for home measurement failures)
 * - ignore: Keep partial data and infer missing values (used for step test failures)
 * - abort: Stop calibration entirely
 */
export type DecisionOption = 'retry' | 'home-retry' | 'skip' | 'ignore' | 'abort';

/**
 * Await a user decision (e.g., after a tile failure).
 * Executor pauses and emits state with decision options.
 * UI shows buttons, user choice is fed back via executor.submitDecision().
 */
export interface AwaitDecisionCommand {
    type: 'AWAIT_DECISION';
    /** Kind of decision being requested */
    kind: 'tile-failure' | 'step-test-failure' | 'command-failure';
    /** Tile that failed (for UI context), may be null for global commands like HOME_ALL */
    tile: TileAddress | null;
    /** Error message describing the failure */
    error: string;
    /** Available decision options */
    options: DecisionOption[];
}

/** IO commands that require adapter calls */
export type IOCommand =
    | HomeAllCommand
    | HomeTileCommand
    | MoveAxisCommand
    | MoveAxesBatchCommand
    | MoveTilePoseCommand
    | MoveTilesBatchCommand
    | CaptureCommand
    | DelayCommand
    | AwaitDecisionCommand;

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

/**
 * Update the calibration run summary (WIP blueprint, tile summaries).
 * Used to display progressive results during calibration.
 */
export interface UpdateSummaryCommand {
    type: 'UPDATE_SUMMARY';
    summary: CalibrationRunSummary;
}

/**
 * Update the expected blob position overlay.
 * Non-blocking command to show the expected position before motor moves.
 */
export interface UpdateExpectedPositionCommand {
    type: 'UPDATE_EXPECTED_POSITION';
    /** Expected position in viewport coordinates (0-1), or null to clear */
    position: { x: number; y: number } | null;
    /** Tolerance radius for display */
    tolerance: number;
}

/**
 * Update the progress counters.
 */
export interface UpdateProgressCommand {
    type: 'UPDATE_PROGRESS';
    progress: {
        completed: number;
        failed: number;
        skipped: number;
        total: number;
    };
}

/** State commands that update executor state without IO */
export type StateCommand =
    | UpdatePhaseCommand
    | UpdateTileCommand
    | CheckpointCommand
    | LogCommand
    | UpdateSummaryCommand
    | UpdateExpectedPositionCommand
    | UpdateProgressCommand;

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
    | { type: 'HOME_TILE'; success: true }
    | { type: 'MOVE_AXIS'; success: true }
    | { type: 'MOVE_AXES_BATCH'; success: true }
    | { type: 'MOVE_TILE_POSE'; success: true }
    | { type: 'MOVE_TILES_BATCH'; success: true }
    | { type: 'CAPTURE'; measurement: BlobMeasurement | null; error?: string }
    | { type: 'DELAY'; success: true }
    | { type: 'AWAIT_DECISION'; decision: DecisionOption }
    | { type: 'UPDATE_PHASE'; success: true }
    | { type: 'UPDATE_TILE'; success: true }
    | { type: 'CHECKPOINT'; success: true }
    | { type: 'LOG'; success: true }
    | { type: 'UPDATE_SUMMARY'; success: true }
    | { type: 'UPDATE_EXPECTED_POSITION'; success: true }
    | { type: 'UPDATE_PROGRESS'; success: true };

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
     * Home both motors (X and Y) for a single tile.
     * Motors are homed in parallel for efficiency.
     * @throws on motor command failure
     */
    homeTile(xMotor: Motor | null, yMotor: Motor | null): Promise<void>;

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
        cmd.type === 'HOME_TILE' ||
        cmd.type === 'MOVE_AXIS' ||
        cmd.type === 'MOVE_AXES_BATCH' ||
        cmd.type === 'MOVE_TILE_POSE' ||
        cmd.type === 'MOVE_TILES_BATCH' ||
        cmd.type === 'CAPTURE' ||
        cmd.type === 'DELAY' ||
        cmd.type === 'AWAIT_DECISION'
    );
}

/** Check if a command is a state command (internal state update only) */
export function isStateCommand(cmd: CalibrationCommand): cmd is StateCommand {
    return (
        cmd.type === 'UPDATE_PHASE' ||
        cmd.type === 'UPDATE_TILE' ||
        cmd.type === 'CHECKPOINT' ||
        cmd.type === 'LOG' ||
        cmd.type === 'UPDATE_SUMMARY' ||
        cmd.type === 'UPDATE_EXPECTED_POSITION' ||
        cmd.type === 'UPDATE_PROGRESS'
    );
}
