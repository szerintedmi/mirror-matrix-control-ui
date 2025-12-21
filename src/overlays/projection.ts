/**
 * Projection utilities for overlay rendering.
 *
 * Consolidates transform math from CalibrationPreview.tsx and useRoiOverlayInteractions.ts
 * into shared functions for consistent coordinate transformations.
 */
import type { NormalizedRoi } from '@/types';
import { buildLetterboxTransform, type LetterboxTransform } from '@/utils/letterbox';

import type { OverlayProjection } from './types';

// Re-export letterbox types and functions for convenience
export { buildLetterboxTransform, type LetterboxTransform };

// =============================================================================
// ROI TRANSFORMATION
// =============================================================================

/**
 * Input type for ROI transformation (accepts both NormalizedRoi and partial objects).
 */
export interface RoiRect {
    x: number;
    y: number;
    width: number;
    height: number;
    enabled?: boolean;
}

/**
 * Transform ROI coordinates between Source Space and Screen Space.
 *
 * Source Space: Coordinates relative to the unrotated video frame (0-1 normalized).
 * Screen Space: Coordinates relative to the rotated display (0-1 normalized).
 *
 * This function handles rotation transformations for ROI rectangles when
 * the video is displayed with a rotation applied. Supports arbitrary rotation angles.
 *
 * @param inputRoi - ROI rectangle to transform
 * @param degrees - Rotation angle in degrees (any value, e.g., -10 to +10 for fine adjustment)
 * @param direction - 'toScreen' to rotate from source to display, 'toSource' to reverse
 * @returns Transformed ROI rectangle with rotated bounding box
 */
export const transformRoi = <T extends RoiRect>(
    inputRoi: T,
    degrees: number,
    direction: 'toScreen' | 'toSource',
): T => {
    // Handle zero rotation quickly
    if (Math.abs(degrees) < 1e-6) {
        return { ...inputRoi };
    }

    // Calculate effective rotation
    // toScreen: rotate by degrees CW
    // toSource: rotate by -degrees CW
    const rot = direction === 'toScreen' ? degrees : -degrees;
    const rad = (rot * Math.PI) / 180;

    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Calculate ROI center
    const cx = inputRoi.x + inputRoi.width / 2;
    const cy = inputRoi.y + inputRoi.height / 2;

    // Translate to origin (center at 0.5, 0.5)
    const tx = cx - 0.5;
    const ty = cy - 0.5;

    // Apply rotation: x' = x*cos - y*sin, y' = x*sin + y*cos
    const rx = tx * cos - ty * sin;
    const ry = tx * sin + ty * cos;

    // Translate back
    const newCx = rx + 0.5;
    const newCy = ry + 0.5;

    // Calculate rotated bounding box dimensions
    const absCos = Math.abs(cos);
    const absSin = Math.abs(sin);
    const newW = inputRoi.width * absCos + inputRoi.height * absSin;
    const newH = inputRoi.width * absSin + inputRoi.height * absCos;

    return {
        ...inputRoi,
        x: newCx - newW / 2,
        y: newCy - newH / 2,
        width: newW,
        height: newH,
    };
};

// =============================================================================
// ROTATED DIMENSIONS
// =============================================================================

/**
 * Calculate the bounding box dimensions after rotation.
 *
 * @param width - Original width
 * @param height - Original height
 * @param degrees - Rotation in degrees
 * @returns Bounding box dimensions after rotation
 */
export const getRotatedDimensions = (
    width: number,
    height: number,
    degrees: number,
): { width: number; height: number } => {
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));

    return {
        width: width * cos + height * sin,
        height: width * sin + height * cos,
    };
};

// =============================================================================
// OVERLAY PROJECTION BUILDER
// =============================================================================

export interface BuildProjectionParams {
    /** Canvas dimensions in pixels */
    canvasWidth: number;
    canvasHeight: number;
    /** Capture/source frame dimensions in pixels */
    captureWidth: number;
    captureHeight: number;
    /** Optional ROI crop (in source space 0-1) */
    roi?: NormalizedRoi | null;
}

/**
 * Build an OverlayProjection from component parameters.
 *
 * This creates the projection object needed by the overlay renderer,
 * handling letterbox calculation and optional ROI cropping.
 *
 * **Note:** When ROI is enabled, the letterbox is still calculated from the full
 * capture aspect ratio. If you need letterboxing based on the ROI's aspect ratio
 * (e.g., when the canvas displays only the cropped region), build the projection
 * manually with the correct content aspect ratio. See `useCameraPipeline.ts` for
 * an example of correct ROI handling.
 */
export const buildOverlayProjection = (params: BuildProjectionParams): OverlayProjection => {
    const { canvasWidth, canvasHeight, captureWidth, captureHeight, roi } = params;

    // Calculate aspect ratios
    const contentAspect = captureWidth > 0 && captureHeight > 0 ? captureWidth / captureHeight : 1;
    const viewportAspect = canvasWidth > 0 && canvasHeight > 0 ? canvasWidth / canvasHeight : 1;

    // Build letterbox transform
    const letterbox = buildLetterboxTransform(contentAspect, viewportAspect);

    // Build crop rect from ROI if enabled
    const cropRect = roi?.enabled
        ? {
              x: roi.x,
              y: roi.y,
              width: roi.width,
              height: roi.height,
          }
        : undefined;

    return {
        canvasSize: { width: canvasWidth, height: canvasHeight },
        captureSize: { width: captureWidth, height: captureHeight },
        letterbox: {
            scaleX: letterbox.scaleX,
            scaleY: letterbox.scaleY,
            offsetX: letterbox.offsetX * canvasWidth,
            offsetY: letterbox.offsetY * canvasHeight,
        },
        cropRect,
    };
};

// =============================================================================
// POINT ROTATION
// =============================================================================

/**
 * Rotate a point around the center (0.5, 0.5) in normalized space.
 *
 * @param point - Point to rotate
 * @param radians - Rotation angle in radians
 * @returns Rotated point
 */
export const rotatePointAroundCenter = (
    point: { x: number; y: number },
    radians: number,
): { x: number; y: number } => {
    if (Math.abs(radians) < 1e-6) {
        return point;
    }

    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Translate to origin (center at 0.5, 0.5)
    const tx = point.x - 0.5;
    const ty = point.y - 0.5;

    // Rotate
    const rx = tx * cos - ty * sin;
    const ry = tx * sin + ty * cos;

    // Translate back
    return {
        x: rx + 0.5,
        y: ry + 0.5,
    };
};

/**
 * Create a point rotation function for a given angle.
 * Used for rotating blob positions in overlay rendering.
 *
 * @param degrees - Rotation in degrees
 * @returns Function that rotates points, or undefined if no rotation needed
 */
export const createPointRotator = (
    degrees: number,
): ((point: { x: number; y: number }) => { x: number; y: number }) | undefined => {
    const normDeg = ((degrees % 360) + 360) % 360;
    if (normDeg === 0) {
        return undefined;
    }

    const radians = (normDeg * Math.PI) / 180;
    return (point) => rotatePointAroundCenter(point, radians);
};
