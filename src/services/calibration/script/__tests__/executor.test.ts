/**
 * Executor Tests
 *
 * Async tests that validate executor behavior with fake adapters:
 * - Basic execution flow
 * - Pause/resume
 * - Abort
 * - Capture retries
 * - Step mode (waiting at checkpoints)
 */

import { describe, it, expect } from 'vitest';

import { DEFAULT_CALIBRATION_RUNNER_SETTINGS, DEFAULT_ROI } from '@/constants/calibration';
import type { BlobMeasurement, MirrorConfig, Motor } from '@/types';

import { createFakeMotorAdapter, createFakeCameraAdapter } from '../adapters';
import { CalibrationExecutor, type ExecutorConfig } from '../executor';
import { calibrationScript } from '../script';

import type { ClockAdapter } from '../commands';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMotor(mac: string, index: number): Motor {
    return { nodeMac: mac, motorIndex: index };
}

function createTestConfig(overrides: Partial<ExecutorConfig> = {}): ExecutorConfig {
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
            maxDetectionRetries: 3,
            retryDelayMs: 10, // Fast retries for tests
        },
        arrayRotation: 0,
        stagingPosition: 'corner',
        roi: DEFAULT_ROI,
        mode: 'auto',
        ...overrides,
    };
}

function createMeasurement(x: number, y: number, size: number): BlobMeasurement {
    return { x, y, size, response: 0.8, capturedAt: Date.now() };
}

/**
 * Create a simple instant clock adapter for tests.
 * Delays resolve immediately.
 */
