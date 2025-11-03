import { describe, expect, it } from 'vitest';

import { loadGridState, persistGridState } from '../gridStorage';

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
        return this.store.has(key) ? this.store.get(key) ?? null : null;
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

describe('gridStorage', () => {
    it('returns null when nothing is stored', () => {
        const storage = new MemoryStorage();
        expect(loadGridState(storage)).toBeNull();
    });

    it('persists and reloads grid size with assignments', () => {
        const storage = new MemoryStorage();
        const mirrorConfig: MirrorConfig = new Map();
        mirrorConfig.set('0-0', createAssignment('aa:bb:cc:dd:ee:ff', 1));

        persistGridState(storage, {
            gridSize: { rows: 4, cols: 5 },
            mirrorConfig,
        });

        const raw = storage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();

        const reloaded = loadGridState(storage);
        expect(reloaded).not.toBeNull();
        expect(reloaded?.gridSize).toEqual({ rows: 4, cols: 5 });
        expect(reloaded?.mirrorConfig.size).toBe(1);
        expect(reloaded?.mirrorConfig.get('0-0')).toEqual(mirrorConfig.get('0-0'));
    });

    it('ignores malformed assignments when loading', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 1,
                gridSize: { rows: 3, cols: 3 },
                assignments: {
                    '0-0': { x: { nodeMac: 'ff:ee:dd:cc:bb:aa', motorIndex: 'oops' } },
                    '1-1': { x: { nodeMac: '11:22:33:44:55:66', motorIndex: 2 } },
                },
            }),
        );

        const loaded = loadGridState(storage);
        expect(loaded).not.toBeNull();
        expect(loaded?.mirrorConfig.size).toBe(2);
        expect(loaded?.mirrorConfig.get('0-0')).toEqual({ x: null, y: null });
        expect(loaded?.mirrorConfig.get('1-1')).toEqual({
            x: { nodeMac: '11:22:33:44:55:66', motorIndex: 2 },
            y: null,
        });
    });

    it('returns null when payload is invalid JSON', () => {
        const storage = new MemoryStorage();
        storage.setItem(STORAGE_KEY, '{ invalid json');

        expect(loadGridState(storage)).toBeNull();
    });
});
