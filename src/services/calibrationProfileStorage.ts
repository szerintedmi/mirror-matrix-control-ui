import type {
    CalibrationRunSummary,
    CalibrationRunnerState,
    TileCalibrationResult,
    TileRunState,
} from '@/services/calibrationRunner';
import { getGridStateFingerprint, type GridStateSnapshot } from '@/services/gridStorage';
import type {
    BlobMeasurement,
    BlobMeasurementStats,
    CalibrationGridBlueprint,
    CalibrationProfile,
    CalibrationProfileMetrics,
    CalibrationProfileTile,
    CalibrationTileStatus,
} from '@/types';

const STORAGE_KEY = 'mirror:calibration:profiles';
const LAST_SELECTED_PROFILE_KEY = 'mirror:calibration:last-profile-id';
const STORAGE_VERSION = 1;

interface StoredPayload {
    version: number;
    entries: CalibrationProfile[];
}

const TILE_STATUSES: CalibrationTileStatus[] = [
    'pending',
    'staged',
    'measuring',
    'completed',
    'failed',
    'skipped',
];

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const isCalibrationTileStatus = (value: unknown): value is CalibrationTileStatus =>
    typeof value === 'string' && TILE_STATUSES.includes(value as CalibrationTileStatus);

const sanitizeMeasurementStats = (
    stats?: BlobMeasurementStats | null,
): BlobMeasurementStats | undefined => {
    if (!stats) {
        return undefined;
    }
    const { sampleCount, thresholds, median, medianAbsoluteDeviation, passed } = stats;
    if (
        !isFiniteNumber(sampleCount) ||
        !thresholds ||
        !isFiniteNumber(thresholds.minSamples) ||
        !isFiniteNumber(thresholds.maxMedianDeviationPt) ||
        !median ||
        !isFiniteNumber(median.x) ||
        !isFiniteNumber(median.y) ||
        !isFiniteNumber(median.size) ||
        !medianAbsoluteDeviation ||
        !isFiniteNumber(medianAbsoluteDeviation.x) ||
        !isFiniteNumber(medianAbsoluteDeviation.y) ||
        !isFiniteNumber(medianAbsoluteDeviation.size) ||
        typeof passed !== 'boolean'
    ) {
        return undefined;
    }
    return {
        sampleCount,
        thresholds: {
            minSamples: thresholds.minSamples,
            maxMedianDeviationPt: thresholds.maxMedianDeviationPt,
        },
        median: {
            x: median.x,
            y: median.y,
            size: median.size,
        },
        medianAbsoluteDeviation: {
            x: medianAbsoluteDeviation.x,
            y: medianAbsoluteDeviation.y,
            size: medianAbsoluteDeviation.size,
        },
        passed,
    };
};

const sanitizeMeasurement = (measurement?: BlobMeasurement | null): BlobMeasurement | null => {
    if (!measurement) {
        return null;
    }
    const { x, y, size, response, capturedAt } = measurement;
    if (
        !isFiniteNumber(x) ||
        !isFiniteNumber(y) ||
        !isFiniteNumber(size) ||
        !isFiniteNumber(response) ||
        !isFiniteNumber(capturedAt)
    ) {
        return null;
    }
    return {
        x,
        y,
        size,
        response,
        capturedAt,
        stats: sanitizeMeasurementStats(measurement.stats),
    };
};

const sanitizeOffset = (
    offset?: { dx: number; dy: number } | null,
): { dx: number; dy: number } | null => {
    if (!offset) {
        return null;
    }
    if (!isFiniteNumber(offset.dx) || !isFiniteNumber(offset.dy)) {
        return null;
    }
    return {
        dx: offset.dx,
        dy: offset.dy,
    };
};

const sanitizePoint = (
    point?: { x: number; y: number } | null,
): { x: number; y: number } | null => {
    if (!point) {
        return null;
    }
    if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
        return null;
    }
    return {
        x: point.x,
        y: point.y,
    };
};

const sanitizeStepValue = (value?: number | null): number | null => {
    if (!isFiniteNumber(value)) {
        return null;
    }
    return value;
};

