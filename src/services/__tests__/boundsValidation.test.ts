// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { validatePatternInProfile, validateWaypointsInProfile } from '../boundsValidation';

import type { CalibrationProfile, PatternPoint, TileCalibrationResults } from '../../types';
import type { AnimationWaypoint } from '../../types/animation';

// Test helpers
const createTileWithBounds = (
    key: string,
    row: number,
    col: number,
    bounds: { x: { min: number; max: number }; y: { min: number; max: number } },
): TileCalibrationResults => ({
    key,
    row,
    col,
    status: 'completed',
    error: null,
    adjustedHome: { x: 0, y: 0, stepsX: 0, stepsY: 0 },
    homeOffset: { dx: 0, dy: 0, stepsX: 0, stepsY: 0 },
    homeMeasurement: null,
    stepToDisplacement: { x: 0.001, y: -0.001 },
    sizeDeltaAtStepTest: 0,
    axes: {
        x: { stepRange: { minSteps: -1200, maxSteps: 1200 }, stepScale: 1000 },
        y: { stepRange: { minSteps: -1200, maxSteps: 1200 }, stepScale: -1000 },
    },
    combinedBounds: bounds,
});

const createProfile = (
    tiles: Record<string, TileCalibrationResults>,
    options?: { aspect?: number; rotation?: 0 | 90 | 180 | 270 },
): CalibrationProfile =>
    ({
        id: 'test-profile',
        schemaVersion: 1,
        name: 'Test Profile',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        arrayRotation: options?.rotation ?? 0,
        gridSize: { rows: 2, cols: 2 },
        gridBlueprint: null,
        stepTestSettings: { deltaSteps: 100 },
        gridStateFingerprint: { hash: 'test', snapshot: { version: 1 } },
        calibrationCameraAspect: options?.aspect ?? 1, // Use 1 for simpler testing
        calibrationCameraResolution: null,
        calibrationSpace: { blobStats: null },
        tiles,
        metrics: {
            totalTiles: Object.keys(tiles).length,
            completedTiles: Object.keys(tiles).length,
            failedTiles: 0,
            skippedTiles: 0,
        },
    }) as CalibrationProfile;

const point = (id: string, x: number, y: number): PatternPoint => ({ id, x, y });
const waypoint = (id: string, x: number, y: number): AnimationWaypoint => ({ id, x, y });

