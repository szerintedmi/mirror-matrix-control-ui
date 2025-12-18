import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { Axis, CalibrationProfile, MirrorConfig, TileCalibrationResults } from '@/types';
import type {
    Animation,
    AnimationPath,
    AnimationWaypoint,
    AnimationPlaybackPlan,
    AnimationSegmentPlan,
    AnimationPlanError,
    AnimationPlanErrorCode,
    SegmentAxisMove,
    MirrorOrderStrategy,
} from '@/types/animation';
import {
    MIN_MOTOR_SPEED_SPS,
    MAX_MOTOR_SPEED_SPS,
    SPEED_SAFETY_MARGIN,
    SEGMENT_BUFFER_MS,
} from '@/types/animation';
import { convertDeltaToSteps } from '@/utils/calibrationMath';
import { getMirrorAssignment } from '@/utils/grid';

import { validateWaypointsInProfile } from './boundsValidation';
import { getSpaceParams, patternToCentered, type SpaceConversionParams } from './spaceConversion';

// ============================================================================
// Types
// ============================================================================

interface PlanAnimationParams {
    animation: Animation;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    profile: CalibrationProfile;
}

interface MirrorPathBinding {
    mirrorId: string;
    row: number;
    col: number;
    path: AnimationPath;
    tile: TileCalibrationResults;
}

// ============================================================================
// Helpers
// ============================================================================

const AXES: Axis[] = ['x', 'y'];

const axisCoordKey: Record<Axis, 'x' | 'y'> = { x: 'x', y: 'y' };
const axisStepsKey: Record<Axis, 'stepsX' | 'stepsY'> = { x: 'stepsX', y: 'stepsY' };

const getTileKey = (row: number, col: number): string => `${row}-${col}`;

const createError = (
    code: AnimationPlanErrorCode,
    message: string,
    context: Partial<AnimationPlanError> = {},
): AnimationPlanError => ({
    code,
    message,
    ...context,
});

const isTileCalibrated = (
    tile: TileCalibrationResults | undefined,
): tile is TileCalibrationResults =>
    Boolean(
        tile &&
            tile.status === 'completed' &&
            tile.adjustedHome &&
            typeof tile.adjustedHome.stepsX === 'number' &&
            typeof tile.adjustedHome.stepsY === 'number' &&
            tile.stepToDisplacement.x !== null &&
            tile.stepToDisplacement.y !== null,
    );

/**
 * Get the allowed step range for a tile axis.
 */
const resolveAxisRange = (
    tile: TileCalibrationResults,
    axis: Axis,
): { min: number; max: number } => {
    const range = tile.axes?.[axis]?.stepRange;
    if (range) {
        return { min: range.minSteps, max: range.maxSteps };
    }
    return { min: MOTOR_MIN_POSITION_STEPS, max: MOTOR_MAX_POSITION_STEPS };
};

/**
 * Result of converting normalized coordinate to steps.
 */
interface StepsResult {
    steps: number;
    clamped: boolean;
}

/**
 * Convert a normalized coordinate to motor steps using calibration data.
 * Clamps the result to the valid step range for the axis.
 */
const normalizedToSteps = (
    normalizedValue: number,
    tile: TileCalibrationResults,
    axis: Axis,
): StepsResult | null => {
    const perStep = tile.stepToDisplacement[axis];
    const adjustedHome = tile.adjustedHome;

    if (perStep === null || !adjustedHome) return null;

    const homeCoord = adjustedHome[axisCoordKey[axis]];
    const homeSteps = adjustedHome[axisStepsKey[axis]];

    if (typeof homeCoord !== 'number' || typeof homeSteps !== 'number') return null;

    const delta = normalizedValue - homeCoord;
    const deltaSteps = convertDeltaToSteps(delta, perStep);

    if (deltaSteps === null) return null;

    const rawSteps = Math.round(homeSteps + deltaSteps);
    const range = resolveAxisRange(tile, axis);

    // Clamp to valid range
    const clampedSteps = Math.max(range.min, Math.min(range.max, rawSteps));
    const clamped = clampedSteps !== rawSteps;

    return { steps: clampedSteps, clamped };
};

// ============================================================================
// Mirror Ordering for Sequential Mode
// ============================================================================

