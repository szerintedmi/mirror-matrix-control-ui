import type { Pattern, PatternCanvas, PatternTile } from '../types';

const STORAGE_KEY = 'mirror:patterns';
const CURRENT_VERSION = 1;

interface StoredPatternTile {
    id: string;
    center: { x: number; y: number };
    size: { width: number; height: number };
}

interface StoredPattern {
    id: string;
    name: string;
    canvas: PatternCanvas;
    tiles: StoredPatternTile[];
    createdAt: string;
    updatedAt: string;
}

interface StoredPayload {
    version: number;
    patterns: StoredPattern[];
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const parseCanvas = (input: unknown): PatternCanvas | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<PatternCanvas>;
    if (!isFiniteNumber(candidate.width) || !isFiniteNumber(candidate.height)) {
        return null;
    }
    if (candidate.width <= 0 || candidate.height <= 0) {
        return null;
    }
    return {
        width: candidate.width,
        height: candidate.height,
    };
};

const parseTile = (input: unknown): PatternTile | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<StoredPatternTile>;
    if (!isNonEmptyString(candidate.id)) {
        return null;
    }
    const center = candidate.center;
    if (!center || typeof center !== 'object') {
        return null;
    }
    const size = candidate.size;
    if (!size || typeof size !== 'object') {
        return null;
    }
    const parsedCenter = center as { x?: unknown; y?: unknown };
    const parsedSize = size as { width?: unknown; height?: unknown };
    if (
        !isFiniteNumber(parsedCenter.x) ||
        !isFiniteNumber(parsedCenter.y) ||
        !isFiniteNumber(parsedSize.width) ||
        !isFiniteNumber(parsedSize.height)
    ) {
        return null;
    }
    if (parsedSize.width <= 0 || parsedSize.height <= 0) {
        return null;
    }
    return {
        id: candidate.id,
        center: {
            x: parsedCenter.x,
            y: parsedCenter.y,
        },
        size: {
            width: parsedSize.width,
            height: parsedSize.height,
        },
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
    const canvas = parseCanvas(candidate.canvas);
    if (!canvas) {
        return null;
    }
    const tiles: PatternTile[] = [];
    if (Array.isArray(candidate.tiles)) {
        for (const tileInput of candidate.tiles) {
            const tile = parseTile(tileInput);
            if (tile) {
                tiles.push(tile);
            }
        }
    }
    return {
        id: candidate.id,
        name: candidate.name,
        canvas,
        tiles,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
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
        console.warn('Failed to parse pattern storage', error);
        return [];
    }
};

const serializePattern = (pattern: Pattern): StoredPattern => ({
    id: pattern.id,
    name: pattern.name,
    canvas: {
        width: pattern.canvas.width,
        height: pattern.canvas.height,
    },
    tiles: pattern.tiles.map((tile) => ({
        id: tile.id,
        center: { x: tile.center.x, y: tile.center.y },
        size: { width: tile.size.width, height: tile.size.height },
    })),
    createdAt: pattern.createdAt,
    updatedAt: pattern.updatedAt,
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
        console.warn('Failed to persist pattern storage', error);
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
