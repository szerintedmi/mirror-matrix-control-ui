import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    createAccumulatingErrorToast,
    showCommandErrorToast,
    showSimpleWarningToast,
} from '@/components/common/StyledToast';
import type { CalibrationRunnerSettings } from '@/constants/calibration';
import type { MotorCommandApi } from '@/hooks/useMotorCommands';
import { createAdapters } from '@/services/calibration/script/adapters';
import type { DecisionOption } from '@/services/calibration/script/commands';
import { CalibrationExecutor, type PendingDecision } from '@/services/calibration/script/executor';
import { calibrationScript } from '@/services/calibration/script/script';
import {
    singleTileRecalibrationScript,
    type SingleTileRecalibrationConfig,
} from '@/services/calibration/script/singleTileScript';
import {
    type CalibrationCommandLogEntry,
    type CalibrationRunnerState,
    type CalibrationRunSummary,
    type CalibrationStepState,
    type TileAddress,
    type TileRunState,
    type CaptureBlobMeasurement,
    createBaselineRunnerState,
} from '@/services/calibration/types';
import type { ArrayRotation, MirrorConfig, NormalizedRoi, StagingPosition } from '@/types';

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
     * Current runner settings from external controller.
     * These values are used directly when starting calibration.
     */
    runnerSettings: CalibrationRunnerSettings;
    /**
     * Optional initial state to restore from session storage.
     */
    initialSessionState?: {
        summary: CalibrationRunnerState['summary'];
        tiles: CalibrationRunnerState['tiles'];
        progress: CalibrationRunnerState['progress'];
    } | null;
    /**
     * Loaded profile summary from storage. When provided and no calibration is
     * running, this is synced to runnerState.summary to enable single-tile
     * recalibration on loaded profiles.
     */
    loadedProfileSummary?: CalibrationRunSummary | null;
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
    commandLog: CalibrationCommandLogEntry[];
    stepState: CalibrationStepState | null;
    /** Pending decision for retry/skip UI */
    pendingDecision: PendingDecision | null;

    // Derived state
    tileEntries: TileRunState[];
    isActive: boolean;
    isAwaitingAdvance: boolean;
    /** Whether a decision is pending from the user */
    isAwaitingDecision: boolean;
    detectionReady: boolean;

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
    /** Submit a decision for retry/skip/abort */
    submitDecision: (decision: DecisionOption) => void;
    /** Start single-tile recalibration (requires existing profile) */
    startSingleTileRecalibration: (tile: TileAddress) => void;
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
    runnerSettings,
    initialSessionState,
    loadedProfileSummary,
    onExpectedPositionChange,
}: UseCalibrationControllerParams): CalibrationController => {
    const [mode, setMode] = useState<CalibrationMode>('auto');
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
    const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
    const executorRef = useRef<CalibrationExecutor | null>(null);

    // Create accumulating error toast for tile errors
    const errorToastRef = useRef(createAccumulatingErrorToast('Calibration'));

    const resetState = useCallback(() => {
        setRunnerState(createBaselineRunnerState(gridSize, mirrorConfig));
        setStepState(null);
        setCommandLog([]);
        setPendingDecision(null);
    }, [gridSize, mirrorConfig]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            executorRef.current?.abort();
            executorRef.current = null;
        };
    }, []);

    // Reset when grid/mirror config changes
    useEffect(() => {
        executorRef.current?.abort();
        executorRef.current = null;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        resetState();
    }, [gridSize, mirrorConfig, resetState]);

    // Sync loaded profile summary to runnerState when idle
    // This enables single-tile recalibration for loaded profiles
    useEffect(() => {
        // Only sync when idle (not running calibration)
        const isIdle = ['idle', 'completed', 'error', 'aborted'].includes(runnerState.phase);
        if (!isIdle) {
            return;
        }
        // If we have a loaded profile summary but no current summary, sync it
        if (loadedProfileSummary && !runnerState.summary) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRunnerState((prev) => ({
                ...prev,
                summary: loadedProfileSummary,
            }));
        }
    }, [loadedProfileSummary, runnerState.phase, runnerState.summary]);

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
        executorRef.current?.abort();
        executorRef.current = null;

        // Clear any previous errors and create fresh toast manager
        errorToastRef.current.clear();
        errorToastRef.current = createAccumulatingErrorToast('Calibration');

        // Create adapters for the executor
        const adapters = createAdapters(motorApi, captureMeasurement);

        // Create the executor with callbacks
        const executor = new CalibrationExecutor(
            {
                gridSize,
                mirrorConfig,
                settings: runnerSettings,
                arrayRotation,
                stagingPosition,
                roi,
                mode,
            },
            adapters,
            {
                onStateChange: setRunnerState,
                onStepStateChange: setStepState,
                onCommandLog: appendLogEntry,
                onCommandError: showCommandErrorToast,
                onTileError: (row, col, message) => {
                    errorToastRef.current.addError({ row, col, message });
                },
                onExpectedPositionChange,
                onPendingDecision: setPendingDecision,
            },
        );
        executorRef.current = executor;
        setCommandLog([]);
        setStepState(null);
        setPendingDecision(null);

        // Run the calibration script
        executor.run(calibrationScript).catch((err) => {
            // Handle uncaught errors - executor already sets state to error/aborted
            console.error('Calibration execution failed:', err);
        });
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
        executorRef.current?.pause();
    }, []);

    const resume = useCallback(() => {
        executorRef.current?.resume();
    }, []);

    const abort = useCallback(() => {
        executorRef.current?.abort();
        // Clear UI state that might be stale after abort
        setPendingDecision(null);
        setStepState(null);
    }, []);

    const reset = useCallback(() => {
        executorRef.current?.abort();
        executorRef.current = null;
        resetState();
    }, [resetState]);

    const advance = useCallback(() => {
        executorRef.current?.advance();
    }, []);

    const submitDecision = useCallback((decision: DecisionOption) => {
        executorRef.current?.submitDecision(decision);
    }, []);

    const startSingleTileRecalibration = useCallback(
        (tile: TileAddress) => {
            // Require existing profile
            if (!runnerState.summary) {
                setRunnerState((prev) => ({
                    ...prev,
                    error: 'No calibration profile available for recalibration. Run full calibration first.',
                }));
                return;
            }

            if (!detectionReady) {
                setRunnerState((prev) => ({
                    ...prev,
                    error: 'Camera stream and detector must be ready before recalibration can start.',
                }));
                return;
            }

            executorRef.current?.abort();
            executorRef.current = null;

            // Clear any previous errors and create fresh toast manager
            errorToastRef.current.clear();
            errorToastRef.current = createAccumulatingErrorToast('Recalibration');

            // Create adapters for the executor
            const adapters = createAdapters(motorApi, captureMeasurement);

            // Build the extended config for single-tile recalibration
            const singleTileConfig: SingleTileRecalibrationConfig = {
                gridSize,
                mirrorConfig,
                settings: runnerSettings,
                arrayRotation,
                stagingPosition,
                roi,
                mode,
                targetTile: tile,
                existingProfile: runnerState.summary,
            };

            // Create the executor with callbacks
            const executor = new CalibrationExecutor(singleTileConfig, adapters, {
                onStateChange: setRunnerState,
                onStepStateChange: setStepState,
                onCommandLog: appendLogEntry,
                onCommandError: showCommandErrorToast,
                onTileError: (row, col, message) => {
                    errorToastRef.current.addError({ row, col, message });
                },
                onExpectedPositionChange,
                onPendingDecision: setPendingDecision,
            });
            executorRef.current = executor;
            setCommandLog([]);
            setStepState(null);
            setPendingDecision(null);

            // Run the single-tile recalibration script
            // Wrap in factory to satisfy executor's expected signature
            executor
                .run(() => singleTileRecalibrationScript(singleTileConfig))
                .catch((err) => {
                    console.error('Single-tile recalibration failed:', err);
                });
        },
        [
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
            runnerState.summary,
            stagingPosition,
        ],
    );

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
    const isAwaitingDecision = pendingDecision !== null;

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
        commandLog,
        stepState,
        pendingDecision,
        tileEntries,
        isActive,
        isAwaitingAdvance,
        isAwaitingDecision,
        detectionReady,
        mode,
        setMode,
        start,
        pause,
        resume,
        abort,
        reset,
        advance,
        submitDecision,
        startSingleTileRecalibration,
    };
};

export default useCalibrationController;
