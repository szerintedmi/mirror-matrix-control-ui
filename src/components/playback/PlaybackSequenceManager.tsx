import React, { useCallback, useMemo, useRef, useState } from 'react';

import Modal from '@/components/Modal';
import { useLogStore } from '@/context/LogContext';
import {
    loadPlaybackSequences,
    persistPlaybackSequences,
    removePlaybackSequence,
} from '@/services/playbackSequenceStorage';
import {
    planProfilePlayback,
    type ProfilePlaybackAxisTarget,
} from '@/services/profilePlaybackPlanner';
import type { CalibrationProfile, MirrorConfig, Pattern, PlaybackSequence } from '@/types';

type RunStatus = 'idle' | 'running' | 'success' | 'error';

export interface QueuedPattern {
    id: string;
    patternId: string;
}

interface RenameDialogState {
    sequenceId: string;
    value: string;
}

interface SaveDialogState {
    value: string;
}

interface SequenceValidationResult {
    itemId: string;
    status: 'ok' | 'error' | 'missing' | 'blocked';
    message?: string;
}

interface PlaybackSequenceManagerProps {
    patterns: Pattern[];
    selectedPattern: Pattern | null;
    selectedProfile: CalibrationProfile | null;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    storage: Storage | undefined;
    onSelectPatternId: (patternId: string) => void;
    dispatchPlayback: (targets: ProfilePlaybackAxisTarget[], patternName: string) => Promise<void>;
}