describe('boundsValidation', () => {
    describe('validatePatternInProfile', () => {
        it('returns valid for points within tile bounds', () => {
            const tiles = {
                '0-0': createTileWithBounds('0-0', 0, 0, {
                    x: { min: -1, max: 1 },
                    y: { min: -1, max: 1 },
                }),
            };
            const profile = createProfile(tiles);
            const points = [point('p1', 0, 0), point('p2', 0.5, 0.5)];

            const result = validatePatternInProfile(points, { profile });

            expect(result.isValid).toBe(true);
            expect(result.invalidPointIds.size).toBe(0);
            expect(result.errors).toHaveLength(0);
            expect(result.pointResults.get('p1')?.isValid).toBe(true);
            expect(result.pointResults.get('p2')?.isValid).toBe(true);
        });

        it('returns invalid for points outside all tile bounds', () => {
            const tiles = {
                '0-0': createTileWithBounds('0-0', 0, 0, {
                    x: { min: -0.5, max: 0.5 },
                    y: { min: -0.5, max: 0.5 },
                }),
            };
            const profile = createProfile(tiles);
            const points = [point('p1', 0.8, 0)]; // Outside X bounds

            const result = validatePatternInProfile(points, { profile });

            expect(result.isValid).toBe(false);
            expect(result.invalidPointIds.has('p1')).toBe(true);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('no_valid_tile_for_point');
            expect(result.errors[0].pointId).toBe('p1');
        });

        it('returns validTileKeys for points within multiple tile bounds', () => {
            const tiles = {
                '0-0': createTileWithBounds('0-0', 0, 0, {
                    x: { min: -1, max: 0.5 },
                    y: { min: -1, max: 1 },
                }),
                '0-1': createTileWithBounds('0-1', 0, 1, {
                    x: { min: -0.5, max: 1 },
                    y: { min: -1, max: 1 },
                }),
            };
            const profile = createProfile(tiles);
            const points = [point('p1', 0, 0)]; // Center, within both tiles

            const result = validatePatternInProfile(points, { profile });

            expect(result.isValid).toBe(true);
            const p1Result = result.pointResults.get('p1');
            expect(p1Result?.validTileKeys).toContain('0-0');
            expect(p1Result?.validTileKeys).toContain('0-1');
            expect(p1Result?.validTileKeys).toHaveLength(2);
        });

        it('validates points at boundary edges correctly', () => {
            const tiles = {
                '0-0': createTileWithBounds('0-0', 0, 0, {
                    x: { min: -1, max: 1 },
                    y: { min: -1, max: 1 },
                }),
            };
            const profile = createProfile(tiles);

            // Points exactly at boundaries
            const edgePoints = [
                point('left', -1, 0),
                point('right', 1, 0),
                point('top', 0, 1),
                point('bottom', 0, -1),
            ];

            const result = validatePatternInProfile(edgePoints, { profile });

            expect(result.isValid).toBe(true);
            edgePoints.forEach((p) => {
                expect(result.pointResults.get(p.id)?.isValid).toBe(true);
            });
        });

        it('handles empty points array', () => {
            const tiles = {
                '0-0': createTileWithBounds('0-0', 0, 0, {
                    x: { min: -1, max: 1 },
                    y: { min: -1, max: 1 },
                }),
            };
            const profile = createProfile(tiles);

            const result = validatePatternInProfile([], { profile });

            expect(result.isValid).toBe(true);
            expect(result.invalidPointIds.size).toBe(0);
            expect(result.errors).toHaveLength(0);
        });

        it('handles profile with no tiles having bounds', () => {
            const tiles = {
                '0-0': {
                    ...createTileWithBounds('0-0', 0, 0, {
                        x: { min: 0, max: 0 },
                        y: { min: 0, max: 0 },
                    }),
                    combinedBounds: null, // No bounds
                },
            };
            const profile = createProfile(tiles);
            const points = [point('p1', 0, 0)];

            const result = validatePatternInProfile(points, { profile });

            // No tiles with bounds means point has no valid tiles
            expect(result.isValid).toBe(false);
            expect(result.invalidPointIds.has('p1')).toBe(true);
        });

        describe('aspect ratio handling', () => {
            it('applies aspect ratio scaling to Y coordinate', () => {
                // With aspect = 2, pattern Y=0.5 becomes centered Y=1.0
                // Tile bounds of y: [-1, 0.9] won't contain Y=1.0
                const tiles = {
                    '0-0': createTileWithBounds('0-0', 0, 0, {
                        x: { min: -1, max: 1 },
                        y: { min: -1, max: 0.9 }, // Doesn't reach Y=1.0
                    }),
                };
                const profile = createProfile(tiles, { aspect: 2 });
                const points = [point('p1', 0, 0.5)]; // Y=0.5 * 2 = 1.0

                const result = validatePatternInProfile(points, { profile });

                expect(result.isValid).toBe(false);
                expect(result.invalidPointIds.has('p1')).toBe(true);
            });

            it('validates correctly with matching aspect ratio bounds', () => {
                // With aspect = 2, pattern Y=0.5 becomes centered Y=1.0
                // Tile bounds of y: [-2, 2] will contain Y=1.0
                const tiles = {
                    '0-0': createTileWithBounds('0-0', 0, 0, {
                        x: { min: -1, max: 1 },
                        y: { min: -2, max: 2 }, // Contains scaled Y
                    }),
                };
                const profile = createProfile(tiles, { aspect: 2 });
                const points = [point('p1', 0, 0.5)];

                const result = validatePatternInProfile(points, { profile });

                expect(result.isValid).toBe(true);
            });
        });

        describe('rotation handling', () => {
            it('applies 90° rotation before bounds check', () => {
                // With 90° CW rotation, (1, 0) becomes (0, -1)
                const tiles = {
                    '0-0': createTileWithBounds('0-0', 0, 0, {
                        x: { min: -0.5, max: 0.5 }, // Doesn't contain X=1
                        y: { min: -1, max: 1 },
                    }),
                };
                const profileNoRotation = createProfile(tiles, { rotation: 0 });
                const profileWithRotation = createProfile(tiles, { rotation: 90 });
                const points = [point('p1', 1, 0)];

                // Without rotation: X=1 is outside X bounds [-0.5, 0.5]
                const resultNoRotation = validatePatternInProfile(points, {
                    profile: profileNoRotation,
                });
                expect(resultNoRotation.isValid).toBe(false);

                // With 90° rotation: (1, 0) → (0, -1), now X=0 is inside
                const resultWithRotation = validatePatternInProfile(points, {
                    profile: profileWithRotation,
                });
                expect(resultWithRotation.isValid).toBe(true);
            });

            it('applies 180° rotation before bounds check', () => {
                // With 180° rotation, (1, 0) becomes (-1, 0)
                const tiles = {
                    '0-0': createTileWithBounds('0-0', 0, 0, {
                        x: { min: -1, max: 0 }, // Only negative X
                        y: { min: -1, max: 1 },
                    }),
                };
                const profile = createProfile(tiles, { rotation: 180 });
                const points = [point('p1', 1, 0)]; // Becomes (-1, 0)

                const result = validatePatternInProfile(points, { profile });

                expect(result.isValid).toBe(true);
            });
        });

        describe('error generation', () => {
            it('generates error with correct message format', () => {
                const tiles = {
                    '0-0': createTileWithBounds('0-0', 0, 0, {
                        x: { min: -0.5, max: 0.5 },
                        y: { min: -0.5, max: 0.5 },
                    }),
                };
                const profile = createProfile(tiles);
                const points = [point('my-point', 0.75, -0.25)];

                const result = validatePatternInProfile(points, { profile });

                expect(result.errors[0].message).toContain('my-point');
                expect(result.errors[0].message).toContain('0.750');
                expect(result.errors[0].message).toContain('-0.250');
            });

            it('generates separate errors for each invalid point', () => {
                const tiles = {
                    '0-0': createTileWithBounds('0-0', 0, 0, {
                        x: { min: -0.5, max: 0.5 },
                        y: { min: -0.5, max: 0.5 },
                    }),
                };
                const profile = createProfile(tiles);
                const points = [
                    point('valid', 0, 0),
                    point('invalid1', 0.8, 0),
                    point('invalid2', 0, 0.9),
                ];

                const result = validatePatternInProfile(points, { profile });

                expect(result.errors).toHaveLength(2);
                expect(result.errors.map((e) => e.pointId).sort()).toEqual([
                    'invalid1',
                    'invalid2',
                ]);
            });
        });
    });

    describe('validateWaypointsInProfile', () => {
        it('validates waypoints the same as pattern points', () => {
            const tiles = {
                '0-0': createTileWithBounds('0-0', 0, 0, {
                    x: { min: -1, max: 1 },
                    y: { min: -1, max: 1 },
                }),
            };
            const profile = createProfile(tiles);
            const waypoints = [waypoint('w1', 0.5, 0.5), waypoint('w2', 1.5, 0)];

            const result = validateWaypointsInProfile(waypoints, { profile });

            expect(result.isValid).toBe(false);
            expect(result.invalidPointIds.has('w1')).toBe(false);
            expect(result.invalidPointIds.has('w2')).toBe(true);
        });

        it('handles empty waypoints array', () => {
            const tiles = {
                '0-0': createTileWithBounds('0-0', 0, 0, {
                    x: { min: -1, max: 1 },
                    y: { min: -1, max: 1 },
                }),
            };
            const profile = createProfile(tiles);

            const result = validateWaypointsInProfile([], { profile });

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
});