function createInstantClockAdapter(): ClockAdapter {
    let time = 0;
    return {
        async delay(_ms: number, signal?: AbortSignal) {
            if (signal?.aborted) {
                throw new Error('Aborted');
            }
            time += _ms;
            // Yield to event loop but don't actually wait
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

// =============================================================================
// TESTS
// =============================================================================

describe('CalibrationExecutor', () => {
    describe('basic execution', () => {
        it('runs script to completion with successful capture', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();
            const stateChanges: string[] = [];

            // Queue successful capture result
            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {
                onStateChange: (state) => stateChanges.push(state.phase),
            });

            await executor.run(calibrationScript);

            const state = executor.getState();
            expect(state.phase).toBe('completed');
            expect(stateChanges).toContain('homing');
            expect(stateChanges).toContain('staging');
            expect(stateChanges).toContain('measuring');
            expect(stateChanges).toContain('completed');
        });

        it('records motor commands correctly', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();

            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            // Should have homeAll command
            const homeCommands = adapters.motor.commands.filter((c) => c.type === 'homeAll');
            expect(homeCommands.length).toBeGreaterThan(0);

            // Should have move commands for staging and measuring
            const moveCommands = adapters.motor.commands.filter((c) => c.type === 'moveMotor');
            expect(moveCommands.length).toBeGreaterThan(0);
        });

        it('transitions to error phase on capture failure', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();

            // Queue failed capture results for all retries
            for (let i = 0; i < config.settings.maxDetectionRetries; i++) {
                adapters.camera.results.push({ measurement: null });
            }

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            const state = executor.getState();
            expect(state.phase).toBe('error');
        });
    });

    describe('capture retries', () => {
        it('retries capture on failure then succeeds', async () => {
            const config = createTestConfig({
                settings: {
                    ...DEFAULT_CALIBRATION_RUNNER_SETTINGS,
                    maxDetectionRetries: 3,
                    retryDelayMs: 10,
                },
            });
            const adapters = createFakeAdapters();

            // Fail twice, succeed on third
            adapters.camera.results.push({ measurement: null });
            adapters.camera.results.push({ measurement: null });
            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            expect(executor.getState().phase).toBe('completed');
            expect(adapters.camera.captureCount).toBe(3);
        });

        it('fails after exhausting retries', async () => {
            const config = createTestConfig({
                settings: {
                    ...DEFAULT_CALIBRATION_RUNNER_SETTINGS,
                    maxDetectionRetries: 2,
                    retryDelayMs: 10,
                },
            });
            const adapters = createFakeAdapters();

            // Fail all retries
            adapters.camera.results.push({ measurement: null });
            adapters.camera.results.push({ measurement: null });

            const executor = new CalibrationExecutor(config, adapters, {});
            await executor.run(calibrationScript);

            expect(executor.getState().phase).toBe('error');
            expect(adapters.camera.captureCount).toBe(2);
        });
    });

    describe('step mode', () => {
        it('emits step state changes', async () => {
            // For auto mode, verify step states are emitted
            const config = createTestConfig({ mode: 'auto' });
            const adapters = createFakeAdapters();
            const stepKinds: string[] = [];

            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {
                onStepStateChange: (state) => {
                    // Only record unique step kinds
                    if (!stepKinds.includes(state.step.kind)) {
                        stepKinds.push(state.step.kind);
                    }
                },
            });

            await executor.run(calibrationScript);

            // Should have 3 checkpoints in skeleton script
            expect(stepKinds).toEqual(['home-all', 'stage-all', 'measure-home']);
        });

        it('does not wait at checkpoints in auto mode', async () => {
            const config = createTestConfig({ mode: 'auto' });
            const adapters = createFakeAdapters();
            let waitingCount = 0;

            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {
                onStepStateChange: (state) => {
                    if (state.status === 'waiting') waitingCount++;
                },
            });

            await executor.run(calibrationScript);

            expect(executor.getState().phase).toBe('completed');
            expect(waitingCount).toBe(0);
        });
    });

    describe('command logging', () => {
        it('emits command log entries', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();
            const logEntries: string[] = [];

            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {
                onCommandLog: (entry) => logEntries.push(entry.hint),
            });

            await executor.run(calibrationScript);

            expect(logEntries.length).toBeGreaterThan(0);
            expect(logEntries).toContain('Homing all motors');
        });
    });

    describe('abort', () => {
        it('sets isAborted flag', () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();
            const executor = new CalibrationExecutor(config, adapters, {});

            expect(executor.isAborted).toBe(false);
            executor.abort();
            expect(executor.isAborted).toBe(true);
        });

        it('sets phase to aborted (not error) when aborted mid-execution', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();

            // Use a blocking camera adapter that waits for abort
            const captureHandler = { reject: null as ((err: Error) => void) | null };
            adapters.camera.capture = () =>
                new Promise<BlobMeasurement | null>((_, reject) => {
                    captureHandler.reject = reject;
                });

            const executor = new CalibrationExecutor(config, adapters, {});

            // Start execution - will block at capture
            const runPromise = executor.run(calibrationScript);

            // Wait a tick for execution to reach the capture
            await Promise.resolve();
            await Promise.resolve();

            // Abort while blocked
            executor.abort();

            // Reject the pending capture with AbortError
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            captureHandler.reject?.(abortError);

            await runPromise;

            expect(executor.getState().phase).toBe('aborted');
        });

        it('sets phase to aborted when aborted during DELAY', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();

            // Use a blocking clock adapter
            const delayHandler = { reject: null as ((err: Error) => void) | null };
            adapters.clock.delay = (_ms: number, signal?: AbortSignal) =>
                new Promise<void>((resolve, reject) => {
                    void resolve; // unused but needed for type inference
                    delayHandler.reject = reject;
                    // Also handle immediate abort
                    if (signal?.aborted) {
                        const err = new Error('Aborted');
                        err.name = 'AbortError';
                        reject(err);
                    }
                });

            // Queue a successful capture first (we'll abort during the retry delay)
            // Actually, we need to fail capture to trigger retry delay
            adapters.camera.results.push({ measurement: null });

            const executor = new CalibrationExecutor(config, adapters, {});

            // Start execution - will eventually hit retry delay after first capture fails
            const runPromise = executor.run(calibrationScript);

            // Wait for execution to reach the delay
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            // Abort while blocked on delay
            executor.abort();

            // Reject the pending delay with AbortError
            if (delayHandler.reject) {
                const abortError = new Error('Aborted');
                abortError.name = 'AbortError';
                delayHandler.reject(abortError);
            }

            await runPromise;

            expect(executor.getState().phase).toBe('aborted');
        });
    });

    describe('pause/resume', () => {
        it('blocks execution when paused and continues when resumed', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();
            const phases: string[] = [];

            // Block on homeAll to give us control
            const homeAllHandler = { resolve: null as (() => void) | null, called: false };
            adapters.motor.homeAll = () =>
                new Promise<void>((resolve) => {
                    homeAllHandler.called = true;
                    homeAllHandler.resolve = resolve;
                });

            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {
                onStateChange: (state) => phases.push(state.phase),
            });

            // Start execution
            const runPromise = executor.run(calibrationScript);

            // Wait for homeAll to be called
            await new Promise((r) => setTimeout(r, 5));
            expect(homeAllHandler.called).toBe(true);

            // Pause before homeAll completes
            executor.pause();

            // Complete homeAll - should hit pause gate after
            homeAllHandler.resolve?.();

            // Wait a bit for pause to take effect
            await new Promise((r) => setTimeout(r, 10));

            // Should be paused now
            expect(phases).toContain('paused');

            // Resume to complete
            executor.resume();
            await runPromise;

            expect(executor.getState().phase).toBe('completed');
        });
    });

    describe('step mode with gating', () => {
        it('waits at checkpoint until advance() is called', async () => {
            const config = createTestConfig({ mode: 'step' });
            const adapters = createFakeAdapters();
            const stepStates: Array<{ kind: string; status: string }> = [];

            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {
                onStepStateChange: (state) => {
                    stepStates.push({ kind: state.step.kind, status: state.status });
                },
            });

            // Start execution
            const runPromise = executor.run(calibrationScript);

            // Wait for first checkpoint to be reached
            await new Promise((r) => setTimeout(r, 10));

            // Should have a waiting checkpoint
            const waitingSteps = stepStates.filter((s) => s.status === 'waiting');
            expect(waitingSteps.length).toBeGreaterThan(0);

            // Advance through all checkpoints with delays
            for (let i = 0; i < 10; i++) {
                executor.advance();
                await new Promise((r) => setTimeout(r, 5));
            }

            await runPromise;
            expect(executor.getState().phase).toBe('completed');
        });
    });

    describe('callbacks', () => {
        it('calls onTileError when tile is marked as failed', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();
            const tileErrors: Array<{ row: number; col: number; message: string }> = [];

            // Fail all captures
            for (let i = 0; i < config.settings.maxDetectionRetries; i++) {
                adapters.camera.results.push({ measurement: null });
            }

            const executor = new CalibrationExecutor(config, adapters, {
                onTileError: (row, col, message) => {
                    tileErrors.push({ row, col, message });
                },
            });

            await executor.run(calibrationScript);

            expect(tileErrors.length).toBeGreaterThan(0);
            expect(tileErrors[0].row).toBe(0);
            expect(tileErrors[0].col).toBe(0);
            expect(tileErrors[0].message).toContain('blob');
        });
    });

    describe('state derivation', () => {
        it('sets activeTile when tile status changes to measuring', async () => {
            const config = createTestConfig();
            const adapters = createFakeAdapters();
            const activeTiles: Array<{ row: number; col: number } | null> = [];

            adapters.camera.results.push({
                measurement: createMeasurement(0.5, 0.5, 0.1),
            });

            const executor = new CalibrationExecutor(config, adapters, {
                onStateChange: (state) => {
                    // Record unique activeTile values
                    const current = state.activeTile;
                    const last = activeTiles[activeTiles.length - 1];
                    if (!last || last?.row !== current?.row || last?.col !== current?.col) {
                        activeTiles.push(current ? { row: current.row, col: current.col } : null);
                    }
                },
            });

            await executor.run(calibrationScript);

            // Should have set activeTile to 0,0 when measuring started
            expect(activeTiles).toContainEqual({ row: 0, col: 0 });
            // Should have cleared activeTile when tile completed
            expect(activeTiles[activeTiles.length - 1]).toBeNull();
        });
    });
});
