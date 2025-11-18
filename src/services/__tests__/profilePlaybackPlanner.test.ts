import { describe, expect, it } from 'vitest';

import { planProfilePlayback } from '../profilePlaybackPlanner';

import type {
    Pattern,
    CalibrationProfile,
    TileCalibrationResults,
    MirrorConfig,
} from '../../types';

const createMirrorConfig = (rows: number, cols: number): MirrorConfig => {
    const map: MirrorConfig = new Map();
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            map.set(`${row}-${col}`, {
                x: { nodeMac: 'AA:BB:CC:DD:EE:FF', motorIndex: row * cols + col },
                y: { nodeMac: 'AA:BB:CC:DD:EE:FF', motorIndex: row * cols + col + 100 },
            });
        }
    }
    return map;
};

const createCalibratedTile = (row: number, col: number): TileCalibrationResults => ({
    key: `${row}-${col}`,
    row,
    col,
    status: 'completed',
    error: null,
    adjustedHome: { x: 0, y: 0, stepsX: 0, stepsY: 0 },
    homeOffset: { dx: 0, dy: 0, stepsX: 0, stepsY: 0 },
    homeMeasurement: null,
    stepToDisplacement: {
        x: 0.001,
        y: 0.001,
    },
    sizeDeltaAtStepTest: 0,
    axes: {
        x: {
            stepRange: { minSteps: -1200, maxSteps: 1200 },
            stepScale: 1000,
        },
        y: {
            stepRange: { minSteps: -1200, maxSteps: 1200 },
            stepScale: 1000,
        },
    },
    inferredBounds: {
        x: { min: -1, max: 1 },
        y: { min: -1, max: 1 },
    },
});

const createProfile = (rows: number, cols: number, calibrated = true): CalibrationProfile => {
    const tiles: Record<string, TileCalibrationResults> = {};
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const key = `${row}-${col}`;
            tiles[key] = calibrated
                ? createCalibratedTile(row, col)
                : {
                      ...createCalibratedTile(row, col),
                      status: 'pending',
                      adjustedHome: null,
                  };
        }
    }
    return {
        id: 'profile-1',
        schemaVersion: 2,
        name: 'Profile',
        createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2025-01-01T01:00:00.000Z').toISOString(),
        gridSize: { rows, cols },
        gridBlueprint: null,
        stepTestSettings: { deltaSteps: 400 },
        gridStateFingerprint: {
            hash: 'fingerprint',
            snapshot: {
                version: 1,
                gridSize: { rows, cols },
                assignments: {},
            },
        },
        calibrationSpace: {
            blobStats: null,
            globalBounds: null,
        },
        tiles,
        metrics: {
            totalTiles: rows * cols,
            completedTiles: calibrated ? rows * cols : 0,
            failedTiles: 0,
            skippedTiles: 0,
        },
    };
};

const createPattern = (pointCount: number): Pattern => ({
    id: 'pattern-1',
    name: 'Pattern',
    createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2025-01-01T01:00:00.000Z').toISOString(),
    points: Array.from({ length: pointCount }, (_, index) => ({
        id: `pt-${index}`,
        x: 0,
        y: 0,
    })),
});

describe('profilePlaybackPlanner', () => {
    it('returns empty plan when profile or pattern is missing', () => {
        const gridSize = { rows: 2, cols: 2 };
        const mirrorConfig = createMirrorConfig(gridSize.rows, gridSize.cols);

        const resultNoProfile = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile: null,
            pattern: createPattern(1),
        });
        expect(resultNoProfile.mirrors).toHaveLength(0);
        expect(resultNoProfile.errors).toHaveLength(0);

        const profile = createProfile(gridSize.rows, gridSize.cols);
        const resultNoPattern = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern: null,
        });
        expect(resultNoPattern.mirrors).toHaveLength(0);
        expect(resultNoPattern.errors).toHaveLength(0);
    });

    it('returns error when pattern has more points than mirrors', () => {
        const gridSize = { rows: 2, cols: 2 };
        const mirrorConfig = createMirrorConfig(gridSize.rows, gridSize.cols);
        const profile = createProfile(gridSize.rows, gridSize.cols);
        const pattern = createPattern(5);

        const result = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('pattern_exceeds_mirrors');
        expect(result.mirrors).toHaveLength(0);
    });

    it('assigns pattern points to mirrors when calibrated', () => {
        const gridSize = { rows: 2, cols: 2 };
        const mirrorConfig = createMirrorConfig(gridSize.rows, gridSize.cols);
        const profile = createProfile(gridSize.rows, gridSize.cols);
        const pattern = createPattern(3);

        const result = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        expect(result.mirrors).toHaveLength(4);
        const assigned = result.mirrors.filter((mirror) => mirror.patternId !== null);
        expect(assigned).toHaveLength(3);
        expect(result.errors).toHaveLength(0);
    });

    it('marks mirrors as invalid when tiles are not calibrated', () => {
        const gridSize = { rows: 2, cols: 2 };
        const mirrorConfig = createMirrorConfig(gridSize.rows, gridSize.cols);
        const profile = createProfile(gridSize.rows, gridSize.cols, false);
        const pattern = createPattern(2);

        const result = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        expect(result.mirrors).toHaveLength(4);
        const mirrorsWithAssignments = result.mirrors.filter((mirror) => mirror.patternId !== null);
        expect(mirrorsWithAssignments).toHaveLength(2);
        mirrorsWithAssignments.forEach((mirror) => {
            expect(mirror.errors).toHaveLength(1);
            expect(mirror.errors[0].code).toBe('invalid_target');
        });
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
});
