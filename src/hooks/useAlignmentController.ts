import { useCallback, useEffect, useRef, useState } from 'react';

import { AlignmentExecutor, AlignmentExecutorAbortError } from '@/services/alignment';
import type {
    AlignmentMode,
    AlignmentGranularity,
    AlignmentStepState,
    ConvergenceStatus,
    AlignmentPendingDecision,
    AlignmentDecisionOption,
    AlignmentTileInfo,
} from '@/services/alignment';
import { computeAxisTarget, isTileCalibrated } from '@/services/alignmentAxisTarget';
import { computePoseTargets } from '@/services/calibration/math/stagingCalculations';
import type { ShapeAnalysisResult, ShapeMetrics } from '@/services/opencvWorkerClient';
import { getOpenCvWorkerClient } from '@/services/openCvWorkerSingleton';
import type {
    Axis,
    CalibrationProfile,
    MirrorAssignment,
    MirrorConfig,
    NormalizedRoi,
} from '@/types';
import { getMirrorAssignment } from '@/utils/grid';

import type { MotorCommandApi } from './useMotorCommands';

// --- Types ---

export type AlignmentPhase =
    | 'idle'
    | 'staging'
    | 'measuring-baseline'
    | 'converging'
    | 'paused'
    | 'complete';

export type TileAlignmentStatus =
    | 'pending'
    | 'in-progress'
    | 'converged'
    | 'partial'
    | 'max-iterations'
    | 'skipped'
    | 'error';

export type AxisAlignmentStatus =
    | 'pending'
    | 'in-progress'
    | 'converged'
    | 'max-iterations'
    | 'skipped'
    | 'error';

export interface AxisAlignmentState {
    axis: Axis;
    motor: { nodeMac: string; motorId: number } | null;
    status: AxisAlignmentStatus;
    correctionSteps: number;
    iterations: number;
    error: string | null;
}

