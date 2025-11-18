import React, { useCallback, useMemo, useRef, useState } from 'react';

import CalibrationProfileSelector, {
    sortCalibrationProfiles,
} from '@/components/calibration/CalibrationProfileSelector';
import { useLogStore } from '@/context/LogContext';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import {
    loadCalibrationProfiles,
    loadLastCalibrationProfileId,
    persistLastCalibrationProfileId,
} from '@/services/calibrationProfileStorage';
import { loadPatterns } from '@/services/patternStorage';
import {
    planProfilePlayback,
    type ProfilePlaybackAxisTarget,
    type ProfilePlaybackPlanResult,
} from '@/services/profilePlaybackPlanner';
import type { CalibrationProfile, MirrorConfig, Pattern } from '@/types';

interface PlaybackPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

type RunStatus = 'idle' | 'running' | 'success' | 'error';

interface QueuedPattern {
    id: string;
    patternId: string;
}

const PlaybackPage: React.FC<PlaybackPageProps> = ({ gridSize, mirrorConfig }) => {
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );
    const { moveMotor } = useMotorCommands();
    const { logInfo, logError } = useLogStore();

    const initialProfilesState = useMemo(() => {
        const entries = sortCalibrationProfiles(loadCalibrationProfiles(resolvedStorage));
        const lastSelected = loadLastCalibrationProfileId(resolvedStorage);
        const selected =
            lastSelected && entries.some((entry) => entry.id === lastSelected)
                ? lastSelected
                : (entries[0]?.id ?? '');
        return { entries, selected };
    }, [resolvedStorage]);

    const initialPatterns = useMemo(() => loadPatterns(resolvedStorage), [resolvedStorage]);

    const [profiles, setProfiles] = useState<CalibrationProfile[]>(initialProfilesState.entries);
    const [selectedProfileId, setSelectedProfileId] = useState(initialProfilesState.selected);
    const [patterns, setPatterns] = useState<Pattern[]>(initialPatterns);
    const [selectedPatternId, setSelectedPatternId] = useState(initialPatterns[0]?.id ?? '');
    const [sequence, setSequence] = useState<QueuedPattern[]>([]);
    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [runMessage, setRunMessage] = useState<string | null>(null);
    const sequenceIdRef = useRef(0);

    const selectedProfile = useMemo(
        () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
        [profiles, selectedProfileId],
    );
    const selectedPattern = useMemo(
        () => patterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
        [patterns, selectedPatternId],
    );

    const refreshPatterns = useCallback(() => {
        const nextEntries = loadPatterns(resolvedStorage);
        setPatterns(nextEntries);
        if (nextEntries.length === 0) {
            setSelectedPatternId('');
            return;
        }
        if (!nextEntries.some((entry) => entry.id === selectedPatternId)) {
            setSelectedPatternId(nextEntries[0].id);
        }
    }, [resolvedStorage, selectedPatternId]);

    const refreshProfiles = useCallback(() => {
        const nextEntries = sortCalibrationProfiles(loadCalibrationProfiles(resolvedStorage));
        setProfiles(nextEntries);
        if (nextEntries.length === 0) {
            setSelectedProfileId('');
            persistLastCalibrationProfileId(resolvedStorage, null);
            return;
        }
        if (!nextEntries.some((entry) => entry.id === selectedProfileId)) {
            const fallback = nextEntries[0].id;
            setSelectedProfileId(fallback);
            persistLastCalibrationProfileId(resolvedStorage, fallback);
        }
    }, [resolvedStorage, selectedProfileId]);

    const handleSelectProfile = (profileId: string) => {
        setSelectedProfileId(profileId);
        persistLastCalibrationProfileId(resolvedStorage, profileId || null);
    };

    const previewPlan: ProfilePlaybackPlanResult = useMemo(
        () =>
            planProfilePlayback({
                gridSize,
                mirrorConfig,
                profile: selectedProfile,
                pattern: selectedPattern,
            }),
        [gridSize, mirrorConfig, selectedPattern, selectedProfile],
    );

    const assignedTiles = useMemo(
        () => previewPlan.tiles.filter((tile) => tile.patternPointId),
        [previewPlan.tiles],
    );

    const canAddToSequence = Boolean(selectedPatternId);
    const canPlaySequence =
        sequence.length > 0 && Boolean(selectedProfile) && runStatus !== 'running';

    const dispatchPlayback = useCallback(
        async (targets: ProfilePlaybackAxisTarget[], patternName: string) => {
            if (targets.length === 0) {
                throw new Error('No playable motors found for this pattern.');
            }
            const settled = await Promise.allSettled(
                targets.map((target) =>
                    moveMotor({
                        mac: target.motor.nodeMac,
                        motorId: target.motor.motorIndex,
                        positionSteps: target.targetSteps,
                    }),
                ),
            );
            const failures = settled.filter(
                (entry): entry is PromiseRejectedResult => entry.status === 'rejected',
            );
            if (failures.length > 0) {
                const message = `${failures.length}/${targets.length} motor commands failed for "${patternName}".`;
                logError('Playback', message);
                throw new Error(message);
            }
            const successMessage = `Sent ${targets.length} axis moves for "${patternName}".`;
            logInfo('Playback', successMessage);
        },
        [logError, logInfo, moveMotor],
    );

    const addPatternToSequence = () => {
        if (!selectedPattern) {
            setRunStatus('error');
            setRunMessage('Select a pattern to add to the playback sequence.');
            return;
        }
        const id = `queued-${Date.now()}-${sequenceIdRef.current}`;
        sequenceIdRef.current += 1;
        setSequence((prev) => [...prev, { id, patternId: selectedPattern.id }]);
        setRunStatus('idle');
        setRunMessage(`Added "${selectedPattern.name}" to the sequence.`);
    };

    const removeFromSequence = (id: string) => {
        setSequence((prev) => prev.filter((entry) => entry.id !== id));
    };

    const moveSequenceItem = (id: string, direction: -1 | 1) => {
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
    };

    const clearSequence = () => {
        setSequence([]);
    };

    const playSequence = useCallback(async () => {
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
            const pattern = patterns.find((item) => item.id === entry.patternId);
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
        mirrorConfig,
        patterns,
        selectedProfile,
        sequence,
        setRunMessage,
        setRunStatus,
        logError,
    ]);

    return (
        <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-gray-800/70 bg-gray-900/40 p-4 shadow">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <label
                            className="text-sm font-semibold text-gray-200"
                            htmlFor="pattern-select"
                        >
                            Pattern
                        </label>
                        <div className="flex gap-2">
                            <select
                                id="pattern-select"
                                className="flex-1 rounded-md border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100"
                                value={selectedPatternId}
                                onChange={(event) => setSelectedPatternId(event.target.value)}
                            >
                                {patterns.length === 0 ? (
                                    <option value="">No patterns available</option>
                                ) : (
                                    patterns.map((pattern) => (
                                        <option key={pattern.id} value={pattern.id}>
                                            {pattern.name}
                                        </option>
                                    ))
                                )}
                            </select>
                            <button
                                type="button"
                                onClick={refreshPatterns}
                                className="rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-100 hover:border-cyan-400 hover:text-cyan-200"
                            >
                                Refresh
                            </button>
                        </div>
                    </div>
                    <CalibrationProfileSelector
                        profiles={profiles}
                        selectedProfileId={selectedProfileId}
                        onSelect={handleSelectProfile}
                        onRefresh={refreshProfiles}
                    />
                </div>
                <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm text-gray-400">
                            {previewPlan.playableAxisTargets.length > 0
                                ? `Ready to move ${previewPlan.playableAxisTargets.length} axes for "${selectedPattern?.name ?? 'pattern'}".`
                                : 'Select a pattern and calibration profile to preview motor targets.'}
                        </div>
                        <div className="flex gap-2">
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
                                Add to Sequence
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
                        </div>
                    </div>

                    <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-100">
                                    Playback Sequence
                                </p>
                                <p className="text-xs text-gray-400">
                                    Patterns will play one after another in the order listed below.
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={!canPlaySequence}
                                onClick={playSequence}
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
                        {sequence.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-400">
                                No patterns queued yet. Add a pattern above to start building a run
                                list.
                            </p>
                        ) : (
                            <ol className="mt-3 space-y-2">
                                {sequence.map((entry, index) => {
                                    const pattern = patterns.find(
                                        (item) => item.id === entry.patternId,
                                    );
                                    return (
                                        <li
                                            key={entry.id}
                                            className="flex flex-col gap-2 rounded-md border border-gray-800 bg-gray-900/70 p-3 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <p className="text-sm font-semibold text-gray-100">
                                                    {index + 1}.{' '}
                                                    {pattern?.name ?? 'Missing pattern'}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {pattern
                                                        ? 'Queued for playback.'
                                                        : 'This pattern was removed. Delete it or pick a replacement.'}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
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
            </section>

            <section className="rounded-lg border border-gray-800/70 bg-gray-900/40 p-4 shadow">
                <h3 className="text-sm font-semibold text-gray-200">Validation</h3>
                {previewPlan.errors.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-sm text-amber-200">
                        {previewPlan.errors.map((error, index) => (
                            <li
                                key={`${error.code}-${error.mirrorId ?? 'global'}-${error.patternPointId ?? 'any'}-${index}`}
                                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
                            >
                                {error.message}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                        All checks passed. Motors are ready for playback.
                    </p>
                )}
            </section>

            <section className="rounded-lg border border-gray-800/70 bg-gray-900/50 p-4 shadow">
                <h3 className="text-sm font-semibold text-gray-200">Planned Targets</h3>
                {assignedTiles.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-400">
                        No pattern points assigned yet. Choose a pattern to preview the plan.
                    </p>
                ) : (
                    <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-800 text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase text-gray-400">
                                    <th className="px-3 py-2">Mirror</th>
                                    <th className="px-3 py-2">Pattern Point</th>
                                    <th className="px-3 py-2">Target (x, y)</th>
                                    <th className="px-3 py-2">Steps X</th>
                                    <th className="px-3 py-2">Steps Y</th>
                                    <th className="px-3 py-2">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-gray-200">
                                {assignedTiles.map((tile) => {
                                    const axisX = tile.axisTargets.x;
                                    const axisY = tile.axisTargets.y;
                                    return (
                                        <tr key={tile.mirrorId}>
                                            <td className="px-3 py-2 font-mono text-xs text-gray-400">
                                                {tile.mirrorId}
                                            </td>
                                            <td className="px-3 py-2">{tile.patternPointId}</td>
                                            <td className="px-3 py-2">
                                                {tile.target
                                                    ? `(${tile.target.x.toFixed(3)}, ${tile.target.y.toFixed(3)})`
                                                    : '—'}
                                            </td>
                                            <td className="px-3 py-2">
                                                {axisX ? (
                                                    axisX.targetSteps
                                                ) : (
                                                    <span className="text-amber-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                {axisY ? (
                                                    axisY.targetSteps
                                                ) : (
                                                    <span className="text-amber-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-amber-300">
                                                {tile.errors.length > 0
                                                    ? tile.errors
                                                          .map((error) => error.message)
                                                          .join(' ')
                                                    : 'Ready'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default PlaybackPage;
