import React, { useCallback, useMemo, useState } from 'react';

import CalibrationCommandLog from '@/components/calibration/CalibrationCommandLog';
import CalibrationSummaryModal from '@/components/calibration/CalibrationSummaryModal';
import MoveActionsDropdown from '@/components/calibration/MoveActionsDropdown';
import TileAxisAction from '@/components/calibration/TileAxisAction';
import TileDebugModal from '@/components/calibration/TileDebugModal';
import CollapsibleSection from '@/components/common/CollapsibleSection';
import {
    getTileStatusClasses,
    getTileErrorTextClass,
    TILE_WARNING_TEXT_CLASS,
} from '@/constants/calibrationUiThemes';
import type { DriverView } from '@/context/StatusContext';
import type { CalibrationController, CalibrationMode } from '@/hooks/useCalibrationController';
import type { CalibrationRunSummary } from '@/services/calibrationRunner';
import type { ArrayRotation, Motor, MotorTelemetry, StagingPosition } from '@/types';

interface CalibrationRunnerPanelProps {
    controller: CalibrationController;
    drivers: DriverView[];
    /**
     * Summary from a loaded calibration profile. When present, shows calibration actions
     * even if no calibration has been run in the current session.
     */
    loadedProfileSummary?: CalibrationRunSummary | null;
    gridSize: { rows: number; cols: number };
    arrayRotation: ArrayRotation;
    stagingPosition: StagingPosition;
}

