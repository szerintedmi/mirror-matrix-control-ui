import { describe, expect, it } from 'vitest';

import { planProfilePlayback } from '../profilePlaybackPlanner';

import type {
    CalibrationProfile,
    MirrorConfig,
    Pattern,
    TileCalibrationResults,
} from '../../types';

const buildMirrorConfig = (
    rows: number,
    cols: number,
    options?: { missingY?: boolean },
): MirrorConfig => {
    const map: MirrorConfig = new Map();
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            map.set(`${row}-${col}`, {
                x: { nodeMac: 'AA:BB:CC:DD:EE:FF', motorIndex: row * cols + col },
                y: options?.missingY
                    ? null
                    : { nodeMac: 'AA:BB:CC:DD:EE:FF', motorIndex: row * cols + col + 100 },
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
        y: -0.001,
    },
    sizeDeltaAtStepTest: 0,
    axes: {
        x: {
            stepRange: { minSteps: -1_200, maxSteps: 1_200 },
            stepScale: 1_000,
        },
        y: {
            stepRange: { minSteps: -1_200, maxSteps: 1_200 },
            stepScale: -1_000,
        },
    },
    inferredBounds: {
        x: { min: -1, max: 1 },
        y: { min: -1, max: 1 },
    },
});

const createProfile = (
    rows: number,
    cols: number,
    options?: { calibrated?: boolean; includeBlueprint?: boolean },
): CalibrationProfile => {
    const calibrated = options?.calibrated ?? true;
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
        gridBlueprint:
            options?.includeBlueprint === false
                ? null
                : {
                      adjustedTileFootprint: { width: 0.2, height: 0.2 },
                      tileGap: { x: 0.05, y: 0.05 },
                      gridOrigin: { x: -0.5, y: -0.5 },
                  },
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

const createPattern = (points: Array<{ x: number; y: number }>): Pattern => ({
    id: 'pattern-1',
    name: 'Pattern',
    createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2025-01-01T01:00:00.000Z').toISOString(),
    points: points.map((point, index) => ({
        id: `pt-${index}`,
        x: point.x,
        y: point.y,
    })),
});

describe('profilePlaybackPlanner', () => {
    const gridSize = { rows: 2, cols: 2 };

    it('requires both pattern and profile', () => {
        const mirrorConfig = buildMirrorConfig(gridSize.rows, gridSize.cols);
        const resultNoPattern = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile: createProfile(gridSize.rows, gridSize.cols),
            pattern: null,
        });
        expect(resultNoPattern.errors).toHaveLength(1);
        expect(resultNoPattern.errors[0].code).toBe('missing_pattern');

        const resultNoProfile = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile: null,
            pattern: createPattern([{ x: 0, y: 0 }]),
        });
        expect(resultNoProfile.errors[0].code).toBe('missing_profile');
    });

    it('rejects profiles without a grid blueprint', () => {
        const mirrorConfig = buildMirrorConfig(gridSize.rows, gridSize.cols);
        const result = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile: createProfile(gridSize.rows, gridSize.cols, { includeBlueprint: false }),
            pattern: createPattern([{ x: 0, y: 0 }]),
        });
        expect(result.errors[0].code).toBe('profile_missing_blueprint');
    });

    it('produces axis targets when data is calibrated', () => {
        const mirrorConfig = buildMirrorConfig(gridSize.rows, gridSize.cols);
        const profile = createProfile(gridSize.rows, gridSize.cols);
        const pattern = createPattern([
            { x: 0.2, y: -0.1 },
            { x: -0.3, y: 0.4 },
        ]);

        const result = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        expect(result.tiles).toHaveLength(4);
        expect(result.playableAxisTargets).toHaveLength(pattern.points.length * 2);
        const firstAxis = result.playableAxisTargets.find(
            (entry) => entry.axis === 'x' && entry.patternPointId === 'pt-0',
        );
        expect(firstAxis).toBeDefined();
        expect(firstAxis!.targetSteps).toBe(200);
        expect(result.errors).toHaveLength(0);
    });

    it('flags targets that exceed calibrated bounds or missing motors', () => {
        const mirrorConfig = buildMirrorConfig(gridSize.rows, gridSize.cols, { missingY: true });
        const profile = createProfile(gridSize.rows, gridSize.cols);
        profile.tiles['0-0'].inferredBounds = {
            x: { min: -0.5, max: 0.5 },
            y: { min: -0.5, max: 0.5 },
        };

        const pattern = createPattern([{ x: 0.9, y: 0.9 }]);
        const result = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        expect(result.errors.some((error) => error.code === 'target_out_of_bounds')).toBe(true);
        expect(result.errors.some((error) => error.code === 'missing_motor')).toBe(true);
        expect(result.playableAxisTargets.length).toBe(0);
    });

    it('reports insufficient calibrated tiles when demand exceeds capacity', () => {
        const mirrorConfig = buildMirrorConfig(gridSize.rows, gridSize.cols);
        const profile = createProfile(gridSize.rows, gridSize.cols, { calibrated: false });
        const pattern = createPattern([
            { x: 0, y: 0 },
            { x: 0.1, y: 0.1 },
            { x: -0.1, y: -0.1 },
        ]);

        const result = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        expect(result.errors.some((error) => error.code === 'insufficient_calibrated_tiles')).toBe(
            true,
        );
    });
});
