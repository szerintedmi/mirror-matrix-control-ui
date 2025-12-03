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
            gridGapNormalized: 0.1, // 10% gap
            deltaSteps: 100,
        };

        it('should return null for empty tiles array', () => {
            const result = computeGridBlueprint([], config);
            expect(result).toBeNull();
        });

        it('should compute blueprint from single tile', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            expect(result).not.toBeNull();
            expect(result!.adjustedTileFootprint.width).toBe(0.2);
            expect(result!.adjustedTileFootprint.height).toBe(0.2);
        });

        it('should use largest tile size', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
                {
                    tile: { row: 0, col: 1, key: '0-1' },
                    homeMeasurement: createMeasurement(0.5, 0, 0.3), // larger
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            expect(result!.adjustedTileFootprint.width).toBe(0.3);
        });

        it('should calculate gap from normalized setting', () => {
            const tiles = [
                {
                    tile: { row: 0, col: 0, key: '0-0' },
                    homeMeasurement: createMeasurement(0, 0, 0.2),
                },
            ];

            const result = computeGridBlueprint(tiles, config);

            // normalizedGap = 0.1 * 2 = 0.2
            expect(result!.tileGap.x).toBe(0.2);
            expect(result!.tileGap.y).toBe(0.2);
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
            expect(result!.cameraOriginOffset).toBeDefined();
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
    });
});
