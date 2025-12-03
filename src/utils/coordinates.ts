/**
 * Type-safe coordinate system utilities using branded types.
 *
 * This module provides compile-time safety for coordinate conversions
 * to prevent mixing different coordinate systems (viewport, isotropic,
 * centered, camera pixels).
 *
 * COORDINATE SYSTEMS:
 * - CameraPixels: Raw pixel coordinates from blob detection (0 to width/height)
 * - IsotropicCoord: Aspect-ratio preserved [0,1], used for blob comparison
 * - ViewportCoord: Full frame [0,1], used for ROI and expected positions
 * - CenteredCoord: Origin at center [-1,1], used for measurements and motor displacement
 */

import { clamp01 } from '@/constants/calibration';

// Brand symbol for type safety
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

// =============================================================================
// COORDINATE TYPES
// =============================================================================

/** Raw pixel coordinates from camera/blob detection (0 to width/height) */
export type CameraPixels = Brand<{ x: number; y: number }, 'CameraPixels'>;

/** Isotropic normalized coordinates [0,1], aspect-ratio preserved */
export type IsotropicCoord = Brand<{ x: number; y: number }, 'Isotropic'>;

/** Viewport coordinates [0,1], full frame without aspect ratio adjustment */
export type ViewportCoord = Brand<{ x: number; y: number }, 'Viewport'>;

/** Centered coordinates [-1,1], origin at center */
export type CenteredCoord = Brand<{ x: number; y: number }, 'Centered'>;

// Delta types for sizes and distances
export type CameraPixelsDelta = Brand<number, 'CameraPixelsDelta'>;
export type IsotropicDelta = Brand<number, 'IsotropicDelta'>;
export type ViewportDelta = Brand<number, 'ViewportDelta'>;
export type CenteredDelta = Brand<number, 'CenteredDelta'>;

// =============================================================================
// CAMERA INFO
// =============================================================================

/** Camera dimensions needed for coordinate conversions */
export interface CameraInfo {
    width: number;
    height: number;
}

// =============================================================================
// CONSTRUCTORS
// =============================================================================

/** Create CameraPixels from raw numbers */
export const asCameraPixels = (x: number, y: number): CameraPixels => ({ x, y }) as CameraPixels;

/** Create IsotropicCoord from raw numbers */
export const asIsotropic = (x: number, y: number): IsotropicCoord => ({ x, y }) as IsotropicCoord;

/** Create ViewportCoord from raw numbers */
export const asViewport = (x: number, y: number): ViewportCoord => ({ x, y }) as ViewportCoord;

/** Create CenteredCoord from raw numbers */
export const asCentered = (x: number, y: number): CenteredCoord => ({ x, y }) as CenteredCoord;

// Delta constructors
export const asCameraPixelsDelta = (d: number): CameraPixelsDelta => d as CameraPixelsDelta;
export const asIsotropicDelta = (d: number): IsotropicDelta => d as IsotropicDelta;
export const asViewportDelta = (d: number): ViewportDelta => d as ViewportDelta;
export const asCenteredDelta = (d: number): CenteredDelta => d as CenteredDelta;

// =============================================================================
// VIEWPORT <-> CENTERED CONVERSIONS
// =============================================================================

/** Convert viewport [0,1] to centered [-1,1] */
export const viewportToCentered = (coord: ViewportCoord): CenteredCoord =>
    asCentered(coord.x * 2 - 1, coord.y * 2 - 1);

/** Convert centered [-1,1] to viewport [0,1] */
export const centeredToViewport = (coord: CenteredCoord): ViewportCoord =>
    asViewport((coord.x + 1) / 2, (coord.y + 1) / 2);

/** Convert viewport delta to centered delta (multiply by 2) */
export const viewportDeltaToCentered = (delta: ViewportDelta): CenteredDelta =>
    asCenteredDelta((delta as number) * 2);

/** Convert centered delta to viewport delta (divide by 2) */
export const centeredDeltaToViewport = (delta: CenteredDelta): ViewportDelta =>
    asViewportDelta((delta as number) / 2);

// =============================================================================
// VIEWPORT <-> CAMERA PIXELS CONVERSIONS
// =============================================================================

/** Convert viewport [0,1] to camera pixels */
export const viewportToPixels = (coord: ViewportCoord, camera: CameraInfo): CameraPixels =>
    asCameraPixels(coord.x * camera.width, coord.y * camera.height);

/** Convert camera pixels to viewport [0,1] */
export const pixelsToViewport = (coord: CameraPixels, camera: CameraInfo): ViewportCoord =>
    asViewport(coord.x / camera.width, coord.y / camera.height);

