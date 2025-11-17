import type { Pattern } from '../types';

const STORAGE_KEY = 'mirror:calibration-patterns';
const CURRENT_VERSION = 1;

interface StoredPatternPoint {
    id: string;
    x: number;
    y: number;
}

interface StoredPattern {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    points: StoredPatternPoint[];
}

interface StoredPayload {
    version: number;
    patterns: StoredPattern[];
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const parsePoint = (input: unknown): StoredPatternPoint | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<StoredPatternPoint>;
    if (!isNonEmptyString(candidate.id)) {
        return null;
    }
    if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) {
        return null;
    }
    if (candidate.x < 0 || candidate.x > 1 || candidate.y < 0 || candidate.y > 1) {
        return null;
    }
    return {
        id: candidate.id,
        x: candidate.x,
        y: candidate.y,
    };
};

const parsePattern = (input: unknown): Pattern | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<StoredPattern>;
    if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.name)) {
        return null;
    }
    if (!isNonEmptyString(candidate.createdAt) || !isNonEmptyString(candidate.updatedAt)) {
        return null;
    }

    const points: StoredPatternPoint[] = [];
    if (Array.isArray(candidate.points)) {
        for (const pointInput of candidate.points) {
            const parsed = parsePoint(pointInput);
            if (parsed) {
                points.push(parsed);
            }
        }
    }

    return {
        id: candidate.id,
        name: candidate.name,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        points,
    };
};

export const loadPatterns = (storage: Storage | undefined): Pattern[] => {
    if (!storage) {
        return [];
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw) as Partial<StoredPayload>;
        if (!parsed || typeof parsed !== 'object' || parsed.version !== CURRENT_VERSION) {
            return [];
        }
        if (!Array.isArray(parsed.patterns)) {
            return [];
        }
        const patterns: Pattern[] = [];
        for (const candidate of parsed.patterns) {
            const pattern = parsePattern(candidate);
            if (pattern) {
                patterns.push(pattern);
            }
        }
        return patterns;
    } catch (error) {
        console.warn('Failed to parse calibration-native pattern storage', error);
        return [];
    }
};

const serializePattern = (pattern: Pattern): StoredPattern => ({
    id: pattern.id,
    name: pattern.name,
    createdAt: pattern.createdAt,
    updatedAt: pattern.updatedAt,
    points: pattern.points.map((point) => ({
        id: point.id,
        x: point.x,
        y: point.y,
    })),
});

const writePatterns = (storage: Storage | undefined, patterns: Pattern[]): void => {
    if (!storage) {
        return;
    }
    const payload: StoredPayload = {
        version: CURRENT_VERSION,
        patterns: patterns.map(serializePattern),
    };
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist calibration-native pattern storage', error);
    }
};

export const persistPatterns = (storage: Storage | undefined, patterns: Pattern[]): void => {
    writePatterns(storage, patterns);
};

export const removePattern = (storage: Storage | undefined, patternId: string): void => {
    if (!storage) {
        return;
    }
    const existing = loadPatterns(storage);
    const next = existing.filter((pattern) => pattern.id !== patternId);
    writePatterns(storage, next);
};
