import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type {
    CalibrationRunSummary,
    CalibrationRunnerState,
    TileCalibrationResult,
    TileRunState,
} from '@/services/calibrationRunner';
import { getGridStateFingerprint, type GridStateSnapshot } from '@/services/gridStorage';
import type {
    BlobMeasurement,
    CalibrationGridBlueprint,
    CalibrationProfile,
    CalibrationCameraResolution,
    CalibrationProfileBlobStats,
    CalibrationProfileBounds,
    CalibrationProfileCalibrationSpace,
    CalibrationProfileFingerprint,
    CalibrationProfileMetrics,
    CalibrationTileOffset,
    CalibrationTilePosition,
    TileAxisCalibration,
    TileCalibrationResults,
} from '@/types';
import { STEP_EPSILON, clampNormalized, convertDeltaToSteps } from '@/utils/calibrationMath';

export const CALIBRATION_PROFILES_STORAGE_KEY = 'mirror:calibration:profiles';
export const CALIBRATION_PROFILES_CHANGED_EVENT = 'mirror:calibration-profiles-changed';
const LAST_SELECTED_PROFILE_KEY = 'mirror:calibration:last-profile-id';
const STORAGE_VERSION = 2;
const PROFILE_SCHEMA_VERSION = 2;
const PROFILE_EXPORT_VERSION = 1;
const PROFILE_EXPORT_TYPE = 'mirror.calibration.profile';

interface StoredPayload {
    version: number;
    entries: CalibrationProfile[];
}

type StepVector = {
    x: number | null;
    y: number | null;
};

type PositionInput = {
    x: number;
    y: number;
    stepsX?: number | null;
    stepsY?: number | null;
};

const NORMALIZED_MAD_FACTOR = 1.4826;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isPositiveFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

const computeMedian = (values: number[]): number => {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
};

const normalizeStepVector = (input?: StepVector | null): StepVector => ({
    x: input?.x ?? null,
    y: input?.y ?? null,
});

const buildVectorFromOffset = (
    offset: { dx: number; dy: number } | null | undefined,
    stepToDisplacement: StepVector,
): CalibrationTileOffset | null => {
    if (!offset) {
        return null;
    }
    return {
        dx: offset.dx,
        dy: offset.dy,
        stepsX: convertDeltaToSteps(offset.dx, stepToDisplacement.x),
        stepsY: convertDeltaToSteps(offset.dy, stepToDisplacement.y),
    };
};

const buildVectorFromPosition = (
    position: PositionInput | null | undefined,
    reference: BlobMeasurement | null,
    stepToDisplacement: StepVector,
): CalibrationTilePosition | null => {
    if (!position) {
        return null;
    }
    const deltaX = reference ? position.x - reference.x : null;
    const deltaY = reference ? position.y - reference.y : null;
    return {
        x: position.x,
        y: position.y,
        stepsX:
            position.stepsX ??
            (deltaX !== null ? convertDeltaToSteps(deltaX, stepToDisplacement.x) : null),
        stepsY:
            position.stepsY ??
            (deltaY !== null ? convertDeltaToSteps(deltaY, stepToDisplacement.y) : null),
    };
};

const computeAxisCalibration = (
    perStep: number | null,
    hasMotor: boolean,
): TileAxisCalibration => ({
    stepRange: hasMotor
        ? { minSteps: MOTOR_MIN_POSITION_STEPS, maxSteps: MOTOR_MAX_POSITION_STEPS }
        : null,
    stepScale: perStep && Math.abs(perStep) >= STEP_EPSILON ? 1 / perStep : null,
});

const computeAxisBounds = (
    center: number | null,
    centerSteps: number | null,
    perStep: number | null,
): { min: number; max: number } | null => {
    if (
        center == null ||
        centerSteps == null ||
        perStep == null ||
        Math.abs(perStep) < STEP_EPSILON
    ) {
        return null;
    }
    const deltaMin = MOTOR_MIN_POSITION_STEPS - centerSteps;
    const deltaMax = MOTOR_MAX_POSITION_STEPS - centerSteps;
    const candidateA = clampNormalized(center + deltaMin * perStep);
    const candidateB = clampNormalized(center + deltaMax * perStep);
    return {
        min: Math.min(candidateA, candidateB),
        max: Math.max(candidateA, candidateB),
    };
};

