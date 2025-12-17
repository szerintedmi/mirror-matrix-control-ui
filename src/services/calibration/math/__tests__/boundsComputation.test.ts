import { describe, it, expect } from 'vitest';

import {
    computeAxisBounds,
    computeTileBounds,
    computeLiveTileBounds,
    mergeBoundsIntersection,
    mergeBoundsUnion,
    mergeWithBlueprintFootprint,
} from '../boundsComputation';

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

    describe('mergeBoundsIntersection', () => {
        it('returns a copy of candidate when current is null', () => {
            const candidate = { x: { min: -0.5, max: 0.5 }, y: { min: -0.3, max: 0.3 } };
            const result = mergeBoundsIntersection(null, candidate);

            expect(result).toEqual(candidate);
            // Verify it's a copy, not the same reference
            expect(result).not.toBe(candidate);
        });

        it('computes intersection when bounds overlap', () => {
            const current = { x: { min: -0.8, max: 0.4 }, y: { min: -0.6, max: 0.6 } };
            const candidate = { x: { min: -0.3, max: 0.7 }, y: { min: -0.2, max: 0.8 } };

            const result = mergeBoundsIntersection(current, candidate);

            expect(result).toEqual({
                x: { min: -0.3, max: 0.4 }, // intersection of [-0.8, 0.4] and [-0.3, 0.7]
                y: { min: -0.2, max: 0.6 }, // intersection of [-0.6, 0.6] and [-0.2, 0.8]
            });
        });

        it('returns null when no overlap on X axis', () => {
            const current = { x: { min: -0.8, max: -0.2 }, y: { min: -0.5, max: 0.5 } };
            const candidate = { x: { min: 0.3, max: 0.9 }, y: { min: -0.3, max: 0.3 } };

            const result = mergeBoundsIntersection(current, candidate);

            expect(result).toBeNull();
        });

        it('returns null when no overlap on Y axis', () => {
            const current = { x: { min: -0.5, max: 0.5 }, y: { min: 0.5, max: 0.9 } };
            const candidate = { x: { min: -0.3, max: 0.3 }, y: { min: -0.8, max: -0.2 } };

            const result = mergeBoundsIntersection(current, candidate);

            expect(result).toBeNull();
        });

        it('handles edge-case where bounds touch at a single point', () => {
            const current = { x: { min: -0.5, max: 0.0 }, y: { min: -0.5, max: 0.5 } };
            const candidate = { x: { min: 0.0, max: 0.5 }, y: { min: -0.3, max: 0.3 } };

            const result = mergeBoundsIntersection(current, candidate);

            // At exactly 0, they touch - intersection is degenerate but valid
            expect(result).toEqual({
                x: { min: 0.0, max: 0.0 },
                y: { min: -0.3, max: 0.3 },
            });
        });
    });

    describe('mergeBoundsUnion', () => {
        it('returns a copy of candidate when current is null', () => {
            const candidate = { x: { min: -0.5, max: 0.5 }, y: { min: -0.3, max: 0.3 } };
            const result = mergeBoundsUnion(null, candidate);

            expect(result).toEqual(candidate);
            // Verify it's a copy, not the same reference
            expect(result).not.toBe(candidate);
        });

        it('computes union envelope of overlapping bounds', () => {
            const current = { x: { min: -0.8, max: 0.4 }, y: { min: -0.6, max: 0.6 } };
            const candidate = { x: { min: -0.3, max: 0.7 }, y: { min: -0.2, max: 0.8 } };

            const result = mergeBoundsUnion(current, candidate);

            expect(result).toEqual({
                x: { min: -0.8, max: 0.7 }, // union of [-0.8, 0.4] and [-0.3, 0.7]
                y: { min: -0.6, max: 0.8 }, // union of [-0.6, 0.6] and [-0.2, 0.8]
            });
        });

        it('computes union envelope of disjoint bounds', () => {
            const current = { x: { min: -0.9, max: -0.5 }, y: { min: -0.9, max: -0.5 } };
            const candidate = { x: { min: 0.5, max: 0.9 }, y: { min: 0.5, max: 0.9 } };

            const result = mergeBoundsUnion(current, candidate);

            expect(result).toEqual({
                x: { min: -0.9, max: 0.9 },
                y: { min: -0.9, max: 0.9 },
            });
        });

        it('returns current when candidate is contained within', () => {
            const current = { x: { min: -0.8, max: 0.8 }, y: { min: -0.8, max: 0.8 } };
            const candidate = { x: { min: -0.2, max: 0.2 }, y: { min: -0.2, max: 0.2 } };

            const result = mergeBoundsUnion(current, candidate);

            expect(result).toEqual(current);
        });
    });

    describe('mergeWithBlueprintFootprint', () => {
        const blueprint = {
            adjustedTileFootprint: { width: 0.2, height: 0.2 },
            tileGap: { x: 0.05, y: 0.05 },
            gridOrigin: { x: -0.5, y: -0.5 },
            cameraOriginOffset: { x: 0, y: 0 },
            sourceWidth: 1920,
            sourceHeight: 1080,
        };

        it('returns bounds unchanged when blueprint is null', () => {
            const bounds = { x: { min: -0.5, max: 0.5 }, y: { min: -0.3, max: 0.3 } };
            const result = mergeWithBlueprintFootprint(bounds, null, 0, 0);

            expect(result).toEqual(bounds);
        });

        it('returns null when both bounds and blueprint are null', () => {
            const result = mergeWithBlueprintFootprint(null, null, 0, 0);

            expect(result).toBeNull();
        });

        it('returns footprint when bounds is null', () => {
            const result = mergeWithBlueprintFootprint(null, blueprint, 0, 0);

            expect(result).not.toBeNull();
            // The footprint should have valid x and y ranges
            expect(result!.x.min).toBeLessThan(result!.x.max);
            expect(result!.y.min).toBeLessThan(result!.y.max);
        });

        it('computes union of bounds and footprint', () => {
            // Small bounds that don't cover the footprint
            const bounds = { x: { min: 0.1, max: 0.2 }, y: { min: 0.1, max: 0.2 } };
            const result = mergeWithBlueprintFootprint(bounds, blueprint, 0, 0);

            expect(result).not.toBeNull();
            // The result should be at least as large as the bounds
            expect(result!.x.min).toBeLessThanOrEqual(bounds.x.min);
            expect(result!.x.max).toBeGreaterThanOrEqual(bounds.x.max);
        });

        it('uses row and col for footprint position', () => {
            const result00 = mergeWithBlueprintFootprint(null, blueprint, 0, 0);
            const result11 = mergeWithBlueprintFootprint(null, blueprint, 1, 1);

            expect(result00).not.toBeNull();
            expect(result11).not.toBeNull();
            // Different grid positions should produce different footprints
            expect(result11!.x.min).toBeGreaterThan(result00!.x.min);
            expect(result11!.y.min).toBeGreaterThan(result00!.y.min);
        });
    });
});
