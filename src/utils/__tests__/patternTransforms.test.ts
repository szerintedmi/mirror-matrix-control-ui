import { describe, expect, it } from 'vitest';

import type { Pattern, PatternPoint } from '@/types';

import {
    rotatePoints,
    scalePoints,
    shiftPoints,
    transformPatternRotate,
    transformPatternScale,
    transformPatternShift,
} from '../patternTransforms';

const createTestPoints = (): PatternPoint[] => [
    { id: 'p1', x: 0, y: 0 },
    { id: 'p2', x: 0.5, y: 0.5 },
    { id: 'p3', x: -0.5, y: -0.5 },
];

const createTestPattern = (): Pattern => ({
    id: 'test-pattern',
    name: 'Test Pattern',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    points: createTestPoints(),
});

describe('patternTransforms', () => {
    describe('shiftPoints', () => {
        it('shifts all points by the given delta', () => {
            const points = createTestPoints();
            const result = shiftPoints(points, 0.1, 0.2);

            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({ id: 'p1', x: 0.1, y: 0.2 });
            expect(result[1]).toEqual({ id: 'p2', x: 0.6, y: 0.7 });
            expect(result[2]).toEqual({ id: 'p3', x: -0.4, y: -0.3 });
        });

        it('handles negative shifts', () => {
            const points = [{ id: 'p1', x: 0.5, y: 0.5 }];
            const result = shiftPoints(points, -0.3, -0.2);

            expect(result[0].x).toBeCloseTo(0.2);
            expect(result[0].y).toBeCloseTo(0.3);
        });

        it('returns empty array for empty input', () => {
            const result = shiftPoints([], 0.1, 0.1);
            expect(result).toEqual([]);
        });

        it('allows points to go out of bounds', () => {
            const points = [{ id: 'p1', x: 0.9, y: 0.9 }];
            const result = shiftPoints(points, 0.5, 0.5);

            expect(result[0].x).toBe(1.4);
            expect(result[0].y).toBe(1.4);
        });
    });

    describe('scalePoints', () => {
        it('scales points uniformly from origin', () => {
            const points = [{ id: 'p1', x: 0.5, y: 0.5 }];
            const result = scalePoints(points, 2, 2);

            expect(result[0].x).toBe(1);
            expect(result[0].y).toBe(1);
        });

        it('scales points independently on each axis', () => {
            const points = [{ id: 'p1', x: 0.4, y: 0.6 }];
            const result = scalePoints(points, 2, 0.5);

            expect(result[0].x).toBe(0.8);
            expect(result[0].y).toBe(0.3);
        });

        it('scales from custom center point', () => {
            const points = [{ id: 'p1', x: 1, y: 1 }];
            const result = scalePoints(points, 2, 2, 0.5, 0.5);

            // Distance from center (0.5, 0.5) to (1, 1) is (0.5, 0.5)
            // After 2x scale: center + 2 * distance = (0.5 + 1, 0.5 + 1) = (1.5, 1.5)
            expect(result[0].x).toBe(1.5);
            expect(result[0].y).toBe(1.5);
        });

        it('does not move origin point when scaling from origin', () => {
            const points = [{ id: 'p1', x: 0, y: 0 }];
            const result = scalePoints(points, 5, 5);

            expect(result[0].x).toBe(0);
            expect(result[0].y).toBe(0);
        });

        it('handles scale down', () => {
            const points = [{ id: 'p1', x: 0.8, y: 0.8 }];
            const result = scalePoints(points, 0.5, 0.5);

            expect(result[0].x).toBe(0.4);
            expect(result[0].y).toBe(0.4);
        });
    });

    describe('rotatePoints', () => {
        it('rotates points 90 degrees counterclockwise', () => {
            const points = [{ id: 'p1', x: 1, y: 0 }];
            const result = rotatePoints(points, 90);

            expect(result[0].x).toBeCloseTo(0);
            expect(result[0].y).toBeCloseTo(1);
        });

        it('rotates points 90 degrees clockwise (negative)', () => {
            const points = [{ id: 'p1', x: 1, y: 0 }];
            const result = rotatePoints(points, -90);

            expect(result[0].x).toBeCloseTo(0);
            expect(result[0].y).toBeCloseTo(-1);
        });

        it('rotates points 180 degrees', () => {
            const points = [{ id: 'p1', x: 0.5, y: 0.3 }];
            const result = rotatePoints(points, 180);

            expect(result[0].x).toBeCloseTo(-0.5);
            expect(result[0].y).toBeCloseTo(-0.3);
        });

        it('rotates 360 degrees back to original', () => {
            const points = [{ id: 'p1', x: 0.7, y: 0.4 }];
            const result = rotatePoints(points, 360);

            expect(result[0].x).toBeCloseTo(0.7);
            expect(result[0].y).toBeCloseTo(0.4);
        });

        it('rotates from custom center', () => {
            const points = [{ id: 'p1', x: 1, y: 0 }];
            const result = rotatePoints(points, 90, 0.5, 0);

            // Point is 0.5 units right of center (0.5, 0)
            // After 90° CCW rotation around (0.5, 0): should be 0.5 units above center
            expect(result[0].x).toBeCloseTo(0.5);
            expect(result[0].y).toBeCloseTo(0.5);
        });

        it('does not move center point', () => {
            const points = [{ id: 'p1', x: 0, y: 0 }];
            const result = rotatePoints(points, 45);

            expect(result[0].x).toBeCloseTo(0);
            expect(result[0].y).toBeCloseTo(0);
        });
    });

    describe('transformPatternShift', () => {
        it('returns a new pattern with shifted points', () => {
            const pattern = createTestPattern();
            const result = transformPatternShift(pattern, 0.1, 0.1);

            expect(result.id).toBe(pattern.id);
            expect(result.name).toBe(pattern.name);
            expect(result.points[0].x).toBe(0.1);
            expect(result.points[0].y).toBe(0.1);
        });

        it('updates the updatedAt timestamp', () => {
            const pattern = createTestPattern();
            const result = transformPatternShift(pattern, 0, 0);

            expect(result.updatedAt).not.toBe(pattern.updatedAt);
        });

        it('does not mutate the original pattern', () => {
            const pattern = createTestPattern();
            const originalX = pattern.points[0].x;

            transformPatternShift(pattern, 0.5, 0.5);

            expect(pattern.points[0].x).toBe(originalX);
        });
    });

    describe('transformPatternScale', () => {
        it('returns a new pattern with scaled points', () => {
            const pattern = createTestPattern();
            const result = transformPatternScale(pattern, 2, 2);

            expect(result.points[1].x).toBe(1);
            expect(result.points[1].y).toBe(1);
        });

        it('updates the updatedAt timestamp', () => {
            const pattern = createTestPattern();
            const result = transformPatternScale(pattern, 1, 1);

            expect(result.updatedAt).not.toBe(pattern.updatedAt);
        });
    });

    describe('transformPatternRotate', () => {
        it('returns a new pattern with rotated points', () => {
            const pattern: Pattern = {
                ...createTestPattern(),
                points: [{ id: 'p1', x: 1, y: 0 }],
            };
            const result = transformPatternRotate(pattern, 90);

            expect(result.points[0].x).toBeCloseTo(0);
            expect(result.points[0].y).toBeCloseTo(1);
        });

        it('updates the updatedAt timestamp', () => {
            const pattern = createTestPattern();
            const result = transformPatternRotate(pattern, 0);

            expect(result.updatedAt).not.toBe(pattern.updatedAt);
        });
    });
});
