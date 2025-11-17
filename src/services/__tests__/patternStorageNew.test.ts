import { describe, expect, it, vi } from 'vitest';

import { loadPatterns, persistPatterns, removePattern } from '../patternStorage';

import type { Pattern } from '../../types';

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

const STORAGE_KEY = 'mirror:calibration-patterns';

const createPattern = (overrides?: Partial<Pattern>): Pattern => ({
    id: 'pattern-1',
    name: 'Pattern',
    createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2025-01-02T00:00:00.000Z').toISOString(),
    points: [
        {
            id: 'point-1',
            x: 0,
            y: 0,
        },
    ],
    ...overrides,
});

describe('patternStorage (new patterns)', () => {
    it('returns empty list when nothing is stored', () => {
        const storage = new MemoryStorage();
        expect(loadPatterns(storage)).toEqual([]);
    });

    it('persists and reloads patterns', () => {
        const storage = new MemoryStorage();
        const pattern = createPattern();

        persistPatterns(storage, [pattern]);

        const raw = storage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();

        const reloaded = loadPatterns(storage);
        expect(reloaded).toHaveLength(1);
        expect(reloaded[0]).toEqual(pattern);
    });

    it('filters out malformed patterns when loading', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 2,
                patterns: [
                    {
                        id: 'good-pattern',
                        name: 'Valid',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        updatedAt: '2025-01-01T02:00:00.000Z',
                        points: [
                            {
                                id: 'point-1',
                                x: -0.2,
                                y: 0.4,
                            },
                        ],
                    },
                    {
                        id: 'missing-name',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        updatedAt: '2025-01-01T02:00:00.000Z',
                        points: [],
                    },
                ],
            }),
        );

        const loaded = loadPatterns(storage);
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe('good-pattern');
    });

    it('drops storage when version mismatches or payload is invalid', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 99,
                patterns: [],
            }),
        );
        expect(loadPatterns(storage)).toEqual([]);

        storage.setItem(STORAGE_KEY, '{not-json');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(loadPatterns(storage)).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
            'Failed to parse calibration-native pattern storage',
            expect.any(SyntaxError),
        );
        warnSpy.mockRestore();
    });

    it('removePattern deletes a persisted entry', () => {
        const storage = new MemoryStorage();
        const patternA = createPattern({ id: 'a', name: 'A' });
        const patternB = createPattern({
            id: 'b',
            name: 'B',
            points: [],
        });

        persistPatterns(storage, [patternA, patternB]);
        removePattern(storage, 'a');

        const loaded = loadPatterns(storage);
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe('b');
    });
});