const CalibrationRunnerPanel: React.FC<CalibrationRunnerPanelProps> = ({
    controller,
    drivers,
    loadedProfileSummary,
    gridSize,
    arrayRotation,
    stagingPosition,
}) => {
    const {
        runnerState,
        runnerSettings,
        commandLog,
        stepState,
        tileEntries,
        isActive,
        isAwaitingAdvance,
        detectionReady,
        mode,
        setMode,
        start,
        pause,
        resume,
        abort,
        advance,
    } = controller;

    const phaseLabel = runnerState.phase.charAt(0).toUpperCase() + runnerState.phase.slice(1);
    const activeTileLabel = runnerState.activeTile
        ? `R${runnerState.activeTile.row}C${runnerState.activeTile.col}`
        : '—';
    const isRunnerBusy =
        runnerState.phase === 'homing' ||
        runnerState.phase === 'staging' ||
        runnerState.phase === 'measuring' ||
        runnerState.phase === 'aligning';
    const isRunnerPaused = runnerState.phase === 'paused';
    const canStartRunner = mode === 'step' ? !isActive : !isRunnerBusy && !isRunnerPaused;
    const canPauseRunner = mode === 'step' ? false : isRunnerBusy;
    const canResumeRunner = mode === 'step' ? false : isRunnerPaused;
    const canAbortRunner = mode === 'step' ? isActive : isRunnerBusy || isRunnerPaused;

    // Use runner's blueprint if available, otherwise fall back to loaded profile's blueprint
    const runnerBlueprint = runnerState.summary?.gridBlueprint;
    const loadedBlueprint = loadedProfileSummary?.gridBlueprint;
    const blueprint = runnerBlueprint ?? loadedBlueprint;
    const [debugTileKey, setDebugTileKey] = useState<string | null>(null);
    const [summaryModalOpen, setSummaryModalOpen] = useState(false);

    const debugTileEntry = useMemo(() => {
        if (!debugTileKey) {
            return null;
        }
        return tileEntries.find((entry) => entry.tile.key === debugTileKey) ?? null;
    }, [debugTileKey, tileEntries]);
    const debugTileSummary = useMemo(() => {
        if (!debugTileKey || !runnerState.summary) {
            return null;
        }
        return runnerState.summary.tiles[debugTileKey] ?? null;
    }, [runnerState.summary, debugTileKey]);
    const stepTestSnapshot =
        runnerState.summary?.stepTestSettings ??
        ({
            deltaSteps: runnerSettings.deltaSteps,
        } as const);
    const telemetryMap = useMemo(() => {
        const map = new Map<string, MotorTelemetry>();
        drivers.forEach((driver) => {
            const topicMac = driver.snapshot.topicMac;
            Object.values(driver.snapshot.motors).forEach((motor) => {
                map.set(`${topicMac}-${motor.id}`, {
                    id: motor.id,
                    position: motor.position,
                    moving: motor.moving,
                    awake: motor.awake,
                    homed: motor.homed,
                    stepsSinceHome: motor.stepsSinceHome,
                });
            });
        });
        return map;
    }, [drivers]);

    const getTelemetryForMotor = useCallback(
        (motor: Motor | null): MotorTelemetry | undefined => {
            if (!motor) {
                return undefined;
            }
            return telemetryMap.get(`${motor.nodeMac}-${motor.motorIndex}`);
        },
        [telemetryMap],
    );

    const handleInspectTile = useCallback((tileKey: string) => {
        setDebugTileKey(tileKey);
    }, []);

    const closeDebugModal = useCallback(() => {
        setDebugTileKey(null);
    }, []);

    const handleTileCardClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>, tileKey: string) => {
            const target = event.target as HTMLElement | null;
            const interactiveAncestor = target?.closest(
                'button, a, input, textarea, select, [role="button"]',
            );
            if (interactiveAncestor && interactiveAncestor !== event.currentTarget) {
                return;
            }
            handleInspectTile(tileKey);
        },
        [handleInspectTile],
    );

    const handleTileCardKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>, tileKey: string) => {
            if (event.currentTarget !== event.target) {
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleInspectTile(tileKey);
            }
        },
        [handleInspectTile],
    );

    const gridColumnCount =
        tileEntries.reduce((max, entry) => (entry.tile.col > max ? entry.tile.col : max), 0) + 1;

    return (
        <>
            <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-emerald-300">
                            Auto-Calibration Runner
                        </h2>
                        <p className="text-sm text-gray-400">
                            Phase: <span className="font-mono text-gray-200">{phaseLabel}</span>
                        </p>
                        <p className="text-sm text-gray-400">
                            Active tile:{' '}
                            <span className="font-mono text-gray-200">{activeTileLabel}</span>
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-gray-500">
                                Mode
                            </span>
                            <div className="flex rounded-md border border-gray-700 bg-gray-900 text-xs font-semibold">
                                {(['auto', 'step'] as CalibrationMode[]).map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        className={`px-3 py-1 transition-colors ${
                                            mode === m
                                                ? 'bg-emerald-700 text-white'
                                                : 'text-gray-300 hover:bg-gray-800'
                                        } first:rounded-l-md last:rounded-r-md`}
                                        onClick={() => setMode(m)}
                                        aria-pressed={mode === m}
                                    >
                                        {m === 'auto' ? 'Auto' : 'Step-by-step'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                canStartRunner && detectionReady
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canStartRunner || !detectionReady}
                            onClick={start}
                        >
                            Start
                        </button>
                        {mode === 'step' && (
                            <button
                                type="button"
                                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                    isAwaitingAdvance
                                        ? 'bg-sky-600 text-white hover:bg-sky-500'
                                        : 'bg-gray-800 text-gray-500'
                                }`}
                                disabled={!isAwaitingAdvance}
                                onClick={advance}
                            >
                                Next step
                            </button>
                        )}
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                canPauseRunner
                                    ? 'bg-amber-600 text-white hover:bg-amber-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canPauseRunner}
                            onClick={pause}
                            title={mode === 'step' ? 'Pause not available in step mode' : ''}
                        >
                            Pause
                        </button>
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                canResumeRunner
                                    ? 'bg-sky-600 text-white hover:bg-sky-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canResumeRunner}
                            onClick={resume}
                            title={mode === 'step' ? 'Resume not available in step mode' : ''}
                        >
                            Resume
                        </button>
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                canAbortRunner
                                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canAbortRunner}
                            onClick={abort}
                        >
                            Abort
                        </button>
                    </div>
                </div>
                {/* Step mode action required indicator */}
                {mode === 'step' && isAwaitingAdvance && (
                    <div className="mt-3 flex items-center gap-2 rounded-md border border-sky-500/50 bg-sky-500/10 px-3 py-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                        <span className="text-xs font-medium text-sky-200">
                            Action required — click &ldquo;Next step&rdquo; to continue
                        </span>
                        {stepState?.step.label && (
                            <span className="ml-auto text-xs text-sky-300/70">
                                {stepState.step.label}
                            </span>
                        )}
                    </div>
                )}
                {runnerState.error && (
                    <div className="mt-3 rounded-md border border-rose-500/60 bg-rose-900/30 px-3 py-2 text-sm font-semibold text-rose-100">
                        {runnerState.error}
                    </div>
                )}
                {/* Progress Bar */}
                {runnerState.progress.total > 0 && (
                    <div className="mt-4">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                            <div className="flex h-full">
                                <div
                                    className="bg-emerald-500 transition-all duration-300"
                                    style={{
                                        width: `${(runnerState.progress.completed / runnerState.progress.total) * 100}%`,
                                    }}
                                />
                                <div
                                    className="bg-rose-500 transition-all duration-300"
                                    style={{
                                        width: `${(runnerState.progress.failed / runnerState.progress.total) * 100}%`,
                                    }}
                                />
                                <div
                                    className="bg-gray-600 transition-all duration-300"
                                    style={{
                                        width: `${(runnerState.progress.skipped / runnerState.progress.total) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
                <div className="mt-4 grid gap-3 text-sm text-gray-300 sm:grid-cols-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Ready tiles</p>
                        <p className="font-semibold">{runnerState.progress.total}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Completed</p>
                        <p className="font-semibold text-emerald-300">
                            {runnerState.progress.completed}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Failed</p>
                        <p className="font-semibold text-rose-300">{runnerState.progress.failed}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Skipped</p>
                        <p className="font-semibold text-gray-400">
                            {runnerState.progress.skipped}
                        </p>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <MoveActionsDropdown
                        runnerState={runnerState}
                        tileEntries={tileEntries}
                        isRunnerBusy={isRunnerBusy}
                        loadedProfileSummary={loadedProfileSummary}
                        gridSize={gridSize}
                        arrayRotation={arrayRotation}
                        stagingPosition={stagingPosition}
                    />
                    {blueprint && (
                        <button
                            type="button"
                            onClick={() => setSummaryModalOpen(true)}
                            className="text-xs text-gray-500 hover:text-gray-300 hover:underline"
                        >
                            View calibration math
                        </button>
                    )}
                </div>
                <CalibrationCommandLog entries={commandLog} mode={mode} />
                <CollapsibleSection
                    title="Tile Statuses"
                    defaultExpanded
                    collapsedSummary={`${runnerState.progress.completed}/${runnerState.progress.total} completed`}
                    icon={
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                            />
                        </svg>
                    }
                    headerActions={
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm bg-gray-700" /> Pending
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm bg-sky-700" /> Staged
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm bg-amber-600" /> Measuring
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm bg-emerald-600" /> Completed
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm bg-rose-600" /> Failed
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm bg-gray-600" /> Skipped
                            </span>
                        </div>
                    }
                    className="mt-4"
                >
                    <div
                        className="grid gap-2"
                        style={{
                            gridTemplateColumns: `repeat(${Math.max(gridColumnCount, 1)}, minmax(0, 1fr))`,
                        }}
                    >
                        {tileEntries.map((entry) => (
                            <div
                                key={entry.tile.key}
                                role="button"
                                tabIndex={0}
                                aria-label={`Inspect calibration metrics for tile [${entry.tile.row},${entry.tile.col}]`}
                                onClick={(event) => handleTileCardClick(event, entry.tile.key)}
                                onKeyDown={(event) => handleTileCardKeyDown(event, entry.tile.key)}
                                className={`rounded-md border px-2 py-1.5 text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${getTileStatusClasses(entry.status)} ${entry.status === 'completed' ? 'cursor-pointer' : 'cursor-help'}`}
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] font-semibold">
                                    <span className="font-mono">
                                        [{entry.tile.row},{entry.tile.col}]
                                    </span>
                                    <span className="text-xs capitalize font-medium">
                                        {entry.status}
                                    </span>
                                </div>
                                {entry.error && (
                                    <div
                                        className={`mt-1 text-[10px] leading-tight ${getTileErrorTextClass(entry.status)}`}
                                    >
                                        {entry.error}
                                    </div>
                                )}
                                {entry.warnings && entry.warnings.length > 0 && (
                                    <div
                                        className={`mt-1 text-[10px] leading-tight ${TILE_WARNING_TEXT_CLASS}`}
                                    >
                                        {entry.warnings.map((warning, idx) => (
                                            <div key={idx}>{warning}</div>
                                        ))}
                                    </div>
                                )}
                                {(entry.assignment.x || entry.assignment.y) && (
                                    <div className="mt-2 rounded-md border border-gray-800/70 bg-gray-950/60 p-1.5 text-[10px] text-gray-200">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <TileAxisAction
                                                axis="x"
                                                motor={entry.assignment.x}
                                                telemetry={getTelemetryForMotor(entry.assignment.x)}
                                                layout="inline"
                                                className="flex-1 min-w-[120px]"
                                                showHomeButton
                                            />
                                            <TileAxisAction
                                                axis="y"
                                                motor={entry.assignment.y}
                                                telemetry={getTelemetryForMotor(entry.assignment.y)}
                                                layout="inline"
                                                className="flex-1 min-w-[120px]"
                                                showHomeButton
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            </section>
            <TileDebugModal
                open={Boolean(debugTileKey)}
                entry={debugTileEntry}
                summaryTile={debugTileSummary}
                onClose={closeDebugModal}
                stepTestSettings={stepTestSnapshot}
                getTelemetryForMotor={getTelemetryForMotor}
            />
            <CalibrationSummaryModal
                open={summaryModalOpen}
                summary={runnerState.summary ?? null}
                onClose={() => setSummaryModalOpen(false)}
            />
        </>
    );
};

export default CalibrationRunnerPanel;