/**
 * Generate ordered list of mirror IDs based on ordering strategy.
 */
export const generateMirrorOrder = (
    gridSize: { rows: number; cols: number },
    strategy: MirrorOrderStrategy,
    customOrder?: string[],
): string[] => {
    if (strategy === 'custom' && customOrder && customOrder.length > 0) {
        return customOrder;
    }

    const mirrorIds: string[] = [];

    if (strategy === 'row-major') {
        for (let row = 0; row < gridSize.rows; row++) {
            for (let col = 0; col < gridSize.cols; col++) {
                mirrorIds.push(getTileKey(row, col));
            }
        }
    } else if (strategy === 'col-major') {
        for (let col = 0; col < gridSize.cols; col++) {
            for (let row = 0; row < gridSize.rows; row++) {
                mirrorIds.push(getTileKey(row, col));
            }
        }
    } else if (strategy === 'spiral') {
        let top = 0,
            bottom = gridSize.rows - 1;
        let left = 0,
            right = gridSize.cols - 1;

        while (top <= bottom && left <= right) {
            for (let col = left; col <= right; col++) {
                mirrorIds.push(getTileKey(top, col));
            }
            top++;

            for (let row = top; row <= bottom; row++) {
                mirrorIds.push(getTileKey(row, right));
            }
            right--;

            if (top <= bottom) {
                for (let col = right; col >= left; col--) {
                    mirrorIds.push(getTileKey(bottom, col));
                }
                bottom--;
            }

            if (left <= right) {
                for (let row = bottom; row >= top; row--) {
                    mirrorIds.push(getTileKey(row, left));
                }
                left++;
            }
        }
    } else {
        // Default to row-major
        for (let row = 0; row < gridSize.rows; row++) {
            for (let col = 0; col < gridSize.cols; col++) {
                mirrorIds.push(getTileKey(row, col));
            }
        }
    }

    return mirrorIds;
};

/**
 * Parse mirror ID "row-col" into coordinates.
 */
const parseMirrorId = (mirrorId: string): { row: number; col: number } | null => {
    const parts = mirrorId.split('-');
    if (parts.length !== 2) return null;
    const row = parseInt(parts[0], 10);
    const col = parseInt(parts[1], 10);
    if (isNaN(row) || isNaN(col)) return null;
    return { row, col };
};

// ============================================================================
// Binding Resolution
// ============================================================================

/**
 * Resolve mirror-to-path bindings for independent mode.
 */
const resolveIndependentBindings = (
    animation: Animation,
    mirrorConfig: MirrorConfig,
    profile: CalibrationProfile,
): { bindings: MirrorPathBinding[]; errors: AnimationPlanError[] } => {
    const bindings: MirrorPathBinding[] = [];
    const errors: AnimationPlanError[] = [];

    if (!animation.independentConfig) {
        errors.push(createError('no_assignments', 'Independent mode requires path assignments.'));
        return { bindings, errors };
    }

    for (const assignment of animation.independentConfig.assignments) {
        const path = animation.paths.find((p) => p.id === assignment.pathId);
        if (!path) {
            errors.push(
                createError('path_not_found', `Path "${assignment.pathId}" not found.`, {
                    mirrorId: assignment.mirrorId,
                    pathId: assignment.pathId,
                }),
            );
            continue;
        }

        if (path.waypoints.length < 2) {
            errors.push(
                createError(
                    'insufficient_waypoints',
                    `Path "${path.name}" needs at least 2 waypoints.`,
                    { mirrorId: assignment.mirrorId, pathId: path.id },
                ),
            );
            continue;
        }

        const tileKey = getTileKey(assignment.row, assignment.col);
        const tile = profile.tiles[tileKey];

        if (!isTileCalibrated(tile)) {
            errors.push(
                createError(
                    'missing_calibration',
                    `Mirror ${assignment.mirrorId} is not calibrated.`,
                    { mirrorId: assignment.mirrorId },
                ),
            );
            continue;
        }

        const motorAssignment = getMirrorAssignment(mirrorConfig, assignment.row, assignment.col);
        if (!motorAssignment.x || !motorAssignment.y) {
            errors.push(
                createError(
                    'missing_motor',
                    `Mirror ${assignment.mirrorId} missing motor assignment.`,
                    {
                        mirrorId: assignment.mirrorId,
                    },
                ),
            );
            continue;
        }

        bindings.push({
            mirrorId: assignment.mirrorId,
            row: assignment.row,
            col: assignment.col,
            path,
            tile,
        });
    }

    return { bindings, errors };
};

