import {
    DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    DEFAULT_FIRST_TILE_INTERIM_STEP_DELTA,
    DEFAULT_FIRST_TILE_TOLERANCE,
    DEFAULT_STAGING_POSITION,
    DEFAULT_TILE_TOLERANCE,
} from '@/constants/calibration';
import type { ArrayRotation, StagingPosition } from '@/types';

const STORAGE_KEY = 'mirror:calibration:ui-settings';
const CURRENT_VERSION = 1;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isValidArrayRotation = (value: unknown): value is ArrayRotation =>
    value === 0 || value === 90 || value === 180 || value === 270;

const isValidStagingPosition = (value: unknown): value is StagingPosition =>
    value === 'nearest-corner' || value === 'corner' || value === 'bottom' || value === 'left';

/**
 * UI-facing calibration settings that are persisted to localStorage.
 */
export interface CalibrationUISettings {
    arrayRotation: ArrayRotation;
    stagingPosition: StagingPosition;
    deltaSteps: number;
    gridGapNormalized: number;
    firstTileInterimStepDelta: number;
    firstTileTolerance: number;
    tileTolerance: number;
}

export const DEFAULT_CALIBRATION_UI_SETTINGS: CalibrationUISettings = {
    arrayRotation: 0,
    stagingPosition: DEFAULT_STAGING_POSITION,
    deltaSteps: DEFAULT_CALIBRATION_RUNNER_SETTINGS.deltaSteps,
    gridGapNormalized: DEFAULT_CALIBRATION_RUNNER_SETTINGS.gridGapNormalized,
    firstTileInterimStepDelta: DEFAULT_FIRST_TILE_INTERIM_STEP_DELTA,
    firstTileTolerance: DEFAULT_FIRST_TILE_TOLERANCE,
    tileTolerance: DEFAULT_TILE_TOLERANCE,
};

interface StoredPayload {
    version: number;
    settings: CalibrationUISettings;
}

/**
 * Load calibration UI settings from localStorage.
 * Returns null if no settings are stored or if parsing fails.
 */
export const loadCalibrationSettings = (
    storage: Storage | undefined,
): CalibrationUISettings | null => {
    if (!storage) {
        return null;
    }
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }
        const payload = parsed as Partial<StoredPayload>;
        if (payload.version !== CURRENT_VERSION) {
            return null;
        }
        const settings = payload.settings;
        if (typeof settings !== 'object' || settings === null) {
            return null;
        }

        // Validate and sanitize each field
        const result: CalibrationUISettings = {
            arrayRotation: isValidArrayRotation(settings.arrayRotation)
                ? settings.arrayRotation
                : DEFAULT_CALIBRATION_UI_SETTINGS.arrayRotation,
            stagingPosition: isValidStagingPosition(settings.stagingPosition)
                ? settings.stagingPosition
                : DEFAULT_CALIBRATION_UI_SETTINGS.stagingPosition,
            deltaSteps: isFiniteNumber(settings.deltaSteps)
                ? settings.deltaSteps
                : DEFAULT_CALIBRATION_UI_SETTINGS.deltaSteps,
            gridGapNormalized: isFiniteNumber(settings.gridGapNormalized)
                ? settings.gridGapNormalized
                : DEFAULT_CALIBRATION_UI_SETTINGS.gridGapNormalized,
            firstTileInterimStepDelta: isFiniteNumber(settings.firstTileInterimStepDelta)
                ? settings.firstTileInterimStepDelta
                : DEFAULT_CALIBRATION_UI_SETTINGS.firstTileInterimStepDelta,
            firstTileTolerance: isFiniteNumber(settings.firstTileTolerance)
                ? settings.firstTileTolerance
                : DEFAULT_CALIBRATION_UI_SETTINGS.firstTileTolerance,
            tileTolerance: isFiniteNumber(settings.tileTolerance)
                ? settings.tileTolerance
                : DEFAULT_CALIBRATION_UI_SETTINGS.tileTolerance,
        };

        return result;
    } catch {
        return null;
    }
};

/**
 * Persist calibration UI settings to localStorage.
 */
export const persistCalibrationSettings = (
    storage: Storage | undefined,
    settings: CalibrationUISettings,
): void => {
    if (!storage) {
        return;
    }
    const payload: StoredPayload = {
        version: CURRENT_VERSION,
        settings,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

/**
 * Clear calibration UI settings from localStorage.
 */
export const clearCalibrationSettings = (storage: Storage | undefined): void => {
    if (!storage) {
        return;
    }
    storage.removeItem(STORAGE_KEY);
};

/**
 * Check if the given settings match the defaults.
 */
export const areSettingsDefault = (settings: CalibrationUISettings): boolean => {
    return (
        settings.arrayRotation === DEFAULT_CALIBRATION_UI_SETTINGS.arrayRotation &&
        settings.stagingPosition === DEFAULT_CALIBRATION_UI_SETTINGS.stagingPosition &&
        settings.deltaSteps === DEFAULT_CALIBRATION_UI_SETTINGS.deltaSteps &&
        settings.gridGapNormalized === DEFAULT_CALIBRATION_UI_SETTINGS.gridGapNormalized &&
        settings.firstTileInterimStepDelta ===
            DEFAULT_CALIBRATION_UI_SETTINGS.firstTileInterimStepDelta &&
        settings.firstTileTolerance === DEFAULT_CALIBRATION_UI_SETTINGS.firstTileTolerance &&
        settings.tileTolerance === DEFAULT_CALIBRATION_UI_SETTINGS.tileTolerance
    );
};