const computeTileBounds = (
    adjustedHome: CalibrationTilePosition | null,
    stepToDisplacement: StepVector,
): CalibrationProfileBounds | null => {
    if (!adjustedHome) {
        return null;
    }
    const boundsX = computeAxisBounds(adjustedHome.x, adjustedHome.stepsX, stepToDisplacement.x);
    const boundsY = computeAxisBounds(adjustedHome.y, adjustedHome.stepsY, stepToDisplacement.y);
    if (!boundsX || !boundsY) {
        return null;
    }
    return {
        x: boundsX,
        y: boundsY,
    };
};

const mergeBoundsIntersection = (
    current: CalibrationProfileBounds | null,
    candidate: CalibrationProfileBounds,
): CalibrationProfileBounds | null => {
    if (!current) {
        return {
            x: { ...candidate.x },
            y: { ...candidate.y },
        };
    }
    const minX = Math.max(current.x.min, candidate.x.min);
    const maxX = Math.min(current.x.max, candidate.x.max);
    const minY = Math.max(current.y.min, candidate.y.min);
    const maxY = Math.min(current.y.max, candidate.y.max);
    if (minX > maxX || minY > maxY) {
        return null;
    }
    return {
        x: { min: minX, max: maxX },
        y: { min: minY, max: maxY },
    };
};

const mergeBoundsUnion = (
    current: CalibrationProfileBounds | null,
    candidate: CalibrationProfileBounds,
): CalibrationProfileBounds => {
    if (!current) {
        return {
            x: { ...candidate.x },
            y: { ...candidate.y },
        };
    }
    return {
        x: {
            min: Math.min(current.x.min, candidate.x.min),
            max: Math.max(current.x.max, candidate.x.max),
        },
        y: {
            min: Math.min(current.y.min, candidate.y.min),
            max: Math.max(current.y.max, candidate.y.max),
        },
    };
};

const computeProfileBlobStats = (
    tiles: Record<string, TileCalibrationResults>,
): CalibrationProfileBlobStats | null => {
    const sizes = Object.values(tiles)
        .map((tile) => tile.homeMeasurement?.size)
        .filter((size): size is number => typeof size === 'number' && Number.isFinite(size));
    if (sizes.length === 0) {
        return null;
    }
    const sorted = [...sizes].sort((a, b) => a - b);
    const median = computeMedian(sorted);
    const deviations = sorted.map((size) => Math.abs(size - median));
    const mad = computeMedian(deviations);
    return {
        minDiameter: sorted[0],
        maxDiameter: sorted[sorted.length - 1],
        medianDiameter: median,
        nMad: mad * NORMALIZED_MAD_FACTOR,
        sampleCount: sorted.length,
    };
};

export const recenterBounds = (bounds: CalibrationProfileBounds): CalibrationProfileBounds => {
    const centerX = (bounds.x.min + bounds.x.max) / 2;
    const centerY = (bounds.y.min + bounds.y.max) / 2;
    if (Math.abs(centerX) <= STEP_EPSILON && Math.abs(centerY) <= STEP_EPSILON) {
        return bounds;
    }
    return {
        x: { min: bounds.x.min - centerX, max: bounds.x.max - centerX },
        y: { min: bounds.y.min - centerY, max: bounds.y.max - centerY },
    };
};

export const computeGlobalBoundsFromTiles = (
    tiles: Record<string, TileCalibrationResults>,
): CalibrationProfileBounds | null => {
    let aggregate: CalibrationProfileBounds | null = null;
    Object.values(tiles).forEach((tile) => {
        if (tile.inferredBounds) {
            aggregate = mergeBoundsIntersection(aggregate, tile.inferredBounds);
        }
    });
    if (!aggregate) {
        return null;
    }
    const finalBounds = aggregate as CalibrationProfileBounds;
    return {
        x: { ...finalBounds.x },
        y: { ...finalBounds.y },
    };
};

const buildCalibrationSpace = (
    tiles: Record<string, TileCalibrationResults>,
): CalibrationProfileCalibrationSpace => ({
    blobStats: computeProfileBlobStats(tiles),
    globalBounds: computeGlobalBoundsFromTiles(tiles),
});

