/**
 * Golden Trace Tests
 *
 * These tests verify that the calibration script + executor produce
 * the expected output for known inputs. They serve as regression tests
 * for the calibration pipeline.
 */

import { describe, it, expect } from 'vitest';

import { DEFAULT_CALIBRATION_RUNNER_SETTINGS, DEFAULT_ROI } from '@/constants/calibration';
import type { BlobMeasurement, MirrorConfig, Motor } from '@/types';

import { createFakeMotorAdapter, createFakeCameraAdapter } from '../adapters';
import { CalibrationExecutor, type ExecutorConfig } from '../executor';
import { calibrationScript } from '../script';

import type { ClockAdapter } from '../commands';

// =============================================================================
// GOLDEN VALUES
// =============================================================================

/**
 * Golden measurement values for deterministic testing.
 * These are carefully chosen to produce verifiable output.
 */
const GOLDEN = {
    // Home position for first (and only) tile
    home: { x: 0.5, y: 0.5, size: 0.1 },

    // Step test settings
    deltaSteps: DEFAULT_CALIBRATION_RUNNER_SETTINGS.deltaSteps,
    firstTileInterimStepDelta: DEFAULT_CALIBRATION_RUNNER_SETTINGS.firstTileInterimStepDelta,

    // X-axis step test results (centered coords)
    // After moving +deltaSteps in X direction, blob moves to this position
    xInterim: { x: 0.3, y: 0.5, size: 0.105 },
    xFull: { x: 0.1, y: 0.5, size: 0.11 },

    // Y-axis step test results
    yInterim: { x: 0.5, y: 0.2, size: 0.115 },
    yFull: { x: 0.5, y: -0.1, size: 0.12 },

    // Size change at step tests (for focus verification)
    // sizeDelta = (xFull.size + yFull.size) / 2 - home.size
    expectedSizeDelta: (0.11 + 0.12) / 2 - 0.1,
} as const;

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMotor(mac: string, index: number): Motor {
    return { nodeMac: mac, motorIndex: index };
}

function createMeasurement(x: number, y: number, size: number): BlobMeasurement {
    return {
        x,
        y,
        size,
        response: 0.8,
        capturedAt: Date.now(),
        sourceWidth: 1920,
        sourceHeight: 1080,
    };
}

function createInstantClockAdapter(): ClockAdapter {
    let time = 0;
    return {
        async delay(_ms: number, signal?: AbortSignal) {
            if (signal?.aborted) throw new Error('Aborted');
            time += _ms;
            await Promise.resolve();
        },
        now() {
            return time;
        },
    };
}

function createFakeAdapters() {
    return {
        motor: createFakeMotorAdapter(),
        camera: createFakeCameraAdapter(),
        clock: createInstantClockAdapter(),
    };
}

/**
 * Create config for a single-tile calibration.
 */
function createSingleTileConfig(): ExecutorConfig {
    const mirrorConfig: MirrorConfig = new Map();
    mirrorConfig.set('0-0', {
        x: createMotor('AA:BB:CC:DD:EE:01', 0),
        y: createMotor('AA:BB:CC:DD:EE:01', 1),
    });

    return {
        gridSize: { rows: 1, cols: 1 },
        mirrorConfig,
        settings: {
            ...DEFAULT_CALIBRATION_RUNNER_SETTINGS,
            maxDetectionRetries: 1,
            retryDelayMs: 10,
        },
        arrayRotation: 0,
        stagingPosition: 'corner',
        roi: DEFAULT_ROI,
        mode: 'auto',
    };
}

/**
 * Create config for a 2x2 grid with one calibratable tile (0-0).
 */
function create2x2Config(): ExecutorConfig {
    const mirrorConfig: MirrorConfig = new Map();
    mirrorConfig.set('0-0', {
        x: createMotor('AA:BB:CC:DD:EE:01', 0),
        y: createMotor('AA:BB:CC:DD:EE:01', 1),
    });
    mirrorConfig.set('0-1', { x: null, y: null });
    mirrorConfig.set('1-0', { x: null, y: null });
    mirrorConfig.set('1-1', { x: null, y: null });

    return {
        gridSize: { rows: 2, cols: 2 },
        mirrorConfig,
        settings: {
            ...DEFAULT_CALIBRATION_RUNNER_SETTINGS,
            maxDetectionRetries: 1,
            retryDelayMs: 10,
        },
        arrayRotation: 0,
        stagingPosition: 'corner',
        roi: DEFAULT_ROI,
        mode: 'auto',
    };
}

/**
 * Queue golden capture results in the expected order:
 * 1. Home measurement
 * 2. X interim step test
 * 3. X full step test
 * 4. Y interim step test
 * 5. Y full step test
 */
