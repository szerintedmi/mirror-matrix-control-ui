// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { PlaybackSequence } from '@/types';

import {
    loadPlaybackSequences,
    persistPlaybackSequences,
    removePlaybackSequence,
    upsertPlaybackSequence,
} from '../playbackSequenceStorage';

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

const STORAGE_KEY = 'mirror:playback:sequences';

const createSequence = (overrides?: Partial<PlaybackSequence>): PlaybackSequence => ({
    id: 'sequence-1',
    name: 'Sequence 1',
    createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    patternIds: ['a', 'b', 'c'],
    ...overrides,
});

describe('playbackSequenceStorage', () => {
    it('returns an empty list when storage is absent or empty', () => {
        const storage = new MemoryStorage();
        expect(loadPlaybackSequences(storage)).toEqual([]);
    });

    it('persists and loads sequences', () => {
        const storage = new MemoryStorage();
        const sequence = createSequence();

        persistPlaybackSequences(storage, [sequence]);

        const raw = storage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();

        const loaded = loadPlaybackSequences(storage);
        expect(loaded).toHaveLength(1);
        expect(loaded[0]).toEqual(sequence);
    });

    it('ignores malformed entries while loading', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 1,
                sequences: [
                    createSequence({ id: 'valid', name: 'Valid' }),
                    { id: '', name: 'bad', patternIds: ['a'] },
                    { id: 'missing-patterns', name: 'Bad 2' },
                ],
            }),
        );

        const loaded = loadPlaybackSequences(storage);
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe('valid');
    });

    it('drops payloads on version mismatch or parse error', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 99,
                sequences: [],
            }),
        );
        expect(loadPlaybackSequences(storage)).toEqual([]);

        storage.setItem(STORAGE_KEY, '{oops');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(loadPlaybackSequences(storage)).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
            'Failed to parse playback sequence storage',
            expect.any(SyntaxError),
        );
        warnSpy.mockRestore();
    });

    it('upserts and removes sequences', () => {
        const storage = new MemoryStorage();
        const sequenceA = createSequence({ id: 'a' });
        const sequenceB = createSequence({ id: 'b', name: 'Seq B', patternIds: [] });

        const saved = upsertPlaybackSequence(storage, sequenceA);
        expect(saved).toHaveLength(1);
        expect(saved[0].id).toBe('a');

        const savedAgain = upsertPlaybackSequence(storage, sequenceB);
        expect(savedAgain).toHaveLength(2);

        const updated = upsertPlaybackSequence(storage, { ...sequenceB, name: 'Seq B updated' });
        expect(updated.find((entry) => entry.id === 'b')?.name).toBe('Seq B updated');

        const remaining = removePlaybackSequence(storage, 'a');
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe('b');
    });
});
