import { describe, expect, it } from 'vitest';

import { DEFAULT_PROJECTION_SETTINGS } from '../../constants/projection';
import { TILE_PLACEMENT_UNIT } from '../../constants/pattern';
import { anglesToVector, deriveWallBasis } from '../orientation';
import { solveReflection } from '../reflectionSolver';

import type { Pattern, ProjectionSettings, Vec3 } from '../../types';

const cloneProjection = (): ProjectionSettings => ({
    wallDistance: DEFAULT_PROJECTION_SETTINGS.wallDistance,
    wallOrientation: {
        ...DEFAULT_PROJECTION_SETTINGS.wallOrientation,
        vector: { ...DEFAULT_PROJECTION_SETTINGS.wallOrientation.vector },
    },
    sunOrientation: {
        ...DEFAULT_PROJECTION_SETTINGS.sunOrientation,
        vector: { ...DEFAULT_PROJECTION_SETTINGS.sunOrientation.vector },
    },
    worldUpOrientation: {
        ...DEFAULT_PROJECTION_SETTINGS.worldUpOrientation,
        vector: { ...DEFAULT_PROJECTION_SETTINGS.worldUpOrientation.vector },
    },
    projectionOffset: DEFAULT_PROJECTION_SETTINGS.projectionOffset,
    pixelSpacing: { ...DEFAULT_PROJECTION_SETTINGS.pixelSpacing },
    sunAngularDiameterDeg: DEFAULT_PROJECTION_SETTINGS.sunAngularDiameterDeg,
    slopeBlurSigmaDeg: DEFAULT_PROJECTION_SETTINGS.slopeBlurSigmaDeg,
});

const subVec = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
});

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

