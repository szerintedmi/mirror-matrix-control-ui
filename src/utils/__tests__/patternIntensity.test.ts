// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { TILE_PLACEMENT_UNIT } from '../../constants/pattern';
import {
    calculateDisplayIntensity,
    calculateNormalizedIntensity,
    computeCanvasCoverage,
    rasterizeTileCoverage,
    mapTileIntensitiesFromCoverage,
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

    it('maps display intensity within configured range with adaptive scaling', () => {
        const single = calculateDisplayIntensity(1, 1);
        const low = calculateDisplayIntensity(1, 10);
        const mid = calculateDisplayIntensity(4, 10);
        const max = calculateDisplayIntensity(10, 10);

        expect(single).toBeLessThanOrEqual(1);
        expect(single).toBeGreaterThan(0.9);
        expect(low).toBeGreaterThan(0.19);
        expect(mid).toBeGreaterThan(low);
        expect(mid).toBeLessThan(max);
        expect(max).toBeGreaterThan(0.9);
    });

    it('provides rgba strings for fill and stroke', () => {
        expect(intensityToFill(0.5)).toMatch(/^rgba\(248, 250, 252, 0\.\d{3}\)$/);
        expect(intensityToStroke(0.5)).toMatch(/^rgba\(226, 232, 240, 0\.\d{3}\)$/);
    });

    it('computes coverage for stacked tiles in snap mode', () => {
        const tiles = [
            {
                centerX: TILE_PLACEMENT_UNIT * 0.5,
                centerY: TILE_PLACEMENT_UNIT * 0.5,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
            {
                centerX: TILE_PLACEMENT_UNIT * 0.5,
                centerY: TILE_PLACEMENT_UNIT * 0.5,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
        ];
        const coverage = computeCanvasCoverage(tiles, 2, 2);
        expect(coverage.maxCount).toBe(2);
        expect(coverage.cells).toHaveLength(1);
        expect(coverage.cells[0]).toMatchObject({ row: 0, col: 0, count: 2 });
    });

    it('spreads coverage across multiple cells for free placement offsets', () => {
        const tiles = [
            {
                centerX: TILE_PLACEMENT_UNIT,
                centerY: TILE_PLACEMENT_UNIT,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
        ];
        const coverage = computeCanvasCoverage(tiles, 3, 3);
        expect(coverage.maxCount).toBe(1);
        const expectedCells = [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
        ];
        expectedCells.forEach(({ row, col }) => {
            expect(coverage.cells).toEqual(
                expect.arrayContaining([expect.objectContaining({ row, col, count: 1 })]),
            );
        });
    });

    it('propagates accurate display intensities for high-overlap cells', () => {
        const tiles = Array.from({ length: 7 }).map(() => ({
            centerX: TILE_PLACEMENT_UNIT * 0.5,
            centerY: TILE_PLACEMENT_UNIT * 0.5,
            width: TILE_PLACEMENT_UNIT,
            height: TILE_PLACEMENT_UNIT,
        }));
        const coverage = computeCanvasCoverage(tiles, 2, 2);
        expect(coverage.cells).toHaveLength(1);
        expect(coverage.maxCount).toBe(7);
        const cell = coverage.cells[0];
        expect(cell.count).toBe(7);
        expect(cell.intensity).toBeCloseTo(calculateDisplayIntensity(7, 7));
    });

    it('rasterizes overlaps per pixel for free placement accuracy', () => {
        const tiles = [
            {
                centerX: TILE_PLACEMENT_UNIT,
                centerY: TILE_PLACEMENT_UNIT,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
            {
                centerX: TILE_PLACEMENT_UNIT,
                centerY: TILE_PLACEMENT_UNIT * 1.6,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
        ];
        const raster = rasterizeTileCoverage(
            tiles,
            TILE_PLACEMENT_UNIT * 2,
            TILE_PLACEMENT_UNIT * 3,
        );
        expect(raster.width).toBe(TILE_PLACEMENT_UNIT * 2);
        expect(raster.height).toBe(TILE_PLACEMENT_UNIT * 3);
        expect(raster.maxCount).toBe(2);
        const topIndex = 6 * raster.width + 10;
        const overlapIndex = 12 * raster.width + 10;
        const emptyIndex = 2 * raster.width + 10;
        // Empty regions stay zero, top rows show single-tile coverage, overlaps reach two.
        expect(raster.counts[emptyIndex]).toBe(0);
        expect(raster.counts[topIndex]).toBe(1);
        // Overlap rows should accumulate both tiles.
        expect(raster.counts[overlapIndex]).toBe(2);
        expect(raster.intensities[overlapIndex]).toBeCloseTo(
            calculateDisplayIntensity(2, raster.maxCount),
        );
    });

    it('maps circle intensities back to individual tiles', () => {
        const tiles = [
            {
                id: 'a',
                centerX: TILE_PLACEMENT_UNIT * 0.5,
                centerY: TILE_PLACEMENT_UNIT * 0.5,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
            {
                id: 'b',
                centerX: TILE_PLACEMENT_UNIT * 1.2,
                centerY: TILE_PLACEMENT_UNIT * 1.2,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
        ];
        const coverage = computeCanvasCoverage(tiles, 3, 3);
        const mapped = mapTileIntensitiesFromCoverage(tiles, coverage, 3, 3);
        expect(mapped).toHaveLength(2);
        expect(mapped[0].count).toBeGreaterThan(0);
        expect(mapped[0].intensity).toBeGreaterThan(0);
    });
});