/** Convert viewport delta to pixel delta for X axis */
export const viewportDeltaToPixelsX = (
    delta: ViewportDelta,
    camera: CameraInfo,
): CameraPixelsDelta => asCameraPixelsDelta((delta as number) * camera.width);

/** Convert viewport delta to pixel delta for Y axis */
export const viewportDeltaToPixelsY = (
    delta: ViewportDelta,
    camera: CameraInfo,
): CameraPixelsDelta => asCameraPixelsDelta((delta as number) * camera.height);

// =============================================================================
// CAMERA PIXELS <-> ISOTROPIC CONVERSIONS
// =============================================================================

/**
 * Convert camera pixels to isotropic [0,1] coordinates.
 * Isotropic coordinates preserve aspect ratio by using max dimension.
 * For 16:9 camera, Y range is compressed to ~[0.22, 0.78].
 */
export const pixelsToIsotropic = (coord: CameraPixels, camera: CameraInfo): IsotropicCoord => {
    const maxDim = Math.max(camera.width, camera.height);
    const offsetX = (maxDim - camera.width) / 2;
    const offsetY = (maxDim - camera.height) / 2;

    return asIsotropic(
        clamp01((coord.x + offsetX) / maxDim),
        clamp01((coord.y + offsetY) / maxDim),
    );
};

/**
 * Convert isotropic [0,1] to camera pixels.
 * Reverses the aspect-ratio adjustment.
 */
export const isotropicToPixels = (coord: IsotropicCoord, camera: CameraInfo): CameraPixels => {
    const maxDim = Math.max(camera.width, camera.height);
    const offsetX = (maxDim - camera.width) / 2;
    const offsetY = (maxDim - camera.height) / 2;

    return asCameraPixels(coord.x * maxDim - offsetX, coord.y * maxDim - offsetY);
};

/** Convert pixel delta to isotropic delta */
export const pixelsDeltaToIsotropic = (
    delta: CameraPixelsDelta,
    camera: CameraInfo,
): IsotropicDelta => {
    const maxDim = Math.max(camera.width, camera.height);
    return asIsotropicDelta((delta as number) / maxDim);
};

/** Convert isotropic delta to pixel delta */
export const isotropicDeltaToPixels = (
    delta: IsotropicDelta,
    camera: CameraInfo,
): CameraPixelsDelta => {
    const maxDim = Math.max(camera.width, camera.height);
    return asCameraPixelsDelta((delta as number) * maxDim);
};

// =============================================================================
// VIEWPORT <-> ISOTROPIC CONVERSIONS (composite)
// =============================================================================

/**
 * Convert viewport [0,1] to isotropic [0,1].
 * Goes through pixel space as intermediate.
 */
export const viewportToIsotropic = (coord: ViewportCoord, camera: CameraInfo): IsotropicCoord => {
    const pixels = viewportToPixels(coord, camera);
    return pixelsToIsotropic(pixels, camera);
};

/**
 * Convert isotropic [0,1] to viewport [0,1].
 * Goes through pixel space as intermediate.
 */
export const isotropicToViewport = (coord: IsotropicCoord, camera: CameraInfo): ViewportCoord => {
    const pixels = isotropicToPixels(coord, camera);
    return pixelsToViewport(pixels, camera);
};

/**
 * Convert viewport delta to isotropic delta.
 * Uses average dimension for approximation.
 */
export const viewportDeltaToIsotropic = (
    delta: ViewportDelta,
    camera: CameraInfo,
): IsotropicDelta => {
    const maxDim = Math.max(camera.width, camera.height);
    const avgDim = (camera.width + camera.height) / 2;
    return asIsotropicDelta(((delta as number) * avgDim) / maxDim);
};

// =============================================================================
// ISOTROPIC <-> CENTERED CONVERSIONS (composite)
// =============================================================================

/** Convert isotropic [0,1] to centered [-1,1] */
export const isotropicToCentered = (coord: IsotropicCoord): CenteredCoord =>
    asCentered(coord.x * 2 - 1, coord.y * 2 - 1);

/** Convert centered [-1,1] to isotropic [0,1] */
export const centeredToIsotropic = (coord: CenteredCoord): IsotropicCoord =>
    asIsotropic((coord.x + 1) / 2, (coord.y + 1) / 2);

/** Convert isotropic delta to centered delta */
export const isotropicDeltaToCentered = (delta: IsotropicDelta): CenteredDelta =>
    asCenteredDelta((delta as number) * 2);

/** Convert centered delta to isotropic delta */
export const centeredDeltaToIsotropic = (delta: CenteredDelta): IsotropicDelta =>
    asIsotropicDelta((delta as number) / 2);

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