export interface TileAlignmentState {
    key: string;
    row: number;
    col: number;
    status: TileAlignmentStatus;
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

export interface AlignmentSettings {
    stepSize: number;
    minStepSize: number;
    maxIterations: number;
    areaThreshold: number;
    areaConvergenceThreshold: number;
    samplesPerMeasurement: number;
    settlingDelayMs: number;
    adaptiveThreshold: {
        method: 'GAUSSIAN' | 'MEAN';
        thresholdType: 'BINARY' | 'BINARY_INV';
        blockSize: number;
        C: number;
    };
    minContourArea: number;
    isolateTiles: boolean;
}

export interface AlignmentState {
    phase: AlignmentPhase;
    baselineMetrics: ShapeMetrics | null;
    currentMetrics: ShapeMetrics | null;
    tileStates: Record<string, TileAlignmentState>;
    activeTile: string | null;
    activeAxis: Axis | null;
    positioningComplete: boolean;
    settingsLocked: boolean;
    error: string | null;
    lastShapeResult: ShapeAnalysisResult | null;
}

export interface AlignmentRunSummaryOutput {
    startedAt: string;
    completedAt: string;
    baselineMetrics: ShapeMetrics | null;
    finalMetrics: ShapeMetrics | null;
    tileCorrections: Array<{
        key: string;
        row: number;
        col: number;
        status: TileAlignmentStatus;
        correctionX: number;
        correctionY: number;
        axisStatusX: AxisAlignmentStatus;
        axisStatusY: AxisAlignmentStatus;
        finalEccentricity: number | null;
    }>;
    settings: AlignmentSettings;
    tilesConverged: number;
    tilesPartial: number;
    tilesSkipped: number;
    tilesErrored: number;
    areaReductionPercent: number | null;
}

const DEFAULT_SETTINGS: AlignmentSettings = {
    stepSize: 100,
    minStepSize: 10,
    maxIterations: 50,
    areaThreshold: 0.01,
    areaConvergenceThreshold: 0.005,
    samplesPerMeasurement: 3,
    settlingDelayMs: 200,
    adaptiveThreshold: {
        method: 'GAUSSIAN',
        thresholdType: 'BINARY',
        blockSize: 51,
        C: -3,
    },
    minContourArea: 100,
    isolateTiles: true,
};

const INITIAL_STATE: AlignmentState = {
    phase: 'idle',
    baselineMetrics: null,
    currentMetrics: null,
    tileStates: {},
    activeTile: null,
    activeAxis: null,
    positioningComplete: false,
    settingsLocked: false,
    error: null,
    lastShapeResult: null,
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface UseAlignmentControllerParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    profile: CalibrationProfile | null;
    motorApi: MotorCommandApi;
    roi: NormalizedRoi;
    brightness: number;
    contrast: number;
    claheClipLimit: number;
    claheTileGridSize: number;
    videoDimensions: { width: number; height: number };
}

export interface AlignmentControllerApi {
    state: AlignmentState;
    settings: AlignmentSettings;
    setSettings: (patch: Partial<AlignmentSettings>) => void;
    moveToCenter: () => Promise<void>;
    startConvergence: () => Promise<void>;
    stop: () => void;
    runSummary: AlignmentRunSummaryOutput | null;
    // Step-by-step debugging
    mode: AlignmentMode;
    setMode: (mode: AlignmentMode) => void;
    granularity: AlignmentGranularity;
    setGranularity: (granularity: AlignmentGranularity) => void;
    stepState: AlignmentStepState | null;
    convergenceStatus: ConvergenceStatus | null;
    pendingDecision: AlignmentPendingDecision | null;
    isAwaitingAdvance: boolean;
    advance: () => void;
    runToEnd: () => void;
    retryTile: () => void;
    submitDecision: (decision: AlignmentDecisionOption) => void;
}

export const useAlignmentController = ({
    gridSize,
    mirrorConfig,
    profile,
    motorApi,
    roi,
    brightness,
    contrast,
    claheClipLimit,
    claheTileGridSize,
    videoDimensions,
}: UseAlignmentControllerParams): AlignmentControllerApi => {
    const [state, setState] = useState<AlignmentState>(INITIAL_STATE);
    const [settings, setSettingsState] = useState<AlignmentSettings>(DEFAULT_SETTINGS);
    const [runSummary, setRunSummary] = useState<AlignmentRunSummaryOutput | null>(null);

    // Step-by-step debugging state
    const [mode, setMode] = useState<AlignmentMode>('auto');
    const [granularity, setGranularity] = useState<AlignmentGranularity>('per-axis');
    const [stepState, setStepState] = useState<AlignmentStepState | null>(null);
    const [convergenceStatus, setConvergenceStatus] = useState<ConvergenceStatus | null>(null);
    const [pendingDecision, setPendingDecision] = useState<AlignmentPendingDecision | null>(null);

    const stopRequestedRef = useRef(false);
    const runningRef = useRef(false);
    const startedAtRef = useRef<string>('');
    const executorRef = useRef<AlignmentExecutor | null>(null);

    // Refs for values needed during async operations
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const granularityRef = useRef(granularity);
    granularityRef.current = granularity;
    const roiRef = useRef(roi);
    roiRef.current = roi;
    const brightnessRef = useRef(brightness);
    brightnessRef.current = brightness;
    const contrastRef = useRef(contrast);
    contrastRef.current = contrast;
    const claheClipLimitRef = useRef(claheClipLimit);
    claheClipLimitRef.current = claheClipLimit;
    const claheTileGridSizeRef = useRef(claheTileGridSize);
    claheTileGridSizeRef.current = claheTileGridSize;
    const videoDimensionsRef = useRef(videoDimensions);
    videoDimensionsRef.current = videoDimensions;

    const setSettings = useCallback((patch: Partial<AlignmentSettings>) => {
        setSettingsState((prev) => {
            const next = { ...prev, ...patch };
            if (patch.adaptiveThreshold) {
                next.adaptiveThreshold = { ...prev.adaptiveThreshold, ...patch.adaptiveThreshold };
            }
            return next;
        });
    }, []);

    const captureFrame = useCallback(async (): Promise<ImageBitmap | null> => {
        if (typeof window === 'undefined' || typeof window.createImageBitmap !== 'function') {
            return null;
        }
        const video = document.querySelector('video') as HTMLVideoElement | null;
        if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            return null;
        }
        return window.createImageBitmap(video);
    }, []);

