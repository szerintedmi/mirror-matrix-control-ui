import { useCallback, useEffect, useRef, useState } from 'react';

import {
    computeAxisTarget,
    isTileCalibrated,
    resolveAxisRange,
} from '@/services/alignmentAxisTarget';
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

export type ImprovementStrategy = 'any' | 'weighted';

export interface AlignmentSettings {
    stepSize: number;
    stepReductionPercent: number;
    minStepSize: number;
    maxIterations: number;
    areaThreshold: number;
    improvementStrategy: ImprovementStrategy;
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
    stepReductionPercent: 30,
    minStepSize: 10,
    maxIterations: 50,
    areaThreshold: 0.01,
    improvementStrategy: 'any',
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

const AXES: Axis[] = ['x', 'y'];

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

    const stopRequestedRef = useRef(false);
    const runningRef = useRef(false);
    const startedAtRef = useRef<string>('');

    // Refs for values needed during async operations
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
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
        // Find the video element from the camera pipeline
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

                // Compute target steps for (0,0)
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

            // Initialize tile states
            const tileStates: Record<string, TileAlignmentState> = {};
            for (const t of tiles) {
                tileStates[t.key] = makeTileAlignmentState(t);
            }
            setState((prev) => ({ ...prev, tileStates }));

            // Stage all tiles to aside positions
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

            // Move first tile to calibrated home (reference point)
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

