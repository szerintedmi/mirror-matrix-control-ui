// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_BLOB_PARAMS,
    DEFAULT_DETECTION_SETTINGS,
    DETECTION_SETTINGS_STORAGE_KEY,
    DETECTION_SETTINGS_PROFILES_STORAGE_KEY,
    clearDetectionSettings,
    loadDetectionSettings,
    loadSavedDetectionSettingsProfiles,
    persistDetectionSettings,
    saveDetectionSettingsProfile,
} from '../detectionSettingsStorage';

import type { DetectionSettings } from '../detectionSettingsStorage';

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

const createExampleSettings = (): DetectionSettings => ({
    camera: {
        deviceId: 'camera-42',
        resolutionId: '1080p',
    },
    roi: {
        enabled: true,
        x: 0.1,
        y: 0.2,
        width: 0.5,
        height: 0.4,
        lastCaptureWidth: 1920,
        lastCaptureHeight: 1080,
    },
    processing: {
        brightness: 0.7,
        contrast: 1.05,
        claheClipLimit: 3,
        claheTileGridSize: 10,
        rotationDegrees: 5,
    },
    blobParams: {
        ...DEFAULT_BLOB_PARAMS,
        minArea: 1800,
        maxArea: 6000,
    },
    useWasmDetector: true,
});

describe('detectionSettingsStorage', () => {
    it('returns null when no settings are saved', () => {
        const storage = new MemoryStorage();
        expect(loadDetectionSettings(storage)).toBeNull();
    });

    it('persists and reloads detection settings', () => {
        const storage = new MemoryStorage();
        const settings = createExampleSettings();

        persistDetectionSettings(storage, settings);

        const reloaded = loadDetectionSettings(storage);
        expect(reloaded).toEqual(settings);
    });

    it('ignores payloads with invalid schema or version', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            DETECTION_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                version: 99,
                settings: DEFAULT_DETECTION_SETTINGS,
            }),
        );
        expect(loadDetectionSettings(storage)).toBeNull();

        storage.setItem(DETECTION_SETTINGS_STORAGE_KEY, '{not-json}');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(loadDetectionSettings(storage)).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            'Failed to parse detection settings',
            expect.any(SyntaxError),
        );
        warnSpy.mockRestore();
    });

    it('clearDetectionSettings removes persisted data', () => {
        const storage = new MemoryStorage();
        persistDetectionSettings(storage, createExampleSettings());
        expect(loadDetectionSettings(storage)).not.toBeNull();
        clearDetectionSettings(storage);
        expect(loadDetectionSettings(storage)).toBeNull();
    });

    it('saves and reloads detection profile records', () => {
        const storage = new MemoryStorage();
        const settings = createExampleSettings();

        const saved = saveDetectionSettingsProfile(storage, {
            name: 'Living Room',
            settings,
        });
        expect(saved).not.toBeNull();
        expect(saved).toMatchObject({
            name: 'Living Room',
            settings,
        });

        const list = loadSavedDetectionSettingsProfiles(storage);
        expect(list).toHaveLength(1);
        const entry = list[0];
        expect(entry.id).toBe(saved!.id);
        expect(entry.name).toBe(saved!.name);

        const renamed = saveDetectionSettingsProfile(storage, {
            id: entry.id,
            name: 'Living Room Updated',
            settings,
        });
        expect(renamed).not.toBeNull();
        expect(renamed!.name).toBe('Living Room Updated');
        const refreshed = loadSavedDetectionSettingsProfiles(storage);
        expect(refreshed).toHaveLength(1);
        expect(refreshed[0].name).toBe('Living Room Updated');
    });

    it('skips invalid saved profile records', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            DETECTION_SETTINGS_PROFILES_STORAGE_KEY,
            JSON.stringify({
                version: 1,
                entries: [
                    { foo: 'bar' },
                    {
                        id: 'valid',
                        name: 'Valid Profile',
                        createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
                        updatedAt: new Date('2025-01-02T00:00:00Z').toISOString(),
                        settings: createExampleSettings(),
                    },
                ],
            }),
        );
        const list = loadSavedDetectionSettingsProfiles(storage);
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe('valid');
    });
});
