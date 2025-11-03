import { describe, expect, it } from 'vitest';

import {
    calculateDisplayIntensity,
    calculateNormalizedIntensity,
    intensityToFill,
    intensityToStroke,
} from '../patternIntensity';

describe('patternIntensity helpers', () => {
    it('returns zero normalized intensity when counts are invalid', () => {
        expect(calculateNormalizedIntensity(0, 5)).toBe(0);
        expect(calculateNormalizedIntensity(2, 0)).toBe(0);
        expect(calculateNormalizedIntensity(-1, 3)).toBe(0);
    });

    it('returns full normalized intensity when max overlap is one', () => {
        expect(calculateNormalizedIntensity(1, 1)).toBe(1);
    });

    it('scales normalized intensity linearly when max overlap > 1', () => {
        expect(calculateNormalizedIntensity(1, 5)).toBeCloseTo(0);
        expect(calculateNormalizedIntensity(3, 5)).toBeCloseTo(0.5);
        expect(calculateNormalizedIntensity(5, 5)).toBeCloseTo(1);
    });

    it('maps display intensity within configured range', () => {
        const minIntensity = calculateDisplayIntensity(1, 5);
        const midIntensity = calculateDisplayIntensity(3, 5);
        const maxIntensity = calculateDisplayIntensity(5, 5);

        expect(minIntensity).toBeLessThan(midIntensity);
        expect(midIntensity).toBeLessThan(maxIntensity);
        expect(maxIntensity).toBeLessThanOrEqual(1);
    });

    it('provides rgba strings for fill and stroke', () => {
        expect(intensityToFill(0.5)).toMatch(/^rgba\(248, 250, 252, 0\.\d{3}\)$/);
        expect(intensityToStroke(0.5)).toMatch(/^rgba\(226, 232, 240, 0\.\d{3}\)$/);
    });
});
