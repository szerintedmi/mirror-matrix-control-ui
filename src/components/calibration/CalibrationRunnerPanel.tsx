import React, { useCallback, useMemo, useState } from 'react';

import CalibrationCommandLog from '@/components/calibration/CalibrationCommandLog';
import CalibrationHomeControls from '@/components/calibration/CalibrationHomeControls';
import CalibrationSummaryModal from '@/components/calibration/CalibrationSummaryModal';
import TileAxisAction from '@/components/calibration/TileAxisAction';
import TileDebugModal from '@/components/calibration/TileDebugModal';
import type { CalibrationRunnerSettings } from '@/constants/calibration';
import {
    getTileStatusClasses,
    getTileErrorTextClass,
    TILE_WARNING_TEXT_CLASS,
} from '@/constants/calibrationUiThemes';
import type { DriverView } from '@/context/StatusContext';
import type {
    CalibrationCommandLogEntry,
    CalibrationRunnerState,
    CalibrationRunSummary,
    CalibrationStepState,
} from '@/services/calibrationRunner';
import type { Motor, MotorTelemetry } from '@/types';

type RunMode = 'auto' | 'step';

interface CalibrationRunnerPanelProps {
    runMode: RunMode;
    onRunModeChange: (mode: RunMode) => void;
    runnerSettings: CalibrationRunnerSettings;
    detectionReady: boolean;
    drivers: DriverView[];
    autoControls: {
        runnerState: CalibrationRunnerState;
        start: () => void;
        pause: () => void;
        resume: () => void;
        abort: () => void;
        commandLog: CalibrationCommandLogEntry[];
    };
    stepControls: {
        runnerState: CalibrationRunnerState;
        stepState: CalibrationStepState | null;
        commandLog: CalibrationCommandLogEntry[];
        isAwaitingAdvance: boolean;
        isActive: boolean;
        start: () => void;
        advance: () => void;
        abort: () => void;
        reset: () => void;
    };
    /**
     * Summary from a loaded calibration profile. When present, shows calibration actions
     * even if no calibration has been run in the current session.
     */
    loadedProfileSummary?: CalibrationRunSummary | null;
}

const SUMMARY_BUTTON_CLASS =
    'rounded-md border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

