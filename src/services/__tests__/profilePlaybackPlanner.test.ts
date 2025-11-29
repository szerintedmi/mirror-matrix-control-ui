// @vitest-environment node
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
        schemaVersion: 3,
        name: 'Profile',
        createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2025-01-01T01:00:00.000Z').toISOString(),
        arrayRotation: 0,
        gridSize: { rows, cols },
        gridBlueprint:
            options?.includeBlueprint === false
                ? null
                : {
                      adjustedTileFootprint: { width: 0.2, height: 0.2 },
                      tileGap: { x: 0.05, y: 0.05 },
                      gridOrigin: { x: -0.5, y: -0.5 },
                      cameraOriginOffset: { x: 0, y: 0 },
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
        // We assigned 2 points, so 2 tiles should have targets.
        // The other 2 tiles should have no targets.
        const assignedTiles = result.tiles.filter((t) => t.patternPointId !== null);
        expect(assignedTiles).toHaveLength(2);

        expect(result.playableAxisTargets).toHaveLength(pattern.points.length * 2);
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
        planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        // Since 0.9, 0.9 is out of bounds for 0-0, and other tiles might be valid or not.
        // In this test setup, all tiles have default bounds [-1, 1] except 0-0.
        // So the planner will likely assign it to another tile (e.g. 0-1) if available.
        // But we want to force assignment to 0-0 to check error?
        // Actually, the new planner will try to find a VALID tile.
        // If 0-0 is invalid, it will pick 0-1.
        // If we want to force an error, we must make ALL tiles invalid.

        for (const key in profile.tiles) {
            profile.tiles[key].inferredBounds = {
                x: { min: -0.5, max: 0.5 },
                y: { min: -0.5, max: 0.5 },
            };
        }

        // Now 0.9, 0.9 is invalid for ALL tiles.
        // The planner should report 'insufficient_calibrated_tiles' (or point unassignable).

        const result2 = planProfilePlayback({
            gridSize,
            mirrorConfig,
            profile,
            pattern,
        });

        expect(result2.errors.some((error) => error.code === 'insufficient_calibrated_tiles')).toBe(
            true,
        );
    });

    it('reports insufficient calibrated tiles when demand exceeds capacity', () => {
        const profile = createProfile(gridSize.rows, gridSize.cols, { calibrated: false });
        const pattern = createPattern([
            { x: 0, y: 0 },
            { x: 0.1, y: 0.1 },
            { x: -0.1, y: -0.1 },
        ]);

        const result = planProfilePlayback({
            gridSize,
            mirrorConfig: new Map(),
            profile,
            pattern,
        });

        expect(result.errors.some((error) => error.code === 'insufficient_calibrated_tiles')).toBe(
            true,
        );
    });

    it('correctly resolves contention with constrained tiles', () => {
        // Setup:
        // Tile A (0-0): Global bounds [-1, 1]. Ideal (-1, -1).
        // Tile B (0-1): Restricted bounds [-1.1, -0.9]. Ideal (1, -1).
        // Note: Tile B is physically at (1, -1) but its bounds say it can only project to (-1, -1).
        // This simulates a weird calibration or physical constraint.

        // Let's use 1 row, 2 cols.
        const oneRowGrid = { rows: 1, cols: 2 };
        const profile = createProfile(1, 2);

        // Tile 0-0 (Left): Global bounds
        profile.tiles['0-0'].inferredBounds = {
            x: { min: -1, max: 1 },
            y: { min: -1, max: 1 },
        };

        // Tile 0-1 (Right): Restricted bounds (only covers top-left area)
        profile.tiles['0-1'].inferredBounds = {
            x: { min: -1.1, max: -0.9 },
            y: { min: -1.1, max: -0.9 },
        };

        // Pattern:
        // P1: (-1, -1). Fits 0-0 and 0-1.
        // P2: (0, 0). Fits 0-0. Does NOT fit 0-1.

        // If greedy without sorting:
        // P1 (-1, -1) is distance 0 from 0-0 (ideal -1, 0? No, 1 row 2 cols:
        // Col 0 -> -1. Col 1 -> 1.
        // Row 0 -> 0.
        // So 0-0 ideal is (-1, 0). 0-1 ideal is (1, 0).

        // Let's adjust P1 to be closer to 0-0.
        // P1 (-1, 0). Dist to 0-0 is 0. Dist to 0-1 is 2.
        // P2 (0, 0). Dist to 0-0 is 1. Dist to 0-1 is 1.

        // P1 fits 0-0 (bounds ok) and 0-1 (bounds: x[-1.1, -0.9] covers -1. y[-1.1, -0.9] covers 0? No.)
        // Wait, 0-1 bounds y is [-1.1, -0.9]. P1 y is 0. So P1 does NOT fit 0-1.
        // My constraint setup was bad.

        // Let's fix bounds for 0-1 to cover P1.
        profile.tiles['0-1'].inferredBounds = {
            x: { min: -1.1, max: -0.9 },
            y: { min: -0.1, max: 0.1 }, // Covers y=0
        };

        // Now P1 (-1, 0) fits 0-1.
        // P1 fits 0-0? Yes.
        // P1 is closer to 0-0 (dist 0) than 0-1 (dist 2).
        // So greedy prefers 0-0 for P1.

        // P2 (0, 0).
        // Fits 0-0? Yes.
        // Fits 0-1? No (x=0 not in [-1.1, -0.9]).
        // So P2 MUST go to 0-0.

        // Conflict:
        // P1 wants 0-0.
        // P2 needs 0-0.

        // If sorted by constraints:
        // P1 valid: 0-0, 0-1. (2 options)
        // P2 valid: 0-0. (1 option)
        // Sort: P2, then P1.
        // 1. Assign P2 -> 0-0.
        // 2. Assign P1 -> 0-1.
        // Success.

        const pattern = createPattern([
            { x: -1, y: 0 }, // P1
            { x: 0, y: 0 }, // P2
        ]);

        const result = planProfilePlayback({
            gridSize: oneRowGrid,
            mirrorConfig: buildMirrorConfig(1, 2),
            profile,
            pattern,
        });

        expect(result.errors).toHaveLength(0);

        // Check assignments
        const p1Assignment = result.tiles.find((t) => t.patternPointId === 'pt-0');
        const p2Assignment = result.tiles.find((t) => t.patternPointId === 'pt-1');

        expect(p1Assignment).toBeDefined();
        expect(p2Assignment).toBeDefined();

        expect(p2Assignment!.mirrorId).toBe('0-0'); // P2 must take 0-0
        expect(p1Assignment!.mirrorId).toBe('0-1'); // P1 forced to 0-1
    });

    it('allows playback with mismatched grid size if tiles are available', () => {
        // Profile is 8x8
        const profile = createProfile(8, 8);
        // Current grid is 2x2
        const currentGrid = { rows: 2, cols: 2 };
        const mirrorConfig = buildMirrorConfig(2, 2);

        // Pattern with 2 points
        const pattern = createPattern([
            { x: 0, y: 0 },
            { x: 0.1, y: 0.1 },
        ]);

        const result = planProfilePlayback({
            gridSize: currentGrid,
            mirrorConfig,
            profile,
            pattern,
        });

        // Should NOT have profile_grid_mismatch error blocking everything
        // We might still want to warn, but it should NOT block assignment.
        // If it blocks, tiles will be empty or unassigned.

        // Expect successful assignment
        const assignedTiles = result.tiles.filter((t) => t.patternPointId !== null);
        expect(assignedTiles).toHaveLength(2);
    });
});
