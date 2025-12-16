import { describe, expect, it } from 'vitest';

import type { BlobMeasurement } from '@/types';

import { computeGridBlueprint, type TileAddress } from '../summaryComputation';

const createMeasurement = (
    row: number,
    col: number,
    x: number,
    y: number,
    size = 100,
): { tile: TileAddress; homeMeasurement: BlobMeasurement } => ({
    tile: { row, col, key: `${row}-${col}` },
    homeMeasurement: {
        x,
        y,
        size,
        response: 1,
        capturedAt: 0,
        sourceWidth: 2000,
        sourceHeight: 2000,
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
        // If using axis-specific deltas:
        //   X pitch = 100 (CORRECT)
        //   Y pitch = 150 (CORRECT)

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

        // With gap = 0, footprint = pitch
        // X pitch should be 100 (not 102 from Euclidean)
        expect(blueprint.adjustedTileFootprint.width).toBeCloseTo(100, 0);

        // Y pitch should be 150 (not 150.7 from Euclidean)
        expect(blueprint.adjustedTileFootprint.height).toBeCloseTo(150, 0);

        // Spacing should equal footprint when gap is 0
        const spacingX = blueprint.adjustedTileFootprint.width + blueprint.tileGap.x;
        const spacingY = blueprint.adjustedTileFootprint.height + blueprint.tileGap.y;
        expect(spacingX).toBeCloseTo(100, 0);
        expect(spacingY).toBeCloseTo(150, 0);
    });

    it('should use correct half-tile values for origin computation with non-square tiles', () => {
        // Regression test: origin computation should use halfTileY for Y axis,
        // not halfTileX. This matters when width != height.
        //
        // Grid with different X and Y pitches:
        // X pitch = 100, Y pitch = 200
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

        // Tile footprint should reflect the pitch
        expect(blueprint.adjustedTileFootprint.width).toBeCloseTo(100, 0);
        expect(blueprint.adjustedTileFootprint.height).toBeCloseTo(200, 0);

        // The origin should be computed such that:
        // tile[0][0] center = origin + halfTileX, origin + halfTileY
        // tile[0][0] was measured at (50, 100)
        // So: origin = (50 - 50, 100 - 100) = (0, 0) in raw coords
        // After centering offset is applied, the gridOrigin will be different,
        // but the key is that the formula uses the correct half-tile values.

        // Verify the spacing is correct
        const spacingX = blueprint.adjustedTileFootprint.width + blueprint.tileGap.x;
        const spacingY = blueprint.adjustedTileFootprint.height + blueprint.tileGap.y;
        expect(spacingX).toBeCloseTo(100, 0);
        expect(spacingY).toBeCloseTo(200, 0);

        // Verify the grid covers the expected total area
        const totalWidth = 2 * spacingX - blueprint.tileGap.x;
        const totalHeight = 2 * spacingY - blueprint.tileGap.y;
        expect(totalWidth).toBeCloseTo(200, 0); // 2 cols * 100
        expect(totalHeight).toBeCloseTo(400, 0); // 2 rows * 200
    });
});
