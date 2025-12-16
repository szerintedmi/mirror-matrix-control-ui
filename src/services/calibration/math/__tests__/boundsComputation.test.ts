import { describe, it, expect } from 'vitest';

import { computeAxisBounds, computeTileBounds, computeLiveTileBounds } from '../boundsComputation';

describe('boundsComputation', () => {
    describe('computeAxisBounds', () => {
        it('returns null when center is null', () => {
            expect(computeAxisBounds(null, 0, 0.001)).toBeNull();
        });

        it('returns null when centerSteps is null', () => {
            expect(computeAxisBounds(0, null, 0.001)).toBeNull();
        });

        it('returns null when perStep is null', () => {
            expect(computeAxisBounds(0, 0, null)).toBeNull();
        });

        it('returns null when perStep is below epsilon (1e-9)', () => {
            expect(computeAxisBounds(0, 0, 1e-10)).toBeNull();
        });

        it('computes bounds for positive displacement', () => {
            const center = 0;
            const centerSteps = 0;
            const perStep = 0.001; // positive: larger steps = larger position

            const bounds = computeAxisBounds(center, centerSteps, perStep);

            expect(bounds).not.toBeNull();
            // At step 0, moving to MIN (-1200) gives center + (-1200) * 0.001 = -1.2 -> clamped to -1
            // At step 0, moving to MAX (1200) gives center + (1200) * 0.001 = 1.2 -> clamped to 1
            expect(bounds!.min).toBe(-1);
            expect(bounds!.max).toBe(1);
        });

        it('computes bounds for negative displacement', () => {
            const center = 0;
            const centerSteps = 0;
            const perStep = -0.001; // negative: larger steps = smaller position

            const bounds = computeAxisBounds(center, centerSteps, perStep);

            expect(bounds).not.toBeNull();
            // With negative perStep, min/max are swapped
            expect(bounds!.min).toBe(-1);
            expect(bounds!.max).toBe(1);
        });

        it('computes bounds when motor is at non-zero position', () => {
            const center = 0.2;
            const centerSteps = 600; // halfway between 0 and max
            const perStep = 0.001;

            const bounds = computeAxisBounds(center, centerSteps, perStep);

            expect(bounds).not.toBeNull();
            // From 600, delta to MIN = -1200 - 600 = -1800, position = 0.2 + (-1800 * 0.001) = -1.6 -> -1
            // From 600, delta to MAX = 1200 - 600 = 600, position = 0.2 + (600 * 0.001) = 0.8
            expect(bounds!.min).toBe(-1);
            expect(bounds!.max).toBeCloseTo(0.8, 5);
        });

        it('clamps bounds to normalized range [-1, 1]', () => {
            const center = 0.5;
            const centerSteps = 0;
            const perStep = 0.002; // large displacement

            const bounds = computeAxisBounds(center, centerSteps, perStep);

            expect(bounds).not.toBeNull();
            expect(bounds!.min).toBeGreaterThanOrEqual(-1);
            expect(bounds!.max).toBeLessThanOrEqual(1);
        });
    });

    describe('computeTileBounds', () => {
        it('returns null when adjustedHome is null', () => {
            expect(computeTileBounds(null, { x: 0.001, y: -0.001 })).toBeNull();
        });

        it('returns null when X stepToDisplacement is null', () => {
            const result = computeTileBounds(
                { x: 0, y: 0, stepsX: 0, stepsY: 0 },
                { x: null, y: 0.001 },
            );
            expect(result).toBeNull();
        });

        it('returns null when Y stepToDisplacement is null', () => {
            const result = computeTileBounds(
                { x: 0, y: 0, stepsX: 0, stepsY: 0 },
                { x: 0.001, y: null },
            );
            expect(result).toBeNull();
        });

        it('returns null when X stepsX is null', () => {
            const result = computeTileBounds(
                { x: 0, y: 0, stepsX: null, stepsY: 0 },
                { x: 0.001, y: 0.001 },
            );
            expect(result).toBeNull();
        });

        it('computes bounds for both axes', () => {
            const adjustedHome = { x: 0, y: 0.1, stepsX: 0, stepsY: 200 };
            const stepToDisplacement = { x: 0.0005, y: -0.0008 };

            const bounds = computeTileBounds(adjustedHome, stepToDisplacement);

            expect(bounds).not.toBeNull();
            expect(bounds!.x).toHaveProperty('min');
            expect(bounds!.x).toHaveProperty('max');
            expect(bounds!.y).toHaveProperty('min');
            expect(bounds!.y).toHaveProperty('max');
        });
    });

    describe('computeLiveTileBounds', () => {
        it('returns null when X stepToDisplacement is null', () => {
            const result = computeLiveTileBounds({ x: 0, y: 0 }, { x: null, y: 0.001 });
            expect(result).toBeNull();
        });

        it('returns null when Y stepToDisplacement is null', () => {
            const result = computeLiveTileBounds({ x: 0, y: 0 }, { x: 0.001, y: null });
            expect(result).toBeNull();
        });

        it('computes bounds assuming motor at step 0', () => {
            const homePosition = { x: 0.1, y: -0.2 };
            const stepToDisplacement = { x: 0.0005, y: -0.0008 };

            const bounds = computeLiveTileBounds(homePosition, stepToDisplacement);

            expect(bounds).not.toBeNull();

            // For X: center=0.1, steps=0, perStep=0.0005
            // min = 0.1 + (-1200) * 0.0005 = 0.1 - 0.6 = -0.5
            // max = 0.1 + (1200) * 0.0005 = 0.1 + 0.6 = 0.7
            expect(bounds!.x.min).toBeCloseTo(-0.5, 5);
            expect(bounds!.x.max).toBeCloseTo(0.7, 5);

            // For Y: center=-0.2, steps=0, perStep=-0.0008
            // candidateA = -0.2 + (-1200) * (-0.0008) = -0.2 + 0.96 = 0.76
            // candidateB = -0.2 + (1200) * (-0.0008) = -0.2 - 0.96 = -1 (clamped)
            // min = min(0.76, -1) = -1
            // max = max(0.76, -1) = 0.76
            expect(bounds!.y.min).toBeCloseTo(-1, 5);
            expect(bounds!.y.max).toBeCloseTo(0.76, 5);
        });

        it('matches computeTileBounds when steps are 0', () => {
            const position = { x: 0.15, y: -0.08 };
            const stepToDisplacement = { x: 0.0004, y: -0.0006 };

            const liveBounds = computeLiveTileBounds(position, stepToDisplacement);
            const tileBounds = computeTileBounds(
                { x: position.x, y: position.y, stepsX: 0, stepsY: 0 },
                stepToDisplacement,
            );

            expect(liveBounds).toEqual(tileBounds);
        });
    });
});