    const analyzeShapeOnce = useCallback(async (): Promise<ShapeAnalysisResult | null> => {
        const client = getOpenCvWorkerClient();
        if (client.getStatus() !== 'ready') return null;

        const bitmap = await captureFrame();
        if (!bitmap) return null;

        const dims = videoDimensionsRef.current;
        const w = dims.width || bitmap.width;
        const h = dims.height || bitmap.height;
        const s = settingsRef.current;

        try {
            const result = await client.analyzeShape({
                frame: bitmap,
                width: w,
                height: h,
                roi: roiRef.current,
                brightness: brightnessRef.current,
                contrast: contrastRef.current,
                claheClipLimit: claheClipLimitRef.current,
                claheTileGridSize: claheTileGridSizeRef.current,
                adaptiveThreshold: s.adaptiveThreshold,
                minContourArea: s.minContourArea,
            });
            setState((prev) => ({ ...prev, lastShapeResult: result }));
            return result;
        } catch {
            return null;
        }
    }, [captureFrame]);

    const measureShape = useCallback(async (): Promise<ShapeMetrics | null> => {
        const s = settingsRef.current;
        const samples: ShapeMetrics[] = [];

        for (let i = 0; i < s.samplesPerMeasurement; i++) {
            if (stopRequestedRef.current) return null;
            const result = await analyzeShapeOnce();
            if (result?.detected && result.contour) {
                samples.push({
                    area: result.contour.area,
                    eccentricity: result.contour.eccentricity,
                    principalAngle: result.contour.principalAngle,
                    centroid: result.contour.centroid,
                });
            }
            if (i < s.samplesPerMeasurement - 1) {
                await delay(100);
            }
        }

        if (samples.length === 0) return null;

        // MAD-filter outlier rejection on area
        const areas = samples.map((s) => s.area);
        const medianArea = sortedMedian(areas);
        const deviations = areas.map((a) => Math.abs(a - medianArea));
        const mad = sortedMedian(deviations) * 1.4826;
        const threshold = 3 * (mad > 0 ? mad : medianArea * 0.1);

        const filtered = samples.filter((s) => Math.abs(s.area - medianArea) <= threshold);
        const valid = filtered.length > 0 ? filtered : samples;

        const avgArea = valid.reduce((sum, v) => sum + v.area, 0) / valid.length;
        const avgEcc = valid.reduce((sum, v) => sum + v.eccentricity, 0) / valid.length;
        const avgAngle = valid.reduce((sum, v) => sum + v.principalAngle, 0) / valid.length;
        const avgCx = valid.reduce((sum, v) => sum + v.centroid.x, 0) / valid.length;
        const avgCy = valid.reduce((sum, v) => sum + v.centroid.y, 0) / valid.length;

        return {
            area: avgArea,
            eccentricity: avgEcc,
            principalAngle: avgAngle,
            centroid: { x: avgCx, y: avgCy },
        };
    }, [analyzeShapeOnce]);

    const buildTileList = useCallback((): Array<{
        key: string;
        row: number;
        col: number;
        assignment: MirrorAssignment;
        initialStepsX: number;
        initialStepsY: number;
    }> => {
        if (!profile) return [];
        const tiles: Array<{
            key: string;
            row: number;
            col: number;
            assignment: MirrorAssignment;
            initialStepsX: number;
            initialStepsY: number;
        }> = [];

        for (let row = 0; row < gridSize.rows; row++) {
            for (let col = 0; col < gridSize.cols; col++) {
                const key = `${row}-${col}`;
                const tile = profile.tiles[key];
                if (!isTileCalibrated(tile)) continue;
                const assignment = getMirrorAssignment(mirrorConfig, row, col);
                if (!assignment.x || !assignment.y) continue;

                const xResult = computeAxisTarget({
                    axis: 'x',
                    tile,
                    assignment,
                    normalizedTarget: 0,
                    mirrorId: key,
                    row,
                    col,
                });
                const yResult = computeAxisTarget({
                    axis: 'y',
                    tile,
                    assignment,
                    normalizedTarget: 0,
                    mirrorId: key,
                    row,
                    col,
                });
                if ('error' in xResult || 'error' in yResult) continue;

                tiles.push({
                    key,
                    row,
                    col,
                    assignment,
                    initialStepsX: xResult.target.targetSteps,
                    initialStepsY: yResult.target.targetSteps,
                });
            }
        }
        return tiles;
    }, [profile, gridSize, mirrorConfig]);

