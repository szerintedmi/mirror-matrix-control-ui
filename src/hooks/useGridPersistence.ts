import React, { useCallback, useMemo, useState } from 'react';

import {
    bootstrapGridSnapshots,
    getGridStateFingerprint,
    listGridSnapshotMetadata,
    loadNamedGridSnapshot,
    persistLastSelectedSnapshotName,
    persistNamedGridSnapshot,
    type GridSnapshotMetadata,
} from '@/services/gridStorage';
import type { MirrorConfig } from '@/types';
import type { SnapshotPersistenceStatus } from '@/types/persistence';

type PersistenceStatus =
    | { kind: 'idle' }
    | (SnapshotPersistenceStatus & { kind: 'success' | 'error' });

interface GridSnapshot {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

export interface UseGridPersistenceResult {
    // Current state
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    activeSnapshotName: string | null;
    hasUnsavedChanges: boolean;
    snapshotMetadata: GridSnapshotMetadata[];
    persistenceStatus: SnapshotPersistenceStatus | null;
    canUseStorage: boolean;
    storageUnavailableMessage: string | null;

    // State setters
    setGridSize: (size: { rows: number; cols: number }) => void;
    setMirrorConfig: React.Dispatch<React.SetStateAction<MirrorConfig>>;

    // Actions
    saveSnapshot: (name: string) => void;
    loadSnapshot: (name: string) => void;
}

/**
 * Hook for managing grid state persistence to localStorage.
 * Handles bootstrapping, saving, and loading grid snapshots.
 */
export function useGridPersistence(): UseGridPersistenceResult {
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );

    const snapshotBootstrap = useMemo(
        () => bootstrapGridSnapshots(resolvedStorage),
        [resolvedStorage],
    );

    const [gridSize, setGridSize] = useState(() => ({
        rows: snapshotBootstrap.snapshot?.gridSize.rows ?? 8,
        cols: snapshotBootstrap.snapshot?.gridSize.cols ?? 8,
    }));

    const [mirrorConfig, setMirrorConfig] = useState<MirrorConfig>(
        () => new Map(snapshotBootstrap.snapshot?.mirrorConfig ?? []),
    );

    const [snapshotMetadata, setSnapshotMetadata] = useState(snapshotBootstrap.metadata);
    const [activeSnapshotName, setActiveSnapshotName] = useState<string | null>(
        snapshotBootstrap.selectedName,
    );
    const [lastSavedFingerprint, setLastSavedFingerprint] = useState<string | null>(() =>
        snapshotBootstrap.snapshot
            ? getGridStateFingerprint(snapshotBootstrap.snapshot).hash
            : null,
    );
    const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>({ kind: 'idle' });

    // Computed values
    const currentGridSnapshot = useMemo<GridSnapshot>(
        () => ({ gridSize, mirrorConfig }),
        [gridSize, mirrorConfig],
    );

    const currentGridFingerprint = useMemo(
        () => getGridStateFingerprint(currentGridSnapshot).hash,
        [currentGridSnapshot],
    );

    const hasUnsavedChanges = !activeSnapshotName || lastSavedFingerprint !== currentGridFingerprint;

    const refreshSnapshotMetadata = useCallback(() => {
        if (!resolvedStorage) {
            setSnapshotMetadata([]);
            return;
        }
        setSnapshotMetadata(listGridSnapshotMetadata(resolvedStorage));
    }, [resolvedStorage]);

    // Actions
    const saveSnapshot = useCallback(
        (name: string) => {
            if (!resolvedStorage) {
                setPersistenceStatus({
                    kind: 'error',
                    tone: 'error',
                    action: 'save',
                    message: 'Local storage unavailable; cannot save array configuration.',
                    timestamp: Date.now(),
                });
                return;
            }
            const trimmed = name.trim();
            if (!trimmed) {
                setPersistenceStatus({
                    kind: 'error',
                    tone: 'error',
                    action: 'save',
                    message: 'Config name cannot be empty.',
                    timestamp: Date.now(),
                });
                return;
            }
            persistNamedGridSnapshot(resolvedStorage, trimmed, currentGridSnapshot);
            setActiveSnapshotName(trimmed);
            setLastSavedFingerprint(currentGridFingerprint);
            refreshSnapshotMetadata();
            setPersistenceStatus({
                kind: 'success',
                tone: 'success',
                action: 'save',
                message: `Saved config "${trimmed}".`,
                timestamp: Date.now(),
            });
        },
        [currentGridFingerprint, currentGridSnapshot, refreshSnapshotMetadata, resolvedStorage],
    );

    const loadSnapshot = useCallback(
        (name: string) => {
            if (!resolvedStorage) {
                setPersistenceStatus({
                    kind: 'error',
                    tone: 'error',
                    action: 'load',
                    message: 'Local storage unavailable; cannot load saved configuration.',
                    timestamp: Date.now(),
                });
                return;
            }
            const trimmed = name.trim();
            if (!trimmed) {
                setPersistenceStatus({
                    kind: 'error',
                    tone: 'error',
                    action: 'load',
                    message: 'Select a config to load.',
                    timestamp: Date.now(),
                });
                return;
            }
            const snapshot = loadNamedGridSnapshot(resolvedStorage, trimmed);
            if (!snapshot) {
                setPersistenceStatus({
                    kind: 'error',
                    tone: 'error',
                    action: 'load',
                    message: 'Saved config not found; it may have been removed.',
                    timestamp: Date.now(),
                });
                return;
            }
            setGridSize({ rows: snapshot.gridSize.rows, cols: snapshot.gridSize.cols });
            const normalizedConfig = new Map(snapshot.mirrorConfig);
            setMirrorConfig(normalizedConfig);
            const fingerprint = getGridStateFingerprint({
                gridSize: snapshot.gridSize,
                mirrorConfig: normalizedConfig,
            });
            setLastSavedFingerprint(fingerprint.hash);
            setActiveSnapshotName(trimmed);
            persistLastSelectedSnapshotName(resolvedStorage, trimmed);
            setPersistenceStatus({
                kind: 'success',
                tone: 'success',
                action: 'load',
                message: `Loaded config "${trimmed}".`,
                timestamp: Date.now(),
            });
        },
        [resolvedStorage],
    );

    return {
        gridSize,
        mirrorConfig,
        activeSnapshotName,
        hasUnsavedChanges,
        snapshotMetadata,
        persistenceStatus: persistenceStatus.kind === 'idle' ? null : persistenceStatus,
        canUseStorage: Boolean(resolvedStorage),
        storageUnavailableMessage: resolvedStorage
            ? null
            : 'Local storage is unavailable in this environment.',
        setGridSize,
        setMirrorConfig,
        saveSnapshot,
        loadSnapshot,
    };
}
