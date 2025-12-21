import { describe, expect, it } from 'vitest';

import type { BlobMeasurement } from '@/types';

import { computeGridBlueprint, type TileAddress } from '../summaryComputation';

const createMeasurement = (
    row: number,
    col: number,
    x: number,
    y: number,
    size = 100,
    sourceWidth = 2000,
    sourceHeight = 2000,
): { tile: TileAddress; homeMeasurement: BlobMeasurement } => ({
    tile: { row, col, key: `${row}-${col}` },
    homeMeasurement: {
        x,
        y,
        size,
        response: 1,
        capturedAt: 0,
        sourceWidth,
        sourceHeight,
    },
});

describe('computeGridBlueprint - Pitch vs Blob Size', () => {
    it('should currently fail alignment if blobs are larger than pitch (reproduction)', () => {
        // Setup: A 2x2 grid with pitch 100, but blob size 120 (e.g. overlapping/blooming)
        // Physical centers:
        // (0,0) at 1000, 1000
        // (0,1) at 1100, 1000 (pitch 100)
        // (1,0) at 1000, 1100
        // (1,1) at 1100, 1100

        const tiles = [
            createMeasurement(0, 0, 1000, 1000, 120),
            createMeasurement(0, 1, 1100, 1000, 120),
            createMeasurement(1, 0, 1000, 1100, 120),
            createMeasurement(1, 1, 1100, 1100, 120),
        ];

        const config = {
            gridSize: { rows: 2, cols: 2 },
            gridGapNormalized: 0, // "Tiles touch"
            deltaSteps: 100,
            robustTileSize: { enabled: true, madThreshold: 3 },
        };

        const { blueprint } = computeGridBlueprint(tiles, config);

        if (!blueprint) throw new Error('Blueprint computation failed');

        // FIXED BEHAVIOR (Stable):
        // The gap should match the config (0).
        expect(blueprint.tileGap.x).toBeCloseTo(0, 5);

        // The footprint should be derived from Pitch (100) - Gap (0) = 100.
        // It should NOT be inflated to the blob size (120).
        expect(blueprint.adjustedTileFootprint.width).toBeCloseTo(100, 1);

        // Calculate expected spacing in the blueprint
        const spacingX = blueprint.adjustedTileFootprint.width + blueprint.tileGap.x;

        // The spacing should match the grid pitch (100)
        expect(spacingX).toBeCloseTo(100, 1);

        // Ensure the visual size (footprint) is effectively "smaller" than the blob
        // which means the blob (120) overlaps the grid cell (100). This is intended.
        expect(blueprint.adjustedTileFootprint.width).toBeLessThan(120);

        // Verify Grid Origin Centering (Median logic)
        expect(blueprint.gridOrigin.x).toBeDefined();
    });

    it('should compute correct pitch for misaligned tiles (regression test)', () => {
        // Tiles are NOT perfectly aligned - there's slight offset in the perpendicular direction.
        // This tests that we use axis-specific deltas, not Euclidean distance.
        //
        // Physical layout:
        // (0,0) at (0, 0)
        // (0,1) at (100, 20)   - X pitch is 100, but has Y offset of 20
        // (1,0) at (15, 150)   - Y pitch is 150, but has X offset of 15
        // (1,1) at (115, 170)  - Consistent with above
        //
        // If using Euclidean distance:
        //   X pitch = sqrt(100² + 20²) = 102.0 (WRONG - inflated by ~2%)
        //   Y pitch = sqrt(15² + 150²) = 150.7 (WRONG - inflated by ~0.5%)
        //
        // If using axis-specific deltas (in isotropic space, then averaged):
        //   isoPitchX = 100, isoPitchY = 150 (camera is 2000x2000, so isoFactor = 1)
        //   avgIsoPitch = (100 + 150) / 2 = 125
        //   Both width and height = 125

        const tiles = [
            createMeasurement(0, 0, 0, 0),
            createMeasurement(0, 1, 100, 20), // X delta = 100, Y offset = 20
            createMeasurement(1, 0, 15, 150), // Y delta = 150, X offset = 15
            createMeasurement(1, 1, 115, 170),
        ];

        const config = {
            gridSize: { rows: 2, cols: 2 },
            gridGapNormalized: 0,
            deltaSteps: 100,
            robustTileSize: { enabled: false, madThreshold: 3 },
        };

        const { blueprint } = computeGridBlueprint(tiles, config);

        if (!blueprint) throw new Error('Blueprint computation failed');

        // With gap = 0, footprint = averaged isotropic pitch
        // On a 2000x2000 camera (isoFactor = 1), avg(100, 150) = 125
        expect(blueprint.adjustedTileFootprint.width).toBeCloseTo(125, 0);
        expect(blueprint.adjustedTileFootprint.height).toBeCloseTo(125, 0);

        // Spacing should equal footprint when gap is 0
        const spacingX = blueprint.adjustedTileFootprint.width + blueprint.tileGap.x;
        const spacingY = blueprint.adjustedTileFootprint.height + blueprint.tileGap.y;
        expect(spacingX).toBeCloseTo(125, 0);
        expect(spacingY).toBeCloseTo(125, 0);
    });

    it('should use uniform isotropic tile size for square visual tiles', () => {
        // With isotropic pitch computation, both width and height are equal.
        // This ensures square visual tiles on the overlay (no gaps).
        //
        // Grid with different measured X and Y pitches:
        // X pitch = 100, Y pitch = 200
        // On a 2000x2000 camera (isoFactor = 1), avg(100, 200) = 150
        // All tiles perfectly aligned.

        const tiles = [
            createMeasurement(0, 0, 50, 100), // Center of first tile
            createMeasurement(0, 1, 150, 100), // X + 100
            createMeasurement(1, 0, 50, 300), // Y + 200
            createMeasurement(1, 1, 150, 300),
        ];

        const config = {
            gridSize: { rows: 2, cols: 2 },
            gridGapNormalized: 0,
            deltaSteps: 100,
            robustTileSize: { enabled: false, madThreshold: 3 },
        };

        const { blueprint } = computeGridBlueprint(tiles, config);

        if (!blueprint) throw new Error('Blueprint computation failed');

        // Tile footprint should be the averaged isotropic pitch
        // avg(100, 200) = 150 for both dimensions
        expect(blueprint.adjustedTileFootprint.width).toBeCloseTo(150, 0);
        expect(blueprint.adjustedTileFootprint.height).toBeCloseTo(150, 0);

        // Verify tiles are square (key property for no visual gaps)
        expect(blueprint.adjustedTileFootprint.width).toBeCloseTo(
            blueprint.adjustedTileFootprint.height,
            0,
        );

        // Verify the spacing is uniform
        const spacingX = blueprint.adjustedTileFootprint.width + blueprint.tileGap.x;
        const spacingY = blueprint.adjustedTileFootprint.height + blueprint.tileGap.y;
        expect(spacingX).toBeCloseTo(150, 0);
        expect(spacingY).toBeCloseTo(150, 0);
    });

    it('uses isotropic X pitch when vertical neighbors missing', () => {
        // Only a single row measured, so no Y pitch is available yet.
        // With isotropic computation:
        // - Camera: 2000x1000
        // - avgDim = (2000 + 1000) / 2 = 1500
        // - isoFactorX = 2000 / 1500 = 1.333
        // - isoFactorY = 1000 / 1500 = 0.667
        // - X delta in centered coords = 100
        // - X delta in isotropic = 100 * 1.333 = 133.3
        // - No Y neighbors, so isoPitchY = isoPitchX = 133.3
        // - Convert back to centered: width = 133.3 / 1.333 = 100, height = 133.3 / 0.667 = 200
        // - These different centered values will project to EQUAL visual sizes
        const sourceWidth = 2000;
        const sourceHeight = 1000;
        const tiles = [
            createMeasurement(0, 0, 0, 0, 100, sourceWidth, sourceHeight),
            createMeasurement(0, 1, 100, 0, 100, sourceWidth, sourceHeight),
        ];

        const config = {
            gridSize: { rows: 2, cols: 2 },
            gridGapNormalized: 0,
            deltaSteps: 100,
            robustTileSize: { enabled: false, madThreshold: 3 },
        };

        const { blueprint } = computeGridBlueprint(tiles, config);

        if (!blueprint) throw new Error('Blueprint computation failed');

        // Centered coords differ, but will project to equal visual sizes
        expect(blueprint.adjustedTileFootprint.width).toBeCloseTo(100, 0);
        expect(blueprint.adjustedTileFootprint.height).toBeCloseTo(200, 0);

        // Key property: width * sourceWidth = height * sourceHeight (equal projected sizes)
        const projectedWidth = blueprint.adjustedTileFootprint.width * sourceWidth;
        const projectedHeight = blueprint.adjustedTileFootprint.height * sourceHeight;
        expect(projectedWidth).toBeCloseTo(projectedHeight, 0);
    });
});
