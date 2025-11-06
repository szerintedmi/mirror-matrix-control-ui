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

    it('calculates projection span for a grid', () => {
        const span = calculateProjectionSpan({ rows: 8, cols: 8 }, DEFAULT_PROJECTION_SETTINGS);
        expect(span.width).toBeGreaterThan(0);
        expect(span.height).toBeGreaterThan(0);
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
        expect(firstSpot.world.z).toBeCloseTo(DEFAULT_PROJECTION_SETTINGS.wallDistance, 5);
    });
});
