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
