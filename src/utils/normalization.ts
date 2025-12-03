import { clamp01 } from '@/constants/calibration';

/**
 * Normalizes coordinates isotropically based on the maximum dimension of the source.
 * This ensures that the aspect ratio is preserved in the normalized space.
 * The normalized space is a unit square [0, 1] x [0, 1].
 * The content is centered within this square.
 */
export const normalizeIsotropic = (
    x: number,
    y: number,
    sourceWidth: number,
    sourceHeight: number,
): { x: number; y: number } => {
    const maxDim = Math.max(sourceWidth, sourceHeight);
    const offsetX = (maxDim - sourceWidth) / 2;
    const offsetY = (maxDim - sourceHeight) / 2;

    return {
        x: clamp01((x + offsetX) / maxDim),
        y: clamp01((y + offsetY) / maxDim),
    };
};

/**
 * Denormalizes isotropic coordinates back to pixel space.
 */
export const denormalizeIsotropic = (
    normalizedX: number,
    normalizedY: number,
    sourceWidth: number,
    sourceHeight: number,
): { x: number; y: number } => {
    const maxDim = Math.max(sourceWidth, sourceHeight);
    const offsetX = (maxDim - sourceWidth) / 2;
    const offsetY = (maxDim - sourceHeight) / 2;

    return {
        x: normalizedX * maxDim - offsetX,
        y: normalizedY * maxDim - offsetY,
    };
};

/**
 * Normalizes a size (delta) isotropically.
 */
export const normalizeIsotropicDelta = (
    size: number,
    sourceWidth: number,
    sourceHeight: number,
): number => {
    const maxDim = Math.max(sourceWidth, sourceHeight);
    return size / maxDim;
};

/**
 * Denormalizes a size (delta) isotropically.
 */
export const denormalizeIsotropicDelta = (
    normalizedSize: number,
    sourceWidth: number,
    sourceHeight: number,
): number => {
    const maxDim = Math.max(sourceWidth, sourceHeight);
    return normalizedSize * maxDim;
};

/**
 * Converts viewport coordinates [0,1] to isotropic coordinates.
 * Viewport coords cover the full frame, isotropic coords account for aspect ratio.
 *
 * For 16:9 (1920x1080):
 * - Viewport (0.5, 0.5) → Isotropic (0.5, 0.5) (center stays center)
 * - Viewport (0, 0) → Isotropic (0, ~0.22) (top-left adjusts for letterbox)
 */
export const viewportToIsotropic = (
    viewportX: number,
    viewportY: number,
    sourceWidth: number,
    sourceHeight: number,
): { x: number; y: number } => {
    const maxDim = Math.max(sourceWidth, sourceHeight);
    const offsetX = (maxDim - sourceWidth) / 2;
    const offsetY = (maxDim - sourceHeight) / 2;

    // viewport [0,1] → pixel → isotropic
    const pixelX = viewportX * sourceWidth;
    const pixelY = viewportY * sourceHeight;

    return {
        x: clamp01((pixelX + offsetX) / maxDim),
        y: clamp01((pixelY + offsetY) / maxDim),
    };
};

/**
 * Converts viewport delta to isotropic delta.
 * Since viewport and isotropic use different scales, deltas must be converted.
 */
export const viewportDeltaToIsotropic = (
    viewportDelta: number,
    sourceDimension: number,
    sourceWidth: number,
    sourceHeight: number,
): number => {
    const maxDim = Math.max(sourceWidth, sourceHeight);
    // viewport delta → pixel delta → isotropic delta
    return (viewportDelta * sourceDimension) / maxDim;
};

/**
 * Converts viewport coordinates directly to pixel coordinates.
 * This is a simple linear mapping without aspect ratio adjustment.
 */
export const viewportToPixels = (
    viewportX: number,
    viewportY: number,
    sourceWidth: number,
    sourceHeight: number,
): { x: number; y: number } => ({
    x: viewportX * sourceWidth,
    y: viewportY * sourceHeight,
});

/**
 * Converts viewport delta directly to pixel delta.
 */
export const viewportDeltaToPixels = (viewportDelta: number, sourceDimension: number): number =>
    viewportDelta * sourceDimension;
