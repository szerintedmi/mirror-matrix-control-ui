import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import CalibrationRunnerPanel from '@/components/calibration/CalibrationRunnerPanel';
import { DEFAULT_CALIBRATION_RUNNER_SETTINGS } from '@/constants/calibration';
import type { CalibrationController } from '@/hooks/useCalibrationController';
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

const pendingTile: TileRunState = {
    tile: { row: 0, col: 0, key: '0-0' },
    status: 'pending',
    assignment: baseAssignment,
};

const completedMetrics: TileCalibrationMetrics = {
    home: {
        x: -0.08,
        y: 0.12,
        size: 0.1,
        response: 0.9,
        capturedAt: 1_735_000_000,
    },
    homeOffset: { dx: 0.02, dy: -0.02 },
    adjustedHome: { x: -0.1, y: 0.14 },
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
        adjustedTileFootprint: { width: 0.24, height: 0.24 },
        tileGap: { x: 0.04, y: 0.04 },
        gridOrigin: { x: -0.8, y: -0.8 },
        cameraOriginOffset: { x: 0, y: 0 },
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
            adjustedHome: completedMetrics.adjustedHome!,
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

const noop = () => {};

const createMockController = (state: CalibrationRunnerState): CalibrationController => ({
    runnerState: state,
    runnerSettings: DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    commandLog: [],
    stepState: null,
    tileEntries: Object.values(state.tiles).sort((a, b) => {
        if (a.tile.row === b.tile.row) return a.tile.col - b.tile.col;
        return a.tile.row - b.tile.row;
    }),
    isActive: false,
    isAwaitingAdvance: false,
    detectionReady: true,
    updateSetting: noop,
    mode: 'auto',
    setMode: noop,
    start: noop,
    pause: noop,
    resume: noop,
    abort: noop,
    reset: noop,
    advance: noop,
});

const renderPanel = async (options: { runnerState?: CalibrationRunnerState } = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const state = options.runnerState ?? runnerState;
    const controller = createMockController(state);
    await act(async () => {
        const element = (
            <CalibrationRunnerPanel
                controller={controller}
                gridSize={{ rows: 2, cols: 2 }}
                arrayRotation={0}
                onArrayRotationChange={noop}
                stagingPosition="nearest-corner"
                onStagingPositionChange={noop}
                isCalibrationActive={false}
                stepState={null}
                isAwaitingAdvance={false}
                isPaused={false}
                detectionReady={true}
                onStart={noop}
                onPause={noop}
                onResume={noop}
                onAbort={noop}
                onAdvance={noop}
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

describe('CalibrationRunnerPanel homing actions', () => {
    it('hides calibrated homing button when summary is missing', async () => {
        const container = await renderPanel({
            runnerState: { ...runnerState, summary: undefined },
        });
        // Open the Move dropdown first
        const moveDropdownButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Move'),
        );
        expect(moveDropdownButton).toBeTruthy();
        await act(async () => {
            moveDropdownButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // The calibrated home button should be disabled (shown with indicator dot)
        const calibratedButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('To calibrated home'),
        );
        expect(calibratedButton?.hasAttribute('disabled')).toBe(true);
    });

    it('homes all motors to physical zero', async () => {
        const container = await renderPanel();
        // Open the Move dropdown first
        const moveDropdownButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Move'),
        );
        expect(moveDropdownButton).toBeTruthy();
        await act(async () => {
            moveDropdownButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const physicalButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('To physical home'),
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
        // Open the Move dropdown first
        const moveDropdownButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Move'),
        );
        expect(moveDropdownButton).toBeTruthy();
        await act(async () => {
            moveDropdownButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const calibratedButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('To calibrated home'),
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
                        positionSteps: -40,
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
