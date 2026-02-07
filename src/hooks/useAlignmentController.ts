import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { useCalibrationContext } from '@/context/CalibrationContext';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import { computeAlignmentAxisTarget } from '@/services/alignmentAxisTarget';
import {
    appendAlignmentRun,
    type AlignmentAxisStatus,
    type AlignmentRunSettingsSnapshot,
    type AlignmentRunShapeMetrics,
    type AlignmentRunSummary,
    type AlignmentRunTileState,
    type AlignmentTileStatus,
} from '@/services/alignmentRunStorage';
import type {
    AdaptiveThresholdMethod,
    AdaptiveThresholdType,
    ShapeAnalysisResult,
} from '@/services/opencvWorkerClient';
import { getOpenCvWorkerClient } from '@/services/openCvWorkerSingleton';
import type {
    Axis,
    MirrorAssignment,
    MirrorConfig,
    NormalizedRoi,
    TileCalibrationResults,
} from '@/types';
import { getMirrorAssignment } from '@/utils/grid';

interface GridSize {
    rows: number;
    cols: number;
}

export interface ShapeMetrics {
    area: number;
    eccentricity: number;
    principalAngle: number;
    centroid: { x: number; y: number };
}

export interface AxisAlignmentState {
    axis: Axis;
    motor: { nodeMac: string; motorId: number } | null;
    status: AlignmentAxisStatus;
    correctionSteps: number;
    iterations: number;
    error: string | null;
}

export interface TileAlignmentState {
    key: string;
    row: number;
    col: number;
    status: AlignmentTileStatus;
    initialSteps: { x: number; y: number };
    currentSteps: { x: number; y: number };
    correction: { x: number; y: number };
    iterations: { x: number; y: number };
    axes: {
        x: AxisAlignmentState;
        y: AxisAlignmentState;
    };
    finalEccentricity: number | null;
    error: string | null;
}

export interface AlignmentPauseState {
    reason: 'no-contour' | 'unstable-measurement' | 'camera-unavailable';
    message: string;
    tileKey: string | null;
    axis: Axis | null;
}

export interface AlignmentState {
    phase: 'idle' | 'positioning' | 'measuring-baseline' | 'converging' | 'paused' | 'complete';
    baselineMetrics: ShapeMetrics | null;
    currentMetrics: ShapeMetrics | null;
    tileStates: Record<string, TileAlignmentState>;
    activeTile: string | null;
    activeAxis: Axis | null;
    positioningComplete: boolean;
    settingsLocked: boolean;
    error: string | null;
}

export interface AlignmentControllerSettings {
    stepSize: number;
    maxIterationsPerAxis: number;
    areaThresholdPercent: number;
    improvementStrategy: 'any' | 'weighted';
    weightedArea: number;
    weightedEccentricity: number;
    weightedScoreThresholdPercent: number;
    samplesPerMeasurement: number;
    outlierStrategy: 'mad-filter' | 'none';
    outlierThreshold: number;
    minContourArea: number;
    adaptiveMethod: AdaptiveThresholdMethod;
    thresholdType: AdaptiveThresholdType;
    blockSize: number;
    thresholdConstant: number;
    enableSmoothing: boolean;
    enableMorphology: boolean;
    rejectBorderContours: boolean;
    rejectLargeContours: boolean;
    maxContourAreaRatio: number;
    enableBackgroundSuppression: boolean;
    backgroundBlurKernelSize: number;
    backgroundGain: number;
    enableContourMerging: boolean;
    contourMergeMaxContours: number;
    contourMergeDistancePx: number;
    contourMergeMinAreaRatio: number;
}

interface UseAlignmentControllerParams {
    gridSize: GridSize;
    mirrorConfig: MirrorConfig;
    processedCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
    roi: NormalizedRoi;
    detectionReady: boolean;
    opencvReady: boolean;
    settings: AlignmentControllerSettings;
}

interface RunnableTile {
    key: string;
    row: number;
    col: number;
    assignment: MirrorAssignment;
    tile: TileCalibrationResults;
}

interface ResumePoint {
    tileIndex: number;
    axisIndex: number;
}

const AXES: Axis[] = ['x', 'y'];
const CONVERGED_ECCENTRICITY = 1.05;
const AREA_STABILITY_THRESHOLD = 0.02;
const DEFAULT_SETTLING_DELAY_MS = 200;
const MAX_UNSTABLE_MEASUREMENT_RETRIES = 5;

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const createRunId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `alignment-${Date.now()}`;
};

const createAxisState = (
    axis: Axis,
    motor: { nodeMac: string; motorId: number } | null,
    status: AlignmentAxisStatus,
    error: string | null = null,
): AxisAlignmentState => ({
    axis,
    motor,
    status,
    correctionSteps: 0,
    iterations: 0,
    error,
});

