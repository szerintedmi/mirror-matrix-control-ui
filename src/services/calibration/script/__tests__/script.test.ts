/**
 * Script Tests
 *
 * Synchronous tests that step through the calibration generator
 * and assert the exact command sequence.
 */

import { describe, it, expect } from 'vitest';

import { DEFAULT_CALIBRATION_RUNNER_SETTINGS } from '@/constants/calibration';
import { DEFAULT_ROI } from '@/constants/calibration';
import type { BlobMeasurement, MirrorConfig, Motor } from '@/types';

import { calibrationScript } from '../script';

import type { CalibrationCommand, CommandResult, DecisionOption } from '../commands';
import type { ExecutorConfig } from '../executor';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a test motor.
 */
function createMotor(mac: string, index: number): Motor {
    return {
        nodeMac: mac,
        motorIndex: index,
    };
}

/**
 * Create a minimal executor config for testing.
 */
function createTestConfig(overrides: Partial<ExecutorConfig> = {}): ExecutorConfig {
    const mirrorConfig: MirrorConfig = new Map();

    // Default: 2x2 grid with first tile calibratable
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
        settings: DEFAULT_CALIBRATION_RUNNER_SETTINGS,
        arrayRotation: 0,
        stagingPosition: 'corner',
        roi: DEFAULT_ROI,
        mode: 'auto',
        ...overrides,
    };
}

/**
 * Create a successful capture result.
 */
function captureSuccess(x: number, y: number, size: number): CommandResult {
    const measurement: BlobMeasurement = {
        x,
        y,
        size,
        response: 0.8,
        capturedAt: Date.now(),
    };
    return { type: 'CAPTURE', measurement };
}

/**
 * Create a failed capture result.
 */
function captureFailure(error?: string): CommandResult {
    return { type: 'CAPTURE', measurement: null, error };
}

/**
 * Generic success result for non-capture commands.
 */
function success(
    type: Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
): CommandResult {
    return { type, success: true } as CommandResult;
}

/**
 * Create a decision result.
 */
function decision(choice: DecisionOption): CommandResult {
    return { type: 'AWAIT_DECISION', decision: choice };
}

/**
 * Collect all commands from a script, feeding results as needed.
 */
function collectCommands(
    config: ExecutorConfig,
    resultProvider: (cmd: CalibrationCommand, index: number) => CommandResult,
): CalibrationCommand[] {
    const commands: CalibrationCommand[] = [];
    const gen = calibrationScript(config);

    let result: CommandResult = success('LOG'); // Initial dummy
    let index = 0;

    while (true) {
        const { value: cmd, done } = gen.next(result);
        if (done || cmd === undefined) break;

        commands.push(cmd);
        result = resultProvider(cmd, index);
        index++;
    }

    return commands;
}

// =============================================================================
// TESTS
// =============================================================================

