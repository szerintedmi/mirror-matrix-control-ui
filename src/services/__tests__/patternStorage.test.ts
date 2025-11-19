// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
    loadLegacyPatterns,
    persistLegacyPatterns,
    removeLegacyPattern,
} from '../legacyPatternStorage';

import type { LegacyPattern } from '../../types';

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

const STORAGE_KEY = 'mirror:patterns';

const createPattern = (overrides?: Partial<LegacyPattern>): LegacyPattern => ({
    id: 'pattern-1',
    name: 'Example Pattern',
    canvas: { width: 256, height: 256 },
    tiles: [
        {
            id: 'tile-1',
            center: { x: 5, y: 5 },
            size: { width: 1, height: 1 },
        },
    ],
    createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2025-01-02T00:00:00.000Z').toISOString(),
    ...overrides,
});

describe('legacyPatternStorage', () => {
    it('returns empty list when nothing is stored', () => {
        const storage = new MemoryStorage();
        expect(loadLegacyPatterns(storage)).toEqual([]);
    });

    it('persists and reloads patterns', () => {
        const storage = new MemoryStorage();
        const pattern = createPattern();

        persistLegacyPatterns(storage, [pattern]);

        const raw = storage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();

        const reloaded = loadLegacyPatterns(storage);
        expect(reloaded).toHaveLength(1);
        expect(reloaded[0]).toEqual(pattern);
    });

    it('filters out malformed patterns when loading', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 1,
                patterns: [
                    {
                        id: 'good-pattern',
                        name: 'Valid',
                        canvas: { width: 100, height: 100 },
                        tiles: [
                            {
                                id: 'tile-123',
                                center: { x: 10, y: 10 },
                                size: { width: 5, height: 5 },
                            },
                        ],
                        createdAt: '2025-01-01T00:00:00.000Z',
                        updatedAt: '2025-01-01T02:00:00.000Z',
                    },
                    {
                        id: 'missing-name',
                        canvas: { width: 10, height: 10 },
                        tiles: [],
                        createdAt: '2025-01-01T00:00:00.000Z',
                        updatedAt: '2025-01-01T00:00:00.000Z',
                    },
                ],
            }),
        );

        const loaded = loadLegacyPatterns(storage);
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
        expect(loadLegacyPatterns(storage)).toEqual([]);

        storage.setItem(STORAGE_KEY, '{not-json');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(loadLegacyPatterns(storage)).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
            'Failed to parse pattern storage',
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
            tiles: [],
        });

        persistLegacyPatterns(storage, [patternA, patternB]);
        removeLegacyPattern(storage, 'a');

        const loaded = loadLegacyPatterns(storage);
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe('b');
    });
});
