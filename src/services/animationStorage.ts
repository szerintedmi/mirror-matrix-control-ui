import type {
    Animation,
    AnimationPath,
    AnimationWaypoint,
    AnimationMode,
    IndependentModeConfig,
    SequentialModeConfig,
    MirrorPathAssignment,
    MirrorOrderStrategy,
} from '@/types/animation';
import { DEFAULT_MOTOR_SPEED_SPS } from '@/types/animation';

const STORAGE_KEY = 'mirror:animations';
const STORAGE_VERSION = 1;

interface StoredPayload {
    version: number;
    animations: Animation[];
}

// ============================================================================
// Validation Helpers
// ============================================================================

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isValidAnimationMode = (value: unknown): value is AnimationMode =>
    value === 'independent' || value === 'sequential';

const isValidMirrorOrderStrategy = (value: unknown): value is MirrorOrderStrategy =>
    value === 'row-major' || value === 'col-major' || value === 'spiral' || value === 'custom';

const parseWaypoint = (input: unknown): AnimationWaypoint | null => {
    if (!input || typeof input !== 'object') return null;
    const candidate = input as Partial<AnimationWaypoint>;

    if (!isNonEmptyString(candidate.id)) return null;
    if (!isFiniteNumber(candidate.x) || candidate.x < -1 || candidate.x > 1) return null;
    if (!isFiniteNumber(candidate.y) || candidate.y < -1 || candidate.y > 1) return null;

    return {
        id: candidate.id,
        x: candidate.x,
        y: candidate.y,
    };
};

const parsePath = (input: unknown): AnimationPath | null => {
    if (!input || typeof input !== 'object') return null;
    const candidate = input as Partial<AnimationPath>;

    if (!isNonEmptyString(candidate.id)) return null;
    if (!isNonEmptyString(candidate.name)) return null;
    if (!Array.isArray(candidate.waypoints)) return null;

    const waypoints: AnimationWaypoint[] = [];
    for (const wp of candidate.waypoints) {
        const parsed = parseWaypoint(wp);
        if (parsed) waypoints.push(parsed);
    }

    return {
        id: candidate.id,
        name: candidate.name,
        waypoints,
    };
};

const parseMirrorPathAssignment = (input: unknown): MirrorPathAssignment | null => {
    if (!input || typeof input !== 'object') return null;
    const candidate = input as Partial<MirrorPathAssignment>;

    if (!isNonEmptyString(candidate.mirrorId)) return null;
    if (!isFiniteNumber(candidate.row) || candidate.row < 0) return null;
    if (!isFiniteNumber(candidate.col) || candidate.col < 0) return null;
    if (!isNonEmptyString(candidate.pathId)) return null;

    return {
        mirrorId: candidate.mirrorId,
        row: candidate.row,
        col: candidate.col,
        pathId: candidate.pathId,
    };
};

const parseIndependentConfig = (input: unknown): IndependentModeConfig | null => {
    if (!input || typeof input !== 'object') return null;
    const candidate = input as Partial<IndependentModeConfig>;

    if (!Array.isArray(candidate.assignments)) return null;

    const assignments: MirrorPathAssignment[] = [];
    for (const assignment of candidate.assignments) {
        const parsed = parseMirrorPathAssignment(assignment);
        if (parsed) assignments.push(parsed);
    }

    return { assignments };
};

const parseSequentialConfig = (input: unknown): SequentialModeConfig | null => {
    if (!input || typeof input !== 'object') return null;
    const candidate = input as Partial<SequentialModeConfig>;

    if (!isNonEmptyString(candidate.pathId)) return null;
    if (!isFiniteNumber(candidate.offsetMs) || candidate.offsetMs < 0) return null;
    if (!isValidMirrorOrderStrategy(candidate.orderBy)) return null;

    const result: SequentialModeConfig = {
        pathId: candidate.pathId,
        offsetMs: candidate.offsetMs,
        orderBy: candidate.orderBy,
    };

    if (candidate.orderBy === 'custom' && Array.isArray(candidate.customOrder)) {
        result.customOrder = candidate.customOrder.filter(isNonEmptyString);
    }

    return result;
};

