// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { asCentered } from '@/utils/coordinates';

import {
    transformTileToCamera,
    estimateGridFromMeasurements,
    computeFirstTileExpected,
    computeExpectedFromGrid,
    computeExpectedBlobPosition,
    type TileMeasurement,
    type GridEstimate,
    type ExpectedPositionConfig,
} from '../expectedPosition';

describe('expectedPosition', () => {
    describe('transformTileToCamera', () => {
        const gridSize = { rows: 3, cols: 4 };

        it('should return identity for 0° rotation', () => {
            expect(transformTileToCamera(0, 0, gridSize, 0)).toEqual({ camRow: 0, camCol: 0 });
            expect(transformTileToCamera(1, 2, gridSize, 0)).toEqual({ camRow: 1, camCol: 2 });
            expect(transformTileToCamera(2, 3, gridSize, 0)).toEqual({ camRow: 2, camCol: 3 });
        });

        it('should rotate correctly for 90° CW rotation', () => {
            // For 90° CW: camRow = col, camCol = rows - 1 - row
            expect(transformTileToCamera(0, 0, gridSize, 90)).toEqual({
                camRow: 0,
                camCol: 2,
            });
            expect(transformTileToCamera(1, 2, gridSize, 90)).toEqual({
                camRow: 2,
                camCol: 1,
            });
            expect(transformTileToCamera(2, 3, gridSize, 90)).toEqual({
                camRow: 3,
                camCol: 0,
            });
        });

        it('should rotate correctly for 180° rotation', () => {
            // For 180°: camRow = rows - 1 - row, camCol = cols - 1 - col
            expect(transformTileToCamera(0, 0, gridSize, 180)).toEqual({
                camRow: 2,
                camCol: 3,
            });
            expect(transformTileToCamera(1, 2, gridSize, 180)).toEqual({
                camRow: 1,
                camCol: 1,
            });
            expect(transformTileToCamera(2, 3, gridSize, 180)).toEqual({
                camRow: 0,
                camCol: 0,
            });
        });

        it('should rotate correctly for 270° CW rotation', () => {
            // For 270° CW: camRow = cols - 1 - col, camCol = row
            expect(transformTileToCamera(0, 0, gridSize, 270)).toEqual({
                camRow: 3,
                camCol: 0,
            });
            expect(transformTileToCamera(1, 2, gridSize, 270)).toEqual({
                camRow: 1,
                camCol: 1,
            });
            expect(transformTileToCamera(2, 3, gridSize, 270)).toEqual({
                camRow: 0,
                camCol: 2,
            });
        });

        it('should handle square grids correctly', () => {
            const squareGrid = { rows: 2, cols: 2 };
            // 90° rotation of (0,0) -> (0, 1)
            expect(transformTileToCamera(0, 0, squareGrid, 90)).toEqual({
                camRow: 0,
                camCol: 1,
            });
            // 180° rotation of (0,0) -> (1, 1)
            expect(transformTileToCamera(0, 0, squareGrid, 180)).toEqual({
                camRow: 1,
                camCol: 1,
            });
        });
    });

    describe('estimateGridFromMeasurements', () => {
        const gridSize = { rows: 3, cols: 3 };
        const rotation = 0;

        it('should use default spacing for single measurement', () => {
            const measurements: TileMeasurement[] = [
                { row: 1, col: 1, position: asCentered(0, 0) }, // center
            ];

            const estimate = estimateGridFromMeasurements(measurements, gridSize, rotation);

            // Centered (0,0) -> viewport (0.5, 0.5)
            // With default spacing 0.15 and tile at (1,1):
            // originX = 0.5 - 1 * 0.15 = 0.35
            // originY = 0.5 - 1 * 0.15 = 0.35
            expect(estimate.spacingX).toBeCloseTo(0.15);
            expect(estimate.spacingY).toBeCloseTo(0.15);
            expect(estimate.originX).toBeCloseTo(0.35);
            expect(estimate.originY).toBeCloseTo(0.35);
        });

        it('should calculate spacing from two adjacent horizontal tiles', () => {
            // Tiles at (0,0) and (0,1) with positions 0.2 apart
            const measurements: TileMeasurement[] = [
                { row: 0, col: 0, position: asCentered(-0.6, -0.6) }, // viewport (0.2, 0.2)
                { row: 0, col: 1, position: asCentered(-0.2, -0.6) }, // viewport (0.4, 0.2)
            ];

            const estimate = estimateGridFromMeasurements(measurements, gridSize, rotation);

            // X spacing = |0.4 - 0.2| = 0.2
            expect(estimate.spacingX).toBeCloseTo(0.2);
            // Y spacing defaults to 0.15 (no adjacent vertical tiles)
            expect(estimate.spacingY).toBeCloseTo(0.15);
        });

        it('should calculate spacing from two adjacent vertical tiles', () => {
            // Tiles at (0,0) and (1,0) with positions 0.25 apart vertically
            const measurements: TileMeasurement[] = [
                { row: 0, col: 0, position: asCentered(-0.6, -0.5) }, // viewport (0.2, 0.25)
                { row: 1, col: 0, position: asCentered(-0.6, 0) }, // viewport (0.2, 0.5)
            ];

            const estimate = estimateGridFromMeasurements(measurements, gridSize, rotation);

            // X spacing defaults to 0.15 (no adjacent horizontal tiles)
            expect(estimate.spacingX).toBeCloseTo(0.15);
            // Y spacing = |0.5 - 0.25| = 0.25
            expect(estimate.spacingY).toBeCloseTo(0.25);
        });

        it('should calculate average spacing from multiple measurements', () => {
            // 2x2 grid with known positions
            const measurements: TileMeasurement[] = [
                { row: 0, col: 0, position: asCentered(-0.6, -0.4) }, // viewport (0.2, 0.3)
                { row: 0, col: 1, position: asCentered(-0.2, -0.4) }, // viewport (0.4, 0.3)
                { row: 1, col: 0, position: asCentered(-0.6, 0) }, // viewport (0.2, 0.5)
                { row: 1, col: 1, position: asCentered(-0.2, 0) }, // viewport (0.4, 0.5)
            ];

            const estimate = estimateGridFromMeasurements(measurements, gridSize, rotation);

            // X spacing: (|0.4-0.2| + |0.4-0.2|) / 2 = 0.2
            expect(estimate.spacingX).toBeCloseTo(0.2);
            // Y spacing: (|0.5-0.3| + |0.5-0.3|) / 2 = 0.2
            expect(estimate.spacingY).toBeCloseTo(0.2);
        });

        it('should calculate correct origin', () => {
            // Single tile at (1,1) at viewport center
            const measurements: TileMeasurement[] = [
                { row: 1, col: 1, position: asCentered(0, 0) }, // viewport (0.5, 0.5)
            ];

            const estimate = estimateGridFromMeasurements(measurements, gridSize, rotation);

            // Tile (1,1) at (0.5, 0.5) with spacing 0.15
            // originX = 0.5 - 1 * 0.15 = 0.35
            // originY = 0.5 - 1 * 0.15 = 0.35
            expect(estimate.originX).toBeCloseTo(0.35);
            expect(estimate.originY).toBeCloseTo(0.35);
        });
    });

    describe('computeFirstTileExpected', () => {
        it('should return ROI center', () => {
            const roi = { enabled: true, x: 0.1, y: 0.2, width: 0.6, height: 0.5 };
            const expected = computeFirstTileExpected(roi);

            // Center = (0.1 + 0.6/2, 0.2 + 0.5/2) = (0.4, 0.45)
            expect(expected.x).toBeCloseTo(0.4);
            expect(expected.y).toBeCloseTo(0.45);
        });

        it('should handle default ROI', () => {
            const defaultRoi = { enabled: true, x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
            const expected = computeFirstTileExpected(defaultRoi);

            // Center = (0.15 + 0.7/2, 0.15 + 0.7/2) = (0.5, 0.5)
            expect(expected.x).toBeCloseTo(0.5);
            expect(expected.y).toBeCloseTo(0.5);
        });

        it('should handle edge ROI positions', () => {
            const edgeRoi = { enabled: true, x: 0, y: 0, width: 1, height: 1 };
            const expected = computeFirstTileExpected(edgeRoi);

            // Full frame ROI, center at (0.5, 0.5)
            expect(expected.x).toBeCloseTo(0.5);
            expect(expected.y).toBeCloseTo(0.5);
        });
    });

    describe('computeExpectedFromGrid', () => {
        const gridSize = { rows: 3, cols: 3 };

        it('should compute position from grid estimate for 0° rotation', () => {
            const gridEstimate: GridEstimate = {
                originX: 0.2,
                originY: 0.3,
                spacingX: 0.2,
                spacingY: 0.15,
            };

            // Tile (0,0) -> position (0.2, 0.3)
            const pos00 = computeExpectedFromGrid(0, 0, gridEstimate, gridSize, 0);
            expect(pos00.x).toBeCloseTo(0.2);
            expect(pos00.y).toBeCloseTo(0.3);

            // Tile (1,2) -> position (0.2 + 2*0.2, 0.3 + 1*0.15) = (0.6, 0.45)
            const pos12 = computeExpectedFromGrid(1, 2, gridEstimate, gridSize, 0);
            expect(pos12.x).toBeCloseTo(0.6);
            expect(pos12.y).toBeCloseTo(0.45);
        });

        it('should apply rotation before computing position', () => {
            const gridEstimate: GridEstimate = {
                originX: 0.2,
                originY: 0.2,
                spacingX: 0.2,
                spacingY: 0.2,
            };

            // With 90° rotation, tile (0,0) transforms to camera (0, 2)
            // position = (0.2 + 2*0.2, 0.2 + 0*0.2) = (0.6, 0.2)
            const pos = computeExpectedFromGrid(0, 0, gridEstimate, gridSize, 90);
            expect(pos.x).toBeCloseTo(0.6);
            expect(pos.y).toBeCloseTo(0.2);
        });
    });

    describe('computeExpectedBlobPosition', () => {
        const config: ExpectedPositionConfig = {
            gridSize: { rows: 3, cols: 3 },
            arrayRotation: 0,
            roi: { enabled: true, x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
        };

        it('should return ROI center for first tile (no measurements)', () => {
            const expected = computeExpectedBlobPosition(0, 0, [], config);

            // ROI center = (0.15 + 0.7/2, 0.15 + 0.7/2) = (0.5, 0.5)
            expect(expected.x).toBeCloseTo(0.5);
            expect(expected.y).toBeCloseTo(0.5);
        });

        it('should use grid estimation when measurements exist', () => {
            const measurements: TileMeasurement[] = [
                { row: 0, col: 0, position: asCentered(-0.6, -0.6) }, // viewport (0.2, 0.2)
            ];

            // With tile (0,0) at (0.2, 0.2) and default spacing 0.15:
            // origin = (0.2 - 0*0.15, 0.2 - 0*0.15) = (0.2, 0.2)
            // Tile (1,1) expected at (0.2 + 1*0.15, 0.2 + 1*0.15) = (0.35, 0.35)
            const expected = computeExpectedBlobPosition(1, 1, measurements, config);
            expect(expected.x).toBeCloseTo(0.35);
            expect(expected.y).toBeCloseTo(0.35);
        });

        it('should handle rotated array', () => {
            const rotatedConfig: ExpectedPositionConfig = {
                ...config,
                arrayRotation: 180,
            };

            const measurements: TileMeasurement[] = [
                { row: 0, col: 0, position: asCentered(0.6, 0.6) }, // viewport (0.8, 0.8)
            ];

            // With 180° rotation, tile (0,0) transforms to camera (2,2)
            // origin = (0.8 - 2*0.15, 0.8 - 2*0.15) = (0.5, 0.5)
            // Tile (2,2) with 180° rotation -> camera (0,0)
            // Expected at (0.5 + 0*0.15, 0.5 + 0*0.15) = (0.5, 0.5)
            const expected = computeExpectedBlobPosition(2, 2, measurements, rotatedConfig);
            expect(expected.x).toBeCloseTo(0.5);
            expect(expected.y).toBeCloseTo(0.5);
        });

        it('should work with multiple measurements for better accuracy', () => {
            const measurements: TileMeasurement[] = [
                { row: 0, col: 0, position: asCentered(-0.6, -0.6) }, // viewport (0.2, 0.2)
                { row: 0, col: 1, position: asCentered(-0.2, -0.6) }, // viewport (0.4, 0.2)
            ];

            // X spacing = |0.4 - 0.2| = 0.2
            // Y spacing = 0.15 (default)
            // Origins: tile (0,0) -> 0.2, tile (0,1) -> 0.4 - 0.2 = 0.2
            // Average origin X = 0.2
            // Tile (0,2) expected at (0.2 + 2*0.2, 0.2 + 0*0.15) = (0.6, 0.2)
            const expected = computeExpectedBlobPosition(0, 2, measurements, config);
            expect(expected.x).toBeCloseTo(0.6);
            expect(expected.y).toBeCloseTo(0.2);
        });
    });
});