describe('calibrationScript', () => {
    describe('happy path', () => {
        it('yields correct command sequence for single-tile calibration with step tests', () => {
            const config = createTestConfig();

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            // Extract command types for high-level sequence assertion
            const types = commands.map((c) => c.type);

            // Count specific command types instead of exact sequence
            // (the full sequence with step tests is quite long)
            const homeAllCount = types.filter((t) => t === 'HOME_ALL').length;
            const captureCount = types.filter((t) => t === 'CAPTURE').length;
            const moveAxisCount = types.filter((t) => t === 'MOVE_AXIS').length;
            const moveTilePoseCount = types.filter((t) => t === 'MOVE_TILE_POSE').length;
            const moveTilesBatchCount = types.filter((t) => t === 'MOVE_TILES_BATCH').length;
            const moveAxesBatchCount = types.filter((t) => t === 'MOVE_AXES_BATCH').length;

            // Should have: 1 HOME_ALL
            expect(homeAllCount).toBe(1);

            // Should have: 5 captures (home + interim X + full X + interim Y + full Y) for first tile
            expect(captureCount).toBe(5);

            // Should have: 3 MOVE_AXIS (interim X, full X, full Y)
            // Note: X back to 0 is now parallelized with Y interim via MOVE_AXES_BATCH
            expect(moveAxisCount).toBe(3);

            // Should have: 2 MOVE_TILE_POSE (home, aside during measuring)
            expect(moveTilePoseCount).toBe(2);

            // Should have: 1 MOVE_TILES_BATCH (for staging phase - parallel move aside)
            expect(moveTilesBatchCount).toBe(1);

            // Should have: 1 or 2 MOVE_AXES_BATCH:
            // - 1 for Y interim (parallel X back to 0 + Y to interim)
            // - 0 or 1 for alignment (only if offset is non-zero)
            expect(moveAxesBatchCount).toBeGreaterThanOrEqual(1);
            expect(moveAxesBatchCount).toBeLessThanOrEqual(2);

            // Verify phases are in correct order
            const phases = commands
                .filter((c) => c.type === 'UPDATE_PHASE')
                .map((c) => (c.type === 'UPDATE_PHASE' ? c.phase : null));
            expect(phases).toEqual(['homing', 'staging', 'measuring', 'aligning', 'completed']);
        });

        it('yields HOME_ALL with correct MAC addresses', () => {
            const mirrorConfig: MirrorConfig = new Map();
            mirrorConfig.set('0-0', {
                x: createMotor('AA:BB:CC:DD:EE:01', 0),
                y: createMotor('AA:BB:CC:DD:EE:02', 1),
            });

            const config = createTestConfig({ mirrorConfig });

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            const homeCmd = commands.find((c) => c.type === 'HOME_ALL');
            expect(homeCmd).toBeDefined();
            expect(homeCmd?.type === 'HOME_ALL' && homeCmd.macAddresses).toContain(
                'AA:BB:CC:DD:EE:01',
            );
            expect(homeCmd?.type === 'HOME_ALL' && homeCmd.macAddresses).toContain(
                'AA:BB:CC:DD:EE:02',
            );
        });

        it('updates tile to completed with correct metrics', () => {
            const config = createTestConfig();

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.25, 0.75, 0.15);
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            // Find the UPDATE_TILE with completed status
            const completedUpdate = commands.find(
                (c) =>
                    c.type === 'UPDATE_TILE' &&
                    c.patch.status === 'completed' &&
                    c.patch.metrics?.home,
            );

            expect(completedUpdate).toBeDefined();
            if (completedUpdate?.type === 'UPDATE_TILE') {
                expect(completedUpdate.key).toBe('0-0');
                expect(completedUpdate.patch.metrics?.home).toMatchObject({
                    x: 0.25,
                    y: 0.75,
                    size: 0.15,
                    response: 0.8,
                });
            }
        });

        it('uses firstTileTolerance for capture', () => {
            const config = createTestConfig({
                settings: {
                    ...DEFAULT_CALIBRATION_RUNNER_SETTINGS,
                    firstTileTolerance: 0.3,
                },
            });

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            const captureCmd = commands.find((c) => c.type === 'CAPTURE');
            expect(captureCmd?.type === 'CAPTURE' && captureCmd.tolerance).toBe(0.3);
        });
    });

    describe('error cases', () => {
        it('handles home capture failure gracefully - yields AWAIT_DECISION, skip marks tile skipped', () => {
            const config = createTestConfig();
            let homeCaptureDone = false;

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    // Fail only the home capture (first capture)
                    if (!homeCaptureDone) {
                        homeCaptureDone = true;
                        return captureFailure('No blob detected');
                    }
                    // Subsequent captures succeed (though in single-tile case there won't be any)
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                if (cmd.type === 'AWAIT_DECISION') {
                    // User decides to skip the failed tile
                    return decision('skip');
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            // Should have AWAIT_DECISION command
            const awaitDecision = commands.find((c) => c.type === 'AWAIT_DECISION');
            expect(awaitDecision).toBeDefined();
            if (awaitDecision?.type === 'AWAIT_DECISION') {
                expect(awaitDecision.error).toBe('No blob detected');
            }

            // Should have UPDATE_TILE with skipped status (not failed)
            const skippedUpdate = commands.find(
                (c) => c.type === 'UPDATE_TILE' && c.patch.status === 'skipped',
            );
            expect(skippedUpdate).toBeDefined();
            if (skippedUpdate?.type === 'UPDATE_TILE') {
                expect(skippedUpdate.patch.error).toBe('No blob detected');
            }

            // With single tile skipped, should still complete
            const lastPhaseUpdate = [...commands].reverse().find((c) => c.type === 'UPDATE_PHASE');
            expect(lastPhaseUpdate?.type === 'UPDATE_PHASE' && lastPhaseUpdate.phase).toBe(
                'completed',
            );
        });

        it('handles home capture failure with abort decision - stops calibration', () => {
            const config = createTestConfig();
            let homeCaptureDone = false;

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    if (!homeCaptureDone) {
                        homeCaptureDone = true;
                        return captureFailure('No blob detected');
                    }
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                if (cmd.type === 'AWAIT_DECISION') {
                    // User decides to abort
                    return decision('abort');
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            // Should have aborted phase
            const lastPhaseUpdate = [...commands].reverse().find((c) => c.type === 'UPDATE_PHASE');
            expect(lastPhaseUpdate?.type === 'UPDATE_PHASE' && lastPhaseUpdate.phase).toBe(
                'aborted',
            );
        });

        it('handles home capture failure with retry decision - retries capture', () => {
            const config = createTestConfig();
            let captureAttempts = 0;

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    captureAttempts++;
                    // First capture fails, second succeeds
                    if (captureAttempts === 1) {
                        return captureFailure('No blob detected');
                    }
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                if (cmd.type === 'AWAIT_DECISION') {
                    // User decides to retry
                    return decision('retry');
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            // Should have tried capture twice (fail then success)
            expect(captureAttempts).toBe(6); // 1 failed + 1 retry home + 4 step tests

            // Should have completed successfully
            const completedUpdate = commands.find(
                (c) => c.type === 'UPDATE_TILE' && c.patch.status === 'completed',
            );
            expect(completedUpdate).toBeDefined();
        });

        it('yields error phase when no calibratable tiles', () => {
            const mirrorConfig: MirrorConfig = new Map();
            // All tiles have no motors assigned
            mirrorConfig.set('0-0', { x: null, y: null });

            const config = createTestConfig({
                gridSize: { rows: 1, cols: 1 },
                mirrorConfig,
            });

            const commands = collectCommands(config, () => success('LOG'));

            expect(commands).toHaveLength(1);
            expect(commands[0].type).toBe('UPDATE_PHASE');
            expect(commands[0].type === 'UPDATE_PHASE' && commands[0].phase).toBe('error');
        });
    });

    describe('phase transitions', () => {
        it('transitions through phases in correct order', () => {
            const config = createTestConfig();

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            const phases = commands
                .filter((c) => c.type === 'UPDATE_PHASE')
                .map((c) => (c.type === 'UPDATE_PHASE' ? c.phase : null));

            expect(phases).toEqual(['homing', 'staging', 'measuring', 'aligning', 'completed']);
        });
    });

    describe('checkpoints', () => {
        it('yields checkpoints at appropriate points including step tests', () => {
            const config = createTestConfig();

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            const checkpoints = commands
                .filter((c) => c.type === 'CHECKPOINT')
                .map((c) => (c.type === 'CHECKPOINT' ? c.step.kind : null));

            // First tile has interim + full step tests, plus alignment
            expect(checkpoints).toEqual([
                'home-all',
                'stage-all',
                'measure-home',
                'step-test-x-interim',
                'step-test-x',
                'step-test-y-interim',
                'step-test-y',
                'align-grid',
            ]);
        });
    });

    describe('multi-tile calibration', () => {
        it('measures multiple tiles with full step tests on first tile only', () => {
            const mirrorConfig: MirrorConfig = new Map();
            // Two calibratable tiles
            mirrorConfig.set('0-0', {
                x: createMotor('AA:BB:CC:DD:EE:01', 0),
                y: createMotor('AA:BB:CC:DD:EE:01', 1),
            });
            mirrorConfig.set('0-1', {
                x: createMotor('AA:BB:CC:DD:EE:02', 0),
                y: createMotor('AA:BB:CC:DD:EE:02', 1),
            });

            const config = createTestConfig({ mirrorConfig });

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            // Count completed tile updates
            const completedUpdates = commands.filter(
                (c) => c.type === 'UPDATE_TILE' && c.patch.status === 'completed',
            );
            expect(completedUpdates).toHaveLength(2);

            // Count captures:
            // First tile: home + interim X + full X + interim Y + full Y = 5
            // Second tile: home + full X + full Y = 3
            // Total: 8
            const captureCount = commands.filter((c) => c.type === 'CAPTURE').length;
            expect(captureCount).toBe(8);

            // Second tile should NOT have interim step test checkpoints
            const checkpoints = commands
                .filter((c) => c.type === 'CHECKPOINT')
                .map((c) => (c.type === 'CHECKPOINT' ? c.step.kind : null));

            // First tile: home-all, stage-all, measure-home, step-test-x-interim, step-test-x, step-test-y-interim, step-test-y
            // Second tile: measure-home, step-test-x, step-test-y
            // Plus: align-grid at the end
            expect(checkpoints).toEqual([
                'home-all',
                'stage-all',
                // First tile
                'measure-home',
                'step-test-x-interim',
                'step-test-x',
                'step-test-y-interim',
                'step-test-y',
                // Second tile (no interim)
                'measure-home',
                'step-test-x',
                'step-test-y',
                // Alignment
                'align-grid',
            ]);
        });

        it('continues with remaining tiles when one is skipped', () => {
            const mirrorConfig: MirrorConfig = new Map();
            // Two calibratable tiles
            mirrorConfig.set('0-0', {
                x: createMotor('AA:BB:CC:DD:EE:01', 0),
                y: createMotor('AA:BB:CC:DD:EE:01', 1),
            });
            mirrorConfig.set('0-1', {
                x: createMotor('AA:BB:CC:DD:EE:02', 0),
                y: createMotor('AA:BB:CC:DD:EE:02', 1),
            });

            const config = createTestConfig({ mirrorConfig });

            let captureCount = 0;
            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    captureCount++;
                    // Fail first tile's home capture
                    if (captureCount === 1) {
                        return captureFailure('No blob detected');
                    }
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                if (cmd.type === 'AWAIT_DECISION') {
                    // User decides to skip the failed tile
                    return decision('skip');
                }
                return success(
                    cmd.type as Exclude<CommandResult['type'], 'CAPTURE' | 'AWAIT_DECISION'>,
                );
            });

            // Should have one skipped and one completed
            const skippedUpdates = commands.filter(
                (c) => c.type === 'UPDATE_TILE' && c.patch.status === 'skipped',
            );
            const completedUpdates = commands.filter(
                (c) => c.type === 'UPDATE_TILE' && c.patch.status === 'completed',
            );

            expect(skippedUpdates).toHaveLength(1);
            expect(completedUpdates).toHaveLength(1);

            // Should still complete
            const lastPhaseUpdate = [...commands].reverse().find((c) => c.type === 'UPDATE_PHASE');
            expect(lastPhaseUpdate?.type === 'UPDATE_PHASE' && lastPhaseUpdate.phase).toBe(
                'completed',
            );
        });
    });
});
