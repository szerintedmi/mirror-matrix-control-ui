import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import CalibrationRunnerPanel from '@/components/calibration/CalibrationRunnerPanel';
import {
    DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    type CalibrationRunnerSettings,
} from '@/constants/calibration';
import type { DriverView } from '@/context/StatusContext';
import type {
    CalibrationRunnerState,
    TileRunState,
    TileCalibrationMetrics,
    CalibrationRunSummary,
} from '@/services/calibrationRunner';
import type { Motor } from '@/types';

const nudgeMotorMock = vi.fn().mockResolvedValue({ direction: 1 });
const homeMotorMock = vi.fn().mockResolvedValue({ mac: 'mac', completion: { status: 'done' } });
const homeAllMock = vi.fn().mockResolvedValue([]);
const moveMotorMock = vi.fn().mockResolvedValue({ status: 'done' });

vi.mock('@/hooks/useMotorCommands', () => ({
    useMotorCommands: () => ({
        nudgeMotor: nudgeMotorMock,
        homeMotor: homeMotorMock,
        homeAll: homeAllMock,
        moveMotor: moveMotorMock,
    }),
}));

const createMotor = (motorIndex: number): Motor => ({
    nodeMac: `mac-${motorIndex}`,
    motorIndex,
});

const baseAssignment = { x: createMotor(1), y: createMotor(2) };

const createDriverView = (topicMac: string): DriverView => ({
    mac: topicMac,
    topicMac,
    snapshot: {
        mac: topicMac,
        topicMac,
        nodeState: 'ready',
        motors: {},
        raw: {},
    },
    firstSeenAt: 0,
    lastSeenAt: 0,
    isNew: false,
    source: 'ws',
    presence: 'ready',
    staleForMs: 0,
    brokerDisconnected: false,
});

const pendingTile: TileRunState = {
    tile: { row: 0, col: 0, key: '0-0' },
    status: 'pending',
    assignment: baseAssignment,
};

const completedMetrics: TileCalibrationMetrics = {
    home: {
        x: 0.32,
        y: 0.44,
        size: 0.05,
        response: 0.9,
        capturedAt: 1_735_000_000,
    },
    homeOffset: { dx: 0.01, dy: -0.02 },
    idealTarget: { x: 0.31, y: 0.46 },
    stepToDisplacement: { x: 0.0005, y: -0.0004 },
    sizeDeltaAtStepTest: 0.01,
};

const completedTile: TileRunState = {
    tile: { row: 0, col: 1, key: '0-1' },
    status: 'completed',
    assignment: baseAssignment,
    metrics: completedMetrics,
};

const summary: CalibrationRunSummary = {
    gridBlueprint: {
        idealTileFootprint: { width: 0.2, height: 0.2 },
        tileGap: { x: 0.05, y: 0.05 },
        gridOrigin: { x: 0, y: 0 },
    },
    stepTestSettings: {
        deltaSteps: DEFAULT_CALIBRATION_RUNNER_SETTINGS.deltaSteps,
    },
    tiles: {
        '0-1': {
            tile: completedTile.tile,
            status: 'completed',
            homeMeasurement: completedMetrics.home!,
            homeOffset: completedMetrics.homeOffset!,
            idealTarget: completedMetrics.idealTarget!,
            stepToDisplacement: completedMetrics.stepToDisplacement!,
            sizeDeltaAtStepTest: completedMetrics.sizeDeltaAtStepTest,
        },
    },
};

const runnerState: CalibrationRunnerState = {
    phase: 'idle',
    tiles: {
        '0-0': pendingTile,
        '0-1': completedTile,
    },
    progress: { total: 1, completed: 0, failed: 0, skipped: 0 },
    activeTile: null,
    summary,
    error: null,
};

const runnerSettings: CalibrationRunnerSettings = DEFAULT_CALIBRATION_RUNNER_SETTINGS;

const drivers: DriverView[] = [];