    const makeTileAlignmentState = (t: {
        key: string;
        row: number;
        col: number;
        assignment: MirrorAssignment;
        initialStepsX: number;
        initialStepsY: number;
    }): TileAlignmentState => ({
        key: t.key,
        row: t.row,
        col: t.col,
        status: 'pending',
        initialSteps: { x: t.initialStepsX, y: t.initialStepsY },
        currentSteps: { x: t.initialStepsX, y: t.initialStepsY },
        correction: { x: 0, y: 0 },
        iterations: { x: 0, y: 0 },
        axes: {
            x: {
                axis: 'x',
                motor: t.assignment.x
                    ? { nodeMac: t.assignment.x.nodeMac, motorId: t.assignment.x.motorIndex }
                    : null,
                status: 'pending',
                correctionSteps: 0,
                iterations: 0,
                error: null,
            },
            y: {
                axis: 'y',
                motor: t.assignment.y
                    ? { nodeMac: t.assignment.y.nodeMac, motorId: t.assignment.y.motorIndex }
                    : null,
                status: 'pending',
                correctionSteps: 0,
                iterations: 0,
                error: null,
            },
        },
        finalEccentricity: null,
        error: null,
    });

    // Keep moveToCenter as-is (used independently)
    const moveToCenter = useCallback(async () => {
        if (!profile || runningRef.current) return;
        runningRef.current = true;
        stopRequestedRef.current = false;

        setState((prev) => ({
            ...prev,
            phase: 'staging',
            error: null,
            settingsLocked: true,
        }));

        try {
            const tiles = buildTileList();
            if (tiles.length === 0) {
                setState((prev) => ({
                    ...prev,
                    phase: 'idle',
                    error: 'No calibrated tiles available for staging.',
                    settingsLocked: false,
                }));
                runningRef.current = false;
                return;
            }

            const tileStates: Record<string, TileAlignmentState> = {};
            for (const t of tiles) {
                tileStates[t.key] = makeTileAlignmentState(t);
            }
            setState((prev) => ({ ...prev, tileStates }));

            const stagingConfig = {
                gridSize,
                arrayRotation: profile.arrayRotation,
                stagingPosition: 'nearest-corner' as const,
            };
            const stagingPromises: Promise<unknown>[] = [];
            for (const t of tiles) {
                if (stopRequestedRef.current) break;
                const aside = computePoseTargets(
                    { row: t.row, col: t.col },
                    'aside',
                    stagingConfig,
                );
                if (t.assignment.x) {
                    stagingPromises.push(
                        motorApi
                            .moveMotor({
                                mac: t.assignment.x.nodeMac,
                                motorId: t.assignment.x.motorIndex,
                                positionSteps: aside.x,
                            })
                            .catch((e) => console.warn(`Staging failed for ${t.key} X:`, e)),
                    );
                }
                if (t.assignment.y) {
                    stagingPromises.push(
                        motorApi
                            .moveMotor({
                                mac: t.assignment.y.nodeMac,
                                motorId: t.assignment.y.motorIndex,
                                positionSteps: aside.y,
                            })
                            .catch((e) => console.warn(`Staging failed for ${t.key} Y:`, e)),
                    );
                }
            }
            await Promise.all(stagingPromises);
            await delay(500);

            if (stopRequestedRef.current) {
                setState((prev) => ({
                    ...prev,
                    phase: 'idle',
                    settingsLocked: false,
                }));
                runningRef.current = false;
                return;
            }

            const firstTile = tiles[0];
            const refPromises: Promise<unknown>[] = [];
            if (firstTile.assignment.x) {
                refPromises.push(
                    motorApi.moveMotor({
                        mac: firstTile.assignment.x.nodeMac,
                        motorId: firstTile.assignment.x.motorIndex,
                        positionSteps: firstTile.initialStepsX,
                    }),
                );
            }
            if (firstTile.assignment.y) {
                refPromises.push(
                    motorApi.moveMotor({
                        mac: firstTile.assignment.y.nodeMac,
                        motorId: firstTile.assignment.y.motorIndex,
                        positionSteps: firstTile.initialStepsY,
                    }),
                );
            }
            await Promise.all(refPromises);
            await delay(500);

            setState((prev) => ({
                ...prev,
                phase: 'idle',
                positioningComplete: true,
                settingsLocked: false,
            }));
        } catch (error) {
            setState((prev) => ({
                ...prev,
                phase: 'idle',
                error: error instanceof Error ? error.message : 'Staging failed.',
                settingsLocked: false,
            }));
        } finally {
            runningRef.current = false;
        }
    }, [profile, buildTileList, motorApi, gridSize]);

