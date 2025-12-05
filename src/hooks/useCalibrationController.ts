import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    createAccumulatingErrorToast,
    showCommandErrorToast,
    showSimpleWarningToast,
} from '@/components/common/StyledToast';
import {
    DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    type CalibrationRunnerSettings,
} from '@/constants/calibration';
import { MOTOR_MAX_POSITION_STEPS } from '@/constants/control';
import type { MotorCommandApi } from '@/hooks/useMotorCommands';
import {
    CalibrationRunner,
    type CalibrationCommandLogEntry,
    type CalibrationRunnerState,
    type CalibrationStepState,
    type TileRunState,
    type CaptureBlobMeasurement,
    createBaselineRunnerState,
} from '@/services/calibrationRunner';
import type { ArrayRotation, MirrorConfig, NormalizedRoi, StagingPosition } from '@/types';

const clampSetting = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

const MAX_LOG_ENTRIES = 120;

export type CalibrationMode = 'auto' | 'step';

interface UseCalibrationControllerParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    motorApi: MotorCommandApi;
    captureMeasurement: CaptureBlobMeasurement;
    detectionReady: boolean;
    /**
     * Array rotation setting for calibration.
     * Affects step test jog directions for rotated physical arrays.
     */
    arrayRotation: ArrayRotation;
    /**
     * Position where tiles are moved during staging phase.
     */
    stagingPosition: StagingPosition;

    /**
     * ROI (Region of Interest) settings for expected blob position calculation.
     */
    roi: NormalizedRoi;
    /**
     * Optional initial state to restore from session storage.
     */
    initialSessionState?: {
        summary: CalibrationRunnerState['summary'];
        tiles: CalibrationRunnerState['tiles'];
        progress: CalibrationRunnerState['progress'];
    } | null;
    /**
     * Callback to update the expected blob position overlay.
     * Position is in viewport coordinates (0 to 1).
     */
    onExpectedPositionChange?: (
        position: { x: number; y: number } | null,
        tolerance: number,
    ) => void;
}

export interface CalibrationController {
    // State
    runnerState: CalibrationRunnerState;
    runnerSettings: CalibrationRunnerSettings;
    commandLog: CalibrationCommandLogEntry[];
    stepState: CalibrationStepState | null;

    // Derived state
    tileEntries: TileRunState[];
    isActive: boolean;
    isAwaitingAdvance: boolean;
    detectionReady: boolean;

    // Settings
    updateSetting: <K extends keyof CalibrationRunnerSettings>(
        key: K,
        value: CalibrationRunnerSettings[K],
    ) => void;

    // Mode control
    mode: CalibrationMode;
    setMode: (mode: CalibrationMode) => void;

    // Unified control methods
    start: () => void;
    pause: () => void;
    resume: () => void;
    abort: () => void;
    reset: () => void;
    /** Advance to next step (step mode only) */
    advance: () => void;
}

