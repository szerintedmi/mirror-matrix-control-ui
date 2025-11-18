import type { PlaybackSequence } from '@/types';

const STORAGE_KEY = 'mirror:playback:sequences';
const STORAGE_VERSION = 1;

interface StoredPayload {
    version: number;
    sequences: PlaybackSequence[];
}

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const parseSequence = (input: unknown): PlaybackSequence | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<PlaybackSequence>;
    if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.name)) {
        return null;
    }
    if (!isNonEmptyString(candidate.createdAt) || !isNonEmptyString(candidate.updatedAt)) {
        return null;
    }
    if (!Array.isArray(candidate.patternIds)) {
        return null;
    }
    const patternIds = candidate.patternIds.filter((id): id is string => isNonEmptyString(id));
    return {
        id: candidate.id,
        name: candidate.name,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        patternIds,
    };
};

export const loadPlaybackSequences = (storage: Storage | undefined): PlaybackSequence[] => {
    if (!storage) {
        return [];
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw) as Partial<StoredPayload>;
        if (!parsed || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) {
            return [];
        }
        if (!Array.isArray(parsed.sequences)) {
            return [];
        }
        const sequences: PlaybackSequence[] = [];
        parsed.sequences.forEach((entry) => {
            const parsedEntry = parseSequence(entry);
            if (parsedEntry) {
                sequences.push(parsedEntry);
            }
        });
        return sequences;
    } catch (error) {
        console.warn('Failed to parse playback sequence storage', error);
        return [];
    }
};

const serializeSequence = (sequence: PlaybackSequence): PlaybackSequence => ({
    id: sequence.id,
    name: sequence.name,
    createdAt: sequence.createdAt,
    updatedAt: sequence.updatedAt,
    patternIds: sequence.patternIds,
});

const writeSequences = (storage: Storage | undefined, sequences: PlaybackSequence[]): void => {
    if (!storage) {
        return;
    }
    const payload: StoredPayload = {
        version: STORAGE_VERSION,
        sequences: sequences.map(serializeSequence),
    };
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist playback sequence storage', error);
    }
};

export const persistPlaybackSequences = (
    storage: Storage | undefined,
    sequences: PlaybackSequence[],
): void => {
    writeSequences(storage, sequences);
};

export const upsertPlaybackSequence = (
    storage: Storage | undefined,
    sequence: PlaybackSequence,
): PlaybackSequence[] => {
    const existing = loadPlaybackSequences(storage);
    const existingIndex = existing.findIndex((entry) => entry.id === sequence.id);
    const next =
        existingIndex === -1
            ? [...existing, sequence]
            : existing.map((entry, index) => (index === existingIndex ? sequence : entry));
    writeSequences(storage, next);
    return next;
};

export const removePlaybackSequence = (
    storage: Storage | undefined,
    sequenceId: string,
): PlaybackSequence[] => {
    const existing = loadPlaybackSequences(storage);
    const next = existing.filter((entry) => entry.id !== sequenceId);
    writeSequences(storage, next);
    return next;
};
