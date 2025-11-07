import { describe, expect, it } from 'vitest';

import { DEFAULT_PROJECTION_SETTINGS } from '../../constants/projection';
import { anglesToVector } from '../orientation';
import { solveReflection } from '../reflectionSolver';

import type { Pattern, ProjectionSettings } from '../../types';

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
});