const sanitizeGridBlueprint = (
    blueprint?: CalibrationGridBlueprint | null,
): CalibrationGridBlueprint | null => {
    if (!blueprint) {
        return null;
    }
    const { adjustedTileFootprint, tileGap, gridOrigin } = blueprint;
    if (
        !adjustedTileFootprint ||
        !isFiniteNumber(adjustedTileFootprint.width) ||
        !isFiniteNumber(adjustedTileFootprint.height) ||
        !tileGap ||
        !isFiniteNumber(tileGap.x) ||
        !isFiniteNumber(tileGap.y) ||
        !gridOrigin ||
        !isFiniteNumber(gridOrigin.x) ||
        !isFiniteNumber(gridOrigin.y)
    ) {
        return null;
    }
    return {
        adjustedTileFootprint: {
            width: adjustedTileFootprint.width,
            height: adjustedTileFootprint.height,
        },
        tileGap: {
            x: tileGap.x,
            y: tileGap.y,
        },
        gridOrigin: {
            x: gridOrigin.x,
            y: gridOrigin.y,
        },
    };
};

const buildTileEntry = (
    tile: TileRunState,
    summaryTile?: TileCalibrationResult,
): CalibrationProfileTile => {
    const measurement = summaryTile?.homeMeasurement ?? tile.metrics?.home ?? null;
    const sanitizedMeasurement = sanitizeMeasurement(measurement);
    return {
        key: tile.tile.key,
        row: tile.tile.row,
        col: tile.tile.col,
        status: isCalibrationTileStatus(summaryTile?.status) ? summaryTile?.status : tile.status,
        error: summaryTile?.error ?? tile.error ?? null,
        adjustedHome: sanitizePoint(
            summaryTile?.adjustedHome ?? tile.metrics?.adjustedHome ?? null,
        ),
        homeOffset: sanitizeOffset(summaryTile?.homeOffset ?? tile.metrics?.homeOffset ?? null),
        homeMeasurement: sanitizedMeasurement,
        stepToDisplacement: {
            x: sanitizeStepValue(
                summaryTile?.stepToDisplacement?.x ?? tile.metrics?.stepToDisplacement?.x ?? null,
            ),
            y: sanitizeStepValue(
                summaryTile?.stepToDisplacement?.y ?? tile.metrics?.stepToDisplacement?.y ?? null,
            ),
        },
        sizeDeltaAtStepTest: sanitizeStepValue(
            summaryTile?.sizeDeltaAtStepTest ?? tile.metrics?.sizeDeltaAtStepTest ?? null,
        ),
        blobSize: sanitizedMeasurement?.size ?? null,
    };
};

const buildProfileTiles = (
    tiles: Record<string, TileRunState>,
    summaryTiles: CalibrationRunSummary['tiles'] | undefined,
): Record<string, CalibrationProfileTile> => {
    const entries: Record<string, CalibrationProfileTile> = {};
    Object.values(tiles).forEach((tile) => {
        const summaryTile = summaryTiles?.[tile.tile.key];
        entries[tile.tile.key] = buildTileEntry(tile, summaryTile);
    });
    if (summaryTiles) {
        Object.entries(summaryTiles).forEach(([key, summaryTile]) => {
            if (!entries[key]) {
                const fallback: TileRunState = {
                    tile: summaryTile.tile,
                    status: summaryTile.status as CalibrationTileStatus,
                    assignment: { x: null, y: null },
                };
                entries[key] = buildTileEntry(fallback, summaryTile);
            }
        });
    }
    return entries;
};

const computeMetrics = (
    tiles: Record<string, CalibrationProfileTile>,
): CalibrationProfileMetrics => {
    const metrics: CalibrationProfileMetrics = {
        totalTiles: 0,
        completedTiles: 0,
        failedTiles: 0,
        skippedTiles: 0,
    };
    Object.values(tiles).forEach((tile) => {
        metrics.totalTiles += 1;
        if (tile.status === 'completed') {
            metrics.completedTiles += 1;
        } else if (tile.status === 'failed') {
            metrics.failedTiles += 1;
        } else if (tile.status === 'skipped') {
            metrics.skippedTiles += 1;
        }
    });
    return metrics;
};

