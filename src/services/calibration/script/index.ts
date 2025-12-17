/**
 * Calibration Script Module
 *
 * Generator-based calibration script and executor.
 * See docs/calibration-refactor-plan.md item 4 for architecture details.
 */

// Command types
export type {
    CalibrationCommand,
    IOCommand,
    StateCommand,
    HomeAllCommand,
    MoveAxisCommand,
    MoveTilePoseCommand,
    CaptureCommand,
    DelayCommand,
    UpdatePhaseCommand,
    UpdateTileCommand,
    CheckpointCommand,
    LogCommand,
    CommandResult,
    CaptureParams,
    MotorAdapter,
    CameraAdapter,
    ClockAdapter,
    ExecutorAdapters,
} from './commands';

export { isIOCommand, isStateCommand } from './commands';

// Adapters
export {
    createMotorAdapter,
    createCameraAdapter,
    createClockAdapter,
    createAdapters,
    createFakeMotorAdapter,
    createFakeCameraAdapter,
    createFakeClockAdapter,
} from './adapters';

export type { RecordedMotorCommand, ScriptedCaptureResult } from './adapters';

// Executor
export {
    CalibrationExecutor,
    ExecutorAbortError,
    type ExecutorConfig,
    type ExecutorCallbacks,
    type CalibrationScript,
    type CalibrationScriptFactory,
} from './executor';

// Script
export { calibrationScript, createCalibrationScript } from './script';
