// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
    // Constructors
    asCameraPixels,
    asIsotropic,
    asViewport,
    asCentered,
    asViewportDelta,
    // Viewport <-> Centered
    viewportToCentered,
    centeredToViewport,
    viewportDeltaToCentered,
    centeredDeltaToViewport,
    // Viewport <-> Pixels
    viewportToPixels,
    pixelsToViewport,
    // Pixels <-> Isotropic
    pixelsToIsotropic,
    isotropicToPixels,
    // Viewport <-> Isotropic
    viewportToIsotropic,
    isotropicToViewport,
    viewportDeltaToIsotropic,
    // Isotropic <-> Centered
    isotropicToCentered,
    centeredToIsotropic,
    // Utilities
    rawCoords,
    distance,
    type CameraInfo,
} from '../coordinates';

describe('coordinates', () => {
    // Common camera configurations for testing
    const camera16x9: CameraInfo = { width: 1920, height: 1080 };
    const camera4x3: CameraInfo = { width: 1600, height: 1200 };
    const cameraSquare: CameraInfo = { width: 1000, height: 1000 };

    describe('Viewport <-> Centered conversions', () => {
        it('should convert viewport center to centered center', () => {
            const viewport = asViewport(0.5, 0.5);
            const centered = viewportToCentered(viewport);
            expect(centered.x).toBeCloseTo(0);
            expect(centered.y).toBeCloseTo(0);
        });

        it('should convert viewport corners to centered corners', () => {
            // Top-left
            const topLeft = viewportToCentered(asViewport(0, 0));
            expect(topLeft.x).toBeCloseTo(-1);
            expect(topLeft.y).toBeCloseTo(-1);

            // Bottom-right
            const bottomRight = viewportToCentered(asViewport(1, 1));
            expect(bottomRight.x).toBeCloseTo(1);
            expect(bottomRight.y).toBeCloseTo(1);
        });

        it('should round-trip viewport -> centered -> viewport', () => {
            const original = asViewport(0.25, 0.75);
            const centered = viewportToCentered(original);
            const result = centeredToViewport(centered);
            expect(result.x).toBeCloseTo(original.x);
            expect(result.y).toBeCloseTo(original.y);
        });

        it('should convert deltas correctly', () => {
            const viewportDelta = asViewportDelta(0.1);
            const centeredDelta = viewportDeltaToCentered(viewportDelta);
            expect(centeredDelta as number).toBeCloseTo(0.2); // viewport * 2

            const backToViewport = centeredDeltaToViewport(centeredDelta);
            expect(backToViewport as number).toBeCloseTo(0.1);
        });
    });

    describe('Viewport <-> Pixels conversions', () => {
        it('should convert viewport center to pixel center', () => {
            const viewport = asViewport(0.5, 0.5);
            const pixels = viewportToPixels(viewport, camera16x9);
            expect(pixels.x).toBeCloseTo(960);
            expect(pixels.y).toBeCloseTo(540);
        });

        it('should convert viewport corners to pixel corners', () => {
            const topLeft = viewportToPixels(asViewport(0, 0), camera16x9);
            expect(topLeft.x).toBe(0);
            expect(topLeft.y).toBe(0);

            const bottomRight = viewportToPixels(asViewport(1, 1), camera16x9);
            expect(bottomRight.x).toBe(1920);
            expect(bottomRight.y).toBe(1080);
        });

        it('should round-trip viewport -> pixels -> viewport', () => {
            const original = asViewport(0.3, 0.7);
            const pixels = viewportToPixels(original, camera16x9);
            const result = pixelsToViewport(pixels, camera16x9);
            expect(result.x).toBeCloseTo(original.x);
            expect(result.y).toBeCloseTo(original.y);
        });
    });

    describe('Pixels <-> Isotropic conversions', () => {
        it('should convert pixel center to isotropic center for any aspect ratio', () => {
            // 16:9 camera
            const pixels16x9 = asCameraPixels(960, 540);
            const iso16x9 = pixelsToIsotropic(pixels16x9, camera16x9);
            expect(iso16x9.x).toBeCloseTo(0.5);
            expect(iso16x9.y).toBeCloseTo(0.5);

            // Square camera
            const pixelsSquare = asCameraPixels(500, 500);
            const isoSquare = pixelsToIsotropic(pixelsSquare, cameraSquare);
            expect(isoSquare.x).toBeCloseTo(0.5);
            expect(isoSquare.y).toBeCloseTo(0.5);
        });

        it('should apply letterbox offset for 16:9', () => {
            // For 1920x1080: maxDim=1920, offsetY=(1920-1080)/2=420
            // Top-left pixel (0,0) -> isotropic (0/1920, (0+420)/1920) = (0, 0.21875)
            const topLeft = pixelsToIsotropic(asCameraPixels(0, 0), camera16x9);
            expect(topLeft.x).toBeCloseTo(0);
            expect(topLeft.y).toBeCloseTo(420 / 1920);

            // Bottom-right pixel (1920, 1080) -> isotropic (1920/1920, (1080+420)/1920) = (1, 0.78125)
            const bottomRight = pixelsToIsotropic(asCameraPixels(1920, 1080), camera16x9);
            expect(bottomRight.x).toBeCloseTo(1);
            expect(bottomRight.y).toBeCloseTo(1500 / 1920);
        });

        it('should round-trip pixels -> isotropic -> pixels', () => {
            const original = asCameraPixels(480, 270);
            const iso = pixelsToIsotropic(original, camera16x9);
            const result = isotropicToPixels(iso, camera16x9);
            expect(result.x).toBeCloseTo(original.x);
            expect(result.y).toBeCloseTo(original.y);
        });

        it('should round-trip for 4:3 aspect ratio', () => {
            const original = asCameraPixels(800, 600);
            const iso = pixelsToIsotropic(original, camera4x3);
            const result = isotropicToPixels(iso, camera4x3);
            expect(result.x).toBeCloseTo(original.x);
            expect(result.y).toBeCloseTo(original.y);
        });
    });

    describe('Viewport <-> Isotropic conversions', () => {
        it('should preserve center for any aspect ratio', () => {
            const viewport = asViewport(0.5, 0.5);

            const iso16x9 = viewportToIsotropic(viewport, camera16x9);
            expect(iso16x9.x).toBeCloseTo(0.5);
            expect(iso16x9.y).toBeCloseTo(0.5);

            const isoSquare = viewportToIsotropic(viewport, cameraSquare);
            expect(isoSquare.x).toBeCloseTo(0.5);
            expect(isoSquare.y).toBeCloseTo(0.5);
        });

        it('should correctly transform viewport corners for 16:9', () => {
            // Viewport (0,0) = top-left of video = pixel (0,0)
            // In isotropic: (0, 420/1920) = (0, 0.21875)
            const topLeft = viewportToIsotropic(asViewport(0, 0), camera16x9);
            expect(topLeft.x).toBeCloseTo(0);
            expect(topLeft.y).toBeCloseTo(420 / 1920);

            // Viewport (1,1) = bottom-right = pixel (1920, 1080)
            // In isotropic: (1, 1500/1920) = (1, 0.78125)
            const bottomRight = viewportToIsotropic(asViewport(1, 1), camera16x9);
            expect(bottomRight.x).toBeCloseTo(1);
            expect(bottomRight.y).toBeCloseTo(1500 / 1920);
        });

        it('should round-trip viewport -> isotropic -> viewport', () => {
            const original = asViewport(0.25, 0.75);
            const iso = viewportToIsotropic(original, camera16x9);
            const result = isotropicToViewport(iso, camera16x9);
            expect(result.x).toBeCloseTo(original.x);
            expect(result.y).toBeCloseTo(original.y);
        });

        it('should convert deltas approximately correctly', () => {
            // For 16:9, maxDim=1920, avgDim=1500
            // viewport delta 0.1 -> pixel delta varies by axis
            // Approximation uses average: 0.1 * 1500 / 1920 ≈ 0.078
            const delta = asViewportDelta(0.1);
            const isoDelta = viewportDeltaToIsotropic(delta, camera16x9);
            expect(isoDelta as number).toBeCloseTo((0.1 * 1500) / 1920);
        });
    });

    describe('Isotropic <-> Centered conversions', () => {
        it('should convert isotropic center to centered center', () => {
            const iso = asIsotropic(0.5, 0.5);
            const centered = isotropicToCentered(iso);
            expect(centered.x).toBeCloseTo(0);
            expect(centered.y).toBeCloseTo(0);
        });

        it('should convert isotropic corners to centered corners', () => {
            const topLeft = isotropicToCentered(asIsotropic(0, 0));
            expect(topLeft.x).toBeCloseTo(-1);
            expect(topLeft.y).toBeCloseTo(-1);

            const bottomRight = isotropicToCentered(asIsotropic(1, 1));
            expect(bottomRight.x).toBeCloseTo(1);
            expect(bottomRight.y).toBeCloseTo(1);
        });

        it('should round-trip isotropic -> centered -> isotropic', () => {
            const original = asIsotropic(0.3, 0.7);
            const centered = isotropicToCentered(original);
            const result = centeredToIsotropic(centered);
            expect(result.x).toBeCloseTo(original.x);
            expect(result.y).toBeCloseTo(original.y);
        });
    });

    describe('Complex multi-step conversions', () => {
        it('should correctly chain viewport -> isotropic -> centered', () => {
            // Viewport center (0.5, 0.5)
            // -> Isotropic center (0.5, 0.5)
            // -> Centered center (0, 0)
            const viewport = asViewport(0.5, 0.5);
            const iso = viewportToIsotropic(viewport, camera16x9);
            const centered = isotropicToCentered(iso);
            expect(centered.x).toBeCloseTo(0);
            expect(centered.y).toBeCloseTo(0);
        });

        it('should correctly chain centered -> isotropic -> viewport', () => {
            // Centered center (0, 0)
            // -> Isotropic center (0.5, 0.5)
            // -> Viewport center (0.5, 0.5)
            const centered = asCentered(0, 0);
            const iso = centeredToIsotropic(centered);
            const viewport = isotropicToViewport(iso, camera16x9);
            expect(viewport.x).toBeCloseTo(0.5);
            expect(viewport.y).toBeCloseTo(0.5);
        });

        it('should handle full round-trip viewport -> iso -> centered -> iso -> viewport', () => {
            const original = asViewport(0.15, 0.85);
            const iso1 = viewportToIsotropic(original, camera16x9);
            const centered = isotropicToCentered(iso1);
            const iso2 = centeredToIsotropic(centered);
            const result = isotropicToViewport(iso2, camera16x9);
            expect(result.x).toBeCloseTo(original.x);
            expect(result.y).toBeCloseTo(original.y);
        });
    });

    describe('Utility functions', () => {
        it('rawCoords should extract x,y from any coordinate type', () => {
            const viewport = asViewport(0.3, 0.7);
            const raw = rawCoords(viewport);
            expect(raw.x).toBe(0.3);
            expect(raw.y).toBe(0.7);

            const centered = asCentered(-0.5, 0.5);
            const rawCentered = rawCoords(centered);
            expect(rawCentered.x).toBe(-0.5);
            expect(rawCentered.y).toBe(0.5);
        });

        it('distance should calculate Euclidean distance', () => {
            const a = asViewport(0, 0);
            const b = asViewport(3, 4);
            expect(distance(a, b)).toBeCloseTo(5);

            const c = asCentered(-1, 0);
            const d = asCentered(1, 0);
            expect(distance(c, d)).toBeCloseTo(2);
        });
    });

    describe('Edge cases', () => {
        it('should handle values at boundaries', () => {
            // Viewport 0 and 1
            const v0 = centeredToViewport(asCentered(-1, -1));
            expect(v0.x).toBeCloseTo(0);
            expect(v0.y).toBeCloseTo(0);

            const v1 = centeredToViewport(asCentered(1, 1));
            expect(v1.x).toBeCloseTo(1);
            expect(v1.y).toBeCloseTo(1);
        });

        it('should clamp isotropic values to [0,1]', () => {
            // Negative pixel coords
            const negPixels = asCameraPixels(-100, -50);
            const iso = pixelsToIsotropic(negPixels, camera16x9);
            expect(iso.x).toBe(0); // clamped
            expect(iso.y).toBeGreaterThanOrEqual(0); // may be clamped depending on offset
        });

        it('should handle square aspect ratio (no letterboxing)', () => {
            const pixels = asCameraPixels(250, 250);
            const iso = pixelsToIsotropic(pixels, cameraSquare);
            // For square: no offset, so iso = pixels / maxDim
            expect(iso.x).toBeCloseTo(0.25);
            expect(iso.y).toBeCloseTo(0.25);

            const viewport = asViewport(0.25, 0.25);
            const isoFromViewport = viewportToIsotropic(viewport, cameraSquare);
            expect(isoFromViewport.x).toBeCloseTo(0.25);
            expect(isoFromViewport.y).toBeCloseTo(0.25);
        });
    });
});
