import type { Pattern, PatternPoint } from '@/types';

/**
 * Shift all pattern points by the given delta.
 * Points may go out of bounds [-1, 1] - validation is handled by the UI.
 */
export function shiftPoints(points: PatternPoint[], dx: number, dy: number): PatternPoint[] {
    return points.map((point) => ({
        ...point,
        x: point.x + dx,
        y: point.y + dy,
    }));
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
    return points.map((point) => ({
        ...point,
        x: centerX + (point.x - centerX) * scaleX,
        y: centerY + (point.y - centerY) * scaleY,
    }));
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
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    return points.map((point) => {
        const dx = point.x - centerX;
        const dy = point.y - centerY;

        return {
            ...point,
            x: centerX + dx * cos - dy * sin,
            y: centerY + dx * sin + dy * cos,
        };
    });
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