const noop = () => {};

const handleUpdateSetting = <K extends keyof CalibrationRunnerSettings>(
    key: K,
    value: CalibrationRunnerSettings[K],
) => {
    void key;
    void value;
};

interface RenderOptions {
    runnerState?: CalibrationRunnerState;
    tileEntries?: TileRunState[];
    drivers?: DriverView[];
    detectionReady?: boolean;
}

const renderPanel = async (options: RenderOptions = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const state = options.runnerState ?? runnerState;
    const entries = options.tileEntries ?? [pendingTile, completedTile];
    const driverList = options.drivers ?? drivers;
    const detectionReady = options.detectionReady ?? true;
    await act(async () => {
        const element = (
            <CalibrationRunnerPanel
                runnerState={state}
                runnerSettings={runnerSettings}
                tileEntries={entries}
                detectionReady={detectionReady}
                drivers={driverList}
                onUpdateSetting={handleUpdateSetting}
                onStart={noop}
                onPause={noop}
                onResume={noop}
                onAbort={noop}
            />
        );
        const root = createRoot(container);
        root.render(element);
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
    nudgeMotorMock.mockClear();
    homeMotorMock.mockClear();
    homeAllMock.mockClear();
    moveMotorMock.mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CalibrationRunnerPanel tile modal', () => {
    it('shows selected tile metrics for completed tiles', async () => {
        const container = await renderPanel();
        const completedCard = container.querySelector<HTMLElement>(
            '[aria-label="Inspect calibration metrics for tile [0,1]"]',
        );
        expect(completedCard).toBeTruthy();
        await act(async () => {
            completedCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const modalRoot = document.getElementById('modal-root');
        expect(modalRoot).not.toBeNull();
        expect(modalRoot?.textContent).toContain('Tile [0,1] – debug metrics');
        expect(modalRoot?.textContent).not.toContain('[0,0]');
    });
});

describe('CalibrationRunnerPanel homing actions', () => {
    it('hides calibrated homing button when summary is missing', async () => {
        const container = await renderPanel({
            runnerState: { ...runnerState, summary: undefined },
        });
        const calibratedButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Move to calibrated home'),
        );
        expect(calibratedButton).toBeUndefined();
    });

    it('homes all motors to physical zero', async () => {
        const driverList = [createDriverView('aa:bb'), createDriverView('cc:dd')];
        const container = await renderPanel({ drivers: driverList });
        const physicalButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Move to physical home'),
        );
        expect(physicalButton).toBeTruthy();
        expect(physicalButton?.hasAttribute('disabled')).toBe(false);
        await act(async () => {
            physicalButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(moveMotorMock).toHaveBeenCalledTimes(2);
        expect(moveMotorMock.mock.calls).toEqual(
            expect.arrayContaining([
                [
                    {
                        mac: 'mac-1',
                        motorId: 1,
                        positionSteps: 0,
                    },
                ],
                [
                    {
                        mac: 'mac-2',
                        motorId: 2,
                        positionSteps: 0,
                    },
                ],
            ]),
        );
        expect(homeAllMock).not.toHaveBeenCalled();
    });

    it('applies calibrated home offsets via move commands', async () => {
        const container = await renderPanel();
        const calibratedButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Move to calibrated home'),
        );
        expect(calibratedButton).toBeTruthy();
        expect(calibratedButton?.hasAttribute('disabled')).toBe(false);
        await act(async () => {
            calibratedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(moveMotorMock).toHaveBeenCalledTimes(2);
        expect(moveMotorMock.mock.calls).toEqual(
            expect.arrayContaining([
                [
                    {
                        mac: 'mac-1',
                        motorId: 1,
                        positionSteps: -20,
                    },
                ],
                [
                    {
                        mac: 'mac-2',
                        motorId: 2,
                        positionSteps: -50,
                    },
                ],
            ]),
        );
    });
});