const computeMetrics = (
    tiles: Record<string, TileCalibrationResults>,
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

const buildTileEntry = (
    tile: TileRunState,
    summaryTile: TileCalibrationResult | undefined,
): TileCalibrationResults => {
    const measurement = summaryTile?.homeMeasurement ?? tile.metrics?.home ?? null;
    const stepToDisplacement = normalizeStepVector(
        summaryTile?.stepToDisplacement ?? tile.metrics?.stepToDisplacement ?? null,
    );
    const adjustedHomeSource = summaryTile?.adjustedHome ?? tile.metrics?.adjustedHome ?? null;
    const adjustedHome = buildVectorFromPosition(
        adjustedHomeSource ?? null,
        measurement,
        stepToDisplacement,
    );
    const homeOffsetSource = summaryTile?.homeOffset ?? tile.metrics?.homeOffset ?? null;
    const homeOffset = buildVectorFromOffset(homeOffsetSource ?? null, stepToDisplacement);
    return {
        key: tile.tile.key,
        row: tile.tile.row,
        col: tile.tile.col,
        status: summaryTile?.status ?? tile.status,
        error: summaryTile?.error ?? tile.error ?? null,
        adjustedHome,
        homeOffset,
        homeMeasurement: measurement,
        stepToDisplacement,
        sizeDeltaAtStepTest:
            summaryTile?.sizeDeltaAtStepTest ?? tile.metrics?.sizeDeltaAtStepTest ?? null,
        axes: {
            x: computeAxisCalibration(stepToDisplacement.x, Boolean(tile.assignment.x)),
            y: computeAxisCalibration(stepToDisplacement.y, Boolean(tile.assignment.y)),
        },
        inferredBounds:
            summaryTile?.inferredBounds ?? computeTileBounds(adjustedHome, stepToDisplacement),
    };
};

const computeBlueprintFootprintBounds = (
    blueprint: CalibrationGridBlueprint,
    row: number,
    col: number,
): CalibrationProfileBounds => {
    const spacingX = blueprint.adjustedTileFootprint.width + (blueprint.tileGap?.x ?? 0);
    const spacingY = blueprint.adjustedTileFootprint.height + (blueprint.tileGap?.y ?? 0);
    const minX = blueprint.gridOrigin.x + col * spacingX;
    const minY = blueprint.gridOrigin.y + row * spacingY;
    return {
        x: {
            min: minX,
            max: minX + blueprint.adjustedTileFootprint.width,
        },
        y: {
            min: minY,
            max: minY + blueprint.adjustedTileFootprint.height,
        },
    };
};

const mergeWithBlueprintFootprint = (
    bounds: CalibrationProfileBounds | null,
    blueprint: CalibrationGridBlueprint | null,
    row: number,
    col: number,
): CalibrationProfileBounds | null => {
    if (!blueprint) {
        return bounds;
    }
    const footprint = computeBlueprintFootprintBounds(blueprint, row, col);
    if (!bounds) {
        return footprint;
    }
    return mergeBoundsUnion(bounds, footprint);
};

const buildProfileTiles = (
    tiles: Record<string, TileRunState>,
    summaryTiles: CalibrationRunSummary['tiles'] | undefined,
    gridBlueprint: CalibrationGridBlueprint | null,
): Record<string, TileCalibrationResults> => {
    const entries: Record<string, TileCalibrationResults> = {};
    Object.values(tiles).forEach((tile) => {
        const summaryTile = summaryTiles?.[tile.tile.key];
        const entry = buildTileEntry(tile, summaryTile);
        entry.inferredBounds = mergeWithBlueprintFootprint(
            entry.inferredBounds,
            gridBlueprint,
            tile.tile.row,
            tile.tile.col,
        );
        entries[tile.tile.key] = entry;
    });
    if (summaryTiles) {
        Object.entries(summaryTiles).forEach(([key, summaryTile]) => {
            if (!entries[key]) {
                const fallback: TileRunState = {
                    tile: summaryTile.tile,
                    status: summaryTile.status,
                    assignment: { x: null, y: null },
                };
                const entry = buildTileEntry(fallback, summaryTile);
                entry.inferredBounds = mergeWithBlueprintFootprint(
                    entry.inferredBounds,
                    gridBlueprint,
                    summaryTile.tile.row,
                    summaryTile.tile.col,
                );
                entries[key] = entry;
            }
        });
    }
    return entries;
};

const deriveCalibrationCameraMetadata = (
    summary: CalibrationRunSummary,
): { aspect: number | null; resolution: CalibrationCameraResolution | null } => {
    for (const tile of Object.values(summary.tiles)) {
        const measurement = tile.homeMeasurement;
        if (
            measurement &&
            isPositiveFiniteNumber(measurement.sourceWidth) &&
            isPositiveFiniteNumber(measurement.sourceHeight)
        ) {
            const width = measurement.sourceWidth!;
            const height = measurement.sourceHeight!;
            return {
                aspect: width / height,
                resolution: { width, height },
            };
        }
    }
    return {
        aspect: null,
        resolution: null,
    };
};

const dispatchProfilesChangedEvent = () => {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }
    window.dispatchEvent(new Event(CALIBRATION_PROFILES_CHANGED_EVENT));
};

