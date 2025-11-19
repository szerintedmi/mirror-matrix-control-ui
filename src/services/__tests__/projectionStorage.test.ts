// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
    DEFAULT_PROJECTION_SETTINGS,
    MAX_PIXEL_SPACING_M,
    MAX_SLOPE_BLUR_SIGMA_DEG,
    MAX_SUN_ANGULAR_DIAMETER_DEG,
    MAX_WALL_DISTANCE_M,
    MIN_PIXEL_SPACING_M,
    MIN_PROJECTION_OFFSET_M,
} from '../../constants/projection';
import { anglesToVector } from '../../utils/orientation';
import {
    getInitialProjectionSettings,
    loadProjectionSettings,
    persistProjectionSettings,
} from '../projectionStorage';

import type { ProjectionSettings } from '../../types';

const STORAGE_KEY = 'mirror:projection-settings';

class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    getItem(key: string): string | null {
        return this.store.has(key) ? (this.store.get(key) ?? null) : null;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
}

const cloneSettings = (settings: ProjectionSettings): ProjectionSettings => ({
    ...settings,
    pixelSpacing: { ...settings.pixelSpacing },
    wallOrientation: {
        ...settings.wallOrientation,
        vector: { ...settings.wallOrientation.vector },
    },
    sunOrientation: { ...settings.sunOrientation, vector: { ...settings.sunOrientation.vector } },
    worldUpOrientation: {
        ...settings.worldUpOrientation,
        vector: { ...settings.worldUpOrientation.vector },
    },
});

describe('projectionStorage', () => {
    it('returns defaults when storage is empty', () => {
        const storage = new MemoryStorage();
        expect(getInitialProjectionSettings(storage)).toEqual(DEFAULT_PROJECTION_SETTINGS);
    });

    it('persists and reloads user-modified settings', () => {
        const storage = new MemoryStorage();
        const nextSettings: ProjectionSettings = {
            ...cloneSettings(DEFAULT_PROJECTION_SETTINGS),
            wallDistance: 7,
            projectionOffset: 0.45,
            pixelSpacing: { x: 0.06, y: 0.07 },
            sunAngularDiameterDeg: 0.72,
            slopeBlurSigmaDeg: 0.5,
            wallOrientation: {
                mode: 'angles',
                yaw: 12,
                pitch: -8,
                vector: anglesToVector(12, -8, 'forward'),
            },
            sunOrientation: {
                mode: 'angles',
                yaw: -18,
                pitch: -22,
                vector: anglesToVector(-18, -22, 'forward'),
            },
            worldUpOrientation: {
                mode: 'angles',
                yaw: 5,
                pitch: -60,
                vector: anglesToVector(5, -60, 'up'),
            },
        };

        persistProjectionSettings(storage, nextSettings);
        expect(loadProjectionSettings(storage)).toEqual(nextSettings);
    });

    it('sanitizes out-of-range values', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 2,
                settings: {
                    wallDistance: 999,
                    projectionOffset: -99,
                    pixelSpacing: { x: -10, y: 10 },
                    sunAngularDiameterDeg: 99,
                    slopeBlurSigmaDeg: 7,
                    wallOrientation: {
                        mode: 'angles',
                        yaw: 400,
                        pitch: -200,
                        vector: { x: 0, y: 0, z: 0 },
                    },
                    sunOrientation: {
                        mode: 'vector',
                        yaw: 0,
                        pitch: 0,
                        vector: { x: 0, y: 0, z: 0 },
                    },
                    worldUpOrientation: {
                        mode: 'vector',
                        yaw: 0,
                        pitch: 0,
                        vector: { x: 0, y: 0, z: 0 },
                    },
                },
            }),
        );

        const loaded = loadProjectionSettings(storage);
        expect(loaded).not.toBeNull();
        expect(loaded?.wallDistance).toBe(MAX_WALL_DISTANCE_M);
        expect(loaded?.projectionOffset).toBe(MIN_PROJECTION_OFFSET_M);
        expect(loaded?.pixelSpacing.x).toBeCloseTo(MIN_PIXEL_SPACING_M);
        expect(loaded?.pixelSpacing.y).toBeCloseTo(MAX_PIXEL_SPACING_M);
        expect(loaded?.sunAngularDiameterDeg).toBe(MAX_SUN_ANGULAR_DIAMETER_DEG);
        expect(loaded?.slopeBlurSigmaDeg).toBe(MAX_SLOPE_BLUR_SIGMA_DEG);
        expect(loaded?.wallOrientation.yaw).toBe(180);
        expect(loaded?.wallOrientation.pitch).toBe(-90);
    });

    it('upgrades legacy version-1 payloads', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 1,
                wallDistance: 4,
                wallAngleHorizontal: 25,
                wallAngleVertical: -10,
                lightAngleHorizontal: -30,
                lightAngleVertical: -15,
            }),
        );

        const loaded = loadProjectionSettings(storage);
        expect(loaded).not.toBeNull();
        expect(loaded?.wallDistance).toBe(4);
        expect(loaded?.wallOrientation.yaw).toBe(25);
        expect(loaded?.wallOrientation.pitch).toBe(-10);
        expect(loaded?.sunOrientation.yaw).toBe(-30);
        expect(loaded?.sunOrientation.pitch).toBe(-15);
        expect(loaded?.pixelSpacing).toEqual(DEFAULT_PROJECTION_SETTINGS.pixelSpacing);
    });
});
