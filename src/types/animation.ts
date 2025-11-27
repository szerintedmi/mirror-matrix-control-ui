import type { Axis, Motor } from '../types';

// ============================================================================
// Core Animation Types
// ============================================================================

/**
 * A waypoint in an animation path.
 * Coordinates are in normalized [-1, 1] space, same as PatternPoint.
 */
export interface AnimationWaypoint {
    id: string;
    /** Normalized X coordinate [-1, 1] */
    x: number;
    /** Normalized Y coordinate [-1, 1] */
    y: number;
}

/**
 * A path that defines movement through a series of waypoints.
 * In independent mode, each path is assigned to a specific mirror.
 * In sequential mode, all mirrors follow the same path with time offsets.
 */
export interface AnimationPath {
    id: string;
    name: string;
    /** Ordered waypoints defining the path. Minimum 2 required. */
    waypoints: AnimationWaypoint[];
}

/**
 * Animation mode determines how paths relate to mirrors.
 */
export type AnimationMode = 'independent' | 'sequential';

/**
 * Mirror ordering strategy for sequential mode.
 */
export type MirrorOrderStrategy = 'row-major' | 'col-major' | 'spiral' | 'custom';

/**
 * Configuration for sequential mode animation.
 */
export interface SequentialModeConfig {
    /** The shared path all mirrors follow */
    pathId: string;
    /** Time offset between successive mirrors in milliseconds */
    offsetMs: number;
    /** How mirrors are ordered in the sequence */
    orderBy: MirrorOrderStrategy;
    /** Custom mirror order (grid keys like "0-0", "0-1"). Only used when orderBy is 'custom'. */
    customOrder?: string[];
}

/**
 * Mirror-to-path assignment for independent mode.
 */
export interface MirrorPathAssignment {
    /** Grid key: "row-col" (e.g., "0-0", "2-3") */
    mirrorId: string;
    row: number;
    col: number;
    /** ID of the path this mirror follows */
    pathId: string;
}

/**
 * Configuration for independent mode animation.
 */
export interface IndependentModeConfig {
    /** Assignments mapping mirrors to paths */
    assignments: MirrorPathAssignment[];
}

/**
 * Complete animation definition.
 */
export interface Animation {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;

    /** Animation mode: independent paths or sequential with offsets */
    mode: AnimationMode;

    /** Path library - all paths used in this animation */
    paths: AnimationPath[];

    /** Configuration for independent mode (when mode === 'independent') */
    independentConfig?: IndependentModeConfig;

    /** Configuration for sequential mode (when mode === 'sequential') */
    sequentialConfig?: SequentialModeConfig;

    /** Default playback speed in steps per second. Range: 500-4000. Default: 2000 */
    defaultSpeedSps: number;
}

// ============================================================================
// Animation Planning Types
// ============================================================================

/**
 * Error codes for animation planning.
 */
export type AnimationPlanErrorCode =
    | 'missing_profile'
    | 'missing_animation'
    | 'path_empty'
    | 'path_not_found'
    | 'insufficient_waypoints'
    | 'waypoint_out_of_bounds'
    | 'missing_calibration'
    | 'missing_motor'
    | 'speed_exceeds_limit'
    | 'no_assignments'
    | 'no_mirrors_in_sequence';

/**
 * Error encountered during animation planning.
 */
export interface AnimationPlanError {
    code: AnimationPlanErrorCode;
    message: string;
    mirrorId?: string;
    pathId?: string;
    waypointId?: string;
    segmentIndex?: number;
}

/**
 * A motor movement command for a single axis within a segment.
 */
export interface SegmentAxisMove {
    /** Unique key: "mirrorId:axis:mac:motorIndex" */
    key: string;
    mirrorId: string;
    row: number;
    col: number;
    axis: Axis;
    motor: Motor;
    /** Starting position in steps */
    fromSteps: number;
    /** Target position in steps */
    targetSteps: number;
    /** Absolute distance to travel in steps */
    distanceSteps: number;
    /** Normalized coordinate at start */
    normalizedFrom: number;
    /** Normalized coordinate at target */
    normalizedTarget: number;
}

/**
 * A segment represents one transition between consecutive waypoints.
 * All motors must complete the segment simultaneously.
 */
export interface AnimationSegmentPlan {
    /** Zero-based segment index */
    segmentIndex: number;
    /** All motor moves for this segment */
    axisMoves: SegmentAxisMove[];
    /** Maximum travel distance among all motors (steps) */
    maxDistanceSteps: number;
    /** Calculated segment duration in milliseconds */
    durationMs: number;
    /** Synchronized speed for all motors (steps per second) */
    speedSps: number;
    /** True if speed was clamped to hardware limits */
    speedClamped: boolean;
    /** Errors specific to this segment */
    errors: AnimationPlanError[];
}

/**
 * Complete animation execution plan.
 */
export interface AnimationPlaybackPlan {
    animationId: string;
    /** Ordered segments to execute */
    segments: AnimationSegmentPlan[];
    /** Total animation duration in milliseconds */
    totalDurationMs: number;
    /** Planning errors that may prevent playback */
    errors: AnimationPlanError[];
    /** Non-fatal warnings */
    warnings: AnimationPlanError[];
}

// ============================================================================
// Playback State Types
// ============================================================================

/**
 * Current state of animation playback.
 */
export type AnimationPlaybackState = 'idle' | 'playing' | 'completed' | 'error' | 'stopped';

/**
 * Result of animation playback attempt.
 */
export interface AnimationPlaybackResult {
    success: boolean;
    message: string;
    segmentsCompleted?: number;
    totalSegments?: number;
    finalState: AnimationPlaybackState;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum motor speed in steps per second */
export const MIN_MOTOR_SPEED_SPS = 500;

/** Maximum motor speed in steps per second */
export const MAX_MOTOR_SPEED_SPS = 4000;

/** Default motor speed in steps per second */
export const DEFAULT_MOTOR_SPEED_SPS = 2000;

/** Safety margin factor for speed calculations (use 90% of max) */
export const SPEED_SAFETY_MARGIN = 0.9;

/** Minimum buffer time between segments in milliseconds */
export const SEGMENT_BUFFER_MS = 50;
