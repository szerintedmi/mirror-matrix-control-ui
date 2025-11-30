/**
 * Generic coordinate transformation utilities.
 * These functions work with any type that has x and y number properties,
 * enabling code reuse between Pattern and Animation editors.
 */

export interface Coordinate {
    x: number;
    y: number;
}

/**
 * Shift all coordinates by the given delta.
 * Coordinates may go out of bounds [-1, 1] - validation is handled by the UI.
 */
export function shiftCoordinates<T extends Coordinate>(points: T[], dx: number, dy: number): T[] {
    return points.map((point) => ({
        ...point,
        x: point.x + dx,
        y: point.y + dy,
    }));
}

/**
 * Scale all coordinates around a center point.
 * @param scaleX - Scale factor for X axis (1 = no change, 2 = double, 0.5 = half)
 * @param scaleY - Scale factor for Y axis
 * @param centerX - Center of scaling (default 0 = canvas center)
 * @param centerY - Center of scaling (default 0 = canvas center)
 */
export function scaleCoordinates<T extends Coordinate>(
    points: T[],
    scaleX: number,
    scaleY: number,
    centerX: number = 0,
    centerY: number = 0,
): T[] {
    return points.map((point) => ({
        ...point,
        x: centerX + (point.x - centerX) * scaleX,
        y: centerY + (point.y - centerY) * scaleY,
    }));
}

/**
 * Rotate all coordinates around a center point.
 * @param angleDeg - Rotation angle in degrees (positive = counterclockwise)
 * @param centerX - Center of rotation (default 0 = canvas center)
 * @param centerY - Center of rotation (default 0 = canvas center)
 */
export function rotateCoordinates<T extends Coordinate>(
    points: T[],
    angleDeg: number,
    centerX: number = 0,
    centerY: number = 0,
): T[] {
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
