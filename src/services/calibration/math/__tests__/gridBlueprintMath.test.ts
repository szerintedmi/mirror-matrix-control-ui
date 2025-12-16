// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { asCentered } from '@/coords';

import {
    computeStepScaleFromDisplacement,
    buildStepScale,
    computeAxisPitch,
    computeImpliedOrigin,
    computeGridOrigin,
    computeCameraOriginOffset,
    computeHomeOffset,
    computeAdjustedCenter,
} from '../gridBlueprintMath';

describe('gridBlueprintMath', () => {
    describe('computeStepScaleFromDisplacement', () => {
        it('should return null for null input', () => {
            expect(computeStepScaleFromDisplacement(null)).toBeNull();
        });

        it('should return null for undefined input', () => {
            expect(computeStepScaleFromDisplacement(undefined)).toBeNull();
        });

        it('should return null for zero perStep', () => {
            expect(computeStepScaleFromDisplacement(0)).toBeNull();
        });

        it('should return null for very small perStep (below epsilon)', () => {
            expect(computeStepScaleFromDisplacement(1e-10)).toBeNull();
        });

        it('should compute inverse for positive perStep', () => {
            expect(computeStepScaleFromDisplacement(0.001)).toBeCloseTo(1000);
            expect(computeStepScaleFromDisplacement(0.01)).toBeCloseTo(100);
        });

        it('should compute inverse for negative perStep', () => {
            expect(computeStepScaleFromDisplacement(-0.001)).toBeCloseTo(-1000);
        });
    });

    describe('buildStepScale', () => {
        it('should return null for undefined input', () => {
            expect(buildStepScale(undefined)).toBeNull();
        });

        it('should return null when both axes are null', () => {
            expect(buildStepScale({ x: null, y: null })).toBeNull();
        });

        it('should return partial result when one axis is null', () => {
            const result = buildStepScale({ x: 0.001, y: null });
            expect(result).toEqual({ x: 1000, y: null });
        });

        it('should return full result when both axes are valid', () => {
            const result = buildStepScale({ x: 0.001, y: -0.002 });
            expect(result?.x).toBeCloseTo(1000);
            expect(result?.y).toBeCloseTo(-500);
        });
    });

    describe('computeAxisPitch', () => {
        it('should return 0 for empty array', () => {
            expect(computeAxisPitch([])).toBe(0);
        });

        it('should return single value for single element', () => {
            expect(computeAxisPitch([0.15])).toBe(0.15);
        });

        it('should return median of odd-length array', () => {
            expect(computeAxisPitch([0.1, 0.2, 0.15])).toBe(0.15);
        });

        it('should return median of even-length array', () => {
            // For [0.1, 0.14, 0.16, 0.2], sorted: [0.1, 0.14, 0.16, 0.2]
            // median = (0.14 + 0.16) / 2 = 0.15
            expect(computeAxisPitch([0.1, 0.2, 0.14, 0.16])).toBeCloseTo(0.15);
        });

        it('should be robust to outliers', () => {
            // Median ignores outliers
            expect(computeAxisPitch([0.15, 0.16, 0.14, 0.5, 0.02])).toBe(0.15);
        });
    });

    describe('computeImpliedOrigin', () => {
        const spacing = { spacingX: 0.2, spacingY: 0.15 };
        const halfTile = { x: 0.08, y: 0.06 };

        it('should compute origin for tile at (0, 0)', () => {
            // Origin = tileCenter - (col * spacingX + halfTileX)
            // = (0.3, 0.2) - (0 * 0.2 + 0.08, 0 * 0.15 + 0.06)
            // = (0.3 - 0.08, 0.2 - 0.06) = (0.22, 0.14)
            const result = computeImpliedOrigin(
                asCentered(0.3, 0.2),
                { row: 0, col: 0 },
                spacing,
                halfTile,
            );
            expect(result.x).toBeCloseTo(0.22);
            expect(result.y).toBeCloseTo(0.14);
        });

        it('should compute origin for tile at (1, 2)', () => {
            // Origin = (0.7, 0.4) - (2 * 0.2 + 0.08, 1 * 0.15 + 0.06)
            // = (0.7 - 0.48, 0.4 - 0.21) = (0.22, 0.19)
            const result = computeImpliedOrigin(
                asCentered(0.7, 0.4),
                { row: 1, col: 2 },
                spacing,
                halfTile,
            );
            expect(result.x).toBeCloseTo(0.22);
            expect(result.y).toBeCloseTo(0.19);
        });
    });

    describe('computeGridOrigin', () => {
        it('should return (0, 0) for empty array', () => {
            const result = computeGridOrigin([]);
            expect(result).toEqual({ x: 0, y: 0 });
        });

        it('should return single point for single element', () => {
            const result = computeGridOrigin([{ x: 0.2, y: 0.3 }]);
            expect(result).toEqual({ x: 0.2, y: 0.3 });
        });

        it('should return median of multiple points', () => {
            const result = computeGridOrigin([
                { x: 0.1, y: 0.2 },
                { x: 0.3, y: 0.4 },
                { x: 0.2, y: 0.3 },
            ]);
            expect(result.x).toBeCloseTo(0.2);
            expect(result.y).toBeCloseTo(0.3);
        });

        it('should be robust to outliers', () => {
            const result = computeGridOrigin([
                { x: 0.2, y: 0.3 },
                { x: 0.21, y: 0.31 },
                { x: 0.19, y: 0.29 },
                { x: 0.5, y: 0.8 }, // outlier
            ]);
            // Median of X: [0.19, 0.2, 0.21, 0.5] -> (0.2 + 0.21)/2 = 0.205
            expect(result.x).toBeCloseTo(0.205);
        });
    });

    describe('computeCameraOriginOffset', () => {
        it('should compute offset to center the grid', () => {
            const result = computeCameraOriginOffset(
                { x: 0.1, y: 0.2 },
                { width: 0.6, height: 0.4 },
            );
            // offset = origin + totalSize / 2
            expect(result.x).toBeCloseTo(0.1 + 0.3);
            expect(result.y).toBeCloseTo(0.2 + 0.2);
        });

        it('should handle centered grid', () => {
            const result = computeCameraOriginOffset(
                { x: -0.3, y: -0.2 },
                { width: 0.6, height: 0.4 },
            );
            // offset = (-0.3 + 0.3, -0.2 + 0.2) = (0, 0)
            expect(result.x).toBeCloseTo(0);
            expect(result.y).toBeCloseTo(0);
        });
    });

    describe('computeHomeOffset', () => {
        it('should compute offset between measurement and adjusted center', () => {
            const result = computeHomeOffset(asCentered(0.52, 0.31), { x: 0.5, y: 0.3 });
            expect(result.dx).toBeCloseTo(0.02);
            expect(result.dy).toBeCloseTo(0.01);
        });

        it('should handle negative offsets', () => {
            const result = computeHomeOffset(asCentered(0.48, 0.28), { x: 0.5, y: 0.3 });
            expect(result.dx).toBeCloseTo(-0.02);
            expect(result.dy).toBeCloseTo(-0.02);
        });

        it('should handle zero offset', () => {
            const result = computeHomeOffset(asCentered(0.5, 0.3), { x: 0.5, y: 0.3 });
            expect(result.dx).toBe(0);
            expect(result.dy).toBe(0);
        });
    });

    describe('computeAdjustedCenter', () => {
        const spacing = { spacingX: 0.2, spacingY: 0.15 };
        const halfTile = { x: 0.08, y: 0.06 };

        it('should compute adjusted center for tile at (0, 0)', () => {
            // adjustedCenter = origin + (col * spacingX + halfTileX, row * spacingY + halfTileY)
            const result = computeAdjustedCenter(
                { x: 0.1, y: 0.2 },
                { row: 0, col: 0 },
                spacing,
                halfTile,
            );
            expect(result.x).toBeCloseTo(0.1 + 0.08);
            expect(result.y).toBeCloseTo(0.2 + 0.06);
        });

        it('should compute adjusted center for tile at (2, 3)', () => {
            // adjustedCenter = (0.1 + 3*0.2 + 0.08, 0.2 + 2*0.15 + 0.06)
            // = (0.1 + 0.6 + 0.08, 0.2 + 0.3 + 0.06) = (0.78, 0.56)
            const result = computeAdjustedCenter(
                { x: 0.1, y: 0.2 },
                { row: 2, col: 3 },
                spacing,
                halfTile,
            );
            expect(result.x).toBeCloseTo(0.78);
            expect(result.y).toBeCloseTo(0.56);
        });
    });

    describe('round-trip: implied origin -> adjusted center', () => {
        it('should produce consistent results when round-tripping', () => {
            const spacing = { spacingX: 0.2, spacingY: 0.15 };
            const halfTile = { x: 0.08, y: 0.06 };
            const gridPosition = { row: 1, col: 2 };
            const tileCenter = asCentered(0.5, 0.4);

            // Compute implied origin from tile position
            const impliedOrigin = computeImpliedOrigin(tileCenter, gridPosition, spacing, halfTile);

            // Compute adjusted center from that origin
            const adjustedCenter = computeAdjustedCenter(
                impliedOrigin,
                gridPosition,
                spacing,
                halfTile,
            );

            // Should match original tile center
            expect(adjustedCenter.x).toBeCloseTo(tileCenter.x);
            expect(adjustedCenter.y).toBeCloseTo(tileCenter.y);
        });
    });
});