export const useCalibrationController = ({
    gridSize,
    mirrorConfig,
    motorApi,
    captureMeasurement,
    detectionReady,
    arrayRotation,
    stagingPosition,
    roi,
    initialSessionState,
    onExpectedPositionChange,
}: UseCalibrationControllerParams): CalibrationController => {
    const [mode, setMode] = useState<CalibrationMode>('auto');
    const [runnerSettings, setRunnerSettings] = useState<CalibrationRunnerSettings>(
        DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    );
    const [runnerState, setRunnerState] = useState<CalibrationRunnerState>(() => {
        const baseState = createBaselineRunnerState(gridSize, mirrorConfig);
        // Restore from session state if available
        if (initialSessionState) {
            return {
                ...baseState,
                summary: initialSessionState.summary,
                tiles: initialSessionState.tiles,
                progress: initialSessionState.progress,
                phase: initialSessionState.summary ? 'completed' : baseState.phase,
            };
        }
        return baseState;
    });
    const [stepState, setStepState] = useState<CalibrationStepState | null>(null);
    const [commandLog, setCommandLog] = useState<CalibrationCommandLogEntry[]>([]);
    const runnerRef = useRef<CalibrationRunner | null>(null);

    // Create accumulating error toast for tile errors
    const errorToastRef = useRef(createAccumulatingErrorToast('Calibration'));

    const updateSetting = useCallback(
        <K extends keyof CalibrationRunnerSettings>(
            key: K,
            value: CalibrationRunnerSettings[K],
        ) => {
            setRunnerSettings((prev) => {
                if (prev[key] === value) {
                    return prev;
                }
                // Apply clamping for deltaSteps
                if (key === 'deltaSteps') {
                    const clamped = clampSetting(Number(value), 50, MOTOR_MAX_POSITION_STEPS);
                    return { ...prev, [key]: clamped };
                }
                return { ...prev, [key]: value };
            });
        },
        [],
    );

    const resetState = useCallback(() => {
        setRunnerState(createBaselineRunnerState(gridSize, mirrorConfig));
        setStepState(null);
        setCommandLog([]);
    }, [gridSize, mirrorConfig]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            runnerRef.current?.dispose();
            runnerRef.current = null;
        };
    }, []);

    // Reset when grid/mirror config changes
    useEffect(() => {
        runnerRef.current?.abort();
        runnerRef.current = null;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        resetState();
    }, [gridSize, mirrorConfig, resetState]);

    const appendLogEntry = useCallback((entry: CalibrationCommandLogEntry) => {
        setCommandLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
    }, []);

    const start = useCallback(() => {
        if (!detectionReady) {
            setRunnerState((prev) => ({
                ...prev,
                error: 'Camera stream and detector must be ready before calibration can start.',
            }));
            return;
        }
        runnerRef.current?.dispose();
        runnerRef.current = null;

        // Clear any previous errors and create fresh toast manager
        errorToastRef.current.clear();
        errorToastRef.current = createAccumulatingErrorToast('Calibration');

        const runner = new CalibrationRunner({
            gridSize,
            mirrorConfig,
            motorApi,
            captureMeasurement,
            settings: runnerSettings,
            arrayRotation,
            stagingPosition,
            roi,
            mode,
            onStateChange: setRunnerState,
            onStepStateChange: setStepState,
            onCommandLog: appendLogEntry,
            onCommandError: showCommandErrorToast,
            onTileError: (row, col, message) => {
                errorToastRef.current.addError({ row, col, message });
            },
            onExpectedPositionChange,
        });
        runnerRef.current = runner;
        setCommandLog([]);
        setStepState(null);
        runner.start();
    }, [
        appendLogEntry,
        arrayRotation,
        captureMeasurement,
        detectionReady,
        gridSize,
        mirrorConfig,
        mode,
        motorApi,
        onExpectedPositionChange,
        roi,
        runnerSettings,
        stagingPosition,
    ]);

    const pause = useCallback(() => {
        runnerRef.current?.pause();
    }, []);

    const resume = useCallback(() => {
        runnerRef.current?.resume();
    }, []);

    const abort = useCallback(() => {
        runnerRef.current?.abort();
    }, []);

    const reset = useCallback(() => {
        runnerRef.current?.dispose();
        runnerRef.current = null;
        resetState();
    }, [resetState]);

    const advance = useCallback(() => {
        runnerRef.current?.advanceStep();
    }, []);

    const tileEntries = useMemo(
        () =>
            Object.values(runnerState.tiles).sort((a, b) => {
                if (a.tile.row === b.tile.row) {
                    return a.tile.col - b.tile.col;
                }
                return a.tile.row - b.tile.row;
            }),
        [runnerState.tiles],
    );

    const isActive = useMemo(
        () => !['idle', 'completed', 'error', 'aborted'].includes(runnerState.phase),
        [runnerState.phase],
    );

    const isAwaitingAdvance = stepState?.status === 'waiting';

    // Track whether we've shown the outlier warning for current calibration
    const outlierToastShownRef = useRef(false);

    // Show outlier warning toast when calibration completes with outliers
    useEffect(() => {
        const summary = runnerState.summary;
        const outlierAnalysis = summary?.outlierAnalysis;

        // Reset toast flag when a new calibration starts
        if (isActive) {
            outlierToastShownRef.current = false;
            return;
        }

        // Only show toast once per calibration, when it completes with outliers
        if (
            runnerState.phase === 'completed' &&
            outlierAnalysis?.outlierCount &&
            outlierAnalysis.outlierCount > 0 &&
            !outlierToastShownRef.current
        ) {
            outlierToastShownRef.current = true;
            const count = outlierAnalysis.outlierCount;
            const tileKeys = outlierAnalysis.outlierTileKeys;

            // Calculate max percentage above median for outlier tiles
            const median = outlierAnalysis.median;
            let maxPctAboveMedian = 0;
            for (const key of tileKeys) {
                const tile = summary?.tiles[key];
                const size = tile?.homeMeasurement?.size;
                if (size !== undefined && median > 0) {
                    const pct = ((size - median) / median) * 100;
                    if (pct > maxPctAboveMedian) {
                        maxPctAboveMedian = pct;
                    }
                }
            }

            const pctStr =
                maxPctAboveMedian > 0
                    ? ` (up to ${Math.round(maxPctAboveMedian)}% above median)`
                    : '';
            const plural = count > 1 ? 's' : '';

            showSimpleWarningToast(
                `${count} outlier size tile${plural} detected`,
                `Tile${plural} [${tileKeys.join(', ')}] excluded from grid sizing${pctStr}.`,
            );
        }
    }, [runnerState.phase, runnerState.summary, isActive]);

    return {
        runnerState,
        runnerSettings,
        commandLog,
        stepState,
        tileEntries,
        isActive,
        isAwaitingAdvance,
        detectionReady,
        updateSetting,
        mode,
        setMode,
        start,
        pause,
        resume,
        abort,
        reset,
        advance,
    };
};

export default useCalibrationController;