const PlaybackSequenceManager: React.FC<PlaybackSequenceManagerProps> = ({
    patterns,
    selectedPattern,
    selectedProfile,
    gridSize,
    mirrorConfig,
    storage,
    onSelectPatternId,
    dispatchPlayback,
}) => {
    const { logError } = useLogStore();
    const [sequence, setSequence] = useState<QueuedPattern[]>([]);
    const [savedSequences, setSavedSequences] = useState<PlaybackSequence[]>(() =>
        loadPlaybackSequences(storage),
    );
    const [activeSavedSequenceId, setActiveSavedSequenceId] = useState<string | null>(null);
    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [runMessage, setRunMessage] = useState<string | null>(null);
    const [renameState, setRenameState] = useState<RenameDialogState | null>(null);
    const [saveState, setSaveState] = useState<SaveDialogState | null>(null);
    const sequenceIdRef = useRef(0);

    const canAddToSequence = Boolean(selectedPattern);
    const canPlaySequence =
        sequence.length > 0 && Boolean(selectedProfile) && runStatus !== 'running';

    const patternLookup = useMemo(
        () => new Map(patterns.map((pattern) => [pattern.id, pattern])),
        [patterns],
    );

    const validationResults = useMemo(() => {
        const list: SequenceValidationResult[] = sequence.map((entry) => {
            const pattern = patternLookup.get(entry.patternId);
            if (!pattern) {
                return {
                    itemId: entry.id,
                    status: 'missing',
                    message: 'This pattern no longer exists.',
                };
            }
            if (!selectedProfile) {
                return {
                    itemId: entry.id,
                    status: 'blocked',
                    message: 'Select a calibration profile to validate.',
                };
            }
            const plan = planProfilePlayback({
                gridSize,
                mirrorConfig,
                profile: selectedProfile,
                pattern,
            });
            if (plan.errors.length === 0) {
                return { itemId: entry.id, status: 'ok' };
            }
            return {
                itemId: entry.id,
                status: 'error',
                message: plan.errors[0].message,
            };
        });
        return {
            list,
            byItemId: new Map(list.map((result) => [result.itemId, result])),
        };
    }, [gridSize, mirrorConfig, patternLookup, selectedProfile, sequence]);

    const validationNotice = useMemo(() => {
        if (sequence.length === 0) {
            return null;
        }
        if (!selectedProfile) {
            return {
                tone: 'warning' as const,
                message: 'Select a calibration profile to validate queued patterns.',
            };
        }
        const hasIssues = validationResults.list.some(
            (result) => result.status === 'error' || result.status === 'missing',
        );
        if (hasIssues) {
            return {
                tone: 'error' as const,
                message: 'Some patterns need attention—see the list for details.',
            };
        }
        return null;
    }, [selectedProfile, sequence.length, validationResults.list]);

    const generateItemId = useCallback(() => {
        sequenceIdRef.current += 1;
        return `queued-${Date.now()}-${sequenceIdRef.current}`;
    }, []);

    const persistSequencePayload = useCallback(
        (sequenceId: string, name: string, existing?: PlaybackSequence) => {
            const now = new Date().toISOString();
            const payload: PlaybackSequence = {
                id: sequenceId,
                name,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                patternIds: sequence.map((entry) => entry.patternId),
            };
            const next = existing
                ? savedSequences.map((entry) => (entry.id === sequenceId ? payload : entry))
                : [...savedSequences, payload];
            persistPlaybackSequences(storage, next);
            setSavedSequences(next);
            setActiveSavedSequenceId(sequenceId);
            setRunStatus('success');
            setRunMessage(
                existing ? `Saved changes to "${name}".` : `Saved playback sequence as "${name}".`,
            );
        },
        [savedSequences, sequence, storage],
    );

    const resetActiveSavedSequence = useCallback(() => {
        setActiveSavedSequenceId(null);
    }, []);

    const addPatternToSequence = useCallback(() => {
        if (!selectedPattern) {
            setRunStatus('error');
            setRunMessage('Select a pattern to add to the playback sequence.');
            return;
        }
        const id = generateItemId();
        setSequence((prev) => [...prev, { id, patternId: selectedPattern.id }]);
        resetActiveSavedSequence();
        setRunStatus('idle');
        setRunMessage(`Added "${selectedPattern.name}" to the sequence.`);
    }, [generateItemId, resetActiveSavedSequence, selectedPattern]);

    const removeFromSequence = useCallback(
        (id: string) => {
            setSequence((prev) => prev.filter((entry) => entry.id !== id));
            resetActiveSavedSequence();
        },
        [resetActiveSavedSequence],
    );

    const moveSequenceItem = useCallback(
        (id: string, direction: -1 | 1) => {
            setSequence((prev) => {
                const index = prev.findIndex((entry) => entry.id === id);
                if (index === -1) {
                    return prev;
                }
                const nextIndex = index + direction;
                if (nextIndex < 0 || nextIndex >= prev.length) {
                    return prev;
                }
                const updated = [...prev];
                const [entry] = updated.splice(index, 1);
                updated.splice(nextIndex, 0, entry);
                return updated;
            });
            resetActiveSavedSequence();
        },
        [resetActiveSavedSequence],
    );

    const clearSequence = useCallback(() => {
        setSequence([]);
        resetActiveSavedSequence();
    }, [resetActiveSavedSequence]);

    const handlePlaySequence = useCallback(async () => {
        if (sequence.length === 0) {
            setRunStatus('error');
            setRunMessage('Add at least one pattern to the playback sequence.');
            return;
        }
        if (!selectedProfile) {
            setRunStatus('error');
            setRunMessage('Select a calibration profile to run playback.');
            return;
        }
        setRunStatus('running');
        setRunMessage(
            `Starting playback for ${sequence.length} pattern${sequence.length === 1 ? '' : 's'}.`,
        );
        for (let index = 0; index < sequence.length; index += 1) {
            const entry = sequence[index];
            const pattern = patternLookup.get(entry.patternId);
            if (!pattern) {
                const message = 'A pattern in the sequence is no longer available.';
                logError('Playback', message);
                setRunStatus('error');
                setRunMessage(message);
                return;
            }
            const plan = planProfilePlayback({
                gridSize,
                mirrorConfig,
                profile: selectedProfile,
                pattern,
            });
            if (plan.errors.length > 0) {
                const message = `Cannot play "${pattern.name}": ${plan.errors[0].message}`;
                logError('Playback', message);
                setRunStatus('error');
                setRunMessage(message);
                return;
            }
            try {
                await dispatchPlayback(plan.playableAxisTargets, pattern.name);
                setRunMessage(
                    `Completed "${pattern.name}" (${index + 1}/${sequence.length}). Running next…`,
                );
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : `Playback failed while running "${pattern.name}".`;
                setRunStatus('error');
                setRunMessage(message);
                return;
            }
        }
        setRunStatus('success');
        setRunMessage(
            `Finished playback for ${sequence.length} pattern${sequence.length === 1 ? '' : 's'}.`,
        );
    }, [
        dispatchPlayback,
        gridSize,
        logError,
        mirrorConfig,
        patternLookup,
        selectedProfile,
        sequence,
    ]);

    const deriveDefaultSequenceName = useCallback(() => {
        const base = 'Sequence';
        const existingNames = new Set(savedSequences.map((entry) => entry.name));
        let suffix = 1;
        let candidate = `${base} ${suffix}`;
        while (existingNames.has(candidate)) {
            suffix += 1;
            candidate = `${base} ${suffix}`;
        }
        return candidate;
    }, [savedSequences]);

    const openSaveDialog = useCallback(
        (name?: string) => setSaveState({ value: name ?? deriveDefaultSequenceName() }),
        [deriveDefaultSequenceName],
    );

    const handleSaveSequence = useCallback(() => {
        if (sequence.length === 0) {
            setRunStatus('error');
            setRunMessage('Add patterns before saving a playback sequence.');
            return;
        }
        const active = activeSavedSequenceId
            ? savedSequences.find((entry) => entry.id === activeSavedSequenceId)
            : null;
        if (active) {
            persistSequencePayload(active.id, active.name, active);
            return;
        }
        openSaveDialog();
    }, [
        activeSavedSequenceId,
        openSaveDialog,
        persistSequencePayload,
        savedSequences,
        sequence.length,
    ]);

    const handleSaveAs = useCallback(() => {
        if (sequence.length === 0) {
            setRunStatus('error');
            setRunMessage('Add patterns before saving a playback sequence.');
            return;
        }
        const active = activeSavedSequenceId
            ? savedSequences.find((entry) => entry.id === activeSavedSequenceId)
            : null;
        const suggestedName = active ? `${active.name} copy` : deriveDefaultSequenceName();
        openSaveDialog(suggestedName);
    }, [
        activeSavedSequenceId,
        deriveDefaultSequenceName,
        openSaveDialog,
        savedSequences,
        sequence.length,
    ]);

    const handleSaveInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSaveState((previous) => (previous ? { ...previous, value } : previous));
    }, []);

    const handleSaveSubmit = useCallback(
        (event?: React.FormEvent<HTMLFormElement>) => {
            event?.preventDefault();
            if (!saveState) {
                return;
            }
            const trimmed = saveState.value.trim();
            if (!trimmed || sequence.length === 0) {
                return;
            }
            const sequenceId = `sequence-${Date.now().toString(36)}`;
            persistSequencePayload(sequenceId, trimmed);
            setSaveState(null);
        },
        [persistSequencePayload, saveState, sequence.length],
    );

    const handleCloseSaveModal = useCallback(() => setSaveState(null), []);

    const handleLoadSavedSequence = useCallback(
        (sequenceId: string) => {
            const saved = savedSequences.find((entry) => entry.id === sequenceId);
            if (!saved) {
                return;
            }
            const filtered = saved.patternIds.filter((id) => patternLookup.has(id));
            if (filtered.length === 0) {
                setRunStatus('error');
                setRunMessage(
                    'This saved sequence no longer has any valid patterns. Add patterns and re-save.',
                );
                setSequence([]);
                setActiveSavedSequenceId(null);
                return;
            }
            const hydrated: QueuedPattern[] = filtered.map((patternId, index) => ({
                id: `queued-${Date.now()}-${index}`,
                patternId,
            }));
            setSequence(hydrated);
            setActiveSavedSequenceId(sequenceId);
            onSelectPatternId(filtered[0]);
            setRunStatus('idle');
            setRunMessage(`Loaded "${saved.name}" (${hydrated.length} patterns).`);
        },
        [onSelectPatternId, patternLookup, savedSequences],
    );

    const handleDeleteSavedSequence = useCallback(
        (sequenceId: string) => {
            const target = savedSequences.find((entry) => entry.id === sequenceId);
            if (!target) {
                return;
            }
            if (!window.confirm(`Delete "${target.name}"?`)) {
                return;
            }
            const next = removePlaybackSequence(storage, sequenceId);
            setSavedSequences(next);
            if (activeSavedSequenceId === sequenceId) {
                setActiveSavedSequenceId(null);
            }
            setRunStatus('idle');
            setRunMessage(`Deleted "${target.name}".`);
        },
        [activeSavedSequenceId, savedSequences, storage],
    );

    const openRenameDialog = useCallback((sequence: PlaybackSequence) => {
        setRenameState({ sequenceId: sequence.id, value: sequence.name });
    }, []);

    const handleRenameInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setRenameState((previous) => (previous ? { ...previous, value } : previous));
    }, []);

    const handleCloseRenameModal = useCallback(() => setRenameState(null), []);

    const handleRenameSubmit = useCallback(
        (event?: React.FormEvent<HTMLFormElement>) => {
            event?.preventDefault();
            if (!renameState) {
                return;
            }
            const nextName = renameState.value.trim();
            if (!nextName) {
                return;
            }
            const now = new Date().toISOString();
            const next = savedSequences.map((entry) =>
                entry.id === renameState.sequenceId
                    ? { ...entry, name: nextName, updatedAt: now }
                    : entry,
            );
            persistPlaybackSequences(storage, next);
            setSavedSequences(next);
            setRenameState(null);
            setRunStatus('success');
            setRunMessage(`Renamed sequence to "${nextName}".`);
        },
        [renameState, savedSequences, storage],
    );

    const isSaveDisabled = !saveState || saveState.value.trim().length === 0;
    const isRenameDisabled = !renameState || renameState.value.trim().length === 0;

    return (
        <section className="rounded-lg border border-gray-800/70 bg-gray-900/40 p-4 shadow">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-gray-100">Playback Sequence</p>
                    <p className="text-xs text-gray-400">
                        Patterns will play one after another in the order listed below.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!canAddToSequence}
                        onClick={addPatternToSequence}
                        className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                            canAddToSequence
                                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                                : 'cursor-not-allowed bg-gray-700 text-gray-400'
                        }`}
                    >
                        Add Selected Pattern
                    </button>
                    <button
                        type="button"
                        disabled={sequence.length === 0}
                        onClick={clearSequence}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                            sequence.length > 0
                                ? 'border border-gray-600 text-gray-100 hover:border-red-400 hover:text-red-200'
                                : 'cursor-not-allowed border border-gray-800 text-gray-500'
                        }`}
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        disabled={sequence.length === 0}
                        onClick={handleSaveSequence}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                            sequence.length > 0
                                ? 'border border-gray-600 text-gray-100 hover:border-cyan-400 hover:text-cyan-200'
                                : 'cursor-not-allowed border border-gray-800 text-gray-500'
                        }`}
                    >
                        Save Sequence
                    </button>
                    <button
                        type="button"
                        disabled={sequence.length === 0}
                        onClick={handleSaveAs}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                            sequence.length > 0
                                ? 'border border-gray-700 text-gray-100 hover:border-cyan-400 hover:text-cyan-200'
                                : 'cursor-not-allowed border border-gray-800 text-gray-500'
                        }`}
                    >
                        Save As
                    </button>
                    <button
                        type="button"
                        disabled={!canPlaySequence}
                        onClick={handlePlaySequence}
                        className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                            canPlaySequence
                                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                : 'cursor-not-allowed bg-gray-800 text-gray-500'
                        }`}
                    >
                        {runStatus === 'running'
                            ? 'Playing sequence…'
                            : `Play ${sequence.length || '0'} pattern${sequence.length === 1 ? '' : 's'}`}
                    </button>
                </div>
            </div>

            <div className="mt-4 space-y-3">
                {validationNotice && (
                    <div
                        className={`rounded-md border px-3 py-2 text-sm ${
                            validationNotice.tone === 'error'
                                ? 'border-red-500/50 bg-red-500/10 text-red-100'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                        }`}
                    >
                        {validationNotice.message}
                    </div>
                )}

                <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                    {sequence.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            Add patterns to start a playback sequence.
                        </p>
                    ) : (
                        <ol className="space-y-2" aria-label="Playback sequence list">
                            {sequence.map((entry, index) => {
                                const pattern = patternLookup.get(entry.patternId);
                                const validation = validationResults.byItemId.get(entry.id);
                                const validationTone =
                                    validation?.status === 'ok'
                                        ? 'text-emerald-300'
                                        : validation?.status === 'blocked'
                                          ? 'text-amber-200'
                                          : 'text-red-200';
                                return (
                                    <li
                                        key={entry.id}
                                        className="flex flex-col gap-2 rounded-md border border-gray-800 bg-gray-900/60 p-3 md:flex-row md:items-center md:justify-between"
                                    >
                                        <div className="flex flex-1 flex-col gap-1 text-sm text-gray-200">
                                            <span className="font-semibold text-gray-100">
                                                {pattern?.name ?? 'Pattern removed'}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                Step {index + 1} of {sequence.length}
                                            </span>
                                            {validation && (
                                                <div
                                                    className={`flex items-start gap-2 text-xs ${validationTone}`}
                                                >
                                                    <span aria-hidden>
                                                        {validation.status === 'ok' ? '✓' : '⚠'}
                                                    </span>
                                                    {validation.status === 'ok' ? (
                                                        <span className="sr-only">
                                                            Validation passed
                                                        </span>
                                                    ) : (
                                                        <span>
                                                            {validation.message ??
                                                                'Needs validation attention.'}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => moveSequenceItem(entry.id, -1)}
                                                disabled={index === 0}
                                                className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                                                    index === 0
                                                        ? 'cursor-not-allowed border border-gray-800 text-gray-500'
                                                        : 'border border-gray-700 text-gray-100 hover:border-cyan-400 hover:text-cyan-200'
                                                }`}
                                            >
                                                Move Up
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveSequenceItem(entry.id, 1)}
                                                disabled={index === sequence.length - 1}
                                                className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                                                    index === sequence.length - 1
                                                        ? 'cursor-not-allowed border border-gray-800 text-gray-500'
                                                        : 'border border-gray-700 text-gray-100 hover:border-cyan-400 hover:text-cyan-200'
                                                }`}
                                            >
                                                Move Down
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeFromSequence(entry.id)}
                                                className="rounded-md border border-red-500/60 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:text-red-100"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>

                <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-100">Saved Sequences</p>
                        <span className="text-xs text-gray-400">{savedSequences.length} saved</span>
                    </div>
                    {savedSequences.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            No saved sequences yet. Save a sequence to reuse it later.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {savedSequences.map((entry) => {
                                const patternCount = entry.patternIds.length;
                                const isActive = entry.id === activeSavedSequenceId;
                                return (
                                    <div
                                        key={entry.id}
                                        className={`flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between ${
                                            isActive
                                                ? 'border-cyan-500/50 bg-cyan-500/10'
                                                : 'border-gray-800 bg-gray-900/50'
                                        }`}
                                    >
                                        <div className="flex flex-col gap-1 text-sm text-gray-100">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">{entry.name}</span>
                                                {isActive && (
                                                    <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-cyan-100">
                                                        Loaded
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {patternCount} pattern
                                                {patternCount === 1 ? '' : 's'} · Updated{' '}
                                                {new Date(entry.updatedAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                            <button
                                                type="button"
                                                onClick={() => handleLoadSavedSequence(entry.id)}
                                                className="rounded-md border border-gray-700 px-3 py-2 text-gray-100 transition hover:border-cyan-400 hover:text-cyan-200"
                                            >
                                                Load
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openRenameDialog(entry)}
                                                aria-label={`Rename sequence ${entry.name}`}
                                                className="rounded-md border border-gray-700 px-3 py-2 text-gray-100 transition hover:border-cyan-400 hover:text-cyan-200"
                                            >
                                                Rename
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSavedSequence(entry.id)}
                                                className="rounded-md border border-red-500/60 px-3 py-2 text-red-200 transition hover:border-red-400 hover:text-red-100"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {runMessage && (
                    <p
                        className={`text-sm ${
                            runStatus === 'error' ? 'text-red-300' : 'text-emerald-300'
                        }`}
                    >
                        {runMessage}
                    </p>
                )}
            </div>

            <Modal
                open={Boolean(saveState)}
                onClose={handleCloseSaveModal}
                title="Save Playback Sequence"
            >
                {saveState && (
                    <form className="space-y-4" onSubmit={handleSaveSubmit}>
                        <label className="block text-sm text-gray-100" htmlFor="sequence-save-name">
                            Sequence name
                        </label>
                        <input
                            id="sequence-save-name"
                            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-cyan-400 focus:outline-none"
                            value={saveState.value}
                            onChange={handleSaveInputChange}
                            placeholder="Morning run"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={handleCloseSaveModal}
                                className="rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-100 transition hover:border-gray-500 hover:text-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaveDisabled}
                                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                                    isSaveDisabled
                                        ? 'cursor-not-allowed bg-gray-700 text-gray-400'
                                        : 'bg-cyan-600 text-white hover:bg-cyan-500'
                                }`}
                            >
                                Save
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                open={Boolean(renameState)}
                onClose={handleCloseRenameModal}
                title="Rename Sequence"
            >
                {renameState && (
                    <form className="space-y-4" onSubmit={handleRenameSubmit}>
                        <label
                            className="block text-sm text-gray-100"
                            htmlFor="sequence-rename-input"
                        >
                            New name
                        </label>
                        <input
                            id="sequence-rename-input"
                            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-cyan-400 focus:outline-none"
                            value={renameState.value}
                            onChange={handleRenameInputChange}
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={handleCloseRenameModal}
                                className="rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-100 transition hover:border-gray-500 hover:text-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isRenameDisabled}
                                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                                    isRenameDisabled
                                        ? 'cursor-not-allowed bg-gray-700 text-gray-400'
                                        : 'bg-cyan-600 text-white hover:bg-cyan-500'
                                }`}
                            >
                                Rename
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </section>
    );
};

export default PlaybackSequenceManager;
