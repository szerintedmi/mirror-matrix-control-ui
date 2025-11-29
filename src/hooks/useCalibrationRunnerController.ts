import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    type TileRunState,
    type CaptureBlobMeasurement,
    createBaselineRunnerState,
} from '@/services/calibrationRunner';
import type { ArrayRotation, MirrorConfig } from '@/types';

const clampSetting = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

interface UseCalibrationRunnerControllerParams {
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
     * Optional initial state to restore from session storage.
     */
    initialSessionState?: {
        summary: CalibrationRunnerState['summary'];
        tiles: CalibrationRunnerState['tiles'];
        progress: CalibrationRunnerState['progress'];
    } | null;
}

export interface CalibrationRunnerController {
    runnerState: CalibrationRunnerState;
    runnerSettings: CalibrationRunnerSettings;
    commandLog: CalibrationCommandLogEntry[];
    updateSetting: <K extends keyof CalibrationRunnerSettings>(
        key: K,
        value: CalibrationRunnerSettings[K],
    ) => void;
    tileEntries: TileRunState[];
    startRunner: () => void;
    pauseRunner: () => void;
    resumeRunner: () => void;
    abortRunner: () => void;
    detectionReady: boolean;
}

export const useCalibrationRunnerController = ({
    gridSize,
    mirrorConfig,
    motorApi,
    captureMeasurement,
    detectionReady,
    arrayRotation,
    initialSessionState,
}: UseCalibrationRunnerControllerParams): CalibrationRunnerController => {
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
    const [commandLog, setCommandLog] = useState<CalibrationCommandLogEntry[]>([]);
    const runnerRef = useRef<CalibrationRunner | null>(null);

    const updateSetting = useCallback(
        <K extends keyof CalibrationRunnerSettings>(
            key: K,
            value: CalibrationRunnerSettings[K],
        ) => {
            setRunnerSettings((prev) => {
                if (prev[key] === value) {
                    return prev;
                }
                return {
                    ...prev,
                    [key]: value,
                };
            });
        },
        [],
    );

    useEffect(() => {
        return () => {
            runnerRef.current?.dispose();
            runnerRef.current = null;
        };
    }, []);

    useEffect(() => {
        runnerRef.current?.abort();
        runnerRef.current = null;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRunnerState(createBaselineRunnerState(gridSize, mirrorConfig));
        setCommandLog([]);
    }, [gridSize, mirrorConfig]);

    const appendLogEntry = useCallback((entry: CalibrationCommandLogEntry) => {
        setCommandLog((prev) => [entry, ...prev].slice(0, 120));
    }, []);

    const startRunner = useCallback(() => {
        if (!detectionReady) {
            setRunnerState((prev) => ({
                ...prev,
                error: 'Camera stream and detector must be ready before calibration can start.',
            }));
            return;
        }
        runnerRef.current?.dispose();
        runnerRef.current = null;
        const runner = new CalibrationRunner({
            gridSize,
            mirrorConfig,
            motorApi,
            captureMeasurement,
            settings: runnerSettings,
            arrayRotation,
            onStateChange: (next) => {
                setRunnerState(next);
            },
            onCommandLog: appendLogEntry,
        });
        runnerRef.current = runner;
        setCommandLog([]);
        runner.start();
    }, [
        appendLogEntry,
        arrayRotation,
        captureMeasurement,
        detectionReady,
        gridSize,
        mirrorConfig,
        motorApi,
        runnerSettings,
    ]);

    const pauseRunner = useCallback(() => {
        runnerRef.current?.pause();
    }, []);

    const resumeRunner = useCallback(() => {
        runnerRef.current?.resume();
    }, []);

    const abortRunner = useCallback(() => {
        runnerRef.current?.abort();
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

    return {
        runnerState,
        runnerSettings,
        commandLog,
        updateSetting: (key, value) => {
            if (key === 'deltaSteps') {
                updateSetting(key, clampSetting(Number(value), 50, MOTOR_MAX_POSITION_STEPS));
                return;
            }
            updateSetting(key, value);
        },
        tileEntries,
        startRunner,
        pauseRunner,
        resumeRunner,
        abortRunner,
        detectionReady,
    };
};
