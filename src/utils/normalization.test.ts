// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
    normalizeIsotropic,
    denormalizeIsotropic,
    normalizeIsotropicDelta,
    denormalizeIsotropicDelta,
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
});