const parseAnimation = (input: unknown): Animation | null => {
    if (!input || typeof input !== 'object') return null;
    const candidate = input as Partial<Animation>;

    if (!isNonEmptyString(candidate.id)) return null;
    if (!isNonEmptyString(candidate.name)) return null;
    if (!isNonEmptyString(candidate.createdAt)) return null;
    if (!isNonEmptyString(candidate.updatedAt)) return null;
    if (!isValidAnimationMode(candidate.mode)) return null;
    if (!Array.isArray(candidate.paths)) return null;

    const paths: AnimationPath[] = [];
    for (const path of candidate.paths) {
        const parsed = parsePath(path);
        if (parsed) paths.push(parsed);
    }

    const animation: Animation = {
        id: candidate.id,
        name: candidate.name,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        mode: candidate.mode,
        paths,
        defaultSpeedSps: isFiniteNumber(candidate.defaultSpeedSps)
            ? Math.max(500, Math.min(4000, candidate.defaultSpeedSps))
            : DEFAULT_MOTOR_SPEED_SPS,
    };

    if (candidate.mode === 'independent' && candidate.independentConfig) {
        animation.independentConfig =
            parseIndependentConfig(candidate.independentConfig) ?? undefined;
    }

    if (candidate.mode === 'sequential' && candidate.sequentialConfig) {
        animation.sequentialConfig = parseSequentialConfig(candidate.sequentialConfig) ?? undefined;
    }

    return animation;
};

// ============================================================================
// Storage API
// ============================================================================

export const loadAnimations = (storage: Storage | undefined): Animation[] => {
    if (!storage) return [];

    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as Partial<StoredPayload>;
        if (!parsed || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) {
            return [];
        }
        if (!Array.isArray(parsed.animations)) {
            return [];
        }

        const animations: Animation[] = [];
        for (const entry of parsed.animations) {
            const animation = parseAnimation(entry);
            if (animation) animations.push(animation);
        }
        return animations;
    } catch (error) {
        console.warn('Failed to parse animation storage', error);
        return [];
    }
};

const writeAnimations = (storage: Storage | undefined, animations: Animation[]): void => {
    if (!storage) return;

    const payload: StoredPayload = {
        version: STORAGE_VERSION,
        animations,
    };

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist animation storage', error);
    }
};

export const saveAnimation = (storage: Storage | undefined, animation: Animation): Animation[] => {
    const existing = loadAnimations(storage);
    const index = existing.findIndex((a) => a.id === animation.id);

    const next =
        index === -1
            ? [...existing, animation]
            : existing.map((a, i) => (i === index ? animation : a));

    writeAnimations(storage, next);
    return next;
};

export const deleteAnimation = (storage: Storage | undefined, animationId: string): Animation[] => {
    const existing = loadAnimations(storage);
    const next = existing.filter((a) => a.id !== animationId);
    writeAnimations(storage, next);
    return next;
};

export const getAnimation = (
    storage: Storage | undefined,
    animationId: string,
): Animation | null => {
    const animations = loadAnimations(storage);
    return animations.find((a) => a.id === animationId) ?? null;
};

// ============================================================================
// Factory Helpers
// ============================================================================

export const createAnimationId = (): string => `anim-${globalThis.crypto.randomUUID()}`;

export const createPathId = (): string => `path-${globalThis.crypto.randomUUID()}`;

export const createWaypointId = (): string =>
    `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createEmptyAnimation = (name: string, mode: AnimationMode): Animation => {
    const now = new Date().toISOString();
    return {
        id: createAnimationId(),
        name,
        createdAt: now,
        updatedAt: now,
        mode,
        paths: [],
        defaultSpeedSps: DEFAULT_MOTOR_SPEED_SPS,
        ...(mode === 'independent' && { independentConfig: { assignments: [] } }),
        ...(mode === 'sequential' && {
            sequentialConfig: { pathId: '', offsetMs: 100, orderBy: 'row-major' as const },
        }),
    };
};

export const createEmptyPath = (name: string): AnimationPath => ({
    id: createPathId(),
    name,
    waypoints: [],
});
