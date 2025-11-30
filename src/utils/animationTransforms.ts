import type { AnimationPath } from '@/types/animation';

import { rotateCoordinates, scaleCoordinates, shiftCoordinates } from './coordinateTransforms';

/**
 * Shift all waypoints in a path by the given delta.
 * Waypoints may go out of bounds [-1, 1] - validation is handled by the UI.
 */
export function transformPathShift(path: AnimationPath, dx: number, dy: number): AnimationPath {
    return {
        ...path,
        waypoints: shiftCoordinates(path.waypoints, dx, dy),
    };
}

/**
 * Scale all waypoints in a path around a center point.
 * @param scaleX - Scale factor for X axis (1 = no change, 2 = double, 0.5 = half)
 * @param scaleY - Scale factor for Y axis
 * @param centerX - Center of scaling (default 0 = canvas center)
 * @param centerY - Center of scaling (default 0 = canvas center)
 */
export function transformPathScale(
    path: AnimationPath,
    scaleX: number,
    scaleY: number,
    centerX: number = 0,
    centerY: number = 0,
): AnimationPath {
    return {
        ...path,
        waypoints: scaleCoordinates(path.waypoints, scaleX, scaleY, centerX, centerY),
    };
}

/**
 * Rotate all waypoints in a path around a center point.
 * @param angleDeg - Rotation angle in degrees (positive = counterclockwise)
 * @param centerX - Center of rotation (default 0 = canvas center)
 * @param centerY - Center of rotation (default 0 = canvas center)
 */
export function transformPathRotate(
    path: AnimationPath,
    angleDeg: number,
    centerX: number = 0,
    centerY: number = 0,
): AnimationPath {
    return {
        ...path,
        waypoints: rotateCoordinates(path.waypoints, angleDeg, centerX, centerY),
    };
}
