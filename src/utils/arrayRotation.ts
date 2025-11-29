/**
 * Array Rotation Utilities
 *
 * Handles coordinate transformations for physically rotated mirror arrays.
 * Rotation is clockwise when viewing the array from the camera's perspective.
 *
 * Reference orientation (0°):
 * - Top-left of array is grid position (row=0, col=0)
 * - X-axis motor controls horizontal movement
 * - Y-axis motor controls vertical movement
 */

/**
 * Supported rotation angles (clockwise from camera view).
 */
export type ArrayRotation = 0 | 90 | 180 | 270;

/**
 * All valid rotation values for iteration/validation.
 */
export const ARRAY_ROTATIONS: readonly ArrayRotation[] = [0, 90, 180, 270] as const;

/**
 * Validates that a value is a valid ArrayRotation.
 */
export const isValidArrayRotation = (value: unknown): value is ArrayRotation =>
    value === 0 || value === 90 || value === 180 || value === 270;

/**
 * 2D vector for coordinate transformations.
 */
export interface Vec2 {
    x: number;
    y: number;
}

/**
 * Axis mapping result indicating which physical motor axis handles
 * which logical (visual) direction after rotation.
 */
export interface AxisMapping {
    /**
     * Which physical axis (x or y motor) handles logical X (horizontal) movement.
     */
    logicalX: 'x' | 'y';
    /**
     * Which physical axis (x or y motor) handles logical Y (vertical) movement.
     */
    logicalY: 'x' | 'y';
    /**
     * Whether the physical axis handling logical X needs sign inversion.
     */
    flipX: boolean;
    /**
     * Whether the physical axis handling logical Y needs sign inversion.
     */
    flipY: boolean;
}

/**
 * Rotates a 2D vector by the specified rotation angle (clockwise).
 *
 * Used to transform:
 * - Pattern coordinates before tile assignment
 * - Camera-measured displacements during calibration
 *
 * @param vec - The vector to rotate
 * @param rotation - Clockwise rotation angle in degrees
 * @returns The rotated vector
 */
export const rotateVector = (vec: Vec2, rotation: ArrayRotation): Vec2 => {
    switch (rotation) {
        case 0:
            return { x: vec.x, y: vec.y };
        case 90:
            // 90° CW: (x, y) → (y, -x)
            return { x: vec.y, y: -vec.x };
        case 180:
            // 180°: (x, y) → (-x, -y)
            return { x: -vec.x, y: -vec.y };
        case 270:
            // 270° CW (= 90° CCW): (x, y) → (-y, x)
            return { x: -vec.y, y: vec.x };
    }
};

/**
 * Rotates a 2D vector by the inverse of the specified rotation angle.
 * This effectively rotates counter-clockwise.
 *
 * Used to transform coordinates back to the original space.
 *
 * @param vec - The vector to rotate back
 * @param rotation - The original clockwise rotation angle that was applied
 * @returns The vector in original (unrotated) space
 */
export const rotateVectorInverse = (vec: Vec2, rotation: ArrayRotation): Vec2 => {
    // Inverse of CW rotation is CCW rotation (or rotate by negative angle)
    const inverseRotation: ArrayRotation =
        rotation === 0 ? 0 : rotation === 90 ? 270 : rotation === 180 ? 180 : 90;
    return rotateVector(vec, inverseRotation);
};

/**
 * Gets the axis mapping for a given rotation.
 *
 * When the array is rotated:
 * - 0°: X motor → horizontal, Y motor → vertical (normal)
 * - 90° CW: X motor → vertical, Y motor → horizontal (swapped)
 * - 180°: X motor → horizontal (inverted), Y motor → vertical (inverted)
 * - 270° CW: X motor → vertical, Y motor → horizontal (swapped, inverted)
 *
 * @param rotation - The array rotation angle
 * @returns Axis mapping describing how physical axes map to logical directions
 */
export const getAxisMapping = (rotation: ArrayRotation): AxisMapping => {
    // Baseline coordinate system: +X = LEFT, +Y = UP (from camera view)
    // This matches typical mirror array motor wiring where +steps go to top-left corner.
    switch (rotation) {
        case 0:
            // Baseline: X controls horizontal (but +X = LEFT, so flipX to get +visual = RIGHT)
            // Y controls vertical (+Y = UP, standard, no flip needed)
            return { logicalX: 'x', logicalY: 'y', flipX: true, flipY: false };
        case 90:
            // 90° CW: physical X now moves vertically, physical Y moves horizontally
            return { logicalX: 'y', logicalY: 'x', flipX: true, flipY: true };
        case 180:
            // 180°: Same axes, X flip cancels out, Y now inverted
            return { logicalX: 'x', logicalY: 'y', flipX: false, flipY: true };
        case 270:
            // 270° CW (= 90° CCW): axes swapped
            return { logicalX: 'y', logicalY: 'x', flipX: false, flipY: false };
    }
};

/**
 * Computes the jog direction multiplier for a given axis during calibration step test.
 *
 * When calibrating, motors jog by a delta to measure displacement. The jog direction
 * should match the expected visual direction based on rotation so that the measured
 * `stepToDisplacement` ratios have consistent signs.
 *
 * @param axis - The physical motor axis being tested ('x' or 'y')
 * @param rotation - The array rotation
 * @returns +1 for normal jog direction, -1 for inverted jog direction
 */
export const getStepTestJogDirection = (axis: 'x' | 'y', rotation: ArrayRotation): 1 | -1 => {
    const mapping = getAxisMapping(rotation);

    // Determine if this physical axis needs to jog in the inverted direction
    // to produce positive displacement in the expected visual direction
    if (axis === 'x') {
        // Physical X axis: check if its logical direction (after rotation) is flipped
        // Physical X handles logical Y when axes are swapped (90° or 270°)
        const handlesLogicalY = mapping.logicalY === 'x';
        if (handlesLogicalY) {
            return mapping.flipY ? -1 : 1;
        }
        return mapping.flipX ? -1 : 1;
    } else {
        // Physical Y axis
        const handlesLogicalX = mapping.logicalX === 'y';
        if (handlesLogicalX) {
            return mapping.flipX ? -1 : 1;
        }
        return mapping.flipY ? -1 : 1;
    }
};

/**
 * Human-readable label for a rotation value.
 */
export const getRotationLabel = (rotation: ArrayRotation): string => {
    switch (rotation) {
        case 0:
            return '0° (Normal)';
        case 90:
            return '90° CW';
        case 180:
            return '180°';
        case 270:
            return '270° CW';
    }
};
