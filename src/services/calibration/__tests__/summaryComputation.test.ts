// @vitest-environment node
import { describe, it, expect } from 'vitest';

import type { BlobMeasurement } from '@/types';

import {
    computeGridBlueprint,
    computeCalibrationSummary,
    type TileCalibrationResult,
    type SummaryConfig,
} from '../summaryComputation';

describe('summaryComputation', () => {
    const createMeasurement = (x: number, y: number, size: number): BlobMeasurement => ({
        x,
        y,
        size,
        response: 100,
        capturedAt: Date.now(),
    });

    const createTileResult = (
        row: number,
        col: number,
        measurement: BlobMeasurement | undefined,
        status: TileCalibrationResult['status'] = 'completed',
    ): TileCalibrationResult => {
        const result: TileCalibrationResult = {
            tile: { row, col, key: `${row}-${col}` },
            status,
        };
        if (measurement) {
            result.homeMeasurement = measurement;
        }
        return result;
    };

    describe('computeGridBlueprint', () => {
        const config: SummaryConfig = {
            gridSize: { rows: 2, cols: 2 },
            gridGapNormalized: 0.05, // 5% gap (within allowed range)
            deltaSteps: 100,
        };

        it('should return null blueprint for empty tiles array', () => {
            const result = computeGridBlueprint([], config);
            expect(result.blueprint).toBeNull();
        });

        it('should compute blueprint from single tile', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            expect(result.blueprint).not.toBeNull();
            expect(result.blueprint!.adjustedTileFootprint.width).toBe(0.2);
            expect(result.blueprint!.adjustedTileFootprint.height).toBe(0.2);
        });

        it('should use robust max (exclude outliers) by default', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
                {
                    tile: { row: 0, col: 1, key: '0-1' },
                    homeMeasurement: createMeasurement(0.3, 0, 0.21),
                },
                {
                    tile: { row: 1, col: 0, key: '1-0' },
                    homeMeasurement: createMeasurement(0, 0.3, 0.19),
                },
                {
                    tile: { row: 1, col: 1, key: '1-1' },
                    homeMeasurement: createMeasurement(0.3, 0.3, 0.5), // outlier
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            // Should exclude 0.5 outlier and use max of inliers (~0.21)
            expect(result.blueprint!.adjustedTileFootprint.width).toBeLessThan(0.5);
            expect(result.outlierAnalysis.outlierCount).toBe(1);
            expect(result.outlierAnalysis.outlierTileKeys).toContain('1-1');
        });

        it('should calculate gap from normalized setting', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            // normalizedGap = 0.05 * 2 = 0.1 (clamped to max 5%)
            expect(result.blueprint!.tileGap.x).toBe(0.1);
            expect(result.blueprint!.tileGap.y).toBe(0.1);
        });

        it('should allow negative gap values', () => {
            const negativeGapConfig: SummaryConfig = {
                ...config,
                gridGapNormalized: -0.25, // -25% overlap
            };
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
            ];

            const result = computeGridBlueprint(tiles, negativeGapConfig);

            // normalizedGap = -0.25 * 2 = -0.5 (negative gap)
            expect(result.blueprint!.tileGap.x).toBe(-0.5);
            expect(result.blueprint!.tileGap.y).toBe(-0.5);
        });

        it('should have cameraOriginOffset centered on grid', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            // cameraOriginOffset should be computed to center the grid
            expect(result.blueprint!.cameraOriginOffset).toBeDefined();
        });

        it('should return outlier analysis with statistics', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
                {
                    tile: { row: 0, col: 1, key: '0-1' },
                    homeMeasurement: createMeasurement(0.3, 0, 0.21),
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            expect(result.outlierAnalysis).toBeDefined();
            expect(result.outlierAnalysis.enabled).toBe(true);
            expect(result.outlierAnalysis.median).toBeGreaterThan(0);
        });
    });

    describe('computeCalibrationSummary', () => {
        const config: SummaryConfig = {
            gridSize: { rows: 2, cols: 2 },
            gridGapNormalized: 0.05,
            deltaSteps: 100,
        };

        it('should return empty tiles for empty input', () => {
            const result = computeCalibrationSummary(new Map(), config);

            expect(result.gridBlueprint).toBeNull();
            expect(result.tiles).toEqual({});
            expect(result.stepTestSettings.deltaSteps).toBe(100);
        });

        it('should include tiles without measurements', () => {
            const tileResults = new Map<string, TileCalibrationResult>();
            tileResults.set('0-0', createTileResult(0, 0, undefined, 'skipped'));

            const result = computeCalibrationSummary(tileResults, config);

            expect(result.tiles['0-0']).toBeDefined();
            expect(result.tiles['0-0'].status).toBe('skipped');
        });

        it('should compute home offset for completed tiles', () => {
            const tileResults = new Map<string, TileCalibrationResult>();
            // Place tile at center (0, 0)
            tileResults.set('0-0', createTileResult(0, 0, createMeasurement(0, 0, 0.2)));

            const result = computeCalibrationSummary(tileResults, config);

            expect(result.tiles['0-0'].homeOffset).toBeDefined();
            expect(result.tiles['0-0'].adjustedHome).toBeDefined();
        });

        it('should recenter measurements relative to camera origin', () => {
            const tileResults = new Map<string, TileCalibrationResult>();
            tileResults.set('0-0', createTileResult(0, 0, createMeasurement(0.5, 0.5, 0.2)));

            const result = computeCalibrationSummary(tileResults, config);

            // The recentered measurement should be different from original
            const originalX = 0.5;
            const recenteredX = result.tiles['0-0'].homeMeasurement?.x ?? 0;
            expect(recenteredX).not.toBe(originalX);
        });

        it('should skip offset calculation for failed tiles', () => {
            const tileResults = new Map<string, TileCalibrationResult>();
            tileResults.set('0-0', createTileResult(0, 0, createMeasurement(0, 0, 0.2), 'failed'));

            const result = computeCalibrationSummary(tileResults, config);

            expect(result.tiles['0-0'].homeOffset).toBeUndefined();
        });

        it('should include stepTestSettings in summary', () => {
            const tileResults = new Map<string, TileCalibrationResult>();

            const result = computeCalibrationSummary(tileResults, config);

            expect(result.stepTestSettings).toEqual({ deltaSteps: 100 });
        });

        it('should handle multiple tiles with grid alignment', () => {
            const tileResults = new Map<string, TileCalibrationResult>();
            // 2x2 grid of tiles
            tileResults.set('0-0', createTileResult(0, 0, createMeasurement(-0.3, -0.3, 0.2)));
            tileResults.set('0-1', createTileResult(0, 1, createMeasurement(0.3, -0.3, 0.2)));
            tileResults.set('1-0', createTileResult(1, 0, createMeasurement(-0.3, 0.3, 0.2)));
            tileResults.set('1-1', createTileResult(1, 1, createMeasurement(0.3, 0.3, 0.2)));

            const result = computeCalibrationSummary(tileResults, config);

            expect(result.gridBlueprint).not.toBeNull();
            expect(Object.keys(result.tiles)).toHaveLength(4);

            // All tiles should have home offsets
            for (const key of Object.keys(result.tiles)) {
                expect(result.tiles[key].homeOffset).toBeDefined();
            }
        });

        it('populates motor reach, footprint bounds, and step scales', () => {
            const tileResults = new Map<string, TileCalibrationResult>();
            const measurement = createMeasurement(0.1, -0.05, 0.2);
            tileResults.set('0-0', {
                tile: { row: 0, col: 0, key: '0-0' },
                status: 'completed',
                homeMeasurement: {
                    ...measurement,
                    sourceWidth: 1600,
                    sourceHeight: 1200,
                },
                stepToDisplacement: { x: 0.001, y: -0.002 },
            });

            const result = computeCalibrationSummary(tileResults, {
                gridSize: { rows: 1, cols: 1 },
                gridGapNormalized: 0,
                deltaSteps: 50,
            });

            const tile = result.tiles['0-0'];
            expect(tile.motorReachBounds).not.toBeNull();
            expect(tile.motorReachBounds!.x.min).toBeLessThan(tile.motorReachBounds!.x.max);
            expect(tile.motorReachBounds!.y.min).toBeLessThan(tile.motorReachBounds!.y.max);

            // Footprint should be centered on the original home measurement (0.1, -0.05)
            expect(tile.footprintBounds).not.toBeNull();
            const footprintCenterX =
                (tile.footprintBounds!.x.min + tile.footprintBounds!.x.max) / 2;
            const footprintCenterY =
                (tile.footprintBounds!.y.min + tile.footprintBounds!.y.max) / 2;
            expect(footprintCenterX).toBeCloseTo(0.1); // homeMeasurement.x
            expect(footprintCenterY).toBeCloseTo(-0.05); // homeMeasurement.y

            expect(tile.stepScale).toEqual({ x: 1000, y: -500 });
        });
    });
});
