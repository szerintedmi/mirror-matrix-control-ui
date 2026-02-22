/**
 * Alignment Debugging Types
 *
 * Shared types for the step-by-step alignment debugging mode.
 */

import type { Axis } from '@/types';

// =============================================================================
// MODE & GRANULARITY
// =============================================================================

/** Alignment execution mode */
export type AlignmentMode = 'auto' | 'step';

/** Granularity for step mode checkpoints */
export type AlignmentGranularity = 'per-axis' | 'per-step';

// =============================================================================
// STEP DESCRIPTORS
// =============================================================================

/** Kinds of alignment steps that can be checkpointed */
export type AlignmentStepKind =
    | 'stage-all'
    | 'measure-baseline'
    | 'position-tile'
    | 'converge-axis-x'
    | 'converge-axis-y'
    | 'trial-move'
    | 'tile-complete'
    | 'deploy-all';

/** Describes the current step at a checkpoint */
export interface AlignmentStepDescriptor {
    kind: AlignmentStepKind;
    label: string;
    tile?: string | null;
}

/** Step state for checkpoint waiting */
export type AlignmentStepStatus = 'waiting' | 'running' | 'completed' | 'error';

export interface AlignmentStepState {
    step: AlignmentStepDescriptor;
    status: AlignmentStepStatus;
}

// =============================================================================
// CONVERGENCE STATUS
// =============================================================================

/** Live convergence metrics for the active tile/axis */
export interface ConvergenceStatus {
    tile: string;
    axis: Axis;
    iteration: number;
    maxIterations: number;
    referenceArea: number;
    currentArea: number;
    areaDifference: number;
    areaGap: number;
    activeStepSize: number;
    convergenceThreshold: number;
    trialArea?: number;
    trialPosition?: number;
    direction?: number;
    stepOutcome?: 'accepted' | 'rejected' | 'converged' | 'bounds-exceeded';
    consecutiveRejections?: number;
}

// =============================================================================
// DECISION
// =============================================================================

/** Decision options for failure handling */
export type AlignmentDecisionOption = 'retry' | 'skip' | 'abort';

/** Pending decision state for the UI */
export interface AlignmentPendingDecision {
    tile: string | null;
    error: string;
    options: AlignmentDecisionOption[];
}
