/**
 * Alignment Script Commands
 *
 * Command vocabulary for the alignment generator script.
 * Modeled on the calibration command pattern but tailored to alignment's
 * simpler IO needs (no homing, no batch pose moves, no blob capture —
 * alignment uses shape analysis instead).
 */

import type {
    AlignmentPhase,
    TileAlignmentStatus,
    AxisAlignmentStatus,
} from '@/hooks/useAlignmentController';
import type { ShapeMetrics } from '@/services/opencvWorkerClient';
import type { Axis } from '@/types';

import type { AlignmentStepDescriptor, AlignmentDecisionOption, ConvergenceStatus } from '../types';

// =============================================================================
// IO COMMANDS
// =============================================================================

/** Move a single motor axis to an absolute step position */
export interface MoveMotorCommand {
    type: 'MOVE_MOTOR';
    mac: string;
    motorId: number;
    positionSteps: number;
}

/** Move a tile to a named pose (home or aside) via staging calculations */
export interface MoveTilePoseCommand {
    type: 'MOVE_TILE_POSE';
    tileKey: string;
    row: number;
    col: number;
    pose: 'home' | 'aside';
}

/** Measure shape (multi-sample averaged) */
export interface CaptureCommand {
    type: 'CAPTURE';
}

/** Settling delay */
export interface DelayCommand {
    type: 'DELAY';
    ms: number;
}

/** Pause for user decision on failure */
export interface AwaitDecisionCommand {
    type: 'AWAIT_DECISION';
    tile: string | null;
    error: string;
    options: AlignmentDecisionOption[];
}

// =============================================================================
// STATE COMMANDS
// =============================================================================

/** Update the alignment phase */
export interface UpdatePhaseCommand {
    type: 'UPDATE_PHASE';
    phase: AlignmentPhase;
}

/** Update a tile's alignment state */
export interface UpdateTileCommand {
    type: 'UPDATE_TILE';
    tileKey: string;
    patch: {
        status?: TileAlignmentStatus;
        currentSteps?: Partial<{ x: number; y: number }>;
        correction?: Partial<{ x: number; y: number }>;
        iterations?: Partial<{ x: number; y: number }>;
        axisStatus?: { axis: Axis; status: AxisAlignmentStatus; error?: string | null };
        axisCorrection?: { axis: Axis; correctionSteps: number; iterations: number };
        finalEccentricity?: number | null;
        error?: string | null;
    };
}

/** Update live convergence status metrics */
export interface UpdateConvergenceStatusCommand {
    type: 'UPDATE_CONVERGENCE_STATUS';
    status: ConvergenceStatus | null;
}

/** Checkpoint for step mode */
export interface CheckpointCommand {
    type: 'CHECKPOINT';
    step: AlignmentStepDescriptor;
}

// =============================================================================
// COMBINED TYPES
// =============================================================================

export type AlignmentCommand =
    | MoveMotorCommand
    | MoveTilePoseCommand
    | CaptureCommand
    | DelayCommand
    | AwaitDecisionCommand
    | UpdatePhaseCommand
    | UpdateTileCommand
    | UpdateConvergenceStatusCommand
    | CheckpointCommand;

// =============================================================================
// COMMAND RESULTS
// =============================================================================

export type AlignmentCommandResult =
    | { type: 'MOVE_MOTOR'; success: true }
    | { type: 'MOVE_TILE_POSE'; success: true }
    | { type: 'CAPTURE'; metrics: ShapeMetrics | null }
    | { type: 'DELAY'; success: true }
    | { type: 'AWAIT_DECISION'; decision: AlignmentDecisionOption }
    | { type: 'UPDATE_PHASE'; success: true }
    | { type: 'UPDATE_TILE'; success: true }
    | { type: 'UPDATE_CONVERGENCE_STATUS'; success: true }
    | { type: 'CHECKPOINT'; success: true };

// =============================================================================
// ADAPTER INTERFACES
// =============================================================================

export interface AlignmentMotorAdapter {
    moveMotor(mac: string, motorId: number, positionSteps: number): Promise<void>;
    moveTilePose(tileKey: string, row: number, col: number, pose: 'home' | 'aside'): Promise<void>;
}

export interface AlignmentShapeAnalysisAdapter {
    measureShape(): Promise<ShapeMetrics | null>;
}

export interface AlignmentClockAdapter {
    delay(ms: number): Promise<void>;
}

export interface AlignmentAdapters {
    motor: AlignmentMotorAdapter;
    shape: AlignmentShapeAnalysisAdapter;
    clock: AlignmentClockAdapter;
}
