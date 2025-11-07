import {
    DEFAULT_PROJECTION_SETTINGS,
    MAX_PIXEL_SPACING_M,
    MAX_PROJECTION_OFFSET_M,
    MAX_SLOPE_BLUR_SIGMA_DEG,
    MAX_SUN_ANGULAR_DIAMETER_DEG,
    MAX_WALL_ANGLE_DEG,
    MAX_WALL_DISTANCE_M,
    MIN_PIXEL_SPACING_M,
    MIN_PROJECTION_OFFSET_M,
    MIN_SLOPE_BLUR_SIGMA_DEG,
    MIN_SUN_ANGULAR_DIAMETER_DEG,
    MIN_WALL_ANGLE_DEG,
    MIN_WALL_DISTANCE_M,
} from '../constants/projection';
import {
    type OrientationBasis,
    anglesToVector,
    cloneOrientationState,
    normalizeVec3,
    vectorToAngles,
} from '../utils/orientation';

import type { OrientationState, ProjectionSettings, Vec3 } from '../types';

const STORAGE_KEY = 'mirror:projection-settings';
const CURRENT_VERSION = 2;

interface StoredProjectionSettingsV2 {
    version: 2;
    settings: ProjectionSettings;
}

interface LegacyProjectionSettingsV1 {
    wallDistance: number;
    wallAngleHorizontal: number;
    wallAngleVertical: number;
    lightAngleHorizontal: number;
    lightAngleVertical: number;
}

type StoredProjectionSettings =
    | StoredProjectionSettingsV2
    | (LegacyProjectionSettingsV1 & { version: 1 });

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const sanitizeNumber = (value: unknown, fallback: number, min: number, max: number): number => {
    if (!isFiniteNumber(value)) {
        return fallback;
    }
    return clamp(value, min, max);
};

const sanitizeVec3 = (vector: unknown, fallback: Vec3): Vec3 => {
    if (
        !vector ||
        typeof vector !== 'object' ||
        !isFiniteNumber((vector as Vec3).x) ||
        !isFiniteNumber((vector as Vec3).y) ||
        !isFiniteNumber((vector as Vec3).z)
    ) {
        return { ...fallback };
    }
    return { ...(vector as Vec3) };
};

const sanitizeOrientationState = (
    input: OrientationState | null | undefined,
    fallback: OrientationState,
    basis: OrientationBasis,
): OrientationState => {
    if (!input) {
        return cloneOrientationState(fallback);
    }

    const mode: 'angles' | 'vector' = input.mode === 'vector' ? 'vector' : 'angles';
    const yaw = sanitizeNumber(input.yaw, fallback.yaw, -180, 180);
    const pitch = sanitizeNumber(input.pitch, fallback.pitch, -90, 90);
    const vector = sanitizeVec3(input.vector, fallback.vector);

    if (mode === 'angles') {
        return {
            mode,
            yaw,
            pitch,
            vector: anglesToVector(yaw, pitch, basis),
        };
    }

    const normalized = normalizeVec3(vector);
    const { yaw: derivedYaw, pitch: derivedPitch } = vectorToAngles(normalized, basis);
    return {
        mode,
        yaw: derivedYaw,
        pitch: derivedPitch,
        vector: normalized,
    };
};

const sanitizeSettings = (
    input: Partial<ProjectionSettings> | null | undefined,
): ProjectionSettings | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const base = DEFAULT_PROJECTION_SETTINGS;
    const wallDistance = sanitizeNumber(
        input.wallDistance,
        base.wallDistance,
        MIN_WALL_DISTANCE_M,
        MAX_WALL_DISTANCE_M,
    );
    const projectionOffset = sanitizeNumber(
        input.projectionOffset,
        base.projectionOffset,
        MIN_PROJECTION_OFFSET_M,
        MAX_PROJECTION_OFFSET_M,
    );
    const pixelSpacing = {
        x: sanitizeNumber(
            input.pixelSpacing?.x,
            base.pixelSpacing.x,
            MIN_PIXEL_SPACING_M,
            MAX_PIXEL_SPACING_M,
        ),
        y: sanitizeNumber(
            input.pixelSpacing?.y,
            base.pixelSpacing.y,
            MIN_PIXEL_SPACING_M,
            MAX_PIXEL_SPACING_M,
        ),
    };
    const sunAngularDiameterDeg = sanitizeNumber(
        input.sunAngularDiameterDeg,
        base.sunAngularDiameterDeg,
        MIN_SUN_ANGULAR_DIAMETER_DEG,
        MAX_SUN_ANGULAR_DIAMETER_DEG,
    );
    const slopeBlurSigmaDeg = sanitizeNumber(
        input.slopeBlurSigmaDeg,
        base.slopeBlurSigmaDeg,
        MIN_SLOPE_BLUR_SIGMA_DEG,
        MAX_SLOPE_BLUR_SIGMA_DEG,
    );

    const wallOrientation = sanitizeOrientationState(
        input.wallOrientation,
        base.wallOrientation,
        'forward',
    );
    const sunOrientation = sanitizeOrientationState(
        input.sunOrientation,
        base.sunOrientation,
        'forward',
    );
    const worldUpOrientation = sanitizeOrientationState(
        input.worldUpOrientation,
        base.worldUpOrientation,
        'up',
    );

    return {
        wallDistance,
        projectionOffset,
        pixelSpacing,
        sunAngularDiameterDeg,
        slopeBlurSigmaDeg,
        wallOrientation,
        sunOrientation,
        worldUpOrientation,
    };
};

const upgradeLegacySettings = (legacy: LegacyProjectionSettingsV1): ProjectionSettings => {
    const base = DEFAULT_PROJECTION_SETTINGS;
    const wallYaw = clamp(legacy.wallAngleHorizontal, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG);
    const wallPitch = clamp(legacy.wallAngleVertical, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG);
    const sunYaw = clamp(legacy.lightAngleHorizontal, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG);
    const sunPitch = clamp(legacy.lightAngleVertical, MIN_WALL_ANGLE_DEG, MAX_WALL_ANGLE_DEG);

    return {
        ...base,
        wallDistance: clamp(legacy.wallDistance, MIN_WALL_DISTANCE_M, MAX_WALL_DISTANCE_M),
        wallOrientation: {
            mode: 'angles',
            yaw: wallYaw,
            pitch: wallPitch,
            vector: anglesToVector(wallYaw, wallPitch, 'forward'),
        },
        sunOrientation: {
            mode: 'angles',
            yaw: sunYaw,
            pitch: sunPitch,
            vector: anglesToVector(sunYaw, sunPitch, 'forward'),
        },
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
        if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
            return null;
        }

        if (parsed.version === CURRENT_VERSION) {
            const sanitized = sanitizeSettings(parsed.settings ?? null);
            return sanitized ?? null;
        }

        if (parsed.version === 1) {
            return upgradeLegacySettings(parsed as LegacyProjectionSettingsV1);
        }

        return null;
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

    const payload: StoredProjectionSettingsV2 = {
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