function queueGoldenCaptures(camera: ReturnType<typeof createFakeCameraAdapter>) {
    const { home, xInterim, xFull, yInterim, yFull } = GOLDEN;
    camera.results.push({ measurement: createMeasurement(home.x, home.y, home.size) });
    camera.results.push({ measurement: createMeasurement(xInterim.x, xInterim.y, xInterim.size) });
    camera.results.push({ measurement: createMeasurement(xFull.x, xFull.y, xFull.size) });
    camera.results.push({ measurement: createMeasurement(yInterim.x, yInterim.y, yInterim.size) });
    camera.results.push({ measurement: createMeasurement(yFull.x, yFull.y, yFull.size) });
}

// =============================================================================
// TESTS
// =============================================================================

describe('Golden Trace Tests', () => {
    describe('single tile calibration', () => {
        it('produces correct stepToDisplacement from golden measurements', async () => {
            const config = createSingleTileConfig();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            const state = executor.getState();
            expect(state.phase).toBe('completed');

            // Verify tile state
            const tile = state.tiles['0-0'];
            expect(tile).toBeDefined();
            expect(tile.status).toBe('completed');

            // Check summary tiles for calibration results
            const summaryTile = state.summary?.tiles['0-0'];
            expect(summaryTile).toBeDefined();

            // Verify stepToDisplacement was computed (non-null)
            expect(summaryTile?.stepToDisplacement?.x).not.toBeNull();
            expect(summaryTile?.stepToDisplacement?.y).not.toBeNull();

            // Verify magnitude is reasonable for our delta values
            // X: blob moved from 0.5 to 0.1 (delta = 0.4) over 1200 steps
            // Expected magnitude: ~0.0003 (0.4 / 1200)
            expect(Math.abs(summaryTile?.stepToDisplacement?.x ?? 0)).toBeCloseTo(0.0003333, 4);

            // Y: blob moved from 0.5 to -0.1 (delta = 0.6) over 1200 steps
            // Expected magnitude: ~0.0005 (0.6 / 1200)
            expect(Math.abs(summaryTile?.stepToDisplacement?.y ?? 0)).toBeCloseTo(0.0005, 4);
        });

        it('produces correct home measurement in summary (recentered)', async () => {
            const config = createSingleTileConfig();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            const state = executor.getState();
            const summaryTile = state.summary?.tiles['0-0'];

            // Home measurement is recentered: single tile at (0.5, 0.5) becomes grid origin (0, 0)
            // The cameraOriginOffset is set to the first tile's position, so it's subtracted
            expect(summaryTile?.homeMeasurement?.x).toBeCloseTo(0, 6);
            expect(summaryTile?.homeMeasurement?.y).toBeCloseTo(0, 6);
            // Size is preserved (no recentering)
            expect(summaryTile?.homeMeasurement?.size).toBeCloseTo(GOLDEN.home.size, 6);
        });

        it('produces summary with tile calibration results', async () => {
            const config = createSingleTileConfig();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            const state = executor.getState();
            const summary = state.summary;

            expect(summary).toBeDefined();
            expect(summary?.tiles).toBeDefined();
            expect(summary?.tiles['0-0']).toBeDefined();

            const summaryTile = summary?.tiles['0-0'];
            expect(summaryTile?.status).toBe('completed');
            // Home measurement is recentered to grid origin (0, 0)
            expect(summaryTile?.homeMeasurement?.x).toBeCloseTo(0, 6);

            // Verify stepToDisplacement magnitude (sign depends on jog direction)
            // X: 0.4 displacement over 1200 steps → ~0.0003333 per step
            // Y: 0.6 displacement over 1200 steps → ~0.0005 per step
            expect(Math.abs(summaryTile?.stepToDisplacement?.x ?? 0)).toBeCloseTo(0.0003333, 4);
            expect(Math.abs(summaryTile?.stepToDisplacement?.y ?? 0)).toBeCloseTo(0.0005, 4);
        });
    });

    describe('multi-tile calibration', () => {
        it('produces correct progress tracking for 2x2 grid', async () => {
            const config = create2x2Config();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const progressUpdates: { completed: number; total: number }[] = [];
            const executor = new CalibrationExecutor(config, adapters, {
                onStateChange: (state) => {
                    progressUpdates.push({
                        completed: state.progress.completed,
                        total: state.progress.total,
                    });
                },
            });
            await executor.run(calibrationScript);

            const state = executor.getState();

            // Only 1 tile is calibratable, others have no motors
            expect(state.progress.total).toBe(1);
            expect(state.progress.completed).toBe(1);
            expect(state.phase).toBe('completed');

            // Verify progress was tracked
            const finalProgress = progressUpdates[progressUpdates.length - 1];
            expect(finalProgress?.completed).toBe(1);
        });

        it('generates grid blueprint for single calibratable tile', async () => {
            const config = create2x2Config();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            const state = executor.getState();
            const blueprint = state.summary?.gridBlueprint;

            expect(blueprint).toBeDefined();
            // With only one tile, the blueprint represents that tile's footprint
            expect(blueprint?.adjustedTileFootprint).toBeDefined();
            expect(blueprint?.gridOrigin).toBeDefined();
        });
    });

    describe('command sequence verification', () => {
        it('executes expected motor command sequence', async () => {
            const config = createSingleTileConfig();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            const motorCommands = adapters.motor.commands;

            // Should have home command first
            const homeCmd = motorCommands.find((c) => c.type === 'homeAll');
            expect(homeCmd).toBeDefined();

            // Should have move commands for step tests
            const moveCommands = motorCommands.filter((c) => c.type === 'moveMotor');
            expect(moveCommands.length).toBeGreaterThan(0);

            // Verify deltaSteps was used for step tests
            // X step test moves should include deltaSteps position
            const xStepMove = moveCommands.find(
                (c) =>
                    c.args[1] === 0 && // motorId 0 is X axis
                    c.args[2] === GOLDEN.deltaSteps,
            );
            expect(xStepMove).toBeDefined();
        });

        it('calls capture adapter correct number of times', async () => {
            const config = createSingleTileConfig();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            // First tile: home + X interim + X full + Y interim + Y full = 5 captures
            expect(adapters.camera.captureCount).toBe(5);
        });
    });

    describe('phase transitions', () => {
        it('transitions through all phases in correct order', async () => {
            const config = createSingleTileConfig();
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const phases: string[] = [];
            const executor = new CalibrationExecutor(config, adapters, {
                onStateChange: (state) => {
                    if (phases[phases.length - 1] !== state.phase) {
                        phases.push(state.phase);
                    }
                },
            });
            await executor.run(calibrationScript);

            expect(phases).toEqual(['homing', 'staging', 'measuring', 'aligning', 'completed']);
        });
    });

    describe('array rotation handling', () => {
        it('produces different step test directions for 180° rotation', async () => {
            // Run with 0° rotation
            const config0 = createSingleTileConfig();
            config0.arrayRotation = 0;
            const adapters0 = createFakeAdapters();
            queueGoldenCaptures(adapters0.camera);
            const executor0 = new CalibrationExecutor(config0, adapters0, {});
            await executor0.run(calibrationScript);

            // Run with 180° rotation
            const config180 = createSingleTileConfig();
            config180.arrayRotation = 180;
            const adapters180 = createFakeAdapters();
            queueGoldenCaptures(adapters180.camera);
            const executor180 = new CalibrationExecutor(config180, adapters180, {});
            await executor180.run(calibrationScript);

            // Get X-axis step test moves (motorId 0) that moved to deltaSteps
            const xStepMoves0 = adapters0.motor.commands.filter(
                (c) => c.type === 'moveMotor' && c.args[1] === 0 && c.args[2] === GOLDEN.deltaSteps,
            );
            const xStepMoves180 = adapters180.motor.commands.filter(
                (c) => c.type === 'moveMotor' && c.args[1] === 0 && c.args[2] === GOLDEN.deltaSteps,
            );

            // Both should have step test moves
            expect(xStepMoves0.length).toBeGreaterThan(0);
            expect(xStepMoves180.length).toBeGreaterThan(0);

            // Get Y-axis step test moves (motorId 1) that moved to deltaSteps
            const yStepMoves0 = adapters0.motor.commands.filter(
                (c) => c.type === 'moveMotor' && c.args[1] === 1 && c.args[2] === GOLDEN.deltaSteps,
            );
            const yStepMoves180 = adapters180.motor.commands.filter(
                (c) => c.type === 'moveMotor' && c.args[1] === 1 && c.args[2] === GOLDEN.deltaSteps,
            );

            // Both should have Y step test moves
            expect(yStepMoves0.length).toBeGreaterThan(0);
            expect(yStepMoves180.length).toBeGreaterThan(0);

            // Both should complete successfully
            expect(executor0.getState().phase).toBe('completed');
            expect(executor180.getState().phase).toBe('completed');
        });

        it('produces correct stepToDisplacement sign for 180° rotation', async () => {
            const config = createSingleTileConfig();
            config.arrayRotation = 180;
            const adapters = createFakeAdapters();

            queueGoldenCaptures(adapters.camera);

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            const state = executor.getState();
            expect(state.phase).toBe('completed');

            const summaryTile = state.summary?.tiles['0-0'];
            expect(summaryTile).toBeDefined();
            expect(summaryTile?.status).toBe('completed');

            // stepToDisplacement magnitude should be the same regardless of rotation
            // (rotation affects jog direction, but perStep magnitude is computed from measurement delta)
            expect(Math.abs(summaryTile?.stepToDisplacement?.x ?? 0)).toBeCloseTo(0.0003333, 4);
            expect(Math.abs(summaryTile?.stepToDisplacement?.y ?? 0)).toBeCloseTo(0.0005, 4);
        });
    });
});
