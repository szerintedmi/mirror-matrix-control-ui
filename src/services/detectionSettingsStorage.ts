import type { BlobDetectorParams } from '@/services/opencvWorkerClient';
import type { NormalizedRoi } from '@/types';

const STORAGE_KEY = 'mirror:calibration:detection-settings';
export const DETECTION_SETTINGS_STORAGE_KEY = STORAGE_KEY;
const CURRENT_VERSION = 1;
const SAVED_PROFILES_KEY = 'mirror:calibration:detection-settings-profiles';
export const DETECTION_SETTINGS_PROFILES_STORAGE_KEY = SAVED_PROFILES_KEY;
const SAVED_PROFILES_VERSION = 1;
const LAST_DETECTION_PROFILE_KEY = 'mirror:calibration:detection-last-profile-id';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const clampRange = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));
const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;
const isIsoTimestamp = (value: unknown): value is string =>
    typeof value === 'string' && !Number.isNaN(Date.parse(value));

export interface DetectionRoi extends NormalizedRoi {
    lastCaptureWidth: number | null;
    lastCaptureHeight: number | null;
}

export interface DetectionCameraSettings {
    deviceId: string;
    resolutionId: string;
}

export interface DetectionProcessingSettings {
    brightness: number;
    contrast: number;
    claheClipLimit: number;
    claheTileGridSize: number;
    rotationDegrees: number;
}

export interface DetectionSettings {
    camera: DetectionCameraSettings;
    roi: DetectionRoi;
    processing: DetectionProcessingSettings;
    blobParams: BlobDetectorParams;
    useWasmDetector: boolean;
}

export interface DetectionSettingsProfile {
    id: string;
    name: string;
    settings: DetectionSettings;
    createdAt: string;
    updatedAt: string;
}

export const DEFAULT_BLOB_PARAMS: BlobDetectorParams = {
    minThreshold: 30,
    maxThreshold: 255,
    thresholdStep: 10,
    minDistBetweenBlobs: 10,
    minRepeatability: 2,
    filterByArea: true,
    minArea: 1500,
    maxArea: 15000,
    filterByCircularity: false,
    minCircularity: 0.5,
    filterByConvexity: true,
    minConvexity: 0.6,
    filterByInertia: true,
    minInertiaRatio: 0.6,
    filterByColor: true,
    blobColor: 255,
};

const DEFAULT_ROI: DetectionRoi = {
    enabled: true,
    x: 0.15,
    y: 0.15,
    width: 0.7,
    height: 0.7,
    lastCaptureWidth: null,
    lastCaptureHeight: null,
};

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
    camera: {
        deviceId: 'default',
        resolutionId: 'auto',
    },
    roi: DEFAULT_ROI,
    processing: {
        brightness: 0,
        contrast: 1,
        claheClipLimit: 2,
        claheTileGridSize: 8,
        rotationDegrees: 0,
    },
    blobParams: DEFAULT_BLOB_PARAMS,
    useWasmDetector: false,
};

const parseCameraSettings = (input: unknown): DetectionCameraSettings | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<DetectionCameraSettings>;
    if (typeof candidate.deviceId !== 'string' || candidate.deviceId.trim().length === 0) {
        return null;
    }
    if (typeof candidate.resolutionId !== 'string' || candidate.resolutionId.trim().length === 0) {
        return null;
    }
    return {
        deviceId: candidate.deviceId,
        resolutionId: candidate.resolutionId,
    };
};

const parseProcessingSettings = (input: unknown): DetectionProcessingSettings | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<DetectionProcessingSettings>;
    const { brightness, contrast, claheClipLimit, claheTileGridSize, rotationDegrees } = candidate;
    if (
        !isFiniteNumber(brightness) ||
        !isFiniteNumber(contrast) ||
        !isFiniteNumber(claheClipLimit) ||
        !isFiniteNumber(claheTileGridSize) ||
        !isFiniteNumber(rotationDegrees)
    ) {
        return null;
    }
    return {
        brightness: clampRange(brightness, -10, 10),
        contrast: clampRange(contrast, 0, 5),
        claheClipLimit: clampRange(claheClipLimit, 0, 50),
        claheTileGridSize: Math.max(1, Math.floor(claheTileGridSize)),
        rotationDegrees: clampRange(rotationDegrees, -180, 180),
    };
};