/**
 * Resolve mirror-to-path bindings for sequential mode.
 */
const resolveSequentialBindings = (
    animation: Animation,
    gridSize: { rows: number; cols: number },
    mirrorConfig: MirrorConfig,
    profile: CalibrationProfile,
): { bindings: MirrorPathBinding[]; errors: AnimationPlanError[] } => {
    const bindings: MirrorPathBinding[] = [];
    const errors: AnimationPlanError[] = [];

    if (!animation.sequentialConfig) {
        errors.push(createError('no_assignments', 'Sequential mode requires configuration.'));
        return { bindings, errors };
    }

    const path = animation.paths.find((p) => p.id === animation.sequentialConfig!.pathId);
    if (!path) {
        errors.push(
            createError(
                'path_not_found',
                `Shared path "${animation.sequentialConfig.pathId}" not found.`,
                {
                    pathId: animation.sequentialConfig.pathId,
                },
            ),
        );
        return { bindings, errors };
    }

    if (path.waypoints.length < 2) {
        errors.push(
            createError(
                'insufficient_waypoints',
                `Path "${path.name}" needs at least 2 waypoints.`,
                {
                    pathId: path.id,
                },
            ),
        );
        return { bindings, errors };
    }

    const mirrorOrder = generateMirrorOrder(
        gridSize,
        animation.sequentialConfig.orderBy,
        animation.sequentialConfig.customOrder,
    );

    for (const mirrorId of mirrorOrder) {
        const coords = parseMirrorId(mirrorId);
        if (!coords) continue;

        const tileKey = getTileKey(coords.row, coords.col);
        const tile = profile.tiles[tileKey];

        if (!isTileCalibrated(tile)) continue; // Skip uncalibrated mirrors silently in sequential mode

        const motorAssignment = getMirrorAssignment(mirrorConfig, coords.row, coords.col);
        if (!motorAssignment.x || !motorAssignment.y) continue;

        bindings.push({
            mirrorId,
            row: coords.row,
            col: coords.col,
            path,
            tile,
        });
    }

    if (bindings.length === 0) {
        errors.push(
            createError('no_mirrors_in_sequence', 'No calibrated mirrors available for sequence.'),
        );
    }

    return { bindings, errors };
};

// ============================================================================
// Segment Planning
// ============================================================================

interface SegmentPlanContext {
    bindings: MirrorPathBinding[];
    mirrorConfig: MirrorConfig;
    defaultSpeedSps: number;
    previousSteps: Map<string, number>; // "mirrorId:axis" -> steps
    spaceParams: SpaceConversionParams; // For converting pattern space to centered space
}

/**
 * Interpolate position between two waypoints at a given fraction t [0, 1].
 * Reserved for future use in smoother animations.
 */
export const interpolatePosition = (
    from: AnimationWaypoint,
    to: AnimationWaypoint,
    t: number,
): { x: number; y: number } => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
});

/**
 * Plan a single segment (transition from waypoint i to waypoint i+1).
 * For sequential mode with offsets, mirrors are at different waypoint indices.
 */
