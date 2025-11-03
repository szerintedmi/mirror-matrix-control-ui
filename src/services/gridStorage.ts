import type { MirrorAssignment, MirrorConfig } from '../types';

const STORAGE_KEY = 'mirror:grid-config';
const CURRENT_VERSION = 1;

interface SerializableAssignment {
    x: MirrorAssignment['x'];
    y: MirrorAssignment['y'];
}

interface StoredGridState {
    version: number;
    gridSize: {
        rows: number;
        cols: number;
    };
    assignments: Record<string, SerializableAssignment>;
}

const isFinitePositiveInt = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 && Number.isInteger(value);

const parseAssignment = (input: unknown): SerializableAssignment | null => {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input as Partial<SerializableAssignment>;
    const x = candidate.x ?? null;
    const y = candidate.y ?? null;
    const normalizeMotor = (motor: unknown) => {
        if (!motor || typeof motor !== 'object') {
            return null;
        }
        const candidateMotor = motor as { nodeMac?: unknown; motorIndex?: unknown };
        if (
            typeof candidateMotor.nodeMac === 'string' &&
            typeof candidateMotor.motorIndex === 'number' &&
            Number.isInteger(candidateMotor.motorIndex)
        ) {
            return {
                nodeMac: candidateMotor.nodeMac,
                motorIndex: candidateMotor.motorIndex,
            };
        }
        return null;
    };

    return {
        x: x ? normalizeMotor(x) : null,
        y: y ? normalizeMotor(y) : null,
    };
};

export interface GridStateSnapshot {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

export const loadGridState = (storage: Storage | undefined): GridStateSnapshot | null => {
    if (!storage) {
        return null;
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as Partial<StoredGridState>;
        if (!parsed || typeof parsed !== 'object' || parsed.version !== CURRENT_VERSION) {
            return null;
        }

        const { gridSize, assignments } = parsed;
        if (!gridSize || typeof gridSize !== 'object') {
            return null;
        }

        const rows = isFinitePositiveInt((gridSize as { rows?: unknown }).rows)
            ? (gridSize as { rows: number }).rows
            : null;
        const cols = isFinitePositiveInt((gridSize as { cols?: unknown }).cols)
            ? (gridSize as { cols: number }).cols
            : null;

        if (!rows || !cols) {
            return null;
        }

        const entries = Object.entries(assignments ?? {});
        const mirrorConfig: MirrorConfig = new Map();
        for (const [key, value] of entries) {
            const assignment = parseAssignment(value);
            if (!assignment) {
                continue;
            }
            mirrorConfig.set(key, {
                x: assignment.x,
                y: assignment.y,
            });
        }

        return {
            gridSize: { rows, cols },
            mirrorConfig,
        };
    } catch (error) {
        console.warn('Failed to load grid state from storage', error);
        return null;
    }
};

export const persistGridState = (
    storage: Storage | undefined,
    state: GridStateSnapshot,
): void => {
    if (!storage) {
        return;
    }
    const assignments: Record<string, SerializableAssignment> = {};
    for (const [key, assignment] of state.mirrorConfig.entries()) {
        assignments[key] = {
            x: assignment.x,
            y: assignment.y,
        };
    }

    const payload: StoredGridState = {
        version: CURRENT_VERSION,
        gridSize: state.gridSize,
        assignments,
    };

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist grid state', error);
    }
};