const parseBlobParams = (input: unknown): BlobDetectorParams | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<BlobDetectorParams>;
    const {
        minThreshold,
        maxThreshold,
        thresholdStep,
        minDistBetweenBlobs,
        minRepeatability,
        filterByArea,
        minArea,
        maxArea,
        filterByCircularity,
        minCircularity,
        filterByConvexity,
        minConvexity,
        filterByInertia,
        minInertiaRatio,
        filterByColor,
        blobColor,
    } = candidate;
    if (
        !isFiniteNumber(minThreshold) ||
        !isFiniteNumber(maxThreshold) ||
        !isFiniteNumber(thresholdStep) ||
        !isFiniteNumber(minDistBetweenBlobs) ||
        !isFiniteNumber(minRepeatability) ||
        !isFiniteNumber(minArea) ||
        !isFiniteNumber(maxArea) ||
        !isFiniteNumber(minConvexity) ||
        !isFiniteNumber(minInertiaRatio) ||
        !isFiniteNumber(minCircularity) ||
        !isFiniteNumber(blobColor)
    ) {
        return null;
    }
    if (
        typeof filterByArea !== 'boolean' ||
        typeof filterByCircularity !== 'boolean' ||
        typeof filterByConvexity !== 'boolean' ||
        typeof filterByInertia !== 'boolean' ||
        typeof filterByColor !== 'boolean'
    ) {
        return null;
    }
    return {
        minThreshold: clampRange(minThreshold, 0, 255),
        maxThreshold: clampRange(maxThreshold, 0, 255),
        thresholdStep: Math.max(1, Math.floor(thresholdStep)),
        minDistBetweenBlobs: Math.max(0, Math.floor(minDistBetweenBlobs)),
        minRepeatability: Math.max(0, Math.floor(minRepeatability)),
        filterByArea,
        minArea: Math.max(0, Math.floor(minArea)),
        maxArea: Math.max(minArea, Math.floor(maxArea)),
        filterByCircularity,
        minCircularity: clampRange(minCircularity, 0, 1),
        filterByConvexity,
        minConvexity: clampRange(minConvexity, 0, 1),
        filterByInertia,
        minInertiaRatio: clampRange(minInertiaRatio, 0, 1),
        filterByColor,
        blobColor: clampRange(blobColor, 0, 255),
    };
};

const parseRoi = (input: unknown): DetectionRoi | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<DetectionRoi>;
    if (
        typeof candidate.enabled !== 'boolean' ||
        !isFiniteNumber(candidate.x) ||
        !isFiniteNumber(candidate.y) ||
        !isFiniteNumber(candidate.width) ||
        !isFiniteNumber(candidate.height)
    ) {
        return null;
    }
    const width = clampRange(candidate.width, 0.01, 1);
    const height = clampRange(candidate.height, 0.01, 1);
    const x = clamp01(Math.min(candidate.x, 1 - width));
    const y = clamp01(Math.min(candidate.y, 1 - height));
    const lastCaptureWidth = isFiniteNumber(candidate.lastCaptureWidth)
        ? candidate.lastCaptureWidth
        : null;
    const lastCaptureHeight = isFiniteNumber(candidate.lastCaptureHeight)
        ? candidate.lastCaptureHeight
        : null;
    return {
        enabled: candidate.enabled,
        x,
        y,
        width,
        height,
        lastCaptureWidth,
        lastCaptureHeight,
    };
};

const parseDetectionSettings = (input: unknown): DetectionSettings | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<DetectionSettings>;
    const camera = parseCameraSettings(candidate.camera);
    const processing = parseProcessingSettings(candidate.processing);
    const roi = parseRoi(candidate.roi);
    const blobParams = parseBlobParams(candidate.blobParams);
    if (!camera || !processing || !roi || !blobParams) {
        return null;
    }
    return {
        camera,
        processing,
        roi,
        blobParams,
        useWasmDetector:
            typeof candidate.useWasmDetector === 'boolean'
                ? candidate.useWasmDetector
                : DEFAULT_DETECTION_SETTINGS.useWasmDetector,
    };
};

export const loadDetectionSettings = (storage?: Storage): DetectionSettings | null => {
    if (!storage) {
        return null;
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return null;
    }
    try {
        const payload = JSON.parse(raw) as Partial<{ version?: number; settings?: unknown }>;
        if (!payload || typeof payload !== 'object' || payload.version !== CURRENT_VERSION) {
            return null;
        }
        return payload.settings ? parseDetectionSettings(payload.settings) : null;
    } catch (error) {
        console.warn('Failed to parse detection settings', error);
        return null;
    }
};

export const persistDetectionSettings = (
    storage: Storage | undefined,
    settings: DetectionSettings,
): void => {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: CURRENT_VERSION,
                settings: cloneDetectionSettings(settings),
            }),
        );
    } catch (error) {
        console.warn('Failed to persist detection settings', error);
    }
};

export const clearDetectionSettings = (storage: Storage | undefined): void => {
    if (!storage) {
        return;
    }
    try {
        storage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear detection settings', error);
    }
};

