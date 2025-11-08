import { describe, expect, it } from 'vitest';

import { DEFAULT_PROJECTION_SETTINGS } from '../constants/projection';

import {
    computeProjectionFootprint,
    inferGridFromCanvas,
    calculateProjectionSpan,
} from './projectionGeometry';

const mockPattern = {
    id: 'pattern-1',
    name: 'Test Pattern',
    canvas: { width: 100, height: 100 },
    tiles: [
        {
            id: 'a',
            center: { x: 10, y: 50 },
            size: { width: 10, height: 10 },
        },
        {
            id: 'b',
            center: { x: 90, y: 50 },
            size: { width: 10, height: 10 },
        },
        {
            id: 'c',
            center: { x: 50, y: 10 },
            size: { width: 10, height: 10 },
        },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe('projectionGeometry', () => {
    it('infers grid size from canvas dimensions', () => {
        const grid = inferGridFromCanvas(mockPattern.canvas);
        expect(grid.rows).toBeGreaterThan(0);
        expect(grid.cols).toBeGreaterThan(0);
    });

    it('calculates projection span without wall orientation distortion', () => {
        const span = calculateProjectionSpan({ rows: 4, cols: 4 }, DEFAULT_PROJECTION_SETTINGS);
        expect(span.width).toBeCloseTo((4 - 1) * DEFAULT_PROJECTION_SETTINGS.pixelSpacing.x, 5);
        expect(span.height).toBeCloseTo((4 - 1) * DEFAULT_PROJECTION_SETTINGS.pixelSpacing.y, 5);
    });

    it('computes footprint spots for a pattern', () => {
        const footprint = computeProjectionFootprint({
            gridSize: { rows: 8, cols: 8 },
            pattern: mockPattern,
            settings: DEFAULT_PROJECTION_SETTINGS,
        });
        expect(footprint.spots).toHaveLength(mockPattern.tiles.length);
        const firstSpot = footprint.spots[0];
        expect(firstSpot.normalizedX).toBeGreaterThanOrEqual(0);
        expect(firstSpot.normalizedX).toBeLessThanOrEqual(1);
        expect(firstSpot.wallX).not.toBeNull();
        expect(firstSpot.wallY).not.toBeNull();
    });

    it('keeps projected footprint consistent when wall yaw changes', () => {
        const footprintA = computeProjectionFootprint({
            gridSize: { rows: 6, cols: 6 },
            pattern: null,
            settings: DEFAULT_PROJECTION_SETTINGS,
        });
        const rotatedSettings = {
            ...DEFAULT_PROJECTION_SETTINGS,
            wallOrientation: {
                ...DEFAULT_PROJECTION_SETTINGS.wallOrientation,
                yaw: 25,
            },
        };
        const footprintB = computeProjectionFootprint({
            gridSize: { rows: 6, cols: 6 },
            pattern: null,
            settings: rotatedSettings,
        });

        expect(footprintA.projectedWidth).not.toBeNull();
        expect(footprintB.projectedWidth).not.toBeNull();
        expect(footprintA.projectedHeight).not.toBeNull();
        expect(footprintB.projectedHeight).not.toBeNull();
        expect(footprintB.projectedWidth ?? 0).toBeCloseTo(footprintA.projectedWidth ?? 0, 5);
        expect(footprintB.projectedHeight ?? 0).toBeCloseTo(footprintA.projectedHeight ?? 0, 5);
    });
});
