/**
 * Coordinate conversion utilities (wrapper over the canonical coords kernel).
 *
 * Exposes the same branded types as before while delegating math to the
 * central `src/coords` module. This keeps legacy call sites stable and
 * concentrates conversion logic in one place.
 */

import {
    asCameraPixels,
    asCameraPixelsDelta,
    asCentered,
    asCenteredDelta,
    asIsotropic,
    asIsotropicDelta,
    asViewport,
    asViewportDelta,
    convert,
    convertDelta,
    type CameraPixels,
    type CameraPixelsDelta,
    type CenteredCoord,
    type CenteredDelta,
    type CoordSpace,
    type IsotropicCoord,
    type IsotropicDelta,
    type ViewportCoord,
    type ViewportDelta,
} from '@/coords';

// =============================================================================
// CAMERA INFO
// =============================================================================

/** Camera dimensions needed for coordinate conversions */
export interface CameraInfo {
    width: number;
    height: number;
}

const unitContext = { width: 1, height: 1 } as const;
const ctxFromCamera = (camera: CameraInfo) => ({ width: camera.width, height: camera.height });

// =============================================================================
// VIEWPORT <-> CENTERED CONVERSIONS
// =============================================================================

/** Convert viewport [0,1] to centered [-1,1] */
export const viewportToCentered = (coord: ViewportCoord): CenteredCoord =>
    convert(coord, 'viewport', 'centered', unitContext);

/** Convert centered [-1,1] to viewport [0,1] */
export const centeredToViewport = (coord: CenteredCoord): ViewportCoord =>
    convert(coord, 'centered', 'viewport', unitContext);

/** Convert viewport delta to centered delta (multiply by 2) */
export const viewportDeltaToCentered = (delta: ViewportDelta): CenteredDelta =>
    asCenteredDelta(convertDelta(delta as number, 'x', 'viewport', 'centered', unitContext));

/** Convert centered delta to viewport delta (divide by 2) */
export const centeredDeltaToViewport = (delta: CenteredDelta): ViewportDelta =>
    asViewportDelta(convertDelta(delta as number, 'x', 'centered', 'viewport', unitContext));

// =============================================================================
// VIEWPORT <-> CAMERA PIXELS CONVERSIONS
// =============================================================================

/** Convert viewport [0,1] to camera pixels */
export const viewportToPixels = (coord: ViewportCoord, camera: CameraInfo): CameraPixels =>
    convert(coord, 'viewport', 'camera', ctxFromCamera(camera));

/** Convert camera pixels to viewport [0,1] */
export const pixelsToViewport = (coord: CameraPixels, camera: CameraInfo): ViewportCoord =>
    convert(coord, 'camera', 'viewport', ctxFromCamera(camera));

/** Convert viewport delta to pixel delta for X axis */
export const viewportDeltaToPixelsX = (
    delta: ViewportDelta,
    camera: CameraInfo,
): CameraPixelsDelta =>
    asCameraPixelsDelta(
        convertDelta(delta as number, 'x', 'viewport', 'camera', ctxFromCamera(camera)),
    );

/** Convert viewport delta to pixel delta for Y axis */
export const viewportDeltaToPixelsY = (
    delta: ViewportDelta,
    camera: CameraInfo,
): CameraPixelsDelta =>
    asCameraPixelsDelta(
        convertDelta(delta as number, 'y', 'viewport', 'camera', ctxFromCamera(camera)),
    );

// =============================================================================
// CAMERA PIXELS <-> ISOTROPIC CONVERSIONS
// =============================================================================

/**
 * Convert camera pixels to isotropic [0,1] coordinates.
 * Isotropic coordinates preserve aspect ratio by using max dimension.
 */
export const pixelsToIsotropic = (coord: CameraPixels, camera: CameraInfo): IsotropicCoord =>
    convert(coord, 'camera', 'isotropic', ctxFromCamera(camera));

/** Convert isotropic [0,1] to camera pixels. */
export const isotropicToPixels = (coord: IsotropicCoord, camera: CameraInfo): CameraPixels =>
    convert(coord, 'isotropic', 'camera', ctxFromCamera(camera));

/** Convert pixel delta to isotropic delta (uses max dimension) */
export const pixelsDeltaToIsotropic = (
    delta: CameraPixelsDelta,
    camera: CameraInfo,
): IsotropicDelta =>
    asIsotropicDelta(
        convertDelta(delta as number, 'x', 'camera', 'isotropic', ctxFromCamera(camera)),
    );

