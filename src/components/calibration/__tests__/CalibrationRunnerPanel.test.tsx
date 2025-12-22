import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import CalibrationRunnerPanel from '@/components/calibration/CalibrationRunnerPanel';
import { DEFAULT_CALIBRATION_RUNNER_SETTINGS } from '@/constants/calibration';
import type { CalibrationController } from '@/hooks/useCalibrationController';
import type { PendingDecision } from '@/services/calibration/script/executor';
import type {
    CalibrationRunnerState,
    TileRunState,
    TileCalibrationMetrics,
    CalibrationRunSummary,
} from '@/services/calibration/types';
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

const createMockController = (
    state: CalibrationRunnerState,
    overrides: Partial<CalibrationController> = {},
): CalibrationController => ({
    runnerState: state,
    runnerSettings: DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    commandLog: [],
    stepState: null,
    pendingDecision: null,
    tileEntries: Object.values(state.tiles).sort((a, b) => {
        if (a.tile.row === b.tile.row) return a.tile.col - b.tile.col;
        return a.tile.row - b.tile.row;
    }),
    isActive: false,
    isAwaitingAdvance: false,
    isAwaitingDecision: false,
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
    submitDecision: noop,
    startSingleTileRecalibration: noop,
    ...overrides,
});

const renderPanel = async (
    options: {
        runnerState?: CalibrationRunnerState;
        controllerOverrides?: Partial<CalibrationController>;
        isCalibrationActive?: boolean;
    } = {},
) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const state = options.runnerState ?? runnerState;
    const controller = createMockController(state, options.controllerOverrides);
    await act(async () => {
        const element = (
            <CalibrationRunnerPanel
                controller={controller}
                arrayRotation={0}
                onArrayRotationChange={noop}
                stagingPosition="nearest-corner"
                onStagingPositionChange={noop}
                isCalibrationActive={options.isCalibrationActive ?? false}
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

describe('CalibrationRunnerPanel pending decision UI', () => {
    it('shows decision buttons when pendingDecision is set', async () => {
        const pendingDecision: PendingDecision = {
            kind: 'tile-failure',
            tile: { row: 1, col: 2, key: '1-2' },
            error: 'Unable to detect blob at home position',
            options: ['retry', 'skip', 'abort'],
        };

        const container = await renderPanel({
            controllerOverrides: { pendingDecision, isActive: true },
            isCalibrationActive: true,
        });

        // Should show the tile identifier
        expect(container.textContent).toContain('[1,2]');
        expect(container.textContent).toContain('failed');

        // Should show the error message
        expect(container.textContent).toContain('Unable to detect blob at home position');

        // Should have all three decision buttons
        const retryBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
            btn.textContent?.includes('Retry'),
        );
        const skipBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
            btn.textContent?.includes('Skip'),
        );
        const abortBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
            btn.textContent?.includes('Abort'),
        );

        expect(retryBtn).toBeTruthy();
        expect(skipBtn).toBeTruthy();
        expect(abortBtn).toBeTruthy();
    });

    it('calls submitDecision when decision button is clicked', async () => {
        const submitDecisionMock = vi.fn();
        const pendingDecision: PendingDecision = {
            kind: 'tile-failure',
            tile: { row: 0, col: 0, key: '0-0' },
            error: 'Detection failed',
            options: ['retry', 'skip', 'abort'],
        };

        const container = await renderPanel({
            controllerOverrides: {
                pendingDecision,
                isActive: true,
                submitDecision: submitDecisionMock,
            },
            isCalibrationActive: true,
        });

        const skipBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
            btn.textContent?.includes('Skip'),
        );
        expect(skipBtn).toBeTruthy();

        await act(async () => {
            skipBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(submitDecisionMock).toHaveBeenCalledWith('skip');
    });

    it('does not show decision banner when pendingDecision is null', async () => {
        const container = await renderPanel({
            controllerOverrides: { pendingDecision: null },
        });

        // Should not have retry/skip buttons in this context
        const retryBtn = Array.from(container.querySelectorAll('button')).find(
            (btn) => btn.textContent === 'Retry',
        );
        expect(retryBtn).toBeFalsy();
    });
});