const cloneTile = (tile: CalibrationProfileTile): CalibrationProfileTile => ({
    key: tile.key,
    row: tile.row,
    col: tile.col,
    status: tile.status,
    error: tile.error ?? null,
    adjustedHome: tile.adjustedHome ? { x: tile.adjustedHome.x, y: tile.adjustedHome.y } : null,
    homeOffset: tile.homeOffset ? { dx: tile.homeOffset.dx, dy: tile.homeOffset.dy } : null,
    homeMeasurement: tile.homeMeasurement ? sanitizeMeasurement(tile.homeMeasurement) : null,
    stepToDisplacement: {
        x: tile.stepToDisplacement.x,
        y: tile.stepToDisplacement.y,
    },
    sizeDeltaAtStepTest: tile.sizeDeltaAtStepTest ?? null,
    blobSize: tile.blobSize ?? null,
});

const serializeProfile = (profile: CalibrationProfile): CalibrationProfile => ({
    id: profile.id,
    name: profile.name,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    gridSize: { rows: profile.gridSize.rows, cols: profile.gridSize.cols },
    gridBlueprint: sanitizeGridBlueprint(profile.gridBlueprint),
    stepTestSettings: {
        deltaSteps: profile.stepTestSettings.deltaSteps,
    },
    gridStateFingerprint: profile.gridStateFingerprint,
    tiles: Object.fromEntries(
        Object.entries(profile.tiles).map(([key, tile]) => [key, cloneTile(tile)]),
    ),
    metrics: {
        totalTiles: profile.metrics.totalTiles,
        completedTiles: profile.metrics.completedTiles,
        failedTiles: profile.metrics.failedTiles,
        skippedTiles: profile.metrics.skippedTiles,
    },
});

const persistProfiles = (storage: Storage, profiles: CalibrationProfile[]) => {
    const payload: StoredPayload = {
        version: STORAGE_VERSION,
        entries: profiles.map((profile) => serializeProfile(profile)),
    };
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist calibration profiles', error);
    }
};

const parseMeasurementStats = (input: unknown): BlobMeasurementStats | undefined => {
    if (!input || typeof input !== 'object') {
        return undefined;
    }
    const candidate = input as BlobMeasurementStats;
    if (
        !isFiniteNumber(candidate.sampleCount) ||
        !candidate.thresholds ||
        !isFiniteNumber(candidate.thresholds.minSamples) ||
        !isFiniteNumber(candidate.thresholds.maxMedianDeviationPt) ||
        !candidate.median ||
        !isFiniteNumber(candidate.median.x) ||
        !isFiniteNumber(candidate.median.y) ||
        !isFiniteNumber(candidate.median.size) ||
        !candidate.medianAbsoluteDeviation ||
        !isFiniteNumber(candidate.medianAbsoluteDeviation.x) ||
        !isFiniteNumber(candidate.medianAbsoluteDeviation.y) ||
        !isFiniteNumber(candidate.medianAbsoluteDeviation.size) ||
        typeof candidate.passed !== 'boolean'
    ) {
        return undefined;
    }
    return {
        sampleCount: candidate.sampleCount,
        thresholds: {
            minSamples: candidate.thresholds.minSamples,
            maxMedianDeviationPt: candidate.thresholds.maxMedianDeviationPt,
        },
        median: {
            x: candidate.median.x,
            y: candidate.median.y,
            size: candidate.median.size,
        },
        medianAbsoluteDeviation: {
            x: candidate.medianAbsoluteDeviation.x,
            y: candidate.medianAbsoluteDeviation.y,
            size: candidate.medianAbsoluteDeviation.size,
        },
        passed: candidate.passed,
    };
};

const parseMeasurement = (input: unknown): BlobMeasurement | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as BlobMeasurement;
    if (
        !isFiniteNumber(candidate.x) ||
        !isFiniteNumber(candidate.y) ||
        !isFiniteNumber(candidate.size) ||
        !isFiniteNumber(candidate.response) ||
        !isFiniteNumber(candidate.capturedAt)
    ) {
        return null;
    }
    return {
        x: candidate.x,
        y: candidate.y,
        size: candidate.size,
        response: candidate.response,
        capturedAt: candidate.capturedAt,
        stats: parseMeasurementStats(candidate.stats),
    };
};

