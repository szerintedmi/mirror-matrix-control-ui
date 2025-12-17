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

import type { CalibrationCommand, CommandResult } from '../commands';
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
function success(type: Exclude<CommandResult['type'], 'CAPTURE'>): CommandResult {
    return { type, success: true } as CommandResult;
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
        it('yields correct command sequence for single-tile calibration', () => {
            const config = createTestConfig();

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(cmd.type as Exclude<CommandResult['type'], 'CAPTURE'>);
            });

            // Extract command types for high-level sequence assertion
            const types = commands.map((c) => c.type);

            expect(types).toEqual([
                // Homing phase
                'UPDATE_PHASE', // homing
                'LOG',
                'HOME_ALL',
                'CHECKPOINT',
                // Staging phase
                'UPDATE_PHASE', // staging
                'LOG',
                'MOVE_TILE_POSE', // aside
                'UPDATE_TILE', // staged
                'CHECKPOINT',
                // Measuring phase
                'UPDATE_PHASE', // measuring
                'UPDATE_TILE', // measuring
                'LOG',
                'MOVE_TILE_POSE', // home
                'CAPTURE',
                'LOG',
                'UPDATE_TILE', // completed with metrics
                'CHECKPOINT',
                'MOVE_TILE_POSE', // aside
                // Completed
                'UPDATE_PHASE', // completed
                'LOG',
            ]);
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
                return success(cmd.type as Exclude<CommandResult['type'], 'CAPTURE'>);
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
                return success(cmd.type as Exclude<CommandResult['type'], 'CAPTURE'>);
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
                return success(cmd.type as Exclude<CommandResult['type'], 'CAPTURE'>);
            });

            const captureCmd = commands.find((c) => c.type === 'CAPTURE');
            expect(captureCmd?.type === 'CAPTURE' && captureCmd.tolerance).toBe(0.3);
        });
    });

    describe('error cases', () => {
        it('handles capture failure gracefully', () => {
            const config = createTestConfig();

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureFailure('No blob detected');
                }
                return success(cmd.type as Exclude<CommandResult['type'], 'CAPTURE'>);
            });

            const types = commands.map((c) => c.type);

            // Should end with error phase after failed capture
            expect(types).toContain('UPDATE_PHASE');

            // Find the last UPDATE_PHASE
            const lastPhaseUpdate = [...commands].reverse().find((c) => c.type === 'UPDATE_PHASE');
            expect(lastPhaseUpdate?.type === 'UPDATE_PHASE' && lastPhaseUpdate.phase).toBe('error');

            // Should have UPDATE_TILE with failed status
            const failedUpdate = commands.find(
                (c) => c.type === 'UPDATE_TILE' && c.patch.status === 'failed',
            );
            expect(failedUpdate).toBeDefined();
            if (failedUpdate?.type === 'UPDATE_TILE') {
                expect(failedUpdate.patch.error).toBe('No blob detected');
            }
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
                return success(cmd.type as Exclude<CommandResult['type'], 'CAPTURE'>);
            });

            const phases = commands
                .filter((c) => c.type === 'UPDATE_PHASE')
                .map((c) => (c.type === 'UPDATE_PHASE' ? c.phase : null));

            expect(phases).toEqual(['homing', 'staging', 'measuring', 'completed']);
        });
    });

    describe('checkpoints', () => {
        it('yields checkpoints at appropriate points', () => {
            const config = createTestConfig();

            const commands = collectCommands(config, (cmd) => {
                if (cmd.type === 'CAPTURE') {
                    return captureSuccess(0.5, 0.5, 0.1);
                }
                return success(cmd.type as Exclude<CommandResult['type'], 'CAPTURE'>);
            });

            const checkpoints = commands
                .filter((c) => c.type === 'CHECKPOINT')
                .map((c) => (c.type === 'CHECKPOINT' ? c.step.kind : null));

            expect(checkpoints).toEqual(['home-all', 'stage-all', 'measure-home']);
        });
    });
});