const createTileState = ({
    key,
    row,
    col,
    xMotor,
    yMotor,
    stepsX,
    stepsY,
    usable,
    error,
}: {
    key: string;
    row: number;
    col: number;
    xMotor: { nodeMac: string; motorId: number } | null;
    yMotor: { nodeMac: string; motorId: number } | null;
    stepsX: number;
    stepsY: number;
    usable: boolean;
    error: string | null;
}): TileAlignmentState => ({
    key,
    row,
    col,
    status: usable ? 'pending' : 'skipped',
    initialSteps: { x: stepsX, y: stepsY },
    currentSteps: { x: stepsX, y: stepsY },
    correction: { x: 0, y: 0 },
    iterations: { x: 0, y: 0 },
    axes: {
        x: createAxisState('x', xMotor, usable ? 'pending' : 'skipped', usable ? null : error),
        y: createAxisState('y', yMotor, usable ? 'pending' : 'skipped', usable ? null : error),
    },
    finalEccentricity: null,
    error,
});

const computeMedian = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const computeMad = (values: number[]): number => {
    const median = computeMedian(values);
    const deviations = values.map((value) => Math.abs(value - median));
    return computeMedian(deviations);
};

const toRunTile = (tile: TileAlignmentState): AlignmentRunTileState => ({
    ...tile,
});

const computeTileAggregateStatus = (tile: TileAlignmentState): AlignmentTileStatus => {
    const x = tile.axes.x.status;
    const y = tile.axes.y.status;
    if (x === 'error' || y === 'error') {
        return 'error';
    }
    if (x === 'max-iterations' || y === 'max-iterations') {
        return 'max-iterations';
    }
    if (x === 'converged' && y === 'converged') {
        return 'converged';
    }
    if (x === 'skipped' && y === 'skipped') {
        return 'skipped';
    }
    if (x === 'pending' || y === 'pending') {
        return 'pending';
    }
    return 'partial';
};

const computeTotals = (
    tiles: TileAlignmentState[],
    baseline: ShapeMetrics | null,
    finalMetrics: ShapeMetrics | null,
) => {
    let convergedTiles = 0;
    let partialTiles = 0;
    let skippedTiles = 0;
    let erroredTiles = 0;
    let maxIterationsTiles = 0;
    const improvements: number[] = [];

    tiles.forEach((tile) => {
        switch (tile.status) {
            case 'converged':
                convergedTiles += 1;
                break;
            case 'partial':
                partialTiles += 1;
                break;
            case 'skipped':
                skippedTiles += 1;
                break;
            case 'error':
                erroredTiles += 1;
                break;
            case 'max-iterations':
                maxIterationsTiles += 1;
                break;
            default:
                break;
        }
        if (baseline && tile.finalEccentricity !== null) {
            improvements.push(baseline.eccentricity - tile.finalEccentricity);
        }
    });

    const averageEccentricityImprovement =
        improvements.length > 0
            ? improvements.reduce((sum, value) => sum + value, 0) / improvements.length
            : null;
    const areaReductionPercent =
        baseline && finalMetrics && baseline.area > 0
            ? ((baseline.area - finalMetrics.area) / baseline.area) * 100
            : null;

    return {
        totalTiles: tiles.length,
        convergedTiles,
        partialTiles,
        skippedTiles,
        erroredTiles,
        maxIterationsTiles,
        averageEccentricityImprovement,
        areaReductionPercent,
    };
};

const toSettingsSnapshot = (
    settings: AlignmentControllerSettings,
): AlignmentRunSettingsSnapshot => ({
    stepSize: settings.stepSize,
    maxIterationsPerAxis: settings.maxIterationsPerAxis,
    areaThreshold: settings.areaThresholdPercent,
    improvementStrategy: settings.improvementStrategy,
    weightedArea: settings.weightedArea,
    weightedEccentricity: settings.weightedEccentricity,
    weightedScoreThreshold: settings.weightedScoreThresholdPercent,
    samplesPerMeasurement: settings.samplesPerMeasurement,
    outlierStrategy: settings.outlierStrategy,
    outlierThreshold: settings.outlierThreshold,
    minContourArea: settings.minContourArea,
    adaptiveMethod: settings.adaptiveMethod,
    thresholdType: settings.thresholdType,
    blockSize: settings.blockSize,
    thresholdConstant: settings.thresholdConstant,
    enableSmoothing: settings.enableSmoothing,
    enableMorphology: settings.enableMorphology,
    rejectBorderContours: settings.rejectBorderContours,
    rejectLargeContours: settings.rejectLargeContours,
    maxContourAreaRatio: settings.maxContourAreaRatio,
    enableBackgroundSuppression: settings.enableBackgroundSuppression,
    backgroundBlurKernelSize: settings.backgroundBlurKernelSize,
    backgroundGain: settings.backgroundGain,
    enableContourMerging: settings.enableContourMerging,
    contourMergeMaxContours: settings.contourMergeMaxContours,
    contourMergeDistancePx: settings.contourMergeDistancePx,
    contourMergeMinAreaRatio: settings.contourMergeMinAreaRatio,
});