const persistProfiles = (storage: Storage, profiles: CalibrationProfile[]): void => {
    const payload: StoredPayload = {
        version: STORAGE_VERSION,
        entries: profiles,
    };
    try {
        storage.setItem(CALIBRATION_PROFILES_STORAGE_KEY, JSON.stringify(payload));
        dispatchProfilesChangedEvent();
    } catch (error) {
        console.warn('Failed to persist calibration profiles', error);
    }
};

const readProfilesFromStorage = (storage?: Storage): CalibrationProfile[] => {
    if (!storage) {
        return [];
    }
    const raw = storage.getItem(CALIBRATION_PROFILES_STORAGE_KEY);
    if (!raw) {
        return [];
    }
    try {
        const payload = JSON.parse(raw) as StoredPayload;
        if (!payload || payload.version !== STORAGE_VERSION || !Array.isArray(payload.entries)) {
            return [];
        }
        return payload.entries.filter((entry) => entry.schemaVersion === PROFILE_SCHEMA_VERSION);
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

export interface CalibrationProfileExportPayload {
    type: typeof PROFILE_EXPORT_TYPE;
    version: number;
    profile: CalibrationProfile;
}

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
    const tiles = buildProfileTiles(options.runnerState.tiles, summary.tiles, summary.gridBlueprint);
    const metrics = computeMetrics(tiles);
    const fingerprint = getGridStateFingerprint(options.gridSnapshot);
    const now = new Date().toISOString();
    const { aspect: calibrationCameraAspect, resolution: calibrationCameraResolution } =
        deriveCalibrationCameraMetadata(summary);
    const profile: CalibrationProfile = {
        id: options.id ?? generateProfileId(),
        schemaVersion: PROFILE_SCHEMA_VERSION,
        name: options.name.trim() || 'Untitled calibration',
        createdAt: now,
        updatedAt: now,
        gridSize: {
            rows: options.gridSnapshot.gridSize.rows,
            cols: options.gridSnapshot.gridSize.cols,
        },
        gridBlueprint: summary.gridBlueprint ?? null,
        stepTestSettings: {
            deltaSteps: summary.stepTestSettings.deltaSteps,
        },
        gridStateFingerprint: fingerprint,
        calibrationCameraAspect,
        calibrationCameraResolution,
        calibrationSpace: buildCalibrationSpace(tiles),
        tiles,
        metrics,
    };
    const existing = readProfilesFromStorage(storage);
    const existingIndex = options.id ? existing.findIndex((entry) => entry.id === options.id) : -1;
    if (existingIndex >= 0) {
        const previous = existing[existingIndex];
        const updatedProfile: CalibrationProfile = {
            ...profile,
            id: previous.id,
            createdAt: previous.createdAt,
        };
        existing[existingIndex] = updatedProfile;
        persistProfiles(storage, existing);
        return updatedProfile;
    }
    existing.push(profile);
    persistProfiles(storage, existing);
    return profile;
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

export const buildCalibrationProfileExportPayload = (
    profile: CalibrationProfile,
): CalibrationProfileExportPayload => ({
    type: PROFILE_EXPORT_TYPE,
    version: PROFILE_EXPORT_VERSION,
    profile,
});

const isCalibrationMetricsRecord = (value: unknown): value is CalibrationProfileMetrics => {
    if (!isRecord(value)) {
        return false;
    }
    return (
        isFiniteNumber(value.totalTiles) &&
        isFiniteNumber(value.completedTiles) &&
        isFiniteNumber(value.failedTiles) &&
        isFiniteNumber(value.skippedTiles)
    );
};

const isTileResultsRecord = (value: unknown): value is Record<string, TileCalibrationResults> => {
    if (!isRecord(value)) {
        return false;
    }
    return Object.values(value).every((entry) => {
        if (!isRecord(entry)) {
            return false;
        }
        return (
            typeof entry.key === 'string' &&
            isFiniteNumber(entry.row) &&
            isFiniteNumber(entry.col) &&
            typeof entry.status === 'string'
        );
    });
};

const isCalibrationFingerprint = (value: unknown): value is CalibrationProfileFingerprint => {
    if (!isRecord(value) || typeof value.hash !== 'string') {
        return false;
    }
    if (!isRecord(value.snapshot) || !isFiniteNumber(value.snapshot.version)) {
        return false;
    }
    if (!isRecord(value.snapshot.gridSize)) {
        return false;
    }
    if (
        !isFiniteNumber(value.snapshot.gridSize.rows) ||
        !isFiniteNumber(value.snapshot.gridSize.cols)
    ) {
        return false;
    }
    return isRecord(value.snapshot.assignments ?? {});
};

const isCalibrationCameraResolution = (value: unknown): value is CalibrationCameraResolution => {
    if (!isRecord(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return isPositiveFiniteNumber(record.width) && isPositiveFiniteNumber(record.height);
};

const validateCalibrationProfileCandidate = (
    input: unknown,
): { profile: CalibrationProfile | null; error?: string } => {
    if (!isRecord(input)) {
        return { profile: null, error: 'File is not a calibration profile.' };
    }
    if (typeof input.schemaVersion !== 'number') {
        return { profile: null, error: 'Profile is missing schema version info.' };
    }
    if (input.schemaVersion !== PROFILE_SCHEMA_VERSION) {
        return {
            profile: null,
            error: `Unsupported profile schema version ${input.schemaVersion}.`,
        };
    }
    if (typeof input.id !== 'string' || input.id.trim().length === 0) {
        return { profile: null, error: 'Profile id is invalid.' };
    }
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        return { profile: null, error: 'Profile name is invalid.' };
    }
    if (typeof input.createdAt !== 'string' || typeof input.updatedAt !== 'string') {
        return { profile: null, error: 'Profile timestamps are missing.' };
    }
    if (!isRecord(input.gridSize)) {
        return { profile: null, error: 'Profile grid size is invalid.' };
    }
    if (!isFiniteNumber(input.gridSize.rows) || !isFiniteNumber(input.gridSize.cols)) {
        return { profile: null, error: 'Profile grid size is invalid.' };
    }
    if (!isRecord(input.stepTestSettings) || !isFiniteNumber(input.stepTestSettings.deltaSteps)) {
        return { profile: null, error: 'Profile step settings are invalid.' };
    }
    if (!isCalibrationFingerprint(input.gridStateFingerprint)) {
        return { profile: null, error: 'Profile fingerprint is invalid.' };
    }
    if (
        input.calibrationCameraAspect !== undefined &&
        input.calibrationCameraAspect !== null &&
        !isFiniteNumber(input.calibrationCameraAspect)
    ) {
        return { profile: null, error: 'Profile camera aspect ratio is invalid.' };
    }
    if (
        input.calibrationCameraResolution !== undefined &&
        input.calibrationCameraResolution !== null &&
        !isCalibrationCameraResolution(input.calibrationCameraResolution)
    ) {
        return { profile: null, error: 'Profile camera resolution is invalid.' };
    }
    if (!isRecord(input.calibrationSpace)) {
        return { profile: null, error: 'Calibration space is invalid.' };
    }
    if (!isTileResultsRecord(input.tiles)) {
        return { profile: null, error: 'Tile calibration data is invalid.' };
    }
    if (!isCalibrationMetricsRecord(input.metrics)) {
        return { profile: null, error: 'Calibration metrics are invalid.' };
    }
    return { profile: input as unknown as CalibrationProfile };
};

const unwrapExportPayload = (
    payload: unknown,
): { profile: CalibrationProfile | null; error?: string } => {
    if (isRecord(payload) && payload.type === PROFILE_EXPORT_TYPE) {
        if (payload.version !== PROFILE_EXPORT_VERSION) {
            return {
                profile: null,
                error: `Unsupported export version ${String(payload.version)}.`,
            };
        }
        if (!('profile' in payload)) {
            return { profile: null, error: 'Export is missing profile data.' };
        }
        return validateCalibrationProfileCandidate(payload.profile);
    }
    return validateCalibrationProfileCandidate(payload);
};

const sanitizeImportedProfile = (
    candidate: CalibrationProfile,
    existing: CalibrationProfile[],
): { profile: CalibrationProfile; replacedProfileId?: string } => {
    const now = new Date().toISOString();
    const name = candidate.name.trim() || 'Imported calibration';
    const hasConflict = existing.some((entry) => entry.id === candidate.id);
    const sanitized: CalibrationProfile = {
        ...candidate,
        id: hasConflict ? generateProfileId() : candidate.id,
        schemaVersion: PROFILE_SCHEMA_VERSION,
        name,
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
        updatedAt: now,
        gridSize: {
            rows: candidate.gridSize.rows,
            cols: candidate.gridSize.cols,
        },
        stepTestSettings: {
            deltaSteps: candidate.stepTestSettings.deltaSteps,
        },
        calibrationCameraAspect:
            typeof candidate.calibrationCameraAspect === 'number' &&
            Number.isFinite(candidate.calibrationCameraAspect)
                ? candidate.calibrationCameraAspect
                : null,
        calibrationCameraResolution: isCalibrationCameraResolution(
            candidate.calibrationCameraResolution,
        )
            ? {
                  width: candidate.calibrationCameraResolution.width,
                  height: candidate.calibrationCameraResolution.height,
              }
            : null,
    };
    return {
        profile: sanitized,
        replacedProfileId: hasConflict ? candidate.id : undefined,
    };
};

export interface ImportCalibrationProfileResult {
    profile: CalibrationProfile | null;
    replacedProfileId?: string;
    error?: string;
}

export const importCalibrationProfileFromJson = (
    storage: Storage | undefined,
    json: string,
): ImportCalibrationProfileResult => {
    if (!storage) {
        return {
            profile: null,
            error: 'Local storage is unavailable; cannot import calibration profile.',
        };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return {
            profile: null,
            error: 'Unable to parse the selected file as JSON.',
        };
    }
    const { profile: candidate, error } = unwrapExportPayload(parsed);
    if (!candidate) {
        return {
            profile: null,
            error: error ?? 'File does not contain a calibration profile.',
        };
    }
    const existing = readProfilesFromStorage(storage);
    const { profile, replacedProfileId } = sanitizeImportedProfile(candidate, existing);
    existing.push(profile);
    persistProfiles(storage, existing);
    return { profile, replacedProfileId };
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
            result.homeOffset = { dx: entry.homeOffset.dx, dy: entry.homeOffset.dy };
        }
        if (entry.adjustedHome) {
            result.adjustedHome = { x: entry.adjustedHome.x, y: entry.adjustedHome.y };
        }
        if (entry.stepToDisplacement) {
            result.stepToDisplacement = entry.stepToDisplacement;
        }
        if (typeof entry.sizeDeltaAtStepTest === 'number') {
            result.sizeDeltaAtStepTest = entry.sizeDeltaAtStepTest;
        }
        if (entry.inferredBounds) {
            result.inferredBounds = entry.inferredBounds;
        }
        const stepScale = {
            x: entry.axes.x.stepScale ?? null,
            y: entry.axes.y.stepScale ?? null,
        };
        if (stepScale.x !== null || stepScale.y !== null) {
            result.stepScale = stepScale;
        }
        tiles[entry.key] = result;
    });
    return {
        gridBlueprint: profile.gridBlueprint,
        stepTestSettings: profile.stepTestSettings,
        tiles,
    };
};