const planSegment = (
    segmentIndex: number,
    ctx: SegmentPlanContext,
    // offsetMs is reserved for future sequential timing offset feature
): AnimationSegmentPlan => {
    const errors: AnimationPlanError[] = [];
    const axisMoves: SegmentAxisMove[] = [];

    for (const binding of ctx.bindings) {
        const { mirrorId, row, col, path, tile } = binding;

        // Get waypoints for this segment
        if (segmentIndex >= path.waypoints.length - 1) continue;

        const fromWaypoint = path.waypoints[segmentIndex];
        const toWaypoint = path.waypoints[segmentIndex + 1];

        // Transform waypoints from pattern space to centered space
        const fromCentered = patternToCentered(fromWaypoint, ctx.spaceParams);
        const toCentered = patternToCentered(toWaypoint, ctx.spaceParams);

        const assignment = getMirrorAssignment(ctx.mirrorConfig, row, col);

        for (const axis of AXES) {
            const motor = assignment[axis];
            if (!motor) continue;

            const fromNormalized = fromCentered[axis];
            const toNormalized = toCentered[axis];

            const fromResult = normalizedToSteps(fromNormalized, tile, axis);
            const toResult = normalizedToSteps(toNormalized, tile, axis);

            if (fromResult === null || toResult === null) {
                errors.push(
                    createError(
                        'missing_calibration',
                        `Unable to calculate steps for ${mirrorId} axis ${axis}.`,
                        { mirrorId, segmentIndex },
                    ),
                );
                continue;
            }

            // Warn if steps were clamped to the valid range
            if (fromResult.clamped || toResult.clamped) {
                errors.push(
                    createError(
                        'steps_out_of_range',
                        `Target steps clamped to valid range for ${mirrorId} axis ${axis} in segment ${segmentIndex}.`,
                        { mirrorId, segmentIndex },
                    ),
                );
            }

            const fromSteps = fromResult.steps;
            const toSteps = toResult.steps;

            // Use previous end position if available (for continuity)
            const stateKey = `${mirrorId}:${axis}`;
            const actualFromSteps = ctx.previousSteps.get(stateKey) ?? fromSteps;
            const distanceSteps = Math.abs(toSteps - actualFromSteps);

            // Update state for next segment
            ctx.previousSteps.set(stateKey, toSteps);

            if (distanceSteps === 0) continue; // Skip no-op moves

            axisMoves.push({
                key: `${mirrorId}:${axis}:${motor.nodeMac}:${motor.motorIndex}`,
                mirrorId,
                row,
                col,
                axis,
                motor,
                fromSteps: actualFromSteps,
                targetSteps: toSteps,
                distanceSteps,
                normalizedFrom: fromNormalized,
                normalizedTarget: toNormalized,
            });
        }
    }

    // Calculate synchronized timing
    const maxDistanceSteps =
        axisMoves.length > 0 ? Math.max(...axisMoves.map((m) => m.distanceSteps)) : 0;

    // Calculate speed: use default speed, but may need to clamp
    const effectiveMaxSpeed = MAX_MOTOR_SPEED_SPS * SPEED_SAFETY_MARGIN;
    let speedSps = ctx.defaultSpeedSps;
    let speedClamped = false;

    // Duration based on requested speed
    let durationMs = maxDistanceSteps > 0 ? (maxDistanceSteps / speedSps) * 1000 : 0;

    // Check if any motor would need to exceed max speed
    for (const move of axisMoves) {
        const requiredSpeed = durationMs > 0 ? move.distanceSteps / (durationMs / 1000) : 0;
        if (requiredSpeed > effectiveMaxSpeed) {
            // Need to slow down the entire segment
            speedSps = effectiveMaxSpeed;
            durationMs = (maxDistanceSteps / speedSps) * 1000;
            speedClamped = true;
            break;
        }
    }

    // Ensure minimum speed
    if (speedSps < MIN_MOTOR_SPEED_SPS && maxDistanceSteps > 0) {
        speedSps = MIN_MOTOR_SPEED_SPS;
        durationMs = (maxDistanceSteps / speedSps) * 1000;
        speedClamped = true;
    }

    // Add buffer time
    durationMs += SEGMENT_BUFFER_MS;

    return {
        segmentIndex,
        axisMoves,
        maxDistanceSteps,
        durationMs: Math.ceil(durationMs),
        speedSps: Math.round(speedSps),
        speedClamped,
        errors,
    };
};

// ============================================================================
// Main Planner
// ============================================================================

/**
 * Plan complete animation playback.
 * Resolves mirror-to-path bindings, calculates segments, and synchronizes timing.
 */
