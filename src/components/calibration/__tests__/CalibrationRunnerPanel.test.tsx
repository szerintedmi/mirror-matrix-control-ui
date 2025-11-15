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

vi.mock('@/hooks/useMotorCommands', () => ({
    useMotorCommands: () => ({
        nudgeMotor: vi.fn().mockResolvedValue({ direction: 1 }),
        homeMotor: vi.fn().mockResolvedValue({ mac: 'mac', completion: { status: 'done' } }),
        homeAll: vi.fn().mockResolvedValue([]),
        moveMotor: vi.fn().mockResolvedValue({ status: 'done' }),
    }),
}));

const createMotor = (motorIndex: number): Motor => ({
    nodeMac: `mac-${motorIndex}`,
    motorIndex,
});

const baseAssignment = { x: createMotor(1), y: createMotor(2) };

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
        tileGap: 0.05,
        gridOrigin: { x: 0, y: 0 },
    },
    stepTestSettings: {
        deltaSteps: DEFAULT_CALIBRATION_RUNNER_SETTINGS.deltaSteps,
        dwellMs: DEFAULT_CALIBRATION_RUNNER_SETTINGS.dwellMs,
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
    _key: K,
    _value: CalibrationRunnerSettings[K],
) => {};

const renderPanel = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        const element = (
            <CalibrationRunnerPanel
                runnerState={runnerState}
                runnerSettings={runnerSettings}
                tileEntries={[pendingTile, completedTile]}
                detectionReady
                drivers={drivers}
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
