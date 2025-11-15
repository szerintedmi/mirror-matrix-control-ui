import { describe, expect, it, vi } from 'vitest';

import {
    bootstrapGridSnapshots,
    getGridStateFingerprint,
    getLastSelectedSnapshotName,
    listGridSnapshotMetadata,
    loadGridState,
    loadNamedGridSnapshot,
    persistGridState,
    persistLastSelectedSnapshotName,
    persistNamedGridSnapshot,
} from '../gridStorage';

import type { MirrorAssignment, MirrorConfig } from '../../types';

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

const STORAGE_KEY = 'mirror:grid-config';

const createAssignment = (mac: string, motorIndex: number): MirrorAssignment => ({
    x: { nodeMac: mac, motorIndex },
    y: null,
});

const createMirrorConfig = (mac: string): MirrorConfig => {
    const config: MirrorConfig = new Map();
    config.set('0-0', createAssignment(mac, 1));
    return config;
};

describe('gridStorage snapshot collection', () => {
    it('returns null when nothing is stored', () => {
        const storage = new MemoryStorage();
        expect(loadGridState(storage)).toBeNull();
        expect(listGridSnapshotMetadata(storage)).toHaveLength(0);
    });

    it('persists and reloads snapshots by name', () => {
        const storage = new MemoryStorage();
        const mirrorConfig = createMirrorConfig('aa:bb');

        persistNamedGridSnapshot(storage, 'Main', {
            gridSize: { rows: 4, cols: 5 },
            mirrorConfig,
        });

        const reloaded = loadNamedGridSnapshot(storage, 'Main');
        expect(reloaded).not.toBeNull();
        expect(reloaded?.gridSize).toEqual({ rows: 4, cols: 5 });
        expect(reloaded?.mirrorConfig.get('0-0')).toEqual(mirrorConfig.get('0-0'));
    });

    it('bootstraps metadata sorted alphabetically while respecting last selection', () => {
        const storage = new MemoryStorage();
        persistNamedGridSnapshot(storage, 'Gamma', {
            gridSize: { rows: 2, cols: 2 },
            mirrorConfig: createMirrorConfig('cc:dd'),
        });
        persistNamedGridSnapshot(storage, 'Alpha', {
            gridSize: { rows: 3, cols: 3 },
            mirrorConfig: createMirrorConfig('aa:bb'),
        });
        persistNamedGridSnapshot(storage, 'beta', {
            gridSize: { rows: 5, cols: 5 },
            mirrorConfig: createMirrorConfig('ee:ff'),
        });

        persistLastSelectedSnapshotName(storage, 'Gamma');

        const bootstrap = bootstrapGridSnapshots(storage);
        expect(bootstrap.metadata.map((entry) => entry.name)).toEqual(['Alpha', 'beta', 'Gamma']);
        expect(bootstrap.selectedName).toBe('Gamma');
        expect(bootstrap.snapshot?.gridSize).toEqual({ rows: 2, cols: 2 });
    });

    it('falls back to the first alphabetical snapshot when last selected is missing', () => {
        const storage = new MemoryStorage();
        persistNamedGridSnapshot(storage, 'Bravo', {
            gridSize: { rows: 3, cols: 3 },
            mirrorConfig: createMirrorConfig('11:22'),
        });
        persistNamedGridSnapshot(storage, 'Alpha', {
            gridSize: { rows: 6, cols: 6 },
            mirrorConfig: createMirrorConfig('33:44'),
        });

        persistLastSelectedSnapshotName(storage, 'Nonexistent');

        const loaded = loadGridState(storage);
        expect(loaded?.gridSize).toEqual({ rows: 6, cols: 6 });
    });

    it('creates deterministic fingerprints irrespective of insertion order', () => {
        const baseAssignment: MirrorAssignment = {
            x: { nodeMac: 'aa:bb', motorIndex: 1 },
            y: { nodeMac: 'cc:dd', motorIndex: 2 },
        };
        const first: MirrorConfig = new Map();
        first.set('1-0', baseAssignment);
        first.set('0-0', baseAssignment);

        const second: MirrorConfig = new Map();
        second.set('0-0', baseAssignment);
        second.set('1-0', baseAssignment);

        const snapshotA = { gridSize: { rows: 2, cols: 2 }, mirrorConfig: first };
        const snapshotB = { gridSize: { rows: 2, cols: 2 }, mirrorConfig: second };

        expect(getGridStateFingerprint(snapshotA)).toEqual(getGridStateFingerprint(snapshotB));
    });

    it('stores default snapshots via persistGridState', () => {
        const storage = new MemoryStorage();
        persistGridState(storage, {
            gridSize: { rows: 3, cols: 3 },
            mirrorConfig: createMirrorConfig('44:55'),
        });

        const raw = storage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();
        const parsed = raw ? JSON.parse(raw) : null;
        expect(parsed).toMatchObject({
            version: 1,
            snapshots: {
                'Default Snapshot': expect.any(Object),
            },
        });
    });

    it('updates the last selected snapshot name', () => {
        const storage = new MemoryStorage();
        persistNamedGridSnapshot(storage, 'Bravo', {
            gridSize: { rows: 3, cols: 3 },
            mirrorConfig: new Map(),
        });
        persistNamedGridSnapshot(storage, 'Alpha', {
            gridSize: { rows: 4, cols: 4 },
            mirrorConfig: new Map(),
        });

        expect(getLastSelectedSnapshotName(storage)).toBe('Alpha');

        persistLastSelectedSnapshotName(storage, 'Bravo');
        expect(getLastSelectedSnapshotName(storage)).toBe('Bravo');
    });

    it('swallows invalid JSON payloads and logs warnings', () => {
        const storage = new MemoryStorage();
        storage.setItem(STORAGE_KEY, '{ invalid json');

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(loadGridState(storage)).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            'Failed to load grid state from storage',
            expect.any(SyntaxError),
        );
        warnSpy.mockRestore();
    });
});