const parseTile = (input: unknown): CalibrationProfileTile | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as CalibrationProfileTile;
    if (!isNonEmptyString(candidate.key)) {
        return null;
    }
    if (!isFiniteNumber(candidate.row) || !isFiniteNumber(candidate.col)) {
        return null;
    }
    const status = isCalibrationTileStatus(candidate.status) ? candidate.status : 'pending';
    return {
        key: candidate.key,
        row: candidate.row,
        col: candidate.col,
        status,
        error: isNonEmptyString(candidate.error) ? candidate.error : null,
        adjustedHome: sanitizePoint(candidate.adjustedHome),
        homeOffset: sanitizeOffset(candidate.homeOffset),
        homeMeasurement: parseMeasurement(candidate.homeMeasurement ?? undefined),
        stepToDisplacement: {
            x: sanitizeStepValue(candidate.stepToDisplacement?.x ?? null),
            y: sanitizeStepValue(candidate.stepToDisplacement?.y ?? null),
        },
        sizeDeltaAtStepTest: sanitizeStepValue(candidate.sizeDeltaAtStepTest ?? null),
        blobSize: sanitizeStepValue(candidate.blobSize ?? null),
    };
};

const parseMetrics = (input: unknown): CalibrationProfileMetrics | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as CalibrationProfileMetrics;
    if (
        !isFiniteNumber(candidate.totalTiles) ||
        !isFiniteNumber(candidate.completedTiles) ||
        !isFiniteNumber(candidate.failedTiles) ||
        !isFiniteNumber(candidate.skippedTiles)
    ) {
        return null;
    }
    return {
        totalTiles: candidate.totalTiles,
        completedTiles: candidate.completedTiles,
        failedTiles: candidate.failedTiles,
        skippedTiles: candidate.skippedTiles,
    };
};

const parseProfile = (input: unknown): CalibrationProfile | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as CalibrationProfile;
    if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.name)) {
        return null;
    }
    if (!isNonEmptyString(candidate.createdAt) || !isNonEmptyString(candidate.updatedAt)) {
        return null;
    }
    if (
        !candidate.gridSize ||
        !isFiniteNumber(candidate.gridSize.rows) ||
        !isFiniteNumber(candidate.gridSize.cols)
    ) {
        return null;
    }
    if (!isNonEmptyString(candidate.gridStateFingerprint)) {
        return null;
    }
    if (!candidate.stepTestSettings || !isFiniteNumber(candidate.stepTestSettings.deltaSteps)) {
        return null;
    }
    const tilesInput = candidate.tiles;
    if (!tilesInput || typeof tilesInput !== 'object') {
        return null;
    }
    const tiles: Record<string, CalibrationProfileTile> = {};
    Object.entries(tilesInput).forEach(([key, value]) => {
        const tile = parseTile(value);
        if (tile) {
            tiles[key] = tile;
        }
    });
    if (Object.keys(tiles).length === 0) {
        return null;
    }
    const metrics = parseMetrics(candidate.metrics) ?? computeMetrics(tiles);
    return {
        id: candidate.id,
        name: candidate.name,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        gridSize: {
            rows: candidate.gridSize.rows,
            cols: candidate.gridSize.cols,
        },
        gridBlueprint: sanitizeGridBlueprint(candidate.gridBlueprint),
        stepTestSettings: {
            deltaSteps: candidate.stepTestSettings.deltaSteps,
        },
        gridStateFingerprint: candidate.gridStateFingerprint,
        tiles,
        metrics,
    };
};

const readProfilesFromStorage = (storage?: Storage): CalibrationProfile[] => {
    if (!storage) {
        return [];
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return [];
    }
    try {
        const payload = JSON.parse(raw) as StoredPayload;
        if (!payload || payload.version !== STORAGE_VERSION || !Array.isArray(payload.entries)) {
            return [];
        }
        const profiles: CalibrationProfile[] = [];
        payload.entries.forEach((entry) => {
            const profile = parseProfile(entry);
            if (profile) {
                profiles.push(profile);
            }
        });
        return profiles;
    } catch (error) {
        console.warn('Failed to parse calibration profiles', error);
        return [];
    }
};

const generateProfileId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `cal-profile-${Math.random().toString(36).slice(2, 10)}`;
};

export const loadCalibrationProfiles = (storage?: Storage): CalibrationProfile[] =>
    readProfilesFromStorage(storage);

export interface SaveCalibrationProfileOptions {
    id?: string;
    name: string;
    runnerState: CalibrationRunnerState;
    gridSnapshot: GridStateSnapshot;
}

