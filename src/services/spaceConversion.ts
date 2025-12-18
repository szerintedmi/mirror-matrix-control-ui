/**
 * Coordinate Space Conversion Utilities
 *
 * Single source of truth for transformations between:
 * - Pattern Space (Isotropic): Square [-1,1]² where circles appear circular
 * - Centered Space (Anisotropic): Camera-normalized space where Y is scaled by aspect ratio
 *
 * The "Fit Width" strategy is used:
 * - Pattern X [-1, 1] maps directly to Centered X [-1, 1]
 * - Pattern Y is scaled by aspect ratio to preserve geometric shapes
 * - e.g., Pattern Y=1 maps to Centered Y=aspect (e.g., 1.77 for 16:9)
 */

import type { ArrayRotation, CalibrationProfile } from '@/types';
import { rotateVector, rotateVectorInverse } from '@/utils/arrayRotation';

/**
 * Parameters for space conversion operations.
 */
export interface SpaceConversionParams {
    /** Camera aspect ratio (width/height). Default: 16/9 */
    aspect: number;
    /** Array rotation in degrees (clockwise from camera view). Default: 0 */
    rotation: ArrayRotation;
}

/**
 * Extract space conversion params from a calibration profile.
 */
export function getSpaceParams(profile: CalibrationProfile): SpaceConversionParams {
    return {
        aspect: profile.calibrationCameraAspect ?? 16 / 9,
        rotation: profile.arrayRotation ?? 0,
    };
}

/**
 * Convert a point from isotropic pattern space [-1,1]² to camera-centered space.
 *
 * Applies:
 * 1. Array rotation (clockwise)
 * 2. Aspect ratio scaling on Y axis
 *
 * @param point - Point in isotropic pattern space
 * @param params - Conversion parameters (aspect, rotation)
 * @returns Point in camera-centered space
 */
export function patternToCentered(
    point: { x: number; y: number },
    params: SpaceConversionParams,
): { x: number; y: number } {
    // Apply rotation first (if any)
    const rotated = params.rotation === 0 ? point : rotateVector(point, params.rotation);

    // Scale Y by aspect ratio (Fit Width strategy)
    return {
        x: rotated.x,
        y: rotated.y * params.aspect,
    };
}

/**
 * Convert a point from camera-centered space to isotropic pattern space [-1,1]².
 *
 * Inverse of patternToCentered:
 * 1. Remove aspect ratio scaling from Y axis
 * 2. Apply inverse array rotation
 *
 * @param point - Point in camera-centered space
 * @param params - Conversion parameters (aspect, rotation)
 * @returns Point in isotropic pattern space
 */
export function centeredToPattern(
    point: { x: number; y: number },
    params: SpaceConversionParams,
): { x: number; y: number } {
    // Remove aspect ratio scaling first
    const unscaled = {
        x: point.x,
        y: point.y / params.aspect,
    };

    // Apply inverse rotation (counter-clockwise)
    return params.rotation === 0 ? unscaled : rotateVectorInverse(unscaled, params.rotation);
}

/**
 * Convert bounds from camera-centered space to isotropic pattern space.
 *
 * Used for displaying calibration bounds in pattern editors.
 * For rotated arrays, converts all 4 corners and returns the AABB.
 *
 * @param bounds - Bounds in camera-centered space
 * @param params - Conversion parameters (aspect, rotation)
 * @returns Bounds in isotropic pattern space
 */
export function centeredBoundsToPattern(
    bounds: { x: { min: number; max: number }; y: { min: number; max: number } },
    params: SpaceConversionParams,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
    // Convert all 4 corners of the bounds rectangle
    const corners = [
        { x: bounds.x.min, y: bounds.y.min },
        { x: bounds.x.max, y: bounds.y.min },
        { x: bounds.x.max, y: bounds.y.max },
        { x: bounds.x.min, y: bounds.y.max },
    ];

    const transformedCorners = corners.map((corner) => centeredToPattern(corner, params));

    // Take the axis-aligned bounding box (AABB)
    const xs = transformedCorners.map((p) => p.x);
    const ys = transformedCorners.map((p) => p.y);

    return {
        xMin: Math.min(...xs),
        xMax: Math.max(...xs),
        yMin: Math.min(...ys),
        yMax: Math.max(...ys),
    };
}