    // --- Executor-based convergence ---

    const startConvergence = useCallback(async () => {
        if (!profile || runningRef.current) return;
        runningRef.current = true;
        stopRequestedRef.current = false;
        startedAtRef.current = new Date().toISOString();
        setRunSummary(null);
        setStepState(null);
        setConvergenceStatus(null);
        setPendingDecision(null);

        const tiles = buildTileList();
        if (tiles.length === 0) {
            setState((prev) => ({
                ...prev,
                phase: 'idle',
                error: 'No calibrated tiles available.',
                settingsLocked: false,
            }));
            runningRef.current = false;
            return;
        }

        // Initialize tile states
        const tileStates: Record<string, TileAlignmentState> = {};
        for (const t of tiles) {
            tileStates[t.key] = makeTileAlignmentState(t);
        }
        const needsPositioning = !state.positioningComplete;
        // Set a running phase immediately so the UI shows step controls.
        // Without this, when needsPositioning is false the script's first command
        // is a CHECKPOINT which pauses before any updatePhase, leaving the phase
        // stuck at 'idle' while runningRef is true — blocking all buttons.
        const initialPhase: AlignmentPhase = needsPositioning ? 'staging' : 'converging';
        setState((prev) => ({
            ...prev,
            tileStates,
            settingsLocked: true,
            error: null,
            phase: initialPhase,
        }));
        const currentSettings = settingsRef.current;

        // Build tile info with calibration data for the script
        const tileInfos: AlignmentTileInfo[] = tiles.map((t) => ({
            key: t.key,
            row: t.row,
            col: t.col,
            assignment: t.assignment,
            initialStepsX: t.initialStepsX,
            initialStepsY: t.initialStepsY,
            tileCalibration: profile.tiles[t.key],
        }));

        // Build adapters
        const stagingConfig = {
            gridSize,
            arrayRotation: profile.arrayRotation,
            stagingPosition: 'nearest-corner' as const,
        };

        const adapters = {
            motor: {
                moveMotor: async (mac: string, motorId: number, positionSteps: number) => {
                    await motorApi.moveMotor({ mac, motorId, positionSteps });
                },
                moveTilePose: async (
                    _tileKey: string,
                    row: number,
                    col: number,
                    pose: 'home' | 'aside',
                ) => {
                    const assignment = getMirrorAssignment(mirrorConfig, row, col);
                    const targets = computePoseTargets({ row, col }, pose, stagingConfig);
                    const moves: Promise<unknown>[] = [];
                    if (assignment.x) {
                        moves.push(
                            motorApi
                                .moveMotor({
                                    mac: assignment.x.nodeMac,
                                    motorId: assignment.x.motorIndex,
                                    positionSteps: targets.x,
                                })
                                .catch((e) =>
                                    console.warn(`Tile pose move failed for ${row}-${col}:`, e),
                                ),
                        );
                    }
                    if (assignment.y) {
                        moves.push(
                            motorApi
                                .moveMotor({
                                    mac: assignment.y.nodeMac,
                                    motorId: assignment.y.motorIndex,
                                    positionSteps: targets.y,
                                })
                                .catch((e) =>
                                    console.warn(`Tile pose move failed for ${row}-${col}:`, e),
                                ),
                        );
                    }
                    await Promise.all(moves);
                },
            },
            shape: {
                measureShape: () => measureShape(),
            },
            clock: {
                delay: (ms: number) => delay(ms),
            },
        };

        // Build executor
        const executor = new AlignmentExecutor(
            adapters,
            {
                onPhaseChange: (phase) => {
                    if (phase === 'complete') {
                        // Build run summary when complete
                        const completedAt = new Date().toISOString();
                        setState((prev) => {
                            const tileCorrections = Object.values(prev.tileStates).map((ts) => ({
                                key: ts.key,
                                row: ts.row,
                                col: ts.col,
                                status: ts.status,
                                correctionX: ts.correction.x,
                                correctionY: ts.correction.y,
                                axisStatusX: ts.axes.x.status,
                                axisStatusY: ts.axes.y.status,
                                finalEccentricity: ts.finalEccentricity,
                            }));

                            const tilesConverged = tileCorrections.filter(
                                (t) => t.status === 'converged',
                            ).length;
                            const tilesPartial = tileCorrections.filter(
                                (t) => t.status === 'partial' || t.status === 'max-iterations',
                            ).length;
                            const tilesSkipped = tileCorrections.filter(
                                (t) => t.status === 'skipped',
                            ).length;
                            const tilesErrored = tileCorrections.filter(
                                (t) => t.status === 'error',
                            ).length;

                            // Compute area reduction from final metrics (last currentMetrics)
                            const areaReductionPercent =
                                prev.baselineMetrics && prev.currentMetrics
                                    ? ((prev.baselineMetrics.area - prev.currentMetrics.area) /
                                          prev.baselineMetrics.area) *
                                      100
                                    : null;

                            const summary: AlignmentRunSummaryOutput = {
                                startedAt: startedAtRef.current,
                                completedAt,
                                baselineMetrics: prev.baselineMetrics,
                                finalMetrics: prev.currentMetrics,
                                tileCorrections,
                                settings: settingsRef.current,
                                tilesConverged,
                                tilesPartial,
                                tilesSkipped,
                                tilesErrored,
                                areaReductionPercent,
                            };

                            setRunSummary(summary);

                            return {
                                ...prev,
                                phase: 'complete',
                                activeTile: null,
                                activeAxis: null,
                                settingsLocked: false,
                            };
                        });
                        runningRef.current = false;
                    } else if (phase === 'idle') {
                        setState((prev) => ({
                            ...prev,
                            phase: 'idle',
                            settingsLocked: false,
                        }));
                        runningRef.current = false;
                    } else {
                        setState((prev) => ({ ...prev, phase }));
                    }
                },
                onTileUpdate: (tileKey, patch) => {
                    setState((prev) => {
                        const ts = prev.tileStates[tileKey];
                        if (!ts) return prev;

                        const updated = { ...ts };
                        if (patch.status !== undefined) updated.status = patch.status;
                        if (patch.error !== undefined) updated.error = patch.error;
                        if (patch.finalEccentricity !== undefined)
                            updated.finalEccentricity = patch.finalEccentricity;

                        if (patch.currentSteps) {
                            updated.currentSteps = {
                                ...updated.currentSteps,
                                ...patch.currentSteps,
                            };
                        }
                        if (patch.correction) {
                            updated.correction = {
                                ...updated.correction,
                                ...patch.correction,
                            };
                        }
                        if (patch.iterations) {
                            updated.iterations = {
                                ...updated.iterations,
                                ...patch.iterations,
                            };
                        }
                        if (patch.axisStatus) {
                            const { axis, status, error } = patch.axisStatus;
                            updated.axes = {
                                ...updated.axes,
                                [axis]: {
                                    ...updated.axes[axis],
                                    status,
                                    ...(error !== undefined ? { error } : {}),
                                },
                            };
                        }
                        if (patch.axisCorrection) {
                            const { axis, correctionSteps, iterations } = patch.axisCorrection;
                            updated.axes = {
                                ...updated.axes,
                                [axis]: {
                                    ...updated.axes[axis],
                                    correctionSteps,
                                    iterations,
                                },
                            };
                        }

                        // Derive activeTile
                        let activeTile = prev.activeTile;
                        if (patch.status === 'in-progress') {
                            activeTile = tileKey;
                        }

                        return {
                            ...prev,
                            activeTile,
                            tileStates: {
                                ...prev.tileStates,
                                [tileKey]: updated,
                            },
                        };
                    });
                },
                onStepStateChange: (s) => {
                    setStepState(s);
                },
                onConvergenceStatusChange: (s) => {
                    setConvergenceStatus(s);
                },
                onPendingDecisionChange: (d) => {
                    setPendingDecision(d);
                },
                onBaselineMetrics: (metrics) => {
                    setState((prev) => ({
                        ...prev,
                        baselineMetrics: metrics,
                        currentMetrics: metrics,
                    }));
                },
                onCurrentMetrics: (metrics) => {
                    setState((prev) => ({ ...prev, currentMetrics: metrics }));
                },
                onPositioningComplete: () => {
                    setState((prev) => ({ ...prev, positioningComplete: true }));
                },
            },
            modeRef.current,
            granularityRef.current,
        );

        executorRef.current = executor;

        try {
            await executor.run({
                tiles: tileInfos,
                settings: currentSettings,
                granularity: granularityRef.current,
                needsPositioning,
            });
        } catch (error) {
            if (!(error instanceof AlignmentExecutorAbortError)) {
                setState((prev) => ({
                    ...prev,
                    phase: 'idle',
                    error: error instanceof Error ? error.message : 'Convergence failed.',
                    settingsLocked: false,
                }));
            }
            runningRef.current = false;
        } finally {
            executorRef.current = null;
            setStepState(null);
        }
    }, [
        profile,
        state.positioningComplete,
        buildTileList,
        motorApi,
        measureShape,
        gridSize,
        mirrorConfig,
    ]);

