import {
    DndContext,
    type DragEndEvent,
    type DragOverEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';

import Modal from '@/components/Modal';
import SequencePreview from '@/components/SequencePreview';
import { useLogStore } from '@/context/LogContext';
import { usePlaybackDispatch } from '@/hooks/usePlaybackDispatch';
import {
    loadPlaybackSequences,
    persistPlaybackSequences,
    removePlaybackSequence,
} from '@/services/playbackSequenceStorage';
import { planProfilePlayback } from '@/services/profilePlaybackPlanner';
import type { CalibrationProfile, MirrorConfig, Pattern, PlaybackSequence } from '@/types';

import SortableItem, { type QueuedPattern, type SequenceValidationResult } from './SortableItem';

export type { QueuedPattern };

type RunStatus = 'idle' | 'running' | 'success' | 'error';

interface RenameDialogState {
    sequenceId: string;
    value: string;
}

interface PlaybackSequenceManagerProps {
    patterns: Pattern[];
    selectedProfile: CalibrationProfile | null;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    storage: Storage | undefined;
    onSelectPatternId?: (patternId: string) => void;
    onEditStateChange?: (state: { isEditing: boolean; sequenceName: string | null }) => void;
}

export interface PlaybackSequenceManagerHandle {
    addPatternById: (patternId: string) => void;
}

const PlaybackSequenceManager = React.forwardRef<
    PlaybackSequenceManagerHandle,
    PlaybackSequenceManagerProps
>(
    (
        {
            patterns,
            selectedProfile,
            gridSize,
            mirrorConfig,
            storage,
            onSelectPatternId,
            onEditStateChange,
        },
        ref,
    ) => {
        const { logInfo } = useLogStore();
        const { playPatternSequence, isPlaying } = usePlaybackDispatch({ gridSize, mirrorConfig });
        const [sequence, setSequence] = useState<QueuedPattern[]>([]);
        const [savedSequences, setSavedSequences] = useState<PlaybackSequence[]>(() =>
            loadPlaybackSequences(storage),
        );
        const [activeSavedSequenceId, setActiveSavedSequenceId] = useState<string | null>(null);
        const [runStatus, setRunStatus] = useState<RunStatus>('idle');
        const [runMessage, setRunMessage] = useState<string | null>(null);
        const [renameState, setRenameState] = useState<RenameDialogState | null>(null);
        const [isDragHovering, setIsDragHovering] = useState(false);
        const [dragOverId, setDragOverId] = useState<string | null>(null);
        const sequenceIdRef = useRef(0);
        const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

        const sensors = useSensors(
            useSensor(PointerSensor),
            useSensor(KeyboardSensor, {
                coordinateGetter: sortableKeyboardCoordinates,
            }),
        );

        const canPlaySequence =
            sequence.length > 0 &&
            Boolean(selectedProfile) &&
            runStatus !== 'running' &&
            !isPlaying;
        const isEditMode = Boolean(activeSavedSequenceId);
        const activeSequence = useMemo(
            () =>
                activeSavedSequenceId
                    ? (savedSequences.find((entry) => entry.id === activeSavedSequenceId) ?? null)
                    : null,
            [activeSavedSequenceId, savedSequences],
        );

        const patternLookup = useMemo(
            () => new Map(patterns.map((pattern) => [pattern.id, pattern])),
            [patterns],
        );

        useEffect(() => {
            if (!onEditStateChange) return;
            onEditStateChange({
                isEditing: isEditMode,
                sequenceName: activeSequence?.name ?? null,
            });
        }, [activeSavedSequenceId, activeSequence?.name, isEditMode, onEditStateChange]);

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

        // Autosave Effect
        useEffect(() => {
            if (!activeSavedSequenceId) {
                return;
            }

            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
            }

            autosaveTimeoutRef.current = setTimeout(() => {
                const activeSequence = savedSequences.find((s) => s.id === activeSavedSequenceId);
                if (!activeSequence) return;

                const currentPatternIds = sequence.map((entry) => entry.patternId);
                // Only save if changed
                const isChanged =
                    activeSequence.patternIds.length !== currentPatternIds.length ||
                    activeSequence.patternIds.some((id, index) => id !== currentPatternIds[index]);

                if (isChanged) {
                    const updatedSequence: PlaybackSequence = {
                        ...activeSequence,
                        updatedAt: new Date().toISOString(),
                        patternIds: currentPatternIds,
                    };
                    const nextSaved = savedSequences.map((s) =>
                        s.id === activeSavedSequenceId ? updatedSequence : s,
                    );
                    setSavedSequences(nextSaved);
                    persistPlaybackSequences(storage, nextSaved);
                    logInfo('Playback', `Autosaved changes to "${activeSequence.name}".`);
                }
            }, 1000); // Debounce 1s

            return () => {
                if (autosaveTimeoutRef.current) {
                    clearTimeout(autosaveTimeoutRef.current);
                }
            };
        }, [sequence, activeSavedSequenceId, savedSequences, storage, logInfo]);

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
                    existing
                        ? `Saved changes to "${name}".`
                        : `Saved playback sequence as "${name}".`,
                );
            },
            [savedSequences, sequence, storage],
        );

        const addPatternById = useCallback(
            (patternId: string) => {
                const targetPattern = patternLookup.get(patternId);
                if (!targetPattern) {
                    setRunStatus('error');
                    setRunMessage('Pattern could not be added because it no longer exists.');
                    return;
                }

                const newItem: QueuedPattern = {
                    id: generateItemId(),
                    patternId,
                };

                setSequence((prev) => [...prev, newItem]);
                setRunStatus('idle');
                setRunMessage(null);
            },
            [generateItemId, patternLookup],
        );

        useImperativeHandle(
            ref,
            () => ({
                addPatternById,
            }),
            [addPatternById],
        );

        const handleRemoveFromSequence = (itemId: string) => {
            setSequence((prev) => prev.filter((item) => item.id !== itemId));
            setRunStatus('idle');
            setRunMessage(null);
        };

        const handleDragEnd = (event: DragEndEvent) => {
            const { active, over } = event;
            setDragOverId(null);
            if (over && active.id !== over.id) {
                setSequence((items) => {
                    const oldIndex = items.findIndex((item) => item.id === active.id);
                    const newIndex = items.findIndex((item) => item.id === over.id);
                    return arrayMove(items, oldIndex, newIndex);
                });
            }
        };

        const handleDragOver = (event: DragOverEvent) => {
            const { over } = event;
            setDragOverId(over ? String(over.id) : null);
        };

        const handleClearSequence = () => {
            if (confirm('Are you sure you want to clear the current sequence?')) {
                setSequence([]);
                setRunStatus('idle');
                setRunMessage(null);
            }
        };

        const handleCloseEditMode = () => {
            setActiveSavedSequenceId(null);
            setSequence([]);
            setRunStatus('idle');
            setRunMessage(null);
        };

        const handlePlaySequence = useCallback(async () => {
            if (!canPlaySequence || !selectedProfile) return;

            const patternsToPlay = sequence
                .map((entry) => patternLookup.get(entry.patternId))
                .filter((p): p is Pattern => Boolean(p));

            if (patternsToPlay.length === 0) {
                setRunStatus('error');
                setRunMessage('No valid patterns in sequence.');
                return;
            }

            setRunStatus('running');
            setRunMessage(null);

            const result = await playPatternSequence(patternsToPlay, selectedProfile);
            setRunStatus(result.success ? 'success' : 'error');
            setRunMessage(result.message);
        }, [canPlaySequence, patternLookup, playPatternSequence, selectedProfile, sequence]);

        const handlePlaySavedSequence = useCallback(
            async (seq: PlaybackSequence) => {
                if (!selectedProfile) {
                    setRunStatus('error');
                    setRunMessage('Select a calibration profile before playing.');
                    return;
                }

                const patternsToPlay = seq.patternIds
                    .map((id) => patternLookup.get(id))
                    .filter((p): p is Pattern => Boolean(p));

                if (patternsToPlay.length === 0) {
                    setRunStatus('error');
                    setRunMessage('No valid patterns in this sequence.');
                    return;
                }

                setRunStatus('running');
                setRunMessage(null);

                const result = await playPatternSequence(patternsToPlay, selectedProfile);
                setRunStatus(result.success ? 'success' : 'error');
                setRunMessage(result.message);
            },
            [patternLookup, playPatternSequence, selectedProfile],
        );

        // Save/Load Handlers
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

        const handleStartNewSequence = useCallback(() => {
            const name = deriveDefaultSequenceName();
            const newId = `seq-${Date.now().toString(36)}`;
            setSequence([]);
            persistSequencePayload(newId, name);
            setRunStatus('success');
            setRunMessage(`Created "${name}". Add patterns to begin.`);
        }, [deriveDefaultSequenceName, persistSequencePayload]);

        const handleEditSequence = useCallback(
            (seq: PlaybackSequence) => {
                // Load sequence into queue
                const filtered = seq.patternIds.filter((id) => patternLookup.has(id));
                if (filtered.length === 0) {
                    setRunStatus('error');
                    setRunMessage(
                        'This saved sequence no longer has any valid patterns. Add patterns and re-save.',
                    );
                    setSequence([]);
                    setActiveSavedSequenceId(null);
                    return;
                }
                const queuedItems: QueuedPattern[] = filtered.map((pid) => ({
                    id: generateItemId(),
                    patternId: pid,
                }));
                setSequence(queuedItems);
                setActiveSavedSequenceId(seq.id);
                if (onSelectPatternId) {
                    onSelectPatternId(filtered[0]); // Select the first pattern in the sequence
                }
                setRunStatus('idle');
                setRunMessage(null);
            },
            [generateItemId, onSelectPatternId, patternLookup],
        );

        const handleDeleteSavedSequence = useCallback(
            (seqId: string) => {
                const target = savedSequences.find((entry) => entry.id === seqId);
                if (!target) {
                    return;
                }
                if (confirm(`Delete "${target.name}"?`)) {
                    const next = removePlaybackSequence(storage, seqId);
                    setSavedSequences(next);
                    if (activeSavedSequenceId === seqId) {
                        handleCloseEditMode();
                    }
                    setRunStatus('idle');
                    setRunMessage(`Deleted "${target.name}".`);
                }
            },
            [activeSavedSequenceId, savedSequences, storage],
        );

        const handleOpenRenameModal = useCallback((seq: PlaybackSequence) => {
            setRenameState({ sequenceId: seq.id, value: seq.name });
        }, []);

        const handleRenameSubmit = useCallback(
            (e: React.FormEvent) => {
                e.preventDefault();
                if (!renameState) return;
                const name = renameState.value.trim();
                if (name) {
                    const target = savedSequences.find((s) => s.id === renameState.sequenceId);
                    if (target) {
                        persistSequencePayload(target.id, name, target);
                    }
                }
                setRenameState(null);
            },
            [persistSequencePayload, renameState, savedSequences],
        );

        const handleRenameInputChange = useCallback(
            (event: React.ChangeEvent<HTMLInputElement>) => {
                const value = event.target.value;
                setRenameState((previous) => (previous ? { ...previous, value } : previous));
            },
            [],
        );
        const handleCloseRenameModal = useCallback(() => setRenameState(null), []);

        const isRenameDisabled = !renameState?.value.trim();

        return (
            <section className="flex flex-col gap-6">
                {runMessage && (
                    <div
                        className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                            runStatus === 'error'
                                ? 'border-red-500/60 bg-red-900/30 text-red-100'
                                : 'border-emerald-500/50 bg-emerald-900/30 text-emerald-100'
                        }`}
                    >
                        {runMessage}
                    </div>
                )}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-h-[1.75rem]">
                        {isEditMode && activeSequence && (
                            <span className="rounded bg-cyan-900/50 px-2 py-0.5 text-xs text-cyan-200">
                                Editing
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {isEditMode && (
                            <button
                                type="button"
                                onClick={handleCloseEditMode}
                                className="rounded-md border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700"
                            >
                                Close Edit Mode
                            </button>
                        )}
                        {isEditMode && (
                            <button
                                type="button"
                                onClick={handleClearSequence}
                                disabled={sequence.length === 0}
                                className="rounded-md border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                            >
                                Clear Sequence
                            </button>
                        )}
                        {!isEditMode && (
                            <button
                                type="button"
                                onClick={handleStartNewSequence}
                                className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-500"
                            >
                                New Sequence
                            </button>
                        )}
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

                    {isEditMode && activeSequence && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan-800/60 bg-cyan-950/30 p-3">
                            <div className="flex items-center gap-3">
                                <SequencePreview
                                    patternIds={activeSequence.patternIds}
                                    patterns={patterns}
                                    className="h-12 w-24 flex-none rounded border border-cyan-500/40 bg-gray-950"
                                />
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-semibold text-cyan-100">
                                        {activeSequence.name}
                                    </span>
                                    <span className="text-xs text-cyan-200/80">
                                        Editing this sequence; others are hidden.
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handlePlaySequence}
                                    disabled={!canPlaySequence}
                                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                                        canPlaySequence
                                            ? 'bg-emerald-600 hover:bg-emerald-500'
                                            : 'cursor-not-allowed bg-gray-700 opacity-50'
                                    }`}
                                >
                                    {runStatus === 'running' ? 'Playing…' : 'Play'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleOpenRenameModal(activeSequence)}
                                    className="rounded-md border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-cyan-400 hover:text-cyan-200"
                                >
                                    Rename
                                </button>
                            </div>
                        </div>
                    )}

                    {isEditMode && (
                        <div
                            className={`rounded-md border border-gray-800 bg-gray-950/60 p-3 transition ${
                                isDragHovering
                                    ? 'ring-2 ring-emerald-500/80 ring-offset-2 ring-offset-gray-900'
                                    : ''
                            }`}
                            onDragOver={(event) => {
                                if (
                                    event.dataTransfer.types.includes('application/x-pattern-id') ||
                                    event.dataTransfer.types.includes('text/plain')
                                ) {
                                    event.preventDefault();
                                    setIsDragHovering(true);
                                    setDragOverId(
                                        sequence.length > 0
                                            ? sequence[sequence.length - 1].id
                                            : null,
                                    );
                                }
                            }}
                            onDragLeave={() => {
                                setIsDragHovering(false);
                                setDragOverId(null);
                            }}
                            onDrop={(event) => {
                                if (
                                    event.dataTransfer.types.includes('application/x-pattern-id') ||
                                    event.dataTransfer.types.includes('text/plain')
                                ) {
                                    event.preventDefault();
                                    const patternId =
                                        event.dataTransfer.getData('application/x-pattern-id') ||
                                        event.dataTransfer.getData('text/plain');
                                    if (patternId) {
                                        addPatternById(patternId);
                                    }
                                }
                                setIsDragHovering(false);
                                setDragOverId(null);
                            }}
                        >
                            {sequence.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    Drag patterns from the library or use the + icon to build a
                                    sequence.
                                </p>
                            ) : (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragOver={handleDragOver}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={sequence.map((s) => s.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <ol
                                            className="space-y-2"
                                            aria-label="Playback sequence list"
                                        >
                                            {sequence.map((entry, index) => {
                                                const pattern = patternLookup.get(entry.patternId);
                                                const validation = validationResults.byItemId.get(
                                                    entry.id,
                                                );
                                                const isDropTarget = dragOverId === entry.id;
                                                return (
                                                    <React.Fragment key={entry.id}>
                                                        {isDropTarget && (
                                                            <div
                                                                className="h-0.5 rounded-full bg-emerald-500/70"
                                                                aria-hidden
                                                            />
                                                        )}
                                                        <SortableItem
                                                            entry={entry}
                                                            index={index}
                                                            sequenceLength={sequence.length}
                                                            pattern={pattern}
                                                            validation={validation}
                                                            onRemove={handleRemoveFromSequence}
                                                            isDropTarget={isDropTarget}
                                                        />
                                                    </React.Fragment>
                                                );
                                            })}
                                            {dragOverId === null && sequence.length > 0 && (
                                                <div
                                                    className="h-0.5 rounded-full bg-transparent"
                                                    aria-hidden
                                                />
                                            )}
                                        </ol>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    )}

                    {!isEditMode && (
                        <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-100">
                                    Saved Sequences
                                </p>
                                <span className="text-xs text-gray-400">
                                    {savedSequences.length} saved
                                </span>
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
                                                <div className="flex flex-1 items-center gap-3 overflow-hidden">
                                                    <SequencePreview
                                                        patternIds={entry.patternIds}
                                                        patterns={patterns}
                                                        className="h-12 w-24 flex-none rounded border border-gray-700/50 bg-gray-950"
                                                    />
                                                    <div className="flex min-w-0 flex-col gap-1 text-sm text-gray-100">
                                                        <div className="flex items-center gap-2">
                                                            <span className="truncate font-semibold">
                                                                {entry.name}
                                                            </span>
                                                            {isActive && (
                                                                <span className="flex-none rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-cyan-100">
                                                                    Loaded
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="truncate text-xs text-gray-400">
                                                            {patternCount} pattern
                                                            {patternCount === 1 ? '' : 's'} ·
                                                            Updated{' '}
                                                            {new Date(
                                                                entry.updatedAt,
                                                            ).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handlePlaySavedSequence(entry)
                                                        }
                                                        disabled={isPlaying || !selectedProfile}
                                                        className="rounded-md border border-emerald-600/50 bg-emerald-900/20 px-3 py-2 text-emerald-100 transition hover:bg-emerald-900/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                                        title="Play sequence immediately"
                                                    >
                                                        {isPlaying ? 'Playing…' : 'Play'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditSequence(entry)}
                                                        className="rounded-md border border-gray-700 px-3 py-2 text-gray-100 transition hover:border-cyan-400 hover:text-cyan-200"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenRenameModal(entry)}
                                                        aria-label={`Rename sequence ${entry.name}`}
                                                        className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
                                                        title="Rename sequence"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth={1.5}
                                                            className="h-4 w-4"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M16.862 4.487l2.651 2.651a1.5 1.5 0 010 2.122l-8.19 8.19a2.25 2.25 0 01-.948.57l-3.356 1.007 1.007-3.356a2.25 2.25 0 01.57-.948l8.19-8.19a1.5 1.5 0 012.121 0z"
                                                            />
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M19.5 13.5V19.5A1.5 1.5 0 0118 21H5.25A1.5 1.5 0 013.75 19.5V6A1.5 1.5 0 015.25 4.5H11.25"
                                                            />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleDeleteSavedSequence(entry.id)
                                                        }
                                                        className="rounded p-2 text-gray-400 hover:bg-red-900/40 hover:text-red-200"
                                                        aria-label={`Delete sequence ${entry.name}`}
                                                        title="Delete sequence"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth={1.5}
                                                            className="h-4 w-4"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

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
    },
);

PlaybackSequenceManager.displayName = 'PlaybackSequenceManager';

export default PlaybackSequenceManager;