export const saveCalibrationProfile = (
    storage: Storage | undefined,
    options: SaveCalibrationProfileOptions,
): CalibrationProfile | null => {
    if (!storage) {
        return null;
    }
    const summary = options.runnerState.summary;
    if (!summary) {
        console.warn('Cannot save calibration profile before a summary is available.');
        return null;
    }
    const name = isNonEmptyString(options.name) ? options.name.trim() : 'Untitled calibration';
    const tiles = buildProfileTiles(options.runnerState.tiles, summary.tiles);
    const metrics = computeMetrics(tiles);
    const fingerprint = getGridStateFingerprint(options.gridSnapshot);
    const now = new Date().toISOString();
    const baseProfile: CalibrationProfile = {
        id: options.id ?? generateProfileId(),
        name,
        createdAt: now,
        updatedAt: now,
        gridSize: {
            rows: options.gridSnapshot.gridSize.rows,
            cols: options.gridSnapshot.gridSize.cols,
        },
        gridBlueprint: sanitizeGridBlueprint(summary.gridBlueprint),
        stepTestSettings: {
            deltaSteps: summary.stepTestSettings.deltaSteps,
        },
        gridStateFingerprint: fingerprint,
        tiles,
        metrics,
    };
    const existing = readProfilesFromStorage(storage);
    const index = options.id ? existing.findIndex((entry) => entry.id === options.id) : -1;
    if (index >= 0) {
        const previous = existing[index];
        const updatedProfile: CalibrationProfile = {
            ...baseProfile,
            id: previous.id,
            createdAt: previous.createdAt,
        };
        existing[index] = updatedProfile;
    } else {
        existing.push(baseProfile);
    }
    persistProfiles(storage, existing);
    return index >= 0 ? existing[index] : baseProfile;
};

export const deleteCalibrationProfile = (storage: Storage | undefined, profileId: string): void => {
    if (!storage) {
        return;
    }
    const existing = readProfilesFromStorage(storage);
    const next = existing.filter((profile) => profile.id !== profileId);
    persistProfiles(storage, next);
};

export const loadLastCalibrationProfileId = (storage?: Storage): string | null => {
    if (!storage) {
        return null;
    }
    try {
        const value = storage.getItem(LAST_SELECTED_PROFILE_KEY);
        return value && value.trim().length > 0 ? value : null;
    } catch (error) {
        console.warn('Failed to load last calibration profile id', error);
        return null;
    }
};

export const persistLastCalibrationProfileId = (
    storage: Storage | undefined,
    profileId: string | null,
): void => {
    if (!storage) {
        return;
    }
    try {
        if (!profileId) {
            storage.removeItem(LAST_SELECTED_PROFILE_KEY);
        } else {
            storage.setItem(LAST_SELECTED_PROFILE_KEY, profileId);
        }
    } catch (error) {
        console.warn('Failed to persist last calibration profile id', error);
    }
};

export const profileToRunSummary = (profile: CalibrationProfile): CalibrationRunSummary => {
    const tiles: CalibrationRunSummary['tiles'] = {};
    Object.values(profile.tiles).forEach((entry) => {
        const status: TileCalibrationResult['status'] =
            entry.status === 'completed' || entry.status === 'failed' || entry.status === 'skipped'
                ? entry.status
                : 'measuring';
        const result: TileCalibrationResult = {
            tile: {
                row: entry.row,
                col: entry.col,
                key: entry.key,
            },
            status,
            error: entry.error ?? undefined,
        };
        if (entry.homeMeasurement) {
            result.homeMeasurement = entry.homeMeasurement;
        }
        if (entry.homeOffset) {
            result.homeOffset = entry.homeOffset;
        }
        if (entry.adjustedHome) {
            result.adjustedHome = entry.adjustedHome;
        }
        if (entry.stepToDisplacement) {
            result.stepToDisplacement = entry.stepToDisplacement;
        }
        if (typeof entry.sizeDeltaAtStepTest === 'number') {
            result.sizeDeltaAtStepTest = entry.sizeDeltaAtStepTest;
        }
        tiles[entry.key] = result;
    });
    return {
        gridBlueprint: profile.gridBlueprint,
        stepTestSettings: profile.stepTestSettings,
        tiles,
    };
};
