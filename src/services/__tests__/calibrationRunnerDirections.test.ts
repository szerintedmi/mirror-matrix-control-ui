import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_CALIBRATION_RUNNER_SETTINGS } from '@/constants/calibration';
import { MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { HomeAllArgs, HomeMotorArgs, MotorCommandApi } from '@/hooks/useMotorCommands';
import { CalibrationRunner } from '@/services/calibrationRunner';
import type { BlobMeasurement, MirrorConfig, Motor } from '@/types';

describe('CalibrationRunner axis directions', () => {
    it('stages X to the negative side and jogs positive for the step test', async () => {
        const xMotor: Motor = { nodeMac: 'AA:BB:CC:DD:EE:FF', motorIndex: 1 };
        const yMotor: Motor = { nodeMac: 'AA:BB:CC:DD:EE:FF', motorIndex: 2 };
        const mirrorConfig: MirrorConfig = new Map();
        mirrorConfig.set('0-0', { x: xMotor, y: yMotor });

        const moveCalls: Array<{ mac: string; motorId: number; positionSteps: number }> = [];
        const motorApi: MotorCommandApi = {
            nudgeMotor: vi.fn(),
            homeMotor: vi.fn(async ({ mac }: HomeMotorArgs) => ({
                mac,
                completion: { cmdId: 'home', responses: [] },
            })),
            homeAll: vi.fn(async ({ macAddresses }: HomeAllArgs) =>
                macAddresses.map((mac) => ({
                    mac,
                    completion: { cmdId: 'home-all', responses: [] },
                })),
            ),
            moveMotor: vi.fn(async (args) => {
                moveCalls.push(args);
                return { cmdId: 'move', responses: [] };
            }),
        };

        const measurements: BlobMeasurement[] = [
            { x: 0, y: 0, size: 0.2, response: 1, capturedAt: 1 },
            { x: 0.2, y: 0, size: 0.2, response: 1, capturedAt: 2 },
            { x: 0.2, y: 0.2, size: 0.2, response: 1, capturedAt: 3 },
        ];
        const captureMeasurement = vi
            .fn()
            .mockImplementation(async () => measurements.shift() ?? null);

        const completion = new Promise<void>((resolve, reject) => {
            const runner = new CalibrationRunner({
                gridSize: { rows: 1, cols: 1 },
                mirrorConfig,
                motorApi,
                captureMeasurement,
                onStateChange: (state) => {
                    if (state.phase === 'completed') {
                        resolve();
                    }
                    if (state.phase === 'error') {
                        reject(state.error ? new Error(state.error) : new Error('runner error'));
                    }
                },
            });
            runner.start();
        });

        await completion;

        const xPositions = moveCalls
            .filter((call) => call.motorId === xMotor.motorIndex)
            .map((call) => call.positionSteps);

        expect(xPositions[0]).toBe(MOTOR_MIN_POSITION_STEPS);
        expect(xPositions).toContain(DEFAULT_CALIBRATION_RUNNER_SETTINGS.deltaSteps);
    });
});
