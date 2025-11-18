import React, { useCallback, useMemo, useState } from 'react';

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
    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [runMessage, setRunMessage] = useState<string | null>(null);

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

    const plan: ProfilePlaybackPlanResult = useMemo(
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
        () => plan.tiles.filter((tile) => tile.patternPointId),
        [plan.tiles],
    );

    const canSendPlayback =
        plan.playableAxisTargets.length > 0 && plan.errors.length === 0 && runStatus !== 'running';

    const sendPlayback = useCallback(
        async (targets: ProfilePlaybackAxisTarget[]) => {
            if (targets.length === 0) {
                return;
            }
            setRunStatus('running');
            setRunMessage(null);
            try {
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
                    const message = `${failures.length}/${targets.length} motor commands failed.`;
                    logError('Playback', message);
                    setRunStatus('error');
                    setRunMessage(message);
                    return;
                }
                const successMessage = `Sent ${targets.length} axis moves for "${selectedPattern?.name ?? 'pattern'}".`;
                logInfo('Playback', successMessage);
                setRunStatus('success');
                setRunMessage(successMessage);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'Unexpected playback error.';
                logError('Playback', message);
                setRunStatus('error');
                setRunMessage(message);
            }
        },
        [logError, logInfo, moveMotor, selectedPattern],
    );

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
                <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-gray-400">
                        {plan.playableAxisTargets.length > 0
                            ? `Ready to move ${plan.playableAxisTargets.length} axes.`
                            : 'Select a pattern and calibration profile to compute a plan.'}
                    </div>
                    <button
                        type="button"
                        disabled={!canSendPlayback}
                        onClick={() => sendPlayback(plan.playableAxisTargets)}
                        className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                            canSendPlayback
                                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                : 'cursor-not-allowed bg-gray-700 text-gray-400'
                        }`}
                    >
                        {runStatus === 'running' ? 'Sending…' : 'Send Playback'}
                    </button>
                </div>
                {runMessage && (
                    <p
                        className={`mt-2 text-sm ${
                            runStatus === 'error' ? 'text-red-300' : 'text-emerald-300'
                        }`}
                    >
                        {runMessage}
                    </p>
                )}
            </section>

            <section className="rounded-lg border border-gray-800/70 bg-gray-900/40 p-4 shadow">
                <h3 className="text-sm font-semibold text-gray-200">Validation</h3>
                {plan.errors.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-sm text-amber-200">
                        {plan.errors.map((error, index) => (
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