function cloneDetectionSettings(settings: DetectionSettings): DetectionSettings {
    return {
        camera: {
            deviceId: settings.camera.deviceId,
            resolutionId: settings.camera.resolutionId,
        },
        roi: {
            enabled: settings.roi.enabled,
            x: settings.roi.x,
            y: settings.roi.y,
            width: settings.roi.width,
            height: settings.roi.height,
            lastCaptureWidth: settings.roi.lastCaptureWidth,
            lastCaptureHeight: settings.roi.lastCaptureHeight,
        },
        processing: {
            brightness: settings.processing.brightness,
            contrast: settings.processing.contrast,
            claheClipLimit: settings.processing.claheClipLimit,
            claheTileGridSize: settings.processing.claheTileGridSize,
            rotationDegrees: settings.processing.rotationDegrees,
        },
        blobParams: { ...settings.blobParams },
        useWasmDetector: settings.useWasmDetector,
    };
}

const serializeProfile = (profile: DetectionSettingsProfile): DetectionSettingsProfile => ({
    id: profile.id,
    name: profile.name,
    settings: cloneDetectionSettings(profile.settings),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
});

const persistSavedProfiles = (storage: Storage, entries: DetectionSettingsProfile[]): void => {
    const payload = {
        version: SAVED_PROFILES_VERSION,
        entries: entries.map((entry) => serializeProfile(entry)),
    };
    try {
        storage.setItem(SAVED_PROFILES_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist saved detection profiles', error);
    }
};

const generateProfileId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `profile-${Math.random().toString(36).slice(2, 11)}`;
};

const parseSavedProfile = (input: unknown): DetectionSettingsProfile | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<DetectionSettingsProfile>;
    if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.name)) {
        return null;
    }
    if (!isIsoTimestamp(candidate.createdAt) || !isIsoTimestamp(candidate.updatedAt)) {
        return null;
    }
    const settings = parseDetectionSettings(candidate.settings);
    if (!settings) {
        return null;
    }
    return {
        id: candidate.id,
        name: candidate.name,
        settings,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
    };
};

export const loadSavedDetectionSettingsProfiles = (
    storage?: Storage,
): DetectionSettingsProfile[] => {
    if (!storage) {
        return [];
    }
    const raw = storage.getItem(SAVED_PROFILES_KEY);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw) as Partial<{ version?: number; entries?: unknown }>;
        if (
            !parsed ||
            parsed.version !== SAVED_PROFILES_VERSION ||
            !Array.isArray(parsed.entries)
        ) {
            return [];
        }
        const profiles: DetectionSettingsProfile[] = [];
        for (const entry of parsed.entries) {
            const profile = parseSavedProfile(entry);
            if (profile) {
                profiles.push(profile);
            }
        }
        return profiles;
    } catch (error) {
        console.warn('Failed to parse saved detection profiles', error);
        return [];
    }
};

export const saveDetectionSettingsProfile = (
    storage: Storage | undefined,
    options: { id?: string; name: string; settings: DetectionSettings },
): DetectionSettingsProfile | null => {
    if (!storage) {
        return null;
    }
    const normalizedName = isNonEmptyString(options.name)
        ? options.name.trim()
        : 'Untitled settings';
    const entries = loadSavedDetectionSettingsProfiles(storage);
    const sanitizedSettings = cloneDetectionSettings(options.settings);
    const now = new Date().toISOString();
    let updatedEntry: DetectionSettingsProfile;
    if (options.id) {
        const index = entries.findIndex((entry) => entry.id === options.id);
        if (index >= 0) {
            updatedEntry = {
                ...entries[index],
                name: normalizedName,
                settings: sanitizedSettings,
                updatedAt: now,
            };
            entries[index] = updatedEntry;
        } else {
            updatedEntry = {
                id: options.id,
                name: normalizedName,
                settings: sanitizedSettings,
                createdAt: now,
                updatedAt: now,
            };
            entries.push(updatedEntry);
        }
    } else {
        updatedEntry = {
            id: generateProfileId(),
            name: normalizedName,
            settings: sanitizedSettings,
            createdAt: now,
            updatedAt: now,
        };
        entries.push(updatedEntry);
    }
    persistSavedProfiles(storage, entries);
    return updatedEntry;
};

/**
 * Load the ID of the last selected detection profile from storage.
 */
export const loadLastDetectionProfileId = (storage: Storage | undefined): string | null => {
    if (!storage) {
        return null;
    }
    try {
        const raw = storage.getItem(LAST_DETECTION_PROFILE_KEY);
        return raw && typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
    } catch {
        return null;
    }
};

/**
 * Persist the last selected detection profile ID to storage.
 */
export const persistLastDetectionProfileId = (
    storage: Storage | undefined,
    profileId: string | null,
): void => {
    if (!storage) {
        return;
    }
    try {
        if (profileId && profileId.trim().length > 0) {
            storage.setItem(LAST_DETECTION_PROFILE_KEY, profileId);
        } else {
            storage.removeItem(LAST_DETECTION_PROFILE_KEY);
        }
    } catch {
        // Ignore storage errors
    }
};