    const stop = useCallback(() => {
        stopRequestedRef.current = true;
        if (executorRef.current) {
            executorRef.current.abort();
        }
    }, []);

    const advance = useCallback(() => {
        executorRef.current?.advance();
    }, []);

    const runToEnd = useCallback(() => {
        executorRef.current?.runToEnd();
    }, []);

    const retryTile = useCallback(() => {
        executorRef.current?.retryTile();
    }, []);

    const submitDecision = useCallback((decision: AlignmentDecisionOption) => {
        executorRef.current?.submitDecision(decision);
    }, []);

    // Continuous shape preview: poll analyzeShapeOnce when not actively running
    useEffect(() => {
        if (runningRef.current) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;

        const poll = async () => {
            if (cancelled || runningRef.current) return;
            await analyzeShapeOnce();
            if (!cancelled && !runningRef.current) {
                timer = setTimeout(poll, 500);
            }
        };
        timer = setTimeout(poll, 500);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [analyzeShapeOnce, state.phase]);

    const isAwaitingAdvance = stepState?.status === 'waiting';

    return {
        state,
        settings,
        setSettings,
        moveToCenter,
        startConvergence,
        stop,
        runSummary,
        // Step-by-step debugging
        mode,
        setMode,
        granularity,
        setGranularity,
        stepState,
        convergenceStatus,
        pendingDecision,
        isAwaitingAdvance: isAwaitingAdvance ?? false,
        advance,
        runToEnd,
        retryTile,
        submitDecision,
    };
};

// --- Helpers ---

function sortedMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length === 0) return 0;
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
