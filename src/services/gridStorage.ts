import type { MirrorAssignment, MirrorConfig } from '@/types';
import { fnv1aHash } from '@/utils/hash';

const STORAGE_KEY = 'mirror:grid-config';
const GRID_STATE_VERSION = 1;
const SNAPSHOT_COLLECTION_VERSION = 1;

interface SerializableAssignment {
    x: MirrorAssignment['x'];
    y: MirrorAssignment['y'];
}

export interface StoredGridState {
    version: number;
    gridSize: {
        rows: number;
        cols: number;
    };
    assignments: Record<string, SerializableAssignment>;
}

export interface GridStateFingerprint {
    hash: string;
    snapshot: StoredGridState;
}

interface StoredSnapshotEntry {
    savedAt: string;
    state: StoredGridState;
}

interface SnapshotCollectionPayload {
    version: number;
    snapshots: Record<string, StoredSnapshotEntry>;
    lastSelected: string | null;
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

const toStoredPayload = (state: GridStateSnapshot): StoredGridState => {
    const assignments: Record<string, SerializableAssignment> = {};
    const sortedEntries = [...state.mirrorConfig.entries()].sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true }),
    );
    for (const [key, assignment] of sortedEntries) {
        assignments[key] = {
            x: assignment.x,
            y: assignment.y,
        };
    }
    return {
        version: GRID_STATE_VERSION,
        gridSize: state.gridSize,
        assignments,
    };
};

export const getGridStateFingerprint = (state: GridStateSnapshot): GridStateFingerprint => {
    const snapshot = toStoredPayload(state);
    const serialized = JSON.stringify(snapshot);
    return {
        hash: fnv1aHash(serialized),
        snapshot,
    };
};

const hydrateStoredGridState = (payload: unknown): GridStateSnapshot | null => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const candidate = payload as Partial<StoredGridState>;
    if (candidate.version !== GRID_STATE_VERSION) {
        return null;
    }
    const gridSize = candidate.gridSize;
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
    const entries = Object.entries(candidate.assignments ?? {});
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
};

const createEmptyCollection = (): SnapshotCollectionPayload => ({
    version: SNAPSHOT_COLLECTION_VERSION,
    snapshots: {},
    lastSelected: null,
});

const isSnapshotEntry = (entry: unknown): entry is StoredSnapshotEntry => {
    if (!entry || typeof entry !== 'object') {
        return false;
    }
    const candidate = entry as StoredSnapshotEntry;
    return typeof candidate.savedAt === 'string' && typeof candidate.state === 'object';
};

const sanitizeSnapshotName = (value: string): string => value.trim();

const persistCollection = (storage: Storage | undefined, collection: SnapshotCollectionPayload) => {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(collection));
    } catch (error) {
        console.warn('Failed to persist grid state', error);
    }
};

const readCollection = (storage: Storage | undefined): SnapshotCollectionPayload | null => {
    if (!storage) {
        return null;
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as Partial<SnapshotCollectionPayload>;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        if (parsed.version !== SNAPSHOT_COLLECTION_VERSION) {
            return null;
        }
        const rawSnapshots = (parsed as SnapshotCollectionPayload).snapshots ?? {};
        const snapshots: Record<string, StoredSnapshotEntry> = {};
        for (const [name, entry] of Object.entries(rawSnapshots)) {
            if (isSnapshotEntry(entry) && hydrateStoredGridState(entry.state)) {
                snapshots[name] = entry;
            }
        }
        return {
            version: SNAPSHOT_COLLECTION_VERSION,
            snapshots,
            lastSelected:
                typeof (parsed as SnapshotCollectionPayload).lastSelected === 'string'
                    ? (parsed as SnapshotCollectionPayload).lastSelected
                    : null,
        };
    } catch (error) {
        console.warn('Failed to load grid state from storage', error);
        return null;
    }
};

const getCollectionOrEmpty = (storage: Storage | undefined): SnapshotCollectionPayload => {
    return readCollection(storage) ?? createEmptyCollection();
};

export interface GridSnapshotMetadata {
    name: string;
    savedAt: string;
}

export interface GridSnapshotBootstrap {
    snapshot: GridStateSnapshot | null;
    metadata: GridSnapshotMetadata[];
    selectedName: string | null;
}

export const listGridSnapshotMetadata = (storage: Storage | undefined): GridSnapshotMetadata[] => {
    const collection = getCollectionOrEmpty(storage);
    return Object.entries(collection.snapshots)
        .map(([name, entry]) => ({
            name,
            savedAt: entry.savedAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
};

export const bootstrapGridSnapshots = (storage: Storage | undefined): GridSnapshotBootstrap => {
    const collection = getCollectionOrEmpty(storage);
    const metadata = Object.entries(collection.snapshots)
        .map(([name, entry]) => ({ name, savedAt: entry.savedAt }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const selectedName = metadata.some((entry) => entry.name === collection.lastSelected)
        ? collection.lastSelected
        : (metadata[0]?.name ?? null);
    const snapshot = selectedName
        ? hydrateStoredGridState(collection.snapshots[selectedName]?.state)
        : null;
    return {
        snapshot,
        metadata,
        selectedName,
    };
};

export const loadNamedGridSnapshot = (
    storage: Storage | undefined,
    snapshotName: string,
): GridStateSnapshot | null => {
    if (!storage) {
        return null;
    }
    const collection = readCollection(storage);
    if (!collection) {
        return null;
    }
    const entry = collection.snapshots[snapshotName];
    if (!entry) {
        return null;
    }
    return hydrateStoredGridState(entry.state);
};

export const persistNamedGridSnapshot = (
    storage: Storage | undefined,
    snapshotName: string,
    state: GridStateSnapshot,
): void => {
    if (!storage) {
        return;
    }
    const name = sanitizeSnapshotName(snapshotName);
    if (!name) {
        return;
    }
    const collection = getCollectionOrEmpty(storage);
    collection.snapshots[name] = {
        savedAt: new Date().toISOString(),
        state: toStoredPayload(state),
    };
    collection.lastSelected = name;
    persistCollection(storage, collection);
};

export const persistLastSelectedSnapshotName = (
    storage: Storage | undefined,
    snapshotName: string | null,
): void => {
    if (!storage) {
        return;
    }
    const collection = getCollectionOrEmpty(storage);
    collection.lastSelected = snapshotName;
    persistCollection(storage, collection);
};

export const getLastSelectedSnapshotName = (storage: Storage | undefined): string | null => {
    const collection = readCollection(storage);
    return collection?.lastSelected ?? null;
};

export const loadGridState = (storage: Storage | undefined): GridStateSnapshot | null => {
    return bootstrapGridSnapshots(storage).snapshot;
};

export const persistGridState = (storage: Storage | undefined, state: GridStateSnapshot): void => {
    persistNamedGridSnapshot(storage, 'Default Snapshot', state);
};
