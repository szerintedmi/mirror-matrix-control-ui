import type { Axis, GridPosition, MirrorAssignment, MirrorConfig, Motor } from '@/types';

/**
 * Predicate to check if a motor matches a specific motor reference.
 */
type MotorMatcher = (motor: Motor | null) => boolean;

/**
 * Create a matcher for a specific motor by nodeMac and motorIndex.
 */
export const matchMotor =
    (targetMotor: Motor): MotorMatcher =>
    (motor) =>
        motor?.nodeMac === targetMotor.nodeMac && motor?.motorIndex === targetMotor.motorIndex;

/**
 * Create a matcher for any motor on a specific node.
 */
export const matchNodeMotors =
    (nodeMac: string): MotorMatcher =>
    (motor) =>
        motor?.nodeMac === nodeMac;

/**
 * Remove matching motors from a mirror configuration.
 * Returns [updatedConfig, wasModified].
 *
 * @param config - Current mirror configuration
 * @param matcher - Function to determine which motors to remove
 * @param stopAfterFirst - Stop after finding first match (for single motor removal)
 */
export function removeMatchingMotors(
    config: MirrorConfig,
    matcher: MotorMatcher,
    stopAfterFirst: boolean = false,
): [MirrorConfig, boolean] {
    const newConfig: MirrorConfig = new Map(config);
    let modified = false;

    for (const key of newConfig.keys()) {
        const assignment = newConfig.get(key);
        if (!assignment) {
            continue;
        }

        const newAssignment: MirrorAssignment = { x: assignment.x, y: assignment.y };
        let changed = false;

        if (matcher(newAssignment.x)) {
            newAssignment.x = null;
            changed = true;
        }
        if (matcher(newAssignment.y)) {
            newAssignment.y = null;
            changed = true;
        }

        if (changed) {
            if (newAssignment.x === null && newAssignment.y === null) {
                newConfig.delete(key);
            } else {
                newConfig.set(key, newAssignment);
            }
            modified = true;
            if (stopAfterFirst) {
                break;
            }
        }
    }

    return [modified ? newConfig : config, modified];
}

/**
 * Check if a motor is currently assigned anywhere in the configuration.
 */
export function isMotorAssigned(config: MirrorConfig, motor: Motor): boolean {
    const matcher = matchMotor(motor);
    for (const assignment of config.values()) {
        if (matcher(assignment.x) || matcher(assignment.y)) {
            return true;
        }
    }
    return false;
}

/**
 * Unassign a specific motor from the configuration.
 * Returns the updated configuration (or same reference if unchanged).
 */
export function unassignMotor(config: MirrorConfig, motor: Motor): MirrorConfig {
    const [newConfig] = removeMatchingMotors(config, matchMotor(motor), true);
    return newConfig;
}

/**
 * Unassign all motors belonging to a specific node.
 * Returns the updated configuration (or same reference if unchanged).
 */
export function unassignNodeMotors(config: MirrorConfig, nodeMac: string): MirrorConfig {
    const [newConfig] = removeMatchingMotors(config, matchNodeMotors(nodeMac), false);
    return newConfig;
}

/**
 * Move a motor to a new grid position and axis.
 * First removes the motor from its current position (if any), then assigns it to the new position.
 * Returns the updated configuration.
 */
export function moveMotorToPosition(
    config: MirrorConfig,
    motor: Motor,
    pos: GridPosition,
    axis: Axis,
): MirrorConfig {
    // First remove from any existing position
    const [clearedConfig] = removeMatchingMotors(config, matchMotor(motor), true);

    // Then assign to new position
    const newConfig: MirrorConfig = new Map(clearedConfig);
    const key = `${pos.row}-${pos.col}`;
    const currentAssignment = newConfig.get(key) || { x: null, y: null };

    newConfig.set(key, {
        ...currentAssignment,
        [axis]: motor,
    });

    return newConfig;
}