describe('reflectionSolver', () => {
    it('produces near-zero yaw/pitch when wall and sun vectors align with mirror normal', () => {
        const projection = cloneProjection();
        projection.sunOrientation = {
            mode: 'angles',
            yaw: 0,
            pitch: 0,
            vector: anglesToVector(0, 0, 'forward'),
        };
        projection.wallOrientation = {
            mode: 'vector',
            yaw: 0,
            pitch: 0,
            vector: anglesToVector(0, 0, 'forward'),
        };
        const result = solveReflection({
            gridSize: { rows: 1, cols: 1 },
            projection,
            pattern: null,
        });
        expect(result.errors).toHaveLength(0);
        result.mirrors.forEach((mirror) => {
            if (mirror.patternId === null) {
                return;
            }
            expect(Math.abs(mirror.yaw ?? 0)).toBeLessThan(5e-2);
            expect(Math.abs(mirror.pitch ?? 0)).toBeLessThan(5e-2);
            expect(mirror.errors).toHaveLength(0);
            expect(mirror.wallHit?.z ?? 0).toBeCloseTo(-projection.wallDistance, 3);
        });
    });

    it('keeps fallback mirrors neutral when wall and sun orientations are zeroed', () => {
        const projection = cloneProjection();
        projection.sunOrientation = {
            mode: 'angles',
            yaw: 0,
            pitch: 0,
            vector: anglesToVector(0, 0, 'forward'),
        };
        projection.wallOrientation = {
            mode: 'vector',
            yaw: 0,
            pitch: 0,
            vector: anglesToVector(0, 0, 'forward'),
        };

        const result = solveReflection({
            gridSize: { rows: 3, cols: 4 },
            projection,
            pattern: null,
        });

        expect(result.errors).toHaveLength(0);
        const solvedMirrors = result.mirrors.filter((mirror) => mirror.patternId !== null);
        expect(solvedMirrors).toHaveLength(12);
        solvedMirrors.forEach((mirror) => {
            expect(Math.abs(mirror.yaw ?? 0)).toBeLessThan(5e-2);
            expect(Math.abs(mirror.pitch ?? 0)).toBeLessThan(5e-2);
            expect(mirror.errors).toHaveLength(0);
        });
    });

    it('tilts mirrors by half the horizontal sun offset when reflecting straight ahead', () => {
        const projection = cloneProjection();
        projection.sunOrientation = {
            mode: 'angles',
            yaw: -10,
            pitch: 0,
            vector: anglesToVector(-10, 0, 'forward'),
        };
        projection.wallOrientation = {
            mode: 'vector',
            yaw: 0,
            pitch: 0,
            vector: anglesToVector(0, 0, 'forward'),
        };

        const result = solveReflection({
            gridSize: { rows: 1, cols: 1 },
            projection,
            pattern: null,
        });

        expect(result.errors).toHaveLength(0);
        const mirror = result.mirrors[0];
        expect(mirror.patternId).not.toBeNull();
        expect(mirror.errors).toHaveLength(0);
        expect(mirror.yaw ?? 999).toBeCloseTo(-5, 1);
        expect(Math.abs(mirror.pitch ?? 0)).toBeLessThan(1e-2);
    });

    it('returns invalid_wall_basis when wall normal is parallel to world up', () => {
        const projection = cloneProjection();
        projection.worldUpOrientation = {
            ...projection.worldUpOrientation,
            vector: { ...projection.wallOrientation.vector },
        };
        const result = solveReflection({
            gridSize: { rows: 2, cols: 2 },
            projection,
            pattern: null,
        });
        expect(result.errors.some((error) => error.code === 'invalid_wall_basis')).toBe(true);
        expect(result.assignments).toHaveLength(0);
        result.mirrors.forEach((mirror) => {
            expect(mirror.errors.some((error) => error.code === 'invalid_wall_basis')).toBe(true);
        });
    });

    it('reports pattern_exceeds_mirrors when pattern size is too large', () => {
        const projection = cloneProjection();
        const oversizedPattern: Pattern = {
            id: 'oversized',
            name: 'oversized',
            canvas: { width: 100, height: 100 },
            tiles: Array.from({ length: 5 }).map((_, index) => ({
                id: `tile-${index}`,
                center: { x: 10 * index + 5, y: 5 },
                size: { width: 5, height: 5 },
            })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const result = solveReflection({
            gridSize: { rows: 2, cols: 2 },
            projection,
            pattern: oversizedPattern,
        });
        expect(result.errors.some((error) => error.code === 'pattern_exceeds_mirrors')).toBe(true);
    });

    it('preserves pixel spacing on the wall when yawed without a pattern', () => {
        const projection = cloneProjection();
        projection.wallOrientation = {
            mode: 'angles',
            yaw: 30,
            pitch: 0,
            vector: anglesToVector(30, 0, 'forward'),
        };
        const result = solveReflection({
            gridSize: { rows: 1, cols: 2 },
            projection,
            pattern: null,
        });

        expect(result.errors).toHaveLength(0);
        const solvedMirrors = result.mirrors
            .filter((mirror) => mirror.patternId !== null && mirror.wallHit)
            .sort((a, b) => (a.col ?? 0) - (b.col ?? 0));
        expect(solvedMirrors).toHaveLength(2);

        const { uWall } = deriveWallBasis(projection.wallOrientation, projection.worldUpOrientation);
        const delta = subVec(solvedMirrors[1].wallHit as Vec3, solvedMirrors[0].wallHit as Vec3);
        const spacingAlongWall = Math.abs(dot(delta, uWall));
        expect(spacingAlongWall).toBeCloseTo(projection.pixelSpacing.x, 6);
    });

    it('maps pattern tile spacing onto the wall basis even when the wall is rotated', () => {
        const projection = cloneProjection();
        projection.wallOrientation = {
            mode: 'angles',
            yaw: 20,
            pitch: 10,
            vector: anglesToVector(20, 10, 'forward'),
        };
        projection.sunOrientation = {
            mode: 'angles',
            yaw: -5,
            pitch: -10,
            vector: anglesToVector(-5, -10, 'forward'),
        };

        const pattern: Pattern = {
            id: 'two-tiles',
            name: 'two-tiles',
            canvas: { width: 40, height: 20 },
            tiles: [
                {
                    id: 'tile-a',
                    center: { x: TILE_PLACEMENT_UNIT / 2, y: TILE_PLACEMENT_UNIT / 2 },
                    size: { width: TILE_PLACEMENT_UNIT, height: TILE_PLACEMENT_UNIT },
                },
                {
                    id: 'tile-b',
                    center: { x: (TILE_PLACEMENT_UNIT * 5) / 2, y: TILE_PLACEMENT_UNIT / 2 },
                    size: { width: TILE_PLACEMENT_UNIT, height: TILE_PLACEMENT_UNIT },
                },
            ],
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
        };

        const result = solveReflection({
            gridSize: { rows: 1, cols: 2 },
            projection,
            pattern,
        });

        expect(result.errors).toHaveLength(0);
        const solvedMirrors = result.mirrors.filter(
            (mirror) => mirror.patternId && mirror.wallHit,
        );
        expect(solvedMirrors).toHaveLength(2);

        const hitsByPatternId = new Map(
            solvedMirrors.map((mirror) => [mirror.patternId as string, mirror.wallHit as Vec3]),
        );
        const hitA = hitsByPatternId.get('tile-a');
        const hitB = hitsByPatternId.get('tile-b');
        expect(hitA).toBeDefined();
        expect(hitB).toBeDefined();

        const { uWall } = deriveWallBasis(projection.wallOrientation, projection.worldUpOrientation);
        const delta = subVec(hitB as Vec3, hitA as Vec3);
        const spacingUnits =
            (pattern.tiles[1].center.x - pattern.tiles[0].center.x) / TILE_PLACEMENT_UNIT;
        const expectedSpacing = spacingUnits * projection.pixelSpacing.x;
        expect(Math.abs(dot(delta, uWall))).toBeCloseTo(expectedSpacing, 6);
    });

});
