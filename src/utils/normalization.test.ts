// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
    normalizeIsotropic,
    denormalizeIsotropic,
    normalizeIsotropicDelta,
    denormalizeIsotropicDelta,
    viewportToIsotropic,
    viewportToPixels,
} from './normalization';

describe('normalization', () => {
    describe('normalizeIsotropic', () => {
        it('should normalize correctly for 1:1 aspect ratio', () => {
            const result = normalizeIsotropic(50, 50, 100, 100);
            expect(result.x).toBe(0.5);
            expect(result.y).toBe(0.5);
        });

        it('should normalize correctly for wide aspect ratio', () => {
            // 200x100 image. Max dim is 200.
            // OffsetX = 0, OffsetY = (200-100)/2 = 50.
            // Point (0, 0) -> (0+0)/200, (0+50)/200 -> 0, 0.25
            const result = normalizeIsotropic(0, 0, 200, 100);
            expect(result.x).toBe(0);
            expect(result.y).toBe(0.25);

            // Point (200, 100) -> (200+0)/200, (100+50)/200 -> 1, 0.75
            const result2 = normalizeIsotropic(200, 100, 200, 100);
            expect(result2.x).toBe(1);
            expect(result2.y).toBe(0.75);
        });

        it('should normalize correctly for tall aspect ratio', () => {
            // 100x200 image. Max dim is 200.
            // OffsetX = 50, OffsetY = 0.
            // Point (0, 0) -> (0+50)/200, (0+0)/200 -> 0.25, 0
            const result = normalizeIsotropic(0, 0, 100, 200);
            expect(result.x).toBe(0.25);
            expect(result.y).toBe(0);
        });
    });

    describe('denormalizeIsotropic', () => {
        it('should reverse normalization for wide aspect ratio', () => {
            const width = 200;
            const height = 100;
            const x = 50;
            const y = 25;

            const normalized = normalizeIsotropic(x, y, width, height);
            const denormalized = denormalizeIsotropic(normalized.x, normalized.y, width, height);

            expect(denormalized.x).toBeCloseTo(x);
            expect(denormalized.y).toBeCloseTo(y);
        });
    });

    describe('normalizeIsotropicDelta', () => {
        it('should normalize size based on max dimension', () => {
            expect(normalizeIsotropicDelta(50, 200, 100)).toBe(0.25);
            expect(normalizeIsotropicDelta(50, 100, 200)).toBe(0.25);
        });
    });

    describe('denormalizeIsotropicDelta', () => {
        it('should denormalize size based on max dimension', () => {
            expect(denormalizeIsotropicDelta(0.25, 200, 100)).toBe(50);
        });
    });

    describe('viewportToIsotropic', () => {
        it('should convert center correctly for any aspect ratio', () => {
            // Center should always map to center
            const result1 = viewportToIsotropic(0.5, 0.5, 1920, 1080);
            expect(result1.x).toBeCloseTo(0.5);
            expect(result1.y).toBeCloseTo(0.5);

            const result2 = viewportToIsotropic(0.5, 0.5, 100, 100);
            expect(result2.x).toBeCloseTo(0.5);
            expect(result2.y).toBeCloseTo(0.5);
        });

        it('should convert top-left for 16:9 aspect ratio', () => {
            // 1920x1080: maxDim=1920, offsetY=(1920-1080)/2=420
            // Viewport (0, 0) -> pixel (0, 0) -> isotropic ((0+0)/1920, (0+420)/1920)
            // = (0, 0.21875)
            const result = viewportToIsotropic(0, 0, 1920, 1080);
            expect(result.x).toBeCloseTo(0);
            expect(result.y).toBeCloseTo(420 / 1920);
        });

        it('should convert bottom-right for 16:9 aspect ratio', () => {
            // Viewport (1, 1) -> pixel (1920, 1080) -> isotropic ((1920+0)/1920, (1080+420)/1920)
            // = (1, 0.78125)
            const result = viewportToIsotropic(1, 1, 1920, 1080);
            expect(result.x).toBeCloseTo(1);
            expect(result.y).toBeCloseTo((1080 + 420) / 1920);
        });

        it('should be compatible with denormalizeIsotropic for round-trip', () => {
            // Convert viewport to isotropic, then denormalize back to pixels
            // Should give us the original viewport position in pixel coords
            const width = 1920;
            const height = 1080;
            const viewportX = 0.25;
            const viewportY = 0.75;

            const iso = viewportToIsotropic(viewportX, viewportY, width, height);
            const pixels = denormalizeIsotropic(iso.x, iso.y, width, height);

            // Should match viewport * dimension
            expect(pixels.x).toBeCloseTo(viewportX * width);
            expect(pixels.y).toBeCloseTo(viewportY * height);
        });
    });

    describe('viewportToPixels', () => {
        it('should convert viewport to pixels with simple linear mapping', () => {
            const result = viewportToPixels(0.5, 0.5, 1920, 1080);
            expect(result.x).toBe(960);
            expect(result.y).toBe(540);
        });

        it('should handle corners correctly', () => {
            expect(viewportToPixels(0, 0, 1920, 1080)).toEqual({ x: 0, y: 0 });
            expect(viewportToPixels(1, 1, 1920, 1080)).toEqual({ x: 1920, y: 1080 });
        });
    });
});
