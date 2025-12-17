/**
 * Calibration Types
 *
 * Shared types and utilities for the calibration system.
 * This file consolidates types previously scattered in calibrationRunner.ts.
 */

import type {
    BlobMeasurement,
    CalibrationProfileBounds,
    CalibrationSnapshot,
    MirrorAssignment,
    MirrorConfig,
} from '@/types';

// =============================================================================
// TILE TYPES
// =============================================================================

export interface TileAddress {
    row: number;
    col: number;
    key: string;
}

export interface TileCalibrationMetrics {
    home?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number } | null;
    adjustedHome?: { x: number; y: number } | null;
    stepToDisplacement?: {
        x: number | null;
        y: number | null;
    };
    sizeDeltaAtStepTest?: number | null;
}

export interface TileRunState {
    tile: TileAddress;
    status: 'pending' | 'staged' | 'measuring' | 'completed' | 'partial' | 'failed' | 'skipped';
    error?: string;
    /** Non-fatal warnings (e.g., step test failures with inferred values) */
    warnings?: string[];
    metrics?: TileCalibrationMetrics;
    assignment: MirrorAssignment;
}

export interface TileCalibrationResult {
    tile: TileAddress;
    status: 'measuring' | 'completed' | 'partial' | 'failed' | 'skipped';
    error?: string;
    /** Non-fatal warnings (e.g., step test failures with inferred values) */
    warnings?: string[];
    homeMeasurement?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number };
    adjustedHome?: { x: number; y: number };
    stepToDisplacement?: { x: number | null; y: number | null };
    sizeDeltaAtStepTest?: number | null;
    motorReachBounds?: CalibrationProfileBounds | null;
    footprintBounds?: CalibrationProfileBounds | null;
    inferredBounds?: CalibrationProfileBounds | null;
    stepScale?: { x: number | null; y: number | null };
}

// =============================================================================
// RUNNER STATE TYPES
// =============================================================================

export type CalibrationRunnerPhase =
    | 'idle'
    | 'homing'
    | 'staging'
    | 'measuring'
    | 'aligning'
    | 'paused'
    | 'aborted'
    | 'completed'
    | 'error';

/**
 * CalibrationRunSummary is an alias for CalibrationSnapshot.
 * This maintains backwards compatibility with existing code.
 */
export type CalibrationRunSummary = CalibrationSnapshot;

export interface CalibrationRunnerState {
    phase: CalibrationRunnerPhase;
    tiles: Record<string, TileRunState>;
    progress: {
        total: number;
        completed: number;
        failed: number;
        skipped: number;
    };
    activeTile: TileAddress | null;
    summary?: CalibrationRunSummary;
    error: string | null;
}

export type CalibrationRunnerMode = 'auto' | 'step';

// =============================================================================
// STEP STATE TYPES
// =============================================================================

export type CalibrationStepKind =
    | 'home-all'
    | 'stage-all'
    | 'measure-home'
    | 'step-test-x-interim'
    | 'step-test-x'
    | 'step-test-y-interim'
    | 'step-test-y'
    | 'align-grid';

export interface CalibrationStepDescriptor {
    kind: CalibrationStepKind;
    label: string;
    tile?: TileAddress | null;
}

export type CalibrationStepStatus = 'waiting' | 'running' | 'completed' | 'skipped' | 'error';

export interface CalibrationStepState {
    step: CalibrationStepDescriptor;
    status: CalibrationStepStatus;
    error?: string;
}

// =============================================================================
// COMMAND LOG TYPES
// =============================================================================

export interface CalibrationCommandLogEntry {
    id: string;
    hint: string;
    phase: CalibrationRunnerPhase;
    tile?: TileAddress | null;
    timestamp: number;
    sequence: number;
    group?: string;
    metadata?: Record<string, unknown>;
}

// =============================================================================
// CAPTURE TYPES
// =============================================================================

export interface CaptureBlobMeasurementParams {
    timeoutMs: number;
    signal?: AbortSignal;
    /** Expected blob position in viewport coordinates (0 to 1). If provided, selects closest blob. */
    expectedPosition?: { x: number; y: number };
    /** Maximum distance from expected position to accept a blob (viewport units). */
    maxDistance?: number;
}

export type CaptureBlobMeasurement = (
    params: CaptureBlobMeasurementParams,
) => Promise<BlobMeasurement | null>;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Internal tile descriptor used during state initialization.
 */
interface TileDescriptor extends TileAddress {
    assignment: MirrorAssignment;
    calibratable: boolean;
}

/**
 * Build tile descriptors from grid configuration.
 */
const buildTileDescriptors = (
    gridSize: { rows: number; cols: number },
    mirrorConfig: MirrorConfig,
): TileDescriptor[] => {
    const descriptors: TileDescriptor[] = [];
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const key = `${row}-${col}`;
            const assignmentSource = mirrorConfig.get(key);
            const assignment: MirrorAssignment = assignmentSource
                ? {
                      x: assignmentSource.x,
                      y: assignmentSource.y,
                  }
                : { x: null, y: null };
            const calibratable = Boolean(assignment.x && assignment.y);
            descriptors.push({
                row,
                col,
                key,
                assignment,
                calibratable,
            });
        }
    }
    return descriptors;
};

/**
 * Create a baseline runner state for a given grid configuration.
 * Used to initialize calibration state before running.
 */
export const createBaselineRunnerState = (
    gridSize: { rows: number; cols: number },
    mirrorConfig: MirrorConfig,
): CalibrationRunnerState => {
    const descriptors = buildTileDescriptors(gridSize, mirrorConfig);
    const tiles: Record<string, TileRunState> = {};
    let total = 0;
    let skipped = 0;
    for (const descriptor of descriptors) {
        const status: TileRunState['status'] = descriptor.calibratable ? 'pending' : 'skipped';
        if (descriptor.calibratable) {
            total += 1;
        } else {
            skipped += 1;
        }
        tiles[descriptor.key] = {
            tile: {
                row: descriptor.row,
                col: descriptor.col,
                key: descriptor.key,
            },
            assignment: descriptor.assignment,
            status,
        };
    }
    return {
        phase: 'idle',
        tiles,
        progress: {
            total,
            completed: 0,
            failed: 0,
            skipped,
        },
        activeTile: null,
        summary: undefined,
        error: null,
    };
};