/** Convert isotropic delta to pixel delta (uses max dimension) */
export const isotropicDeltaToPixels = (
    delta: IsotropicDelta,
    camera: CameraInfo,
): CameraPixelsDelta =>
    asCameraPixelsDelta(
        convertDelta(delta as number, 'x', 'isotropic', 'camera', ctxFromCamera(camera)),
    );

// =============================================================================
// VIEWPORT <-> ISOTROPIC CONVERSIONS (composite)
// =============================================================================

/** Convert viewport [0,1] to isotropic [0,1]. Goes through pixel space. */
export const viewportToIsotropic = (coord: ViewportCoord, camera: CameraInfo): IsotropicCoord =>
    convert(coord, 'viewport', 'isotropic', ctxFromCamera(camera));

/** Convert isotropic [0,1] to viewport [0,1]. Goes through pixel space. */
export const isotropicToViewport = (coord: IsotropicCoord, camera: CameraInfo): ViewportCoord =>
    convert(coord, 'isotropic', 'viewport', ctxFromCamera(camera));

/** Convert viewport delta to isotropic delta (average X/Y for aspect) */
export const viewportDeltaToIsotropic = (
    delta: ViewportDelta,
    camera: CameraInfo,
): IsotropicDelta => {
    const ctx = ctxFromCamera(camera);
    const dx = convertDelta(delta as number, 'x', 'viewport', 'isotropic', ctx);
    const dy = convertDelta(delta as number, 'y', 'viewport', 'isotropic', ctx);
    return asIsotropicDelta((dx + dy) / 2);
};

/** Convert isotropic delta to viewport delta (average X/Y for aspect) */
export const isotropicDeltaToViewport = (
    delta: IsotropicDelta,
    camera: CameraInfo,
): ViewportDelta => {
    const ctx = ctxFromCamera(camera);
    const dx = convertDelta(delta as number, 'x', 'isotropic', 'viewport', ctx);
    const dy = convertDelta(delta as number, 'y', 'isotropic', 'viewport', ctx);
    return asViewportDelta((dx + dy) / 2);
};

// =============================================================================
// ISOTROPIC <-> CENTERED CONVERSIONS (composite)
// =============================================================================

/** Convert isotropic [0,1] to centered [-1,1] */
export const isotropicToCentered = (coord: IsotropicCoord): CenteredCoord =>
    convert(coord, 'isotropic', 'centered', unitContext);

/** Convert centered [-1,1] to isotropic [0,1] */
export const centeredToIsotropic = (coord: CenteredCoord): IsotropicCoord =>
    convert(coord, 'centered', 'isotropic', unitContext);

/** Convert isotropic delta to centered delta */
export const isotropicDeltaToCentered = (delta: IsotropicDelta): CenteredDelta =>
    asCenteredDelta(convertDelta(delta as number, 'x', 'isotropic', 'centered', unitContext));

/** Convert centered delta to isotropic delta */
export const centeredDeltaToIsotropic = (delta: CenteredDelta): IsotropicDelta =>
    asIsotropicDelta(convertDelta(delta as number, 'x', 'centered', 'isotropic', unitContext));

// =============================================================================
// CONVENIENCE EXTRACTORS (for when you need raw numbers)
// =============================================================================

/** Extract raw x,y from any coordinate type */
export const rawCoords = <T extends { x: number; y: number }>(
    coord: T,
): { x: number; y: number } => ({
    x: coord.x,
    y: coord.y,
});

/** Extract raw number from any delta type */
export const rawDelta = <T extends number>(delta: T): number => delta as number;

// =============================================================================
// DISTANCE CALCULATIONS
// =============================================================================

/** Calculate Euclidean distance between two points in the same coordinate system */
export const distance = <T extends { x: number; y: number }>(a: T, b: T): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
};

// =============================================================================
// LEGACY HELPERS (single-number conversions for convenience)
// =============================================================================

const clampCentered = (value: number): number => {
    if (Number.isNaN(value)) return 0;
    if (value < -1) return -1;
    if (value > 1) return 1;
    return value;
};

export const viewToCentered = (value: number): number => clampCentered(value * 2 - 1);
export const centeredToView = (value: number): number => (value + 1) / 2;
export const centeredDeltaToView = (delta: number): number => delta / 2;
export const viewDeltaToCentered = (delta: number): number => delta * 2;

export type { CameraPixels, CenteredCoord, CoordSpace, IsotropicCoord, ViewportCoord };
export type { CameraPixelsDelta, CenteredDelta, IsotropicDelta, ViewportDelta };
export {
    asCameraPixels,
    asCentered,
    asIsotropic,
    asViewport,
    asCameraPixelsDelta,
    asCenteredDelta,
    asIsotropicDelta,
    asViewportDelta,
};
