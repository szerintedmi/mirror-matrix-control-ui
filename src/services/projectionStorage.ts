import {
    DEFAULT_PROJECTION_SETTINGS,
    MAX_WALL_ANGLE_DEG,
    MAX_WALL_DISTANCE_M,
    MIN_WALL_ANGLE_DEG,
    MIN_WALL_DISTANCE_M,
} from '../constants/projection';

import type { ProjectionSettings } from '../types';

const STORAGE_KEY = 'mirror:projection-settings';
const CURRENT_VERSION = 1;

interface StoredProjectionSettings {
    version: number;
    settings: ProjectionSettings;
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const sanitizeSettings = (
    input: Partial<ProjectionSettings> | null | undefined,
): ProjectionSettings | null => {
    if (!input) {
        return null;
    }

    const {
        wallDistance,
        wallAngleHorizontal,
        wallAngleVertical,
        lightAngleHorizontal,
        lightAngleVertical,
    } = input;

    if (
        !isFiniteNumber(wallDistance) ||
        !isFiniteNumber(wallAngleHorizontal) ||
        !isFiniteNumber(wallAngleVertical) ||
        !isFiniteNumber(lightAngleHorizontal) ||
        !isFiniteNumber(lightAngleVertical)
    ) {
        return null;
    }

    return {
        wallDistance: clamp(wallDistance, MIN_WALL_DISTANCE_M, MAX_WALL_DISTANCE_M),
        wallAngleHorizontal: clamp(wallAngleHorizontal, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG),
        wallAngleVertical: clamp(wallAngleVertical, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG),
        lightAngleHorizontal: clamp(lightAngleHorizontal, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG),
        lightAngleVertical: clamp(lightAngleVertical, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG),
    };
};

export const loadProjectionSettings = (storage: Storage | undefined): ProjectionSettings | null => {
    if (!storage) {
        return null;
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<StoredProjectionSettings>;
        if (!parsed || typeof parsed !== 'object' || parsed.version !== CURRENT_VERSION) {
            return null;
        }

        const sanitized = sanitizeSettings(parsed.settings ?? null);
        return sanitized ?? null;
    } catch (error) {
        console.warn('Failed to parse projection settings from storage', error);
        return null;
    }
};

export const persistProjectionSettings = (
    storage: Storage | undefined,
    settings: ProjectionSettings,
): void => {
    if (!storage) {
        return;
    }

    const payload: StoredProjectionSettings = {
        version: CURRENT_VERSION,
        settings,
    };

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist projection settings', error);
    }
};

export const getInitialProjectionSettings = (storage: Storage | undefined): ProjectionSettings =>
    loadProjectionSettings(storage) ?? DEFAULT_PROJECTION_SETTINGS;