const CalibrationRunnerPanel: React.FC<CalibrationRunnerPanelProps> = ({
    runMode,
    onRunModeChange,
    runnerSettings,
    detectionReady,
    drivers,
    autoControls,
    stepControls,
    loadedProfileSummary,
}) => {
    const activeRunnerState =
        runMode === 'step' ? stepControls.runnerState : autoControls.runnerState;
    const phaseLabel =
        activeRunnerState.phase.charAt(0).toUpperCase() + activeRunnerState.phase.slice(1);
    const activeTileLabel = activeRunnerState.activeTile
        ? `R${activeRunnerState.activeTile.row}C${activeRunnerState.activeTile.col}`
        : '—';
    const isRunnerBusy =
        activeRunnerState.phase === 'homing' ||
        activeRunnerState.phase === 'staging' ||
        activeRunnerState.phase === 'measuring' ||
        activeRunnerState.phase === 'aligning';
    const isRunnerPaused = activeRunnerState.phase === 'paused';
    const isStepActive = stepControls.isActive;
    const isStepAwaiting = stepControls.isAwaitingAdvance;
    const canStartRunner = runMode === 'step' ? !isStepActive : !isRunnerBusy && !isRunnerPaused;
    const canPauseRunner = runMode === 'step' ? false : isRunnerBusy;
    const canResumeRunner = runMode === 'step' ? false : isRunnerPaused;
    const canAbortRunner = runMode === 'step' ? isStepActive : isRunnerBusy || isRunnerPaused;

    // Use runner's blueprint if available, otherwise fall back to loaded profile's blueprint
    const runnerBlueprint = activeRunnerState.summary?.gridBlueprint;
    const loadedBlueprint = loadedProfileSummary?.gridBlueprint;
    const blueprint = runnerBlueprint ?? loadedBlueprint;
    const isUsingLoadedProfile = !runnerBlueprint && Boolean(loadedBlueprint);
    const handleStart = runMode === 'step' ? stepControls.start : autoControls.start;
    const handlePause = autoControls.pause;
    const handleResume = autoControls.resume;
    const handleAbort = runMode === 'step' ? stepControls.abort : autoControls.abort;
    const [debugTileKey, setDebugTileKey] = useState<string | null>(null);
    const [summaryModalOpen, setSummaryModalOpen] = useState(false);

    const displayedTileEntries = useMemo(() => {
        return Object.values(activeRunnerState.tiles).sort((a, b) => {
            if (a.tile.row === b.tile.row) {
                return a.tile.col - b.tile.col;
            }
            return a.tile.row - b.tile.row;
        });
    }, [activeRunnerState.tiles]);

    const debugTileEntry = useMemo(() => {
        if (!debugTileKey) {
            return null;
        }
        return displayedTileEntries.find((entry) => entry.tile.key === debugTileKey) ?? null;
    }, [debugTileKey, displayedTileEntries]);
    const debugTileSummary = useMemo(() => {
        if (!debugTileKey || !activeRunnerState.summary) {
            return null;
        }
        return activeRunnerState.summary.tiles[debugTileKey] ?? null;
    }, [activeRunnerState.summary, debugTileKey]);
    const stepTestSnapshot =
        activeRunnerState.summary?.stepTestSettings ??
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
        displayedTileEntries.reduce(
            (max, entry) => (entry.tile.col > max ? entry.tile.col : max),
            0,
        ) + 1;

    const activeCommandLog = useMemo(
        () => (runMode === 'step' ? stepControls.commandLog : autoControls.commandLog),
        [autoControls.commandLog, runMode, stepControls.commandLog],
    );

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
                                {(['auto', 'step'] as RunMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        className={`px-3 py-1 transition-colors ${
                                            runMode === mode
                                                ? 'bg-emerald-700 text-white'
                                                : 'text-gray-300 hover:bg-gray-800'
                                        } first:rounded-l-md last:rounded-r-md`}
                                        onClick={() => onRunModeChange(mode)}
                                        aria-pressed={runMode === mode}
                                    >
                                        {mode === 'auto' ? 'Auto' : 'Step-by-step'}
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
                            onClick={handleStart}
                        >
                            Start
                        </button>
                        {runMode === 'step' && (
                            <button
                                type="button"
                                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                    isStepAwaiting
                                        ? 'bg-sky-600 text-white hover:bg-sky-500'
                                        : 'bg-gray-800 text-gray-500'
                                }`}
                                disabled={!isStepAwaiting}
                                onClick={stepControls.advance}
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
                            onClick={handlePause}
                            title={runMode === 'step' ? 'Pause not available in step mode' : ''}
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
                            onClick={handleResume}
                            title={runMode === 'step' ? 'Resume not available in step mode' : ''}
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
                            onClick={handleAbort}
                        >
                            Abort
                        </button>
                    </div>
                </div>
                {/* Step mode action required indicator */}
                {runMode === 'step' && isStepAwaiting && (
                    <div className="mt-3 flex items-center gap-2 rounded-md border border-sky-500/50 bg-sky-500/10 px-3 py-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                        <span className="text-xs font-medium text-sky-200">
                            Action required — click &ldquo;Next step&rdquo; to continue
                        </span>
                        {stepControls.stepState?.step.label && (
                            <span className="ml-auto text-xs text-sky-300/70">
                                {stepControls.stepState.step.label}
                            </span>
                        )}
                    </div>
                )}
                {activeRunnerState.error && (
                    <div className="mt-3 rounded-md border border-rose-500/60 bg-rose-900/30 px-3 py-2 text-sm font-semibold text-rose-100">
                        {activeRunnerState.error}
                    </div>
                )}
                {/* Progress Bar */}
                {activeRunnerState.progress.total > 0 && (
                    <div className="mt-4">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                            <div className="flex h-full">
                                <div
                                    className="bg-emerald-500 transition-all duration-300"
                                    style={{
                                        width: `${(activeRunnerState.progress.completed / activeRunnerState.progress.total) * 100}%`,
                                    }}
                                />
                                <div
                                    className="bg-rose-500 transition-all duration-300"
                                    style={{
                                        width: `${(activeRunnerState.progress.failed / activeRunnerState.progress.total) * 100}%`,
                                    }}
                                />
                                <div
                                    className="bg-gray-600 transition-all duration-300"
                                    style={{
                                        width: `${(activeRunnerState.progress.skipped / activeRunnerState.progress.total) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
                <div className="mt-4 grid gap-3 text-sm text-gray-300 sm:grid-cols-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Ready tiles</p>
                        <p className="font-semibold">{activeRunnerState.progress.total}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Completed</p>
                        <p className="font-semibold text-emerald-300">
                            {activeRunnerState.progress.completed}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Failed</p>
                        <p className="font-semibold text-rose-300">
                            {activeRunnerState.progress.failed}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Skipped</p>
                        <p className="font-semibold text-gray-400">
                            {activeRunnerState.progress.skipped}
                        </p>
                    </div>
                </div>
                <CalibrationCommandLog entries={activeCommandLog} mode={runMode} />
                {blueprint && (
                    <div
                        className={`mt-4 rounded-md border p-3 text-sm ${
                            isUsingLoadedProfile
                                ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                                : 'border-emerald-600/40 bg-emerald-500/10 text-emerald-200'
                        }`}
                    >
                        {isUsingLoadedProfile && (
                            <p className="mb-2 text-xs text-sky-300/70">
                                Using loaded profile. Run calibration to update.
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p>
                                    Adjusted footprint:{' '}
                                    {(blueprint.adjustedTileFootprint.width * 100).toFixed(2)}% ×{' '}
                                    {(blueprint.adjustedTileFootprint.height * 100).toFixed(2)}%
                                </p>
                                <p>
                                    Gap: X {(blueprint.tileGap.x * 100).toFixed(2)}% · Y{' '}
                                    {(blueprint.tileGap.y * 100).toFixed(2)}%
                                </p>
                                <p
                                    className={`mt-2 text-xs ${isUsingLoadedProfile ? 'text-sky-300' : 'text-emerald-300'}`}
                                >
                                    Use the &quot;Calibration View&quot; toggle in the preview to
                                    draw this grid.
                                </p>
                            </div>
                            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                                <CalibrationHomeControls
                                    runnerState={activeRunnerState}
                                    tileEntries={displayedTileEntries}
                                    isRunnerBusy={isRunnerBusy}
                                    loadedProfileSummary={loadedProfileSummary}
                                />
                                <button
                                    type="button"
                                    onClick={() => setSummaryModalOpen(true)}
                                    className={`${SUMMARY_BUTTON_CLASS} ${
                                        isUsingLoadedProfile
                                            ? 'border-sky-500/70 text-sky-200 hover:bg-sky-500/10'
                                            : 'border-emerald-500/70 text-emerald-200 hover:bg-emerald-500/10'
                                    }`}
                                >
                                    Calibration math
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <div className="mt-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                            Tile statuses
                        </p>
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
                    </div>
                    <div
                        className="grid gap-2"
                        style={{
                            gridTemplateColumns: `repeat(${Math.max(gridColumnCount, 1)}, minmax(0, 1fr))`,
                        }}
                    >
                        {displayedTileEntries.map((entry) => (
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
                </div>
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
                summary={activeRunnerState.summary ?? null}
                onClose={() => setSummaryModalOpen(false)}
            />
        </>
    );
};

export default CalibrationRunnerPanel;
