import type { Pattern, PatternPoint } from '@/types';

import { rotateCoordinates, scaleCoordinates, shiftCoordinates } from './coordinateTransforms';

/**
 * Shift all pattern points by the given delta.
 * Points may go out of bounds [-1, 1] - validation is handled by the UI.
 */
export function shiftPoints(points: PatternPoint[], dx: number, dy: number): PatternPoint[] {
    return shiftCoordinates(points, dx, dy);
}

/**
 * Scale all pattern points around a center point.
 * @param scaleX - Scale factor for X axis (1 = no change, 2 = double, 0.5 = half)
 * @param scaleY - Scale factor for Y axis
 * @param centerX - Center of scaling (default 0 = canvas center)
 * @param centerY - Center of scaling (default 0 = canvas center)
 */
export function scalePoints(
    points: PatternPoint[],
    scaleX: number,
    scaleY: number,
    centerX: number = 0,
    centerY: number = 0,
): PatternPoint[] {
    return scaleCoordinates(points, scaleX, scaleY, centerX, centerY);
}

/**
 * Rotate all pattern points around a center point.
 * @param angleDeg - Rotation angle in degrees (positive = counterclockwise)
 * @param centerX - Center of rotation (default 0 = canvas center)
 * @param centerY - Center of rotation (default 0 = canvas center)
 */
export function rotatePoints(
    points: PatternPoint[],
    angleDeg: number,
    centerX: number = 0,
    centerY: number = 0,
): PatternPoint[] {
    return rotateCoordinates(points, angleDeg, centerX, centerY);
}

/**
 * Apply a shift transform to a pattern and return a new pattern.
 */
export function transformPatternShift(pattern: Pattern, dx: number, dy: number): Pattern {
    return {
        ...pattern,
        updatedAt: new Date().toISOString(),
        points: shiftPoints(pattern.points, dx, dy),
    };
}

/**
 * Apply a scale transform to a pattern and return a new pattern.
 */
export function transformPatternScale(
    pattern: Pattern,
    scaleX: number,
    scaleY: number,
    centerX: number = 0,
    centerY: number = 0,
): Pattern {
    return {
        ...pattern,
        updatedAt: new Date().toISOString(),
        points: scalePoints(pattern.points, scaleX, scaleY, centerX, centerY),
    };
}

/**
 * Apply a rotation transform to a pattern and return a new pattern.
 */
export function transformPatternRotate(
    pattern: Pattern,
    angleDeg: number,
    centerX: number = 0,
    centerY: number = 0,
): Pattern {
    return {
        ...pattern,
        updatedAt: new Date().toISOString(),
        points: rotatePoints(pattern.points, angleDeg, centerX, centerY),
    };
}