export interface AlignmentControllerResult {
    state: AlignmentState;
    pauseState: AlignmentPauseState | null;
    latestShapeResult: ShapeAnalysisResult | null;
    lastRun: AlignmentRunSummary | null;
    moveToCenter: () => Promise<void>;
    startConvergence: () => Promise<void>;
    stop: () => void;
    retryPaused: () => Promise<void>;
    skipPausedTile: () => Promise<void>;
    abortRun: () => void;
    exportLastRunJson: () => string | null;
}

export const useAlignmentController = ({
    gridSize,
    mirrorConfig,
    processedCanvasRef,
    roi,
    detectionReady,
    opencvReady,
    settings,
}: UseAlignmentControllerParams): AlignmentControllerResult => {
    const { selectedProfile } = useCalibrationContext();
    const { moveMotor } = useMotorCommands();
    const storage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );

    const [state, setState] = useState<AlignmentState>({
        phase: 'idle',
        baselineMetrics: null,
        currentMetrics: null,
        tileStates: {},
        activeTile: null,
        activeAxis: null,
        positioningComplete: false,
        settingsLocked: false,
        error: null,
    });
    const [pauseState, setPauseState] = useState<AlignmentPauseState | null>(null);
    const [latestShapeResult, setLatestShapeResult] = useState<ShapeAnalysisResult | null>(null);
    const [lastRun, setLastRun] = useState<AlignmentRunSummary | null>(null);

    const baselineRef = useRef<ShapeMetrics | null>(null);
    const settingsRef = useRef<AlignmentControllerSettings>(settings);
    const tileStatesRef = useRef<Record<string, TileAlignmentState>>({});
    const runnableTilesRef = useRef<RunnableTile[]>([]);
    const stopRequestedRef = useRef(false);
    const resumePointRef = useRef<ResumePoint | null>(null);
    const runActiveRef = useRef(false);

    settingsRef.current = settings;

    const setControllerError = useCallback((message: string | null) => {
        setState((prev) => ({
            ...prev,
            error: message,
        }));
    }, []);

    const publishTileStates = useCallback(
        (
            nextTileStates: Record<string, TileAlignmentState>,
            patch: Partial<
                Pick<AlignmentState, 'activeTile' | 'activeAxis' | 'phase' | 'settingsLocked'>
            > = {},
        ) => {
            tileStatesRef.current = nextTileStates;
            setState((prev) => ({
                ...prev,
                tileStates: { ...nextTileStates },
                ...patch,
            }));
        },
        [],
    );

    const setPaused = useCallback(
        (nextPauseState: AlignmentPauseState, resumePoint: ResumePoint | null) => {
            resumePointRef.current = resumePoint;
            setPauseState(nextPauseState);
            setState((prev) => ({
                ...prev,
                phase: 'paused',
                settingsLocked: false,
                activeTile: nextPauseState.tileKey,
                activeAxis: nextPauseState.axis,
                error: nextPauseState.message,
            }));
        },
        [],
    );

    const buildTiles = useCallback((): {
        tileStates: Record<string, TileAlignmentState>;
        runnableTiles: RunnableTile[];
    } => {
        const tileStates: Record<string, TileAlignmentState> = {};
        const runnableTiles: RunnableTile[] = [];
        const existingStates = tileStatesRef.current;

        for (let row = 0; row < gridSize.rows; row += 1) {
            for (let col = 0; col < gridSize.cols; col += 1) {
                const key = `${row}-${col}`;
                const assignment = getMirrorAssignment(mirrorConfig, row, col);
                const tile = selectedProfile?.tiles[key];
                const existingState = existingStates[key];

                const stepsX = existingState?.currentSteps.x ?? tile?.adjustedHome?.stepsX ?? 0;
                const stepsY = existingState?.currentSteps.y ?? tile?.adjustedHome?.stepsY ?? 0;
                const hasAssignments = Boolean(assignment.x && assignment.y);
                const usableTile = Boolean(
                    tile &&
                    tile.status === 'completed' &&
                    hasAssignments &&
                    tile.adjustedHome &&
                    typeof tile.adjustedHome.stepsX === 'number' &&
                    typeof tile.adjustedHome.stepsY === 'number' &&
                    tile.stepToDisplacement.x !== null &&
                    tile.stepToDisplacement.y !== null,
                );

                const tileState = createTileState({
                    key,
                    row,
                    col,
                    xMotor: assignment.x
                        ? { nodeMac: assignment.x.nodeMac, motorId: assignment.x.motorIndex }
                        : null,
                    yMotor: assignment.y
                        ? { nodeMac: assignment.y.nodeMac, motorId: assignment.y.motorIndex }
                        : null,
                    stepsX,
                    stepsY,
                    usable: usableTile,
                    error: usableTile ? null : 'Tile is not fully calibrated or assigned.',
                });
                tileStates[key] = tileState;

                if (usableTile && tile) {
                    runnableTiles.push({ key, row, col, assignment, tile });
                }
            }
        }

        return {
            tileStates,
            runnableTiles,
        };
    }, [gridSize.cols, gridSize.rows, mirrorConfig, selectedProfile]);

    const moveWithRetry = useCallback(
        async (motor: { nodeMac: string; motorId: number }, positionSteps: number) => {
            try {
                await moveMotor({
                    mac: motor.nodeMac,
                    motorId: motor.motorId,
                    positionSteps,
                });
            } catch (firstError) {
                await moveMotor({
                    mac: motor.nodeMac,
                    motorId: motor.motorId,
                    positionSteps,
                }).catch((secondError) => {
                    throw secondError ?? firstError;
                });
            }
        },
        [moveMotor],
    );

    const measureShapeStable = useCallback(async (): Promise<{
        metrics: ShapeMetrics | null;
        error: AlignmentPauseState | null;
    }> => {
        if (!detectionReady || !opencvReady) {
            return {
                metrics: null,
                error: {
                    reason: 'camera-unavailable',
                    message: 'Camera/OpenCV is not ready for shape measurement.',
                    tileKey: null,
                    axis: null,
                },
            };
        }

        const client = getOpenCvWorkerClient();
        await client.init();

        const sampleCount = Math.max(1, Math.floor(settingsRef.current.samplesPerMeasurement));

        for (let attempt = 0; attempt < MAX_UNSTABLE_MEASUREMENT_RETRIES; attempt += 1) {
            const samples: ShapeMetrics[] = [];
            let missingContour = false;

            for (let index = 0; index < sampleCount; index += 1) {
                const canvas = processedCanvasRef.current;
                if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
                    return {
                        metrics: null,
                        error: {
                            reason: 'camera-unavailable',
                            message: 'Processed camera feed is unavailable.',
                            tileKey: null,
                            axis: null,
                        },
                    };
                }

                const bitmap = await window.createImageBitmap(canvas);
                const result = await client.analyzeShape({
                    frame: bitmap,
                    width: canvas.width,
                    height: canvas.height,
                    roi,
                    adaptiveThreshold: {
                        method: settingsRef.current.adaptiveMethod,
                        thresholdType: settingsRef.current.thresholdType,
                        blockSize: settingsRef.current.blockSize,
                        C: settingsRef.current.thresholdConstant,
                    },
                    minContourArea: settingsRef.current.minContourArea,
                    filtering: {
                        enableSmoothing: settingsRef.current.enableSmoothing,
                        enableMorphology: settingsRef.current.enableMorphology,
                        rejectBorderContours: settingsRef.current.rejectBorderContours,
                        rejectLargeContours: settingsRef.current.rejectLargeContours,
                        maxContourAreaRatio: settingsRef.current.maxContourAreaRatio,
                        enableBackgroundSuppression:
                            settingsRef.current.enableBackgroundSuppression,
                        backgroundBlurKernelSize: settingsRef.current.backgroundBlurKernelSize,
                        backgroundGain: settingsRef.current.backgroundGain,
                        enableContourMerging: settingsRef.current.enableContourMerging,
                        contourMergeMaxContours: settingsRef.current.contourMergeMaxContours,
                        contourMergeDistancePx: settingsRef.current.contourMergeDistancePx,
                        contourMergeMinAreaRatio: settingsRef.current.contourMergeMinAreaRatio,
                    },
                });
                setLatestShapeResult(result);

                if (!result.detected || !result.contour) {
                    missingContour = true;
                    break;
                }

                samples.push({
                    area: result.contour.area,
                    eccentricity: result.contour.eccentricity,
                    principalAngle: result.contour.principalAngle,
                    centroid: {
                        x: result.contour.centroid.x,
                        y: result.contour.centroid.y,
                    },
                });
                await sleep(100);
            }

            if (missingContour || samples.length === 0) {
                return {
                    metrics: null,
                    error: {
                        reason: 'no-contour',
                        message: 'No contour detected in ROI. Check lighting/ROI and retry.',
                        tileKey: null,
                        axis: null,
                    },
                };
            }

            let filtered = samples;
            if (settingsRef.current.outlierStrategy === 'mad-filter' && samples.length >= 3) {
                const areaMedian = computeMedian(samples.map((sample) => sample.area));
                const eccMedian = computeMedian(samples.map((sample) => sample.eccentricity));
                const areaMad = computeMad(samples.map((sample) => sample.area));
                const eccMad = computeMad(samples.map((sample) => sample.eccentricity));
                const threshold = Math.max(0.1, settingsRef.current.outlierThreshold);

                filtered = samples.filter((sample) => {
                    const areaOk =
                        areaMad <= Number.EPSILON ||
                        Math.abs(sample.area - areaMedian) <= threshold * areaMad;
                    const eccOk =
                        eccMad <= Number.EPSILON ||
                        Math.abs(sample.eccentricity - eccMedian) <= threshold * eccMad;
                    return areaOk && eccOk;
                });
                if (filtered.length === 0) {
                    filtered = samples;
                }
            }

            const averaged: ShapeMetrics = {
                area: filtered.reduce((sum, sample) => sum + sample.area, 0) / filtered.length,
                eccentricity:
                    filtered.reduce((sum, sample) => sum + sample.eccentricity, 0) /
                    filtered.length,
                principalAngle:
                    filtered.reduce((sum, sample) => sum + sample.principalAngle, 0) /
                    filtered.length,
                centroid: {
                    x:
                        filtered.reduce((sum, sample) => sum + sample.centroid.x, 0) /
                        filtered.length,
                    y:
                        filtered.reduce((sum, sample) => sum + sample.centroid.y, 0) /
                        filtered.length,
                },
            };

            const minArea = Math.min(...filtered.map((sample) => sample.area));
            const maxArea = Math.max(...filtered.map((sample) => sample.area));
            const spread = averaged.area > 0 ? (maxArea - minArea) / averaged.area : 0;
            if (spread <= 0.3) {
                return {
                    metrics: averaged,
                    error: null,
                };
            }

            await sleep(DEFAULT_SETTLING_DELAY_MS + attempt * 100);
        }

        return {
            metrics: null,
            error: {
                reason: 'unstable-measurement',
                message: 'Shape readings remain unstable. Retry, skip tile, or abort.',
                tileKey: null,
                axis: null,
            },
        };
    }, [detectionReady, opencvReady, processedCanvasRef, roi]);

    const evaluateImprovement = useCallback((trial: ShapeMetrics, best: ShapeMetrics): boolean => {
        const areaThreshold = Math.max(0, settingsRef.current.areaThresholdPercent) / 100;
        const areaImproved = trial.area < best.area * (1 - areaThreshold);
        const eccentricityImproved = trial.eccentricity < best.eccentricity * 0.98;
        if (settingsRef.current.improvementStrategy === 'any') {
            return areaImproved || eccentricityImproved;
        }
        const areaWeight = Math.max(0, settingsRef.current.weightedArea);
        const eccentricityWeight = Math.max(0, settingsRef.current.weightedEccentricity);
        const bestScore = areaWeight * best.area + eccentricityWeight * best.eccentricity;
        const trialScore = areaWeight * trial.area + eccentricityWeight * trial.eccentricity;
        const scoreThreshold = Math.max(0, settingsRef.current.weightedScoreThresholdPercent) / 100;
        return trialScore < bestScore * (1 - scoreThreshold);
    }, []);

    const isAreaStable = useCallback((areas: number[]): boolean => {
        if (areas.length < 3) {
            return false;
        }
        const mean = areas.reduce((sum, value) => sum + value, 0) / areas.length;
        const min = Math.min(...areas);
        const max = Math.max(...areas);
        return mean > 0 && (max - min) / mean <= AREA_STABILITY_THRESHOLD;
    }, []);

    const moveToCenter = useCallback(async () => {
        if (!selectedProfile) {
            setControllerError('Select a calibration profile before moving to center.');
            return;
        }
        if (runActiveRef.current) {
            return;
        }

        const built = buildTiles();
        runnableTilesRef.current = built.runnableTiles;
        publishTileStates(built.tileStates, {
            phase: 'positioning',
            activeTile: null,
            activeAxis: null,
            settingsLocked: true,
        });
        setPauseState(null);
        setControllerError(null);
        runActiveRef.current = true;

        try {
            const movePromises: Promise<void>[] = [];
            const nextTileStates = { ...built.tileStates };

            built.runnableTiles.forEach((entry) => {
                const tileState = nextTileStates[entry.key];
                AXES.forEach((axis) => {
                    const axisResult = computeAlignmentAxisTarget({
                        axis,
                        tile: entry.tile,
                        assignment: entry.assignment,
                        normalizedTarget: 0,
                        mirrorId: entry.key,
                        row: entry.row,
                        col: entry.col,
                        patternPointId: 'center',
                    });

                    if ('error' in axisResult) {
                        tileState.axes[axis] = {
                            ...tileState.axes[axis],
                            status: 'error',
                            error: axisResult.error.message,
                        };
                        tileState.error = axisResult.error.message;
                        tileState.status = 'error';
                        return;
                    }

                    const target = axisResult.target;
                    movePromises.push(
                        moveWithRetry(
                            { nodeMac: target.motor.nodeMac, motorId: target.motor.motorIndex },
                            target.targetSteps,
                        )
                            .then(() => {
                                const latestTile = nextTileStates[entry.key];
                                latestTile.currentSteps[axis] = target.targetSteps;
                                latestTile.initialSteps[axis] = target.targetSteps;
                                latestTile.axes[axis] = {
                                    ...latestTile.axes[axis],
                                    status: 'converged',
                                    error: null,
                                };
                                latestTile.status = computeTileAggregateStatus(latestTile);
                            })
                            .catch((error) => {
                                const message =
                                    error instanceof Error ? error.message : String(error);
                                const latestTile = nextTileStates[entry.key];
                                latestTile.axes[axis] = {
                                    ...latestTile.axes[axis],
                                    status: 'error',
                                    error: message,
                                };
                                latestTile.error = message;
                                latestTile.status = 'error';
                            }),
                    );
                });
            });

            await Promise.all(movePromises);
            await sleep(500);

            publishTileStates(nextTileStates, {
                phase: 'idle',
                activeTile: null,
                activeAxis: null,
                settingsLocked: false,
            });
            setState((prev) => ({
                ...prev,
                positioningComplete: true,
            }));
        } finally {
            runActiveRef.current = false;
            stopRequestedRef.current = false;
        }
    }, [buildTiles, moveWithRetry, publishTileStates, selectedProfile, setControllerError]);

    const convergeFrom = useCallback(
        async (startAt: ResumePoint) => {
            const runnableTiles = runnableTilesRef.current;
            if (runnableTiles.length === 0) {
                return;
            }
            const nextTileStates = { ...tileStatesRef.current };
            let haltedByStop = false;

            for (
                let tileIndex = startAt.tileIndex;
                tileIndex < runnableTiles.length;
                tileIndex += 1
            ) {
                const tileEntry = runnableTiles[tileIndex];
                const tileState = nextTileStates[tileEntry.key];
                tileState.status = 'in-progress';
                publishTileStates(nextTileStates, {
                    phase: 'converging',
                    activeTile: tileEntry.key,
                    activeAxis:
                        startAt.axisIndex > 0 && tileIndex === startAt.tileIndex ? 'y' : 'x',
                    settingsLocked: true,
                });

                const axisStart = tileIndex === startAt.tileIndex ? startAt.axisIndex : 0;
                for (let axisIndex = axisStart; axisIndex < AXES.length; axisIndex += 1) {
                    const axis = AXES[axisIndex];
                    if (stopRequestedRef.current) {
                        tileState.axes[axis].status = 'skipped';
                        tileState.status = computeTileAggregateStatus(tileState);
                        haltedByStop = true;
                        break;
                    }

                    tileState.axes[axis] = {
                        ...tileState.axes[axis],
                        status: 'in-progress',
                        error: null,
                    };
                    publishTileStates(nextTileStates, {
                        activeTile: tileEntry.key,
                        activeAxis: axis,
                    });

                    const baselineMeasurement = await measureShapeStable();
                    if (baselineMeasurement.error || !baselineMeasurement.metrics) {
                        setPaused(
                            {
                                ...((baselineMeasurement.error ?? {
                                    reason: 'camera-unavailable',
                                    message: 'Unable to capture baseline shape measurement.',
                                    tileKey: tileEntry.key,
                                    axis,
                                }) as AlignmentPauseState),
                                tileKey: tileEntry.key,
                                axis,
                            },
                            { tileIndex, axisIndex },
                        );
                        return;
                    }
                    let bestMetrics = baselineMeasurement.metrics;
                    setState((prev) => ({
                        ...prev,
                        currentMetrics: bestMetrics,
                    }));

                    const recentAreas: number[] = [bestMetrics.area];
                    let improvedOnce = false;
                    const stepSize = Math.max(1, Math.round(settingsRef.current.stepSize));
                    const maxIterations = Math.max(
                        1,
                        Math.round(settingsRef.current.maxIterationsPerAxis),
                    );
                    let direction: 1 | -1 = 1;

                    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
                        tileState.iterations[axis] = iteration;
                        tileState.axes[axis].iterations = iteration;

                        const currentPosition = tileState.currentSteps[axis];
                        const trialPosition = currentPosition + direction * stepSize;
                        const range = tileEntry.tile.axes?.[axis]?.stepRange;
                        if (
                            range &&
                            (trialPosition < range.minSteps || trialPosition > range.maxSteps)
                        ) {
                            tileState.axes[axis] = {
                                ...tileState.axes[axis],
                                status: 'error',
                                error: 'steps_out_of_range',
                            };
                            tileState.error = 'steps_out_of_range';
                            tileState.status = 'error';
                            break;
                        }

                        const motor = tileState.axes[axis].motor;
                        if (!motor) {
                            tileState.axes[axis] = {
                                ...tileState.axes[axis],
                                status: 'error',
                                error: 'missing_motor',
                            };
                            tileState.error = 'missing_motor';
                            tileState.status = 'error';
                            break;
                        }

                        try {
                            await moveWithRetry(motor, trialPosition);
                        } catch (error) {
                            tileState.axes[axis] = {
                                ...tileState.axes[axis],
                                status: 'error',
                                error: error instanceof Error ? error.message : String(error),
                            };
                            tileState.error = tileState.axes[axis].error;
                            tileState.status = 'error';
                            break;
                        }

                        await sleep(DEFAULT_SETTLING_DELAY_MS);
                        const trialMeasurement = await measureShapeStable();
                        if (trialMeasurement.error || !trialMeasurement.metrics) {
                            setPaused(
                                {
                                    ...((trialMeasurement.error ?? {
                                        reason: 'camera-unavailable',
                                        message: 'Unable to capture shape after motor move.',
                                        tileKey: tileEntry.key,
                                        axis,
                                    }) as AlignmentPauseState),
                                    tileKey: tileEntry.key,
                                    axis,
                                },
                                { tileIndex, axisIndex },
                            );
                            return;
                        }
                        const trialMetrics = trialMeasurement.metrics;
                        setState((prev) => ({
                            ...prev,
                            currentMetrics: trialMetrics,
                        }));

                        if (evaluateImprovement(trialMetrics, bestMetrics)) {
                            improvedOnce = true;
                            bestMetrics = trialMetrics;
                            tileState.currentSteps[axis] = trialPosition;
                            tileState.correction[axis] += direction * stepSize;
                            tileState.axes[axis].correctionSteps = tileState.correction[axis];
                            recentAreas.push(trialMetrics.area);
                            if (recentAreas.length > 3) {
                                recentAreas.shift();
                            }
                            if (
                                trialMetrics.eccentricity < CONVERGED_ECCENTRICITY &&
                                isAreaStable(recentAreas)
                            ) {
                                tileState.axes[axis] = {
                                    ...tileState.axes[axis],
                                    status: 'converged',
                                    error: null,
                                };
                                break;
                            }
                        } else {
                            try {
                                await moveWithRetry(motor, currentPosition);
                                await sleep(DEFAULT_SETTLING_DELAY_MS);
                            } catch (error) {
                                tileState.axes[axis] = {
                                    ...tileState.axes[axis],
                                    status: 'error',
                                    error: error instanceof Error ? error.message : String(error),
                                };
                                tileState.error = tileState.axes[axis].error;
                                tileState.status = 'error';
                                break;
                            }

                            if (iteration === 1) {
                                direction = direction === 1 ? -1 : 1;
                            } else {
                                tileState.axes[axis] = {
                                    ...tileState.axes[axis],
                                    status: improvedOnce ? 'converged' : 'skipped',
                                };
                                break;
                            }
                        }

                        if (iteration === maxIterations) {
                            tileState.axes[axis] = {
                                ...tileState.axes[axis],
                                status: 'max-iterations',
                            };
                        }
                    }
                    tileState.status = computeTileAggregateStatus(tileState);
                    tileState.finalEccentricity = bestMetrics.eccentricity;
                    publishTileStates(nextTileStates, {
                        activeTile: tileEntry.key,
                        activeAxis: axis,
                    });
                }

                tileState.status = computeTileAggregateStatus(tileState);
                publishTileStates(nextTileStates, {
                    activeTile: tileEntry.key,
                    activeAxis: null,
                });
                if (haltedByStop) {
                    break;
                }
            }

            const finalMeasurement = await measureShapeStable();
            const finalMetrics = finalMeasurement.metrics;
            if (finalMetrics) {
                setState((prev) => ({
                    ...prev,
                    currentMetrics: finalMetrics,
                }));
            }

            const baselineMetrics = baselineRef.current;
            const finishedTiles = Object.values(nextTileStates);
            const runSummary: AlignmentRunSummary = {
                id: createRunId(),
                createdAt: new Date().toISOString(),
                profileId: selectedProfile?.id ?? 'unknown-profile',
                profileName: selectedProfile?.name ?? 'Unknown Profile',
                settings: toSettingsSnapshot(settingsRef.current),
                baselineMetrics: (baselineMetrics as AlignmentRunShapeMetrics | null) ?? null,
                finalMetrics: (finalMetrics as AlignmentRunShapeMetrics | null) ?? null,
                tiles: finishedTiles.map(toRunTile),
                totals: computeTotals(finishedTiles, baselineMetrics, finalMetrics ?? null),
            };
            appendAlignmentRun(storage, runSummary);
            setLastRun(runSummary);

            publishTileStates(nextTileStates, {
                phase: 'complete',
                activeTile: null,
                activeAxis: null,
                settingsLocked: false,
            });
            setPauseState(null);
            resumePointRef.current = null;
        },
        [
            evaluateImprovement,
            isAreaStable,
            measureShapeStable,
            moveWithRetry,
            publishTileStates,
            selectedProfile?.id,
            selectedProfile?.name,
            setPaused,
            storage,
        ],
    );

    const startConvergence = useCallback(async () => {
        if (!selectedProfile) {
            setControllerError('Select a calibration profile before starting convergence.');
            return;
        }
        if (runActiveRef.current) {
            return;
        }

        try {
            if (!state.positioningComplete) {
                await moveToCenter();
            }

            runActiveRef.current = true;
            stopRequestedRef.current = false;
            setPauseState(null);
            setControllerError(null);

            const built = buildTiles();
            runnableTilesRef.current = built.runnableTiles;
            publishTileStates(built.tileStates, {
                phase: 'measuring-baseline',
                activeTile: null,
                activeAxis: null,
                settingsLocked: true,
            });

            if (built.runnableTiles.length === 0) {
                setControllerError('No calibrated/assigned tiles are available for convergence.');
                setState((prev) => ({
                    ...prev,
                    phase: 'complete',
                    settingsLocked: false,
                }));
                return;
            }

            const baseline = await measureShapeStable();
            if (!baseline.metrics || baseline.error) {
                setPaused(
                    baseline.error ?? {
                        reason: 'camera-unavailable',
                        message: 'Unable to capture baseline measurement.',
                        tileKey: null,
                        axis: null,
                    },
                    { tileIndex: 0, axisIndex: 0 },
                );
                return;
            }
            baselineRef.current = baseline.metrics;
            setState((prev) => ({
                ...prev,
                baselineMetrics: baseline.metrics,
                currentMetrics: baseline.metrics,
            }));

            await convergeFrom({ tileIndex: 0, axisIndex: 0 });
        } catch (error) {
            setControllerError(error instanceof Error ? error.message : String(error));
            setState((prev) => ({
                ...prev,
                phase: 'complete',
                settingsLocked: false,
            }));
        } finally {
            runActiveRef.current = false;
            stopRequestedRef.current = false;
            setState((prev) => ({
                ...prev,
                settingsLocked: prev.phase === 'converging' || prev.phase === 'measuring-baseline',
            }));
        }
    }, [
        buildTiles,
        convergeFrom,
        measureShapeStable,
        moveToCenter,
        publishTileStates,
        selectedProfile,
        setControllerError,
        setPaused,
        state.positioningComplete,
    ]);

    const retryPaused = useCallback(async () => {
        if (runActiveRef.current) {
            return;
        }
        const resumePoint = resumePointRef.current;
        if (!resumePoint) {
            await startConvergence();
            return;
        }
        runActiveRef.current = true;
        stopRequestedRef.current = false;
        setPauseState(null);
        setControllerError(null);
        try {
            await convergeFrom(resumePoint);
        } catch (error) {
            setControllerError(error instanceof Error ? error.message : String(error));
            setState((prev) => ({
                ...prev,
                phase: 'complete',
                settingsLocked: false,
            }));
        } finally {
            runActiveRef.current = false;
        }
    }, [convergeFrom, setControllerError, startConvergence]);

    const skipPausedTile = useCallback(async () => {
        const resumePoint = resumePointRef.current;
        if (!resumePoint) {
            return;
        }
        const runnableTiles = runnableTilesRef.current;
        const nextTileStates = { ...tileStatesRef.current };
        const tile = runnableTiles[resumePoint.tileIndex];
        if (!tile) {
            return;
        }
        const axis = AXES[resumePoint.axisIndex] ?? 'x';
        const tileState = nextTileStates[tile.key];
        tileState.axes[axis] = {
            ...tileState.axes[axis],
            status: 'skipped',
            error: pauseState?.message ?? 'Skipped by user.',
        };
        tileState.status = computeTileAggregateStatus(tileState);
        publishTileStates(nextTileStates, {
            phase: 'converging',
            activeTile: tile.key,
            activeAxis: axis,
            settingsLocked: true,
        });

        const nextAxisIndex = resumePoint.axisIndex + 1;
        const nextResume: ResumePoint =
            nextAxisIndex < AXES.length
                ? { tileIndex: resumePoint.tileIndex, axisIndex: nextAxisIndex }
                : { tileIndex: resumePoint.tileIndex + 1, axisIndex: 0 };
        resumePointRef.current = nextResume;
        await retryPaused();
    }, [pauseState?.message, publishTileStates, retryPaused]);

    const stop = useCallback(() => {
        stopRequestedRef.current = true;
    }, []);

    const abortRun = useCallback(() => {
        stopRequestedRef.current = true;
        resumePointRef.current = null;
        setPauseState(null);
        setState((prev) => ({
            ...prev,
            phase: 'complete',
            activeTile: null,
            activeAxis: null,
            settingsLocked: false,
            error: 'Alignment run aborted.',
        }));
    }, []);

    const exportLastRunJson = useCallback(() => {
        if (!lastRun) {
            return null;
        }
        return JSON.stringify(lastRun, null, 2);
    }, [lastRun]);

    return {
        state,
        pauseState,
        latestShapeResult,
        lastRun,
        moveToCenter,
        startConvergence,
        stop,
        retryPaused,
        skipPausedTile,
        abortRun,
        exportLastRunJson,
    };
};
