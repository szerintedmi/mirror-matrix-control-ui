import { createTransformer, asCameraPixels, asIsotropic, asViewport } from '@/coords';

const getTransformer = (sourceWidth: number, sourceHeight: number) =>
    createTransformer({ width: sourceWidth, height: sourceHeight });

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
    const t = getTransformer(sourceWidth, sourceHeight);
    const isotropic = t.toIsotropic(asCameraPixels(x, y), 'camera');
    return { x: isotropic.x, y: isotropic.y };
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
    const t = getTransformer(sourceWidth, sourceHeight);
    const pixels = t.toCamera(asIsotropic(normalizedX, normalizedY), 'isotropic');
    return { x: pixels.x, y: pixels.y };
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
    const t = getTransformer(sourceWidth, sourceHeight);
    const iso = t.toIsotropic(asViewport(viewportX, viewportY), 'viewport');
    return { x: iso.x, y: iso.y };
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
): { x: number; y: number } => {
    const t = getTransformer(sourceWidth, sourceHeight);
    const px = t.toCamera(asViewport(viewportX, viewportY), 'viewport');
    return { x: px.x, y: px.y };
};

/**
 * Converts viewport delta directly to pixel delta.
 */
export const viewportDeltaToPixels = (viewportDelta: number, sourceDimension: number): number =>
    viewportDelta * sourceDimension;

/**
 * Converts isotropic coordinates [0,1] to viewport coordinates [0,1].
 * Reverses the aspect ratio adjustment done by normalizeIsotropic.
 *
 * For 16:9 (1920x1080):
 * - Isotropic (0.5, 0.5) → Viewport (0.5, 0.5) (center stays center)
 * - Isotropic (0, ~0.22) → Viewport (0, 0) (top-left adjusts for letterbox removal)
 */
export const isotropicToViewport = (
    isoX: number,
    isoY: number,
    sourceWidth: number,
    sourceHeight: number,
): { x: number; y: number } => {
    const t = getTransformer(sourceWidth, sourceHeight);
    const viewport = t.toViewport(asIsotropic(isoX, isoY), 'isotropic');
    return { x: viewport.x, y: viewport.y };
};

/**
 * Converts isotropic delta to viewport delta.
 * Uses average dimension for approximation since viewport X/Y have different scales.
 */
export const isotropicDeltaToViewport = (
    isoDelta: number,
    sourceWidth: number,
    sourceHeight: number,
): number => {
    const maxDim = Math.max(sourceWidth, sourceHeight);
    const avgDim = (sourceWidth + sourceHeight) / 2;
    return (isoDelta * maxDim) / avgDim;
};
