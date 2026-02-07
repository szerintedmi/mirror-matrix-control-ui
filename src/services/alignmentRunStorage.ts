import type { Axis } from '@/types';

const STORAGE_KEY = 'mirror:alignment:runs';
const STORAGE_VERSION = 1;
const MAX_PERSISTED_RUNS = 50;

export type AlignmentAxisStatus =
    | 'pending'
    | 'in-progress'
    | 'converged'
    | 'max-iterations'
    | 'skipped'
    | 'error';

export type AlignmentTileStatus =
    | 'pending'
    | 'in-progress'
    | 'converged'
    | 'partial'
    | 'max-iterations'
    | 'skipped'
    | 'error';

export interface AlignmentRunShapeMetrics {
    area: number;
    eccentricity: number;
    principalAngle: number;
    centroid: { x: number; y: number };
}

export interface AlignmentRunAxisState {
    axis: Axis;
    status: AlignmentAxisStatus;
    correctionSteps: number;
    iterations: number;
    error: string | null;
    motor: { nodeMac: string; motorId: number } | null;
}

export interface AlignmentRunTileState {
    key: string;
    row: number;
    col: number;
    status: AlignmentTileStatus;
    initialSteps: { x: number; y: number };
    currentSteps: { x: number; y: number };
    correction: { x: number; y: number };
    iterations: { x: number; y: number };
    axes: {
        x: AlignmentRunAxisState;
        y: AlignmentRunAxisState;
    };
    finalEccentricity: number | null;
    error: string | null;
}

export interface AlignmentRunSettingsSnapshot {
    stepSize: number;
    maxIterationsPerAxis: number;
    areaThreshold: number;
    improvementStrategy: 'any' | 'weighted';
    weightedArea: number;
    weightedEccentricity: number;
    weightedScoreThreshold: number;
    samplesPerMeasurement: number;
    outlierStrategy: 'mad-filter' | 'none';
    outlierThreshold: number;
    minContourArea: number;
    adaptiveMethod: 'GAUSSIAN' | 'MEAN';
    thresholdType: 'BINARY' | 'BINARY_INV';
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

export interface AlignmentRunSummary {
    id: string;
    createdAt: string;
    profileId: string;
    profileName: string;
    settings: AlignmentRunSettingsSnapshot;
    baselineMetrics: AlignmentRunShapeMetrics | null;
    finalMetrics: AlignmentRunShapeMetrics | null;
    tiles: AlignmentRunTileState[];
    totals: {
        totalTiles: number;
        convergedTiles: number;
        partialTiles: number;
        skippedTiles: number;
        erroredTiles: number;
        maxIterationsTiles: number;
        averageEccentricityImprovement: number | null;
        areaReductionPercent: number | null;
    };
}

interface StoredPayload {
    version: number;
    runs: AlignmentRunSummary[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const parseRun = (input: unknown): AlignmentRunSummary | null => {
    if (!isRecord(input)) {
        return null;
    }
    const id = input.id;
    const createdAt = input.createdAt;
    const profileId = input.profileId;
    const profileName = input.profileName;
    const settings = input.settings;
    const baselineMetrics = input.baselineMetrics;
    const finalMetrics = input.finalMetrics;
    const tiles = input.tiles;
    const totals = input.totals;

    if (!isString(id) || !isString(createdAt) || !isString(profileId) || !isString(profileName)) {
        return null;
    }
    if (!isRecord(settings) || !Array.isArray(tiles) || !isRecord(totals)) {
        return null;
    }

    return {
        id,
        createdAt,
        profileId,
        profileName,
        settings: settings as unknown as AlignmentRunSettingsSnapshot,
        baselineMetrics: (baselineMetrics ?? null) as AlignmentRunShapeMetrics | null,
        finalMetrics: (finalMetrics ?? null) as AlignmentRunShapeMetrics | null,
        tiles: tiles as AlignmentRunTileState[],
        totals: {
            totalTiles: isFiniteNumber(totals.totalTiles) ? totals.totalTiles : 0,
            convergedTiles: isFiniteNumber(totals.convergedTiles) ? totals.convergedTiles : 0,
            partialTiles: isFiniteNumber(totals.partialTiles) ? totals.partialTiles : 0,
            skippedTiles: isFiniteNumber(totals.skippedTiles) ? totals.skippedTiles : 0,
            erroredTiles: isFiniteNumber(totals.erroredTiles) ? totals.erroredTiles : 0,
            maxIterationsTiles: isFiniteNumber(totals.maxIterationsTiles)
                ? totals.maxIterationsTiles
                : 0,
            averageEccentricityImprovement: isFiniteNumber(totals.averageEccentricityImprovement)
                ? totals.averageEccentricityImprovement
                : null,
            areaReductionPercent: isFiniteNumber(totals.areaReductionPercent)
                ? totals.areaReductionPercent
                : null,
        },
    };
};

export const loadAlignmentRuns = (storage: Storage | undefined): AlignmentRunSummary[] => {
    if (!storage) {
        return [];
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return [];
    }
    try {
        const payload = JSON.parse(raw) as Partial<StoredPayload>;
        if (!payload || payload.version !== STORAGE_VERSION || !Array.isArray(payload.runs)) {
            return [];
        }
        return payload.runs
            .map((entry) => parseRun(entry))
            .filter((entry): entry is AlignmentRunSummary => Boolean(entry));
    } catch (error) {
        console.warn('Failed to parse alignment run storage', error);
        return [];
    }
};

const persistAlignmentRuns = (storage: Storage | undefined, runs: AlignmentRunSummary[]): void => {
    if (!storage) {
        return;
    }
    const payload: StoredPayload = {
        version: STORAGE_VERSION,
        runs: runs.slice(0, MAX_PERSISTED_RUNS),
    };
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist alignment run storage', error);
    }
};

export const appendAlignmentRun = (
    storage: Storage | undefined,
    run: AlignmentRunSummary,
): AlignmentRunSummary[] => {
    const existing = loadAlignmentRuns(storage);
    const next = [run, ...existing].slice(0, MAX_PERSISTED_RUNS);
    persistAlignmentRuns(storage, next);
    return next;
};