export const planAnimation = (params: PlanAnimationParams): AnimationPlaybackPlan => {
    const { animation, gridSize, mirrorConfig, profile } = params;
    const errors: AnimationPlanError[] = [];
    const warnings: AnimationPlanError[] = [];

    // Validate inputs
    if (!animation) {
        errors.push(createError('missing_animation', 'No animation provided.'));
        return {
            animationId: '',
            segments: [],
            totalDurationMs: 0,
            errors,
            warnings,
            mode: 'independent',
        };
    }

    if (!profile) {
        errors.push(createError('missing_profile', 'No calibration profile selected.'));
        return {
            animationId: animation.id,
            segments: [],
            totalDurationMs: 0,
            errors,
            warnings,
            mode: animation.mode,
        };
    }

    if (animation.paths.length === 0) {
        errors.push(createError('path_empty', 'Animation has no paths defined.'));
        return {
            animationId: animation.id,
            segments: [],
            totalDurationMs: 0,
            errors,
            warnings,
            mode: animation.mode,
        };
    }

    // Resolve bindings based on mode
    const { bindings, errors: bindingErrors } =
        animation.mode === 'independent'
            ? resolveIndependentBindings(animation, mirrorConfig, profile)
            : resolveSequentialBindings(animation, gridSize, mirrorConfig, profile);

    errors.push(...bindingErrors);

    if (bindings.length === 0) {
        return {
            animationId: animation.id,
            segments: [],
            totalDurationMs: 0,
            errors,
            warnings,
            mode: animation.mode,
        };
    }

    // Determine segment count (based on the path with most waypoints)
    const maxWaypoints = Math.max(...bindings.map((b) => b.path.waypoints.length));
    const segmentCount = maxWaypoints - 1;

    if (segmentCount < 1) {
        errors.push(createError('insufficient_waypoints', 'Paths need at least 2 waypoints.'));
        return {
            animationId: animation.id,
            segments: [],
            totalDurationMs: 0,
            errors,
            warnings,
            mode: animation.mode,
        };
    }

    // Get space conversion params for transforming waypoints
    const spaceParams = getSpaceParams(profile);

    // Validate waypoints against bounds
    for (const path of animation.paths) {
        const validation = validateWaypointsInProfile(path.waypoints, { profile });
        for (const error of validation.errors) {
            errors.push(
                createError('waypoint_out_of_bounds', error.message, {
                    pathId: path.id,
                    waypointId: error.pointId,
                }),
            );
        }
    }

    // Plan segments
    const segments: AnimationSegmentPlan[] = [];
    const ctx: SegmentPlanContext = {
        bindings,
        mirrorConfig,
        defaultSpeedSps: animation.defaultSpeedSps,
        previousSteps: new Map(),
        spaceParams,
    };

    // offsetMs calculation reserved for future sequential timing offset feature
    // const offsetMs = animation.mode === 'sequential' ? (animation.sequentialConfig?.offsetMs ?? 0) : 0;

    for (let i = 0; i < segmentCount; i++) {
        const segment = planSegment(i, ctx);
        segments.push(segment);
        errors.push(...segment.errors);

        if (segment.speedClamped) {
            warnings.push(
                createError(
                    'speed_exceeds_limit',
                    `Segment ${i + 1} speed clamped to hardware limits.`,
                    { segmentIndex: i },
                ),
            );
        }
    }

    const totalDurationMs = segments.reduce((sum, s) => sum + s.durationMs, 0);

    // Compute mirror order for sequential mode
    const mirrorOrder =
        animation.mode === 'sequential' && animation.sequentialConfig
            ? generateMirrorOrder(
                  gridSize,
                  animation.sequentialConfig.orderBy,
                  animation.sequentialConfig.customOrder,
              )
            : undefined;

    const offsetMs =
        animation.mode === 'sequential' ? animation.sequentialConfig?.offsetMs : undefined;

    return {
        animationId: animation.id,
        segments,
        totalDurationMs,
        errors,
        warnings,
        mode: animation.mode,
        mirrorOrder,
        offsetMs,
    };
};

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Calculate estimated duration for an animation without full planning.
 */
export const estimateAnimationDuration = (
    animation: Animation,
    profile: CalibrationProfile | null,
): number => {
    if (!animation || !profile || animation.paths.length === 0) return 0;

    const maxWaypoints = Math.max(...animation.paths.map((p) => p.waypoints.length), 0);
    const segmentCount = Math.max(0, maxWaypoints - 1);

    // Rough estimate: assume average speed for each segment
    const avgSegmentDurationMs = 500; // Rough estimate
    return segmentCount * avgSegmentDurationMs;
};