    const startConvergence = useCallback(async () => {
        if (!profile || runningRef.current) return;
        runningRef.current = true;
        stopRequestedRef.current = false;
        startedAtRef.current = new Date().toISOString();
        setRunSummary(null);

        // Build tile list upfront — used by both staging and convergence
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
        setState((prev) => ({ ...prev, tileStates, settingsLocked: true }));

        // Auto-run staging if not done yet
        const needsPositioning = !state.positioningComplete;
        if (needsPositioning) {
            setState((prev) => ({
                ...prev,
                phase: 'staging',
                error: null,
            }));

            // Move all tiles to staging (aside) positions
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
                    positioningComplete: true,
                    settingsLocked: false,
                }));
                runningRef.current = false;
                return;
            }

            // Move first tile to calibrated home (reference point)
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

            setState((prev) => ({ ...prev, positioningComplete: true }));
        }

        // Phase 2: Baseline measurement (reference tile at home)
        setState((prev) => ({ ...prev, phase: 'measuring-baseline' }));
        const baselineMetrics = await measureShape();
        if (stopRequestedRef.current || !baselineMetrics) {
            setState((prev) => ({
                ...prev,
                phase: 'idle',
                baselineMetrics,
                error: baselineMetrics
                    ? null
                    : 'Failed to measure baseline shape. Check camera and ROI.',
                settingsLocked: false,
            }));
            runningRef.current = false;
            return;
        }

        setState((prev) => ({
            ...prev,
            phase: 'converging',
            baselineMetrics,
            currentMetrics: baselineMetrics,
        }));

        // Mark first tile as converged (it's the reference point)
        setState((prev) => ({
            ...prev,
            tileStates: {
                ...prev.tileStates,
                [tiles[0].key]: {
                    ...prev.tileStates[tiles[0].key],
                    status: 'converged',
                    axes: {
                        x: {
                            ...prev.tileStates[tiles[0].key].axes.x,
                            status: 'converged',
                        },
                        y: {
                            ...prev.tileStates[tiles[0].key].axes.y,
                            status: 'converged',
                        },
                    },
                },
            },
        }));

        // Phase 3: Per-tile convergence — bring each remaining tile from staging to home, then converge
        const s = settingsRef.current;
        const corrections: Record<string, { x: number; y: number }> = {};

        for (let tileIdx = 1; tileIdx < tiles.length; tileIdx++) {
            const t = tiles[tileIdx];
            if (stopRequestedRef.current) break;

            setState((prev) => ({
                ...prev,
                activeTile: t.key,
                tileStates: {
                    ...prev.tileStates,
                    [t.key]: {
                        ...prev.tileStates[t.key],
                        status: 'in-progress',
                    },
                },
            }));

            // Move this tile from staging to its calibrated home position
            const moveToHomePromises: Promise<unknown>[] = [];
            if (t.assignment.x) {
                moveToHomePromises.push(
                    motorApi.moveMotor({
                        mac: t.assignment.x.nodeMac,
                        motorId: t.assignment.x.motorIndex,
                        positionSteps: t.initialStepsX,
                    }),
                );
            }
            if (t.assignment.y) {
                moveToHomePromises.push(
                    motorApi.moveMotor({
                        mac: t.assignment.y.nodeMac,
                        motorId: t.assignment.y.motorIndex,
                        positionSteps: t.initialStepsY,
                    }),
                );
            }
            try {
                await Promise.all(moveToHomePromises);
            } catch (e) {
                console.warn(`Move to home failed for ${t.key}:`, e);
                setState((prev) => ({
                    ...prev,
                    tileStates: {
                        ...prev.tileStates,
                        [t.key]: {
                            ...prev.tileStates[t.key],
                            status: 'error',
                            error: 'Failed to move tile to home position',
                        },
                    },
                }));
                continue;
            }
            await delay(s.settlingDelayMs);

            // Converge this tile's X and Y axes
            let tileHasConvergedAxis = false;
            let tileHasError = false;
            const tileCorrection = { x: 0, y: 0 };

            for (const axis of AXES) {
                if (stopRequestedRef.current) break;

                const motor = axis === 'x' ? t.assignment.x : t.assignment.y;
                if (!motor) continue;

                setState((prev) => ({
                    ...prev,
                    activeAxis: axis,
                    tileStates: {
                        ...prev.tileStates,
                        [t.key]: {
                            ...prev.tileStates[t.key],
                            axes: {
                                ...prev.tileStates[t.key].axes,
                                [axis]: {
                                    ...prev.tileStates[t.key].axes[axis],
                                    status: 'in-progress',
                                },
                            },
                        },
                    },
                }));

                // Get tile calibration data for axis range check
                const tileCalibration = profile.tiles[t.key];

                let direction = 1;
                let iteration = 0;
                let consecutiveFailures = 0;
                let currentStep = s.stepSize;
                let bestMetrics = await measureShape();
                if (!bestMetrics || stopRequestedRef.current) {
                    tileHasError = true;
                    setState((prev) => ({
                        ...prev,
                        tileStates: {
                            ...prev.tileStates,
                            [t.key]: {
                                ...prev.tileStates[t.key],
                                axes: {
                                    ...prev.tileStates[t.key].axes,
                                    [axis]: {
                                        ...prev.tileStates[t.key].axes[axis],
                                        status: 'error',
                                        error: 'No shape detected',
                                    },
                                },
                            },
                        },
                    }));
                    continue;
                }

                let totalCorrection = 0;
                let axisStatus: AxisAlignmentStatus = 'max-iterations';
                let axisError: string | null = null;

                while (iteration < s.maxIterations) {
                    if (stopRequestedRef.current) break;
                    iteration++;

                    // Get current position from state
                    const currentStepsForAxis =
                        (axis === 'x' ? t.initialStepsX : t.initialStepsY) + totalCorrection;
                    const trialPosition = currentStepsForAxis + direction * currentStep;

                    // Check bounds
                    if (tileCalibration) {
                        const axisRange = resolveAxisRange(tileCalibration, axis);
                        if (trialPosition < axisRange.min || trialPosition > axisRange.max) {
                            axisStatus = 'error';
                            axisError = 'steps_out_of_range';
                            break;
                        }
                    }

                    // Trial move
                    try {
                        await motorApi.moveMotor({
                            mac: motor.nodeMac,
                            motorId: motor.motorIndex,
                            positionSteps: trialPosition,
                        });
                    } catch {
                        axisStatus = 'error';
                        axisError = 'Motor command failed';
                        break;
                    }
                    await delay(s.settlingDelayMs);

                    const trialMetrics = await measureShape();
                    if (!trialMetrics) {
                        // No contour detected — undo and stop
                        try {
                            await motorApi.moveMotor({
                                mac: motor.nodeMac,
                                motorId: motor.motorIndex,
                                positionSteps: currentStepsForAxis,
                            });
                        } catch {
                            /* ignore */
                        }
                        await delay(s.settlingDelayMs);
                        axisStatus = 'error';
                        axisError = 'No shape detected during convergence';
                        break;
                    }

                    if (improved(trialMetrics, bestMetrics, s)) {
                        // Accept the move
                        bestMetrics = trialMetrics;
                        totalCorrection += direction * currentStep;
                        consecutiveFailures = 0;

                        setState((prev) => ({
                            ...prev,
                            currentMetrics: trialMetrics,
                            tileStates: {
                                ...prev.tileStates,
                                [t.key]: {
                                    ...prev.tileStates[t.key],
                                    currentSteps: {
                                        ...prev.tileStates[t.key].currentSteps,
                                        [axis]:
                                            (axis === 'x' ? t.initialStepsX : t.initialStepsY) +
                                            totalCorrection,
                                    },
                                    correction: {
                                        ...prev.tileStates[t.key].correction,
                                        [axis]: totalCorrection,
                                    },
                                    iterations: {
                                        ...prev.tileStates[t.key].iterations,
                                        [axis]: iteration,
                                    },
                                    axes: {
                                        ...prev.tileStates[t.key].axes,
                                        [axis]: {
                                            ...prev.tileStates[t.key].axes[axis],
                                            correctionSteps: totalCorrection,
                                            iterations: iteration,
                                        },
                                    },
                                },
                            },
                        }));

                        // Check convergence
                        if (trialMetrics.eccentricity < 1.05) {
                            axisStatus = 'converged';
                            tileHasConvergedAxis = true;
                            break;
                        }
                    } else {
                        // Undo the move
                        try {
                            await motorApi.moveMotor({
                                mac: motor.nodeMac,
                                motorId: motor.motorIndex,
                                positionSteps: currentStepsForAxis,
                            });
                        } catch {
                            /* ignore */
                        }
                        await delay(s.settlingDelayMs);

                        // Flip direction and track consecutive failures
                        direction = -direction;
                        consecutiveFailures++;

                        if (consecutiveFailures >= 2) {
                            const decayed = Math.floor(
                                currentStep * (1 - s.stepReductionPercent / 100),
                            );
                            const newStep = Math.max(s.minStepSize, decayed);
                            if (newStep >= currentStep) {
                                break; // no effective reduction — exhausted
                            }
                            currentStep = newStep;
                            consecutiveFailures = 0;
                        }
                    }
                }

                // Final axis status update
                setState((prev) => ({
                    ...prev,
                    tileStates: {
                        ...prev.tileStates,
                        [t.key]: {
                            ...prev.tileStates[t.key],
                            axes: {
                                ...prev.tileStates[t.key].axes,
                                [axis]: {
                                    ...prev.tileStates[t.key].axes[axis],
                                    status: stopRequestedRef.current ? 'pending' : axisStatus,
                                    correctionSteps: totalCorrection,
                                    iterations: iteration,
                                    error: axisError,
                                },
                            },
                            correction: {
                                ...prev.tileStates[t.key].correction,
                                [axis]: totalCorrection,
                            },
                            iterations: {
                                ...prev.tileStates[t.key].iterations,
                                [axis]: iteration,
                            },
                        },
                    },
                }));

                tileCorrection[axis] = totalCorrection;
            }

            corrections[t.key] = tileCorrection;

            if (stopRequestedRef.current) break;

            // Compute final eccentricity for this tile
            const finalMeasure = await measureShape();
            const finalEcc = finalMeasure?.eccentricity ?? null;

            // Determine tile aggregate status
            let tileStatus: TileAlignmentStatus;
            if (tileHasError) {
                tileStatus = 'error';
            } else if (tileHasConvergedAxis) {
                tileStatus = 'converged';
            } else {
                tileStatus = 'partial';
            }

            setState((prev) => ({
                ...prev,
                tileStates: {
                    ...prev.tileStates,
                    [t.key]: {
                        ...prev.tileStates[t.key],
                        status: tileStatus,
                        finalEccentricity: finalEcc,
                    },
                },
            }));

            // When isolating tiles, move this tile back to staging so the next converges 1-on-1
            if (s.isolateTiles) {
                const stagingConfig = {
                    gridSize,
                    arrayRotation: profile.arrayRotation,
                    stagingPosition: 'nearest-corner' as const,
                };
                const aside = computePoseTargets(
                    { row: t.row, col: t.col },
                    'aside',
                    stagingConfig,
                );
                const returnPromises: Promise<unknown>[] = [];
                if (t.assignment.x) {
                    returnPromises.push(
                        motorApi
                            .moveMotor({
                                mac: t.assignment.x.nodeMac,
                                motorId: t.assignment.x.motorIndex,
                                positionSteps: aside.x,
                            })
                            .catch((e) =>
                                console.warn(`Return to staging failed for ${t.key} X:`, e),
                            ),
                    );
                }
                if (t.assignment.y) {
                    returnPromises.push(
                        motorApi
                            .moveMotor({
                                mac: t.assignment.y.nodeMac,
                                motorId: t.assignment.y.motorIndex,
                                positionSteps: aside.y,
                            })
                            .catch((e) =>
                                console.warn(`Return to staging failed for ${t.key} Y:`, e),
                            ),
                    );
                }
                await Promise.all(returnPromises);
                await delay(s.settlingDelayMs);
            }
        }

        // Phase 4: Deploy all tiles to their final corrected positions (only needed when isolated)
        if (s.isolateTiles && !stopRequestedRef.current) {
            const deployPromises: Promise<unknown>[] = [];
            for (const t of tiles) {
                const corr = corrections[t.key] ?? { x: 0, y: 0 };
                const corrX = corr.x;
                const corrY = corr.y;

                if (t.assignment.x) {
                    deployPromises.push(
                        motorApi
                            .moveMotor({
                                mac: t.assignment.x.nodeMac,
                                motorId: t.assignment.x.motorIndex,
                                positionSteps: t.initialStepsX + corrX,
                            })
                            .catch((e) => console.warn(`Deploy failed for ${t.key} X:`, e)),
                    );
                }
                if (t.assignment.y) {
                    deployPromises.push(
                        motorApi
                            .moveMotor({
                                mac: t.assignment.y.nodeMac,
                                motorId: t.assignment.y.motorIndex,
                                positionSteps: t.initialStepsY + corrY,
                            })
                            .catch((e) => console.warn(`Deploy failed for ${t.key} Y:`, e)),
                    );
                }
            }
            await Promise.all(deployPromises);
            await delay(500);
        }

        // Phase 5: Final measurement
        const finalMetrics = await measureShape();

        const completedAt = new Date().toISOString();

        // Build run summary
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

            const tilesConverged = tileCorrections.filter((t) => t.status === 'converged').length;
            const tilesPartial = tileCorrections.filter(
                (t) => t.status === 'partial' || t.status === 'max-iterations',
            ).length;
            const tilesSkipped = tileCorrections.filter((t) => t.status === 'skipped').length;
            const tilesErrored = tileCorrections.filter((t) => t.status === 'error').length;

            const areaReductionPercent =
                prev.baselineMetrics && finalMetrics
                    ? ((prev.baselineMetrics.area - finalMetrics.area) /
                          prev.baselineMetrics.area) *
                      100
                    : null;

            const summary: AlignmentRunSummaryOutput = {
                startedAt: startedAtRef.current,
                completedAt,
                baselineMetrics: prev.baselineMetrics,
                finalMetrics,
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
                currentMetrics: finalMetrics,
                activeTile: null,
                activeAxis: null,
                settingsLocked: false,
            };
        });

        runningRef.current = false;
    }, [profile, state.positioningComplete, buildTileList, motorApi, measureShape, gridSize]);

    const stop = useCallback(() => {
        stopRequestedRef.current = true;
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

    return {
        state,
        settings,
        setSettings,
        moveToCenter,
        startConvergence,
        stop,
        runSummary,
    };
};

// --- Helpers ---

function sortedMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length === 0) return 0;
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function improved(trial: ShapeMetrics, best: ShapeMetrics, settings: AlignmentSettings): boolean {
    if (settings.improvementStrategy === 'weighted') {
        const trialScore = 0.6 * trial.area + 0.4 * trial.eccentricity;
        const bestScore = 0.6 * best.area + 0.4 * best.eccentricity;
        return trialScore < bestScore * (1 - settings.areaThreshold);
    }

    // 'any' strategy: area OR eccentricity improvement
    const areaImproved = trial.area < best.area * (1 - settings.areaThreshold);
    const eccImproved = trial.eccentricity < best.eccentricity * 0.98;
    return areaImproved || eccImproved;
}
