import React, { useCallback, useMemo, useRef, useState } from 'react';

import CalibrationProfileSelector from '@/components/calibration/CalibrationProfileSelector';
import PatternLibraryList from '@/components/PatternLibraryList';
import PlaybackSequenceManager, {
    type PlaybackSequenceManagerHandle,
} from '@/components/playback/PlaybackSequenceManager';
import { useCalibrationContext } from '@/context/CalibrationContext';
import { useLogStore } from '@/context/LogContext';
import { usePatternContext } from '@/context/PatternContext';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import {
    planProfilePlayback,
    type ProfilePlaybackAxisTarget,
    type ProfilePlaybackPlanResult,
} from '@/services/profilePlaybackPlanner';
import type { MirrorConfig, Pattern } from '@/types';

interface PlaybackPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    onNavigate: (page: 'patterns') => void;
}

const PlaybackPage: React.FC<PlaybackPageProps> = ({ gridSize, mirrorConfig, onNavigate }) => {
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );
    const { moveMotor } = useMotorCommands();
    const { logInfo, logError } = useLogStore();

    // Contexts
    const { patterns, selectedPatternId, selectPattern } = usePatternContext();
    const {
        profiles: calibrationProfiles,
        selectedProfileId: selectedCalibrationProfileId,
        selectProfile: selectCalibrationProfile,
        selectedProfile: selectedCalibrationProfile,
    } = useCalibrationContext();

    const selectedPattern = useMemo(
        () => patterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
        [patterns, selectedPatternId],
    );

    const sequenceManagerRef = useRef<PlaybackSequenceManagerHandle | null>(null);
    const [editState, setEditState] = useState<{ isEditing: boolean; sequenceName: string | null }>(
        { isEditing: false, sequenceName: null },
    );
    const isEditingSequence = editState.isEditing;

    const previewPlan: ProfilePlaybackPlanResult = useMemo(
        () =>
            planProfilePlayback({
                gridSize,
                mirrorConfig,
                profile: selectedCalibrationProfile,
                pattern: selectedPattern,
            }),
        [gridSize, mirrorConfig, selectedPattern, selectedCalibrationProfile],
    );

    const assignedTiles = useMemo(
        () => (selectedPattern ? previewPlan.tiles.filter((tile) => tile.patternPointId) : []),
        [previewPlan.tiles, selectedPattern],
    );

    const validationByPatternId = useMemo(() => {
        if (!selectedCalibrationProfile) {
            return null;
        }

        const map = new Map<string, { isValid: boolean; message?: string; details?: string }>();

        patterns.forEach((pattern) => {
            if (pattern.points.length === 0) {
                map.set(pattern.id, {
                    isValid: false,
                    message: 'Empty pattern',
                    details: 'Add at least one point to enable playback.',
                });
                return;
            }

            const plan = planProfilePlayback({
                gridSize,
                mirrorConfig,
                profile: selectedCalibrationProfile,
                pattern,
            });

            const relevantErrors = plan.errors.filter(
                (error) => error.code !== 'missing_profile' && error.code !== 'missing_pattern',
            );

            if (relevantErrors.length === 0) {
                map.set(pattern.id, { isValid: true });
                return;
            }

            const outOfBoundsErrors = relevantErrors.filter(
                (error) => error.code === 'target_out_of_bounds',
            );
            const prioritizedErrors =
                outOfBoundsErrors.length > 0 ? outOfBoundsErrors : relevantErrors;

            const message =
                outOfBoundsErrors.length > 0
                    ? `Points out of bounds (${outOfBoundsErrors.length})`
                    : prioritizedErrors[0].message;

            const detailsList = prioritizedErrors.slice(0, 3).map((error) => {
                const pointLabel = error.patternPointId ? `Point ${error.patternPointId}` : 'Point';
                const axisLabel = error.axis ? ` ${error.axis.toUpperCase()}` : '';
                const tileLabel = error.mirrorId ? ` @ ${error.mirrorId}` : '';
                return `${pointLabel}${axisLabel}${tileLabel}: ${error.message}`;
            });

            const remainingCount = prioritizedErrors.length > 3 ? prioritizedErrors.length - 3 : 0;
            const details =
                detailsList.join(' • ') + (remainingCount > 0 ? ` • +${remainingCount} more` : '');

            map.set(pattern.id, {
                isValid: false,
                message,
                details,
            });
        });

        return map;
    }, [gridSize, mirrorConfig, patterns, selectedCalibrationProfile]);

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

    const getValidationStatus = useCallback(
        (pattern: Pattern) => {
            if (!selectedCalibrationProfile) {
                // Cannot validate without profile, assume valid or neutral
                return { isValid: true };
            }
            return validationByPatternId?.get(pattern.id) ?? { isValid: true };
        },
        [selectedCalibrationProfile, validationByPatternId],
    );

    const handleEditPattern = useCallback(
        (pattern: Pattern) => {
            selectPattern(pattern.id);
            onNavigate('patterns');
        },
        [onNavigate, selectPattern],
    );

    const handleAddPatternToSequence = useCallback(
        (pattern: Pattern) => {
            sequenceManagerRef.current?.addPatternById(pattern.id);
            selectPattern(pattern.id);
        },
        [selectPattern],
    );

    const handleQuickPlay = useCallback(
        async (pattern: Pattern) => {
            if (!selectedCalibrationProfile) {
                logError('Playback', 'Select a calibration profile before playing a pattern.');
                return;
            }

            const plan = planProfilePlayback({
                gridSize,
                mirrorConfig,
                profile: selectedCalibrationProfile,
                pattern,
            });

            if (plan.errors.length > 0) {
                logError('Playback', plan.errors[0].message);
                return;
            }

            try {
                await dispatchPlayback(plan.playableAxisTargets, pattern.name);
            } catch (error) {
                if (error instanceof Error) {
                    logError('Playback', error.message);
                }
            }
        },
        [dispatchPlayback, gridSize, logError, mirrorConfig, selectedCalibrationProfile],
    );

    const handleEditStateChange = useCallback(
        (state: { isEditing: boolean; sequenceName: string | null }) => {
            setEditState(state);
        },
        [],
    );

    return (
        <div className="flex h-full gap-6">
            {/* Left Sidebar: Pattern Library */}
            <div className="flex w-80 flex-none flex-col gap-4 rounded-lg bg-gray-900/50 p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-100">Patterns</h2>
                </div>

                <PatternLibraryList
                    patterns={patterns}
                    selectedPatternId={selectedPatternId}
                    onSelect={selectPattern}
                    onEdit={handleEditPattern}
                    onAdd={isEditingSequence ? handleAddPatternToSequence : undefined}
                    onPlay={handleQuickPlay}
                    enableDragAdd={isEditingSequence}
                    disablePrimaryClick
                    suppressSelectionHighlight
                    getValidationStatus={getValidationStatus}
                    className="flex-1"
                />
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto pr-2">
                <section className="rounded-md border border-gray-800/60 bg-gray-950/40 p-4">
                    <CalibrationProfileSelector
                        profiles={calibrationProfiles}
                        selectedProfileId={selectedCalibrationProfileId ?? ''}
                        onSelect={selectCalibrationProfile}
                        label="Calibration Profile"
                        placeholder="No calibration profiles"
                        selectClassName="min-w-[10rem] flex-none max-w-[14rem]"
                    />
                </section>

                <PlaybackSequenceManager
                    ref={sequenceManagerRef}
                    patterns={patterns}
                    selectedProfile={selectedCalibrationProfile}
                    gridSize={gridSize}
                    mirrorConfig={mirrorConfig}
                    storage={resolvedStorage}
                    onSelectPatternId={selectPattern}
                    onEditStateChange={handleEditStateChange}
                    dispatchPlayback={dispatchPlayback}
                />

                <section className="rounded-lg border border-gray-800/70 bg-gray-900/50 p-4 shadow">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-200">Pattern preview</h3>
                            <p className="text-xs text-gray-400">
                                Click a pattern to inspect its targets with the current calibration
                                profile.
                            </p>
                        </div>
                    </div>
                    {!selectedPattern ? (
                        <p className="mt-3 text-sm text-gray-400">
                            Select a pattern from the library to see its planned targets.
                        </p>
                    ) : assignedTiles.length === 0 ? (
                        <p className="mt-3 text-sm text-gray-400">
                            No playable targets found for this pattern.
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
        </div>
    );
};

export default PlaybackPage;
