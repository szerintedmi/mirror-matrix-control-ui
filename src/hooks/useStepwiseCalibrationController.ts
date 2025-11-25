import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CalibrationRunnerSettings } from '@/constants/calibration';
import type { MotorCommandApi } from '@/hooks/useMotorCommands';
import {
    CalibrationRunner,
    type CalibrationCommandLogEntry,
    type CalibrationRunnerState,
    type CalibrationStepState,
    createBaselineRunnerState,
    type CaptureBlobMeasurement,
} from '@/services/calibrationRunner';
import type { MirrorConfig } from '@/types';

interface UseStepwiseCalibrationControllerParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    motorApi: MotorCommandApi;
    captureMeasurement: CaptureBlobMeasurement;
    detectionReady: boolean;
    settings: CalibrationRunnerSettings;
}

export interface StepwiseCalibrationController {
    runnerState: CalibrationRunnerState;
    stepState: CalibrationStepState | null;
    commandLog: CalibrationCommandLogEntry[];
    isAwaitingAdvance: boolean;
    isActive: boolean;
    start: () => void;
    advance: () => void;
    abort: () => void;
    reset: () => void;
}

const MAX_LOG_ENTRIES = 120;

export const useStepwiseCalibrationController = ({
    gridSize,
    mirrorConfig,
    motorApi,
    captureMeasurement,
    detectionReady,
    settings,
}: UseStepwiseCalibrationControllerParams): StepwiseCalibrationController => {
    const initialState = useMemo(
        () => createBaselineRunnerState(gridSize, mirrorConfig),
        [gridSize, mirrorConfig],
    );
    const [runnerState, setRunnerState] = useState<CalibrationRunnerState>(initialState);
    const [stepState, setStepState] = useState<CalibrationStepState | null>(null);
    const [commandLog, setCommandLog] = useState<CalibrationCommandLogEntry[]>([]);
    const runnerRef = useRef<CalibrationRunner | null>(null);

    const resetState = useCallback(() => {
        setRunnerState(createBaselineRunnerState(gridSize, mirrorConfig));
        setStepState(null);
        setCommandLog([]);
    }, [gridSize, mirrorConfig]);

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
        resetState();
    }, [gridSize, mirrorConfig, resetState]);

    const start = useCallback(() => {
        if (!detectionReady) {
            setRunnerState((prev) => ({
                ...prev,
                error: 'Camera stream and detector must be ready before calibration can start.',
            }));
            return;
        }
        runnerRef.current?.dispose();
        const runner = new CalibrationRunner({
            gridSize,
            mirrorConfig,
            motorApi,
            captureMeasurement,
            settings,
            mode: 'step',
            onStateChange: setRunnerState,
            onStepStateChange: setStepState,
            onCommandLog: (entry) => {
                setCommandLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
            },
        });
        runnerRef.current = runner;
        setCommandLog([]);
        setStepState(null);
        runner.start();
    }, [captureMeasurement, detectionReady, gridSize, mirrorConfig, motorApi, settings]);

    const advance = useCallback(() => {
        runnerRef.current?.advanceStep();
    }, []);

    const abort = useCallback(() => {
        runnerRef.current?.abort();
    }, []);

    const reset = useCallback(() => {
        runnerRef.current?.dispose();
        runnerRef.current = null;
        resetState();
    }, [resetState]);

    const isAwaitingAdvance = stepState?.status === 'waiting';
    const isActive = useMemo(
        () => !['idle', 'completed', 'error', 'aborted'].includes(runnerState.phase),
        [runnerState.phase],
    );

    return {
        runnerState,
        stepState,
        commandLog,
        isAwaitingAdvance,
        isActive,
        start,
        advance,
        abort,
        reset,
    };
};

export default useStepwiseCalibrationController;
