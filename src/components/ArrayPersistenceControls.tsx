import React, { useEffect, useMemo, useState } from 'react';

import type { GridSnapshotMetadata } from '../services/gridStorage';
import type { SnapshotPersistenceStatus } from '../types/persistence';

interface ArrayPersistenceControlsProps {
    canUseStorage: boolean;
    hasUnsavedChanges: boolean;
    availableSnapshots: GridSnapshotMetadata[];
    activeSnapshotName: string | null;
    defaultSnapshotName: string;
    status: SnapshotPersistenceStatus | null;
    storageUnavailableMessage: string | null;
    onSave: (name: string) => void;
    onLoad: (name: string) => void;
}

const ArrayPersistenceControls: React.FC<ArrayPersistenceControlsProps> = ({
    canUseStorage,
    hasUnsavedChanges,
    availableSnapshots,
    activeSnapshotName,
    defaultSnapshotName,
    status,
    storageUnavailableMessage,
    onSave,
    onLoad,
}) => {
    const [nameInput, setNameInput] = useState(defaultSnapshotName);
    const [selectedName, setSelectedName] = useState(
        activeSnapshotName ?? availableSnapshots[0]?.name ?? '',
    );

    useEffect(() => {
        setNameInput(defaultSnapshotName);
    }, [defaultSnapshotName]);

    useEffect(() => {
        if (activeSnapshotName) {
            setSelectedName(activeSnapshotName);
            return;
        }
        setSelectedName((current) => {
            if (current && availableSnapshots.some((entry) => entry.name === current)) {
                return current;
            }
            return availableSnapshots[0]?.name ?? '';
        });
    }, [activeSnapshotName, availableSnapshots]);

    const saveDisabled = !canUseStorage || nameInput.trim().length === 0;
    const loadDisabled =
        !canUseStorage || availableSnapshots.length === 0 || selectedName.trim().length === 0;

    const handleSave = (event: React.FormEvent) => {
        event.preventDefault();
        onSave(nameInput);
    };

    const handleLoad = (event: React.FormEvent) => {
        event.preventDefault();
        onLoad(selectedName);
    };

    const statusColor = status?.tone === 'error' ? 'text-red-200' : 'text-emerald-200';
    const sortedOptions = useMemo(
        () =>
            [...availableSnapshots].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
            ),
        [availableSnapshots],
    );

    return (
        <form
            className="flex flex-wrap items-center gap-2 text-sm"
            onSubmit={handleSave}
            aria-label="Array config persistence controls"
        >
            <div className="flex flex-col">
                <label htmlFor="snapshot-name" className="text-xs text-gray-400">
                    Config name
                </label>
                <input
                    id="snapshot-name"
                    data-testid="array-config-name-input"
                    type="text"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    placeholder="e.g. Morning Alignment"
                    className="w-48 rounded-md border border-gray-600 bg-gray-800 px-3 py-1 text-sm text-white focus:border-cyan-400 focus:outline-none"
                    disabled={!canUseStorage}
                />
            </div>
            <button
                type="submit"
                data-testid="array-save-config"
                disabled={saveDisabled}
                className={`rounded-md px-3 py-1.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                    saveDisabled
                        ? 'cursor-not-allowed bg-gray-800 text-gray-500'
                        : 'bg-cyan-600/80 text-white hover:bg-cyan-500/80'
                }`}
            >
                Save
            </button>
            <div className="flex flex-col">
                <label htmlFor="snapshot-select" className="text-xs text-gray-400">
                    Saved configs
                </label>
                <select
                    id="snapshot-select"
                    data-testid="array-saved-config-select"
                    value={selectedName}
                    onChange={(event) => setSelectedName(event.target.value)}
                    disabled={!canUseStorage || sortedOptions.length === 0}
                    className="w-48 rounded-md border border-gray-600 bg-gray-800 px-3 py-1 text-sm text-white focus:border-indigo-400 focus:outline-none"
                >
                    {sortedOptions.length === 0 ? (
                        <option value="">No snapshots</option>
                    ) : (
                        sortedOptions.map((entry) => (
                            <option key={entry.name} value={entry.name}>
                                {entry.name}
                            </option>
                        ))
                    )}
                </select>
            </div>
            <button
                type="button"
                data-testid="array-load-config"
                onClick={handleLoad}
                disabled={loadDisabled}
                className={`rounded-md px-3 py-1.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                    loadDisabled
                        ? 'cursor-not-allowed bg-gray-800 text-gray-500'
                        : 'bg-indigo-600/80 text-white hover:bg-indigo-500/80'
                }`}
            >
                Load
            </button>
            {canUseStorage && hasUnsavedChanges ? (
                <span
                    data-testid="array-unsaved-indicator"
                    className="rounded-full border border-amber-400/70 bg-amber-900/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100"
                >
                    Unsaved changes
                </span>
            ) : null}
            {!canUseStorage && (
                <span
                    data-testid="array-storage-unavailable"
                    className="rounded-full border border-red-500/70 bg-red-900/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-100"
                >
                    Storage unavailable
                </span>
            )}
            <div className="flex flex-col text-xs text-gray-400">
                {status ? (
                    <span data-testid="array-persistence-status" className={statusColor}>
                        {status.message}
                    </span>
                ) : null}
                {storageUnavailableMessage && (
                    <span data-testid="array-storage-message" className="text-red-200">
                        {storageUnavailableMessage}
                    </span>
                )}
            </div>
        </form>
    );
};

export default ArrayPersistenceControls;
