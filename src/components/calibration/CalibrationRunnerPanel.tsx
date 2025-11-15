import React, { useCallback, useMemo, useState } from 'react';

import CalibrationSummaryModal from '@/components/calibration/CalibrationSummaryModal';
import TileAxisAction from '@/components/calibration/TileAxisAction';
import TileDebugModal from '@/components/calibration/TileDebugModal';
import type { CalibrationRunnerSettings } from '@/constants/calibration';
import { MOTOR_MAX_POSITION_STEPS } from '@/constants/control';
import type { DriverView } from '@/context/StatusContext';
import type { CalibrationRunnerState, TileRunState } from '@/services/calibrationRunner';
import type { Motor, MotorTelemetry } from '@/types';

interface CalibrationRunnerPanelProps {
    runnerState: CalibrationRunnerState;
    runnerSettings: CalibrationRunnerSettings;
    tileEntries: TileRunState[];
    detectionReady: boolean;
    drivers: DriverView[];
    onUpdateSetting: <K extends keyof CalibrationRunnerSettings>(
        key: K,
        value: CalibrationRunnerSettings[K],
    ) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onAbort: () => void;
}

const getTileStatusClasses = (status: TileRunState['status']): string => {
    switch (status) {
        case 'completed':
            return 'border-emerald-600/60 bg-emerald-500/10 text-emerald-200';
        case 'measuring':
            return 'border-sky-500/60 bg-sky-500/10 text-sky-100';
        case 'failed':
            return 'border-rose-600/60 bg-rose-500/10 text-rose-100';
        case 'skipped':
            return 'border-gray-800 bg-gray-900 text-gray-500';
        case 'staged':
            return 'border-amber-500/60 bg-amber-500/10 text-amber-100';
        default:
            return 'border-gray-700 bg-gray-900/60 text-gray-200';
    }
};

const CalibrationRunnerPanel: React.FC<CalibrationRunnerPanelProps> = ({
    runnerState,
    runnerSettings,
    tileEntries,
    detectionReady,
    drivers,
    onUpdateSetting,
    onStart,
    onPause,
    onResume,
    onAbort,
}) => {
    const phaseLabel = runnerState.phase.charAt(0).toUpperCase() + runnerState.phase.slice(1);
    const activeTileLabel = runnerState.activeTile
        ? `R${runnerState.activeTile.row + 1}C${runnerState.activeTile.col + 1}`
        : '—';
    const isRunnerBusy =
        runnerState.phase === 'homing' ||
        runnerState.phase === 'staging' ||
        runnerState.phase === 'measuring' ||
        runnerState.phase === 'aligning';
    const isRunnerPaused = runnerState.phase === 'paused';
    const canStartRunner = !isRunnerBusy && !isRunnerPaused;
    const canPauseRunner = isRunnerBusy;
    const canResumeRunner = isRunnerPaused;
    const canAbortRunner = isRunnerBusy || isRunnerPaused;
    const blueprint = runnerState.summary?.gridBlueprint;
    const [debugTileKey, setDebugTileKey] = useState<string | null>(null);
    const [summaryModalOpen, setSummaryModalOpen] = useState(false);
    const gapPercent = runnerSettings.gridGapNormalized * 100;
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
    }, [debugTileKey, runnerState.summary]);
    const stepTestSnapshot =
        runnerState.summary?.stepTestSettings ??
        ({
            deltaSteps: runnerSettings.deltaSteps,
            dwellMs: runnerSettings.dwellMs,
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
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                canStartRunner && detectionReady
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canStartRunner || !detectionReady}
                            onClick={onStart}
                        >
                            Start
                        </button>
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                canPauseRunner
                                    ? 'bg-amber-600 text-white hover:bg-amber-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canPauseRunner}
                            onClick={onPause}
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
                            onClick={onResume}
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
                            onClick={onAbort}
                        >
                            Abort
                        </button>
                    </div>
                </div>
                {runnerState.error && (
                    <p className="mt-3 text-sm text-rose-300">{runnerState.error}</p>
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
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
                            Step delta (steps)
                        </span>
                        <input
                            type="number"
                            min={50}
                            max={MOTOR_MAX_POSITION_STEPS}
                            value={runnerSettings.deltaSteps}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                if (Number.isNaN(next)) {
                                    return;
                                }
                                onUpdateSetting('deltaSteps', Math.round(next));
                            }}
                            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
                            Dwell (ms)
                        </span>
                        <input
                            type="number"
                            min={100}
                            max={2000}
                            value={runnerSettings.dwellMs}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                if (Number.isNaN(next)) {
                                    return;
                                }
                                onUpdateSetting('dwellMs', Math.round(next));
                            }}
                            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
                            Grid gap (%)
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={5}
                            step={0.1}
                            value={Number(gapPercent.toFixed(1))}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                if (Number.isNaN(next)) {
                                    return;
                                }
                                const normalized = Math.max(0, Math.min(1, next / 100));
                                onUpdateSetting('gridGapNormalized', Number(normalized.toFixed(4)));
                            }}
                            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                </div>
                {blueprint && (
                    <div className="mt-4 rounded-md border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p>
                                    Ideal footprint:{' '}
                                    {(blueprint.idealTileFootprint.width * 100).toFixed(2)}% ×{' '}
                                    {(blueprint.idealTileFootprint.height * 100).toFixed(2)}%
                                </p>
                                <p>
                                    Gap: X {(blueprint.tileGap.x * 100).toFixed(2)}% · Y{' '}
                                    {(blueprint.tileGap.y * 100).toFixed(2)}%
                                </p>
                                <p className="mt-2 text-xs text-emerald-300">
                                    Use the “Calibration View” toggle in the preview to draw this
                                    grid.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSummaryModalOpen(true)}
                                className="rounded-md border border-emerald-500/70 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
                            >
                                Calibration math
                            </button>
                        </div>
                    </div>
                )}
                <div className="mt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                        Tile statuses
                    </p>
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
                                        className={`mt-1 text-[10px] leading-tight ${
                                            entry.status === 'failed'
                                                ? 'text-rose-200'
                                                : entry.status === 'skipped'
                                                  ? 'text-gray-400'
                                                  : 'text-amber-200'
                                        }`}
                                    >
                                        {entry.error}
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
                                                showLabel={false}
                                                showHomeButton
                                            />
                                            <TileAxisAction
                                                axis="y"
                                                motor={entry.assignment.y}
                                                telemetry={getTelemetryForMotor(entry.assignment.y)}
                                                layout="inline"
                                                className="flex-1 min-w-[120px]"
                                                showLabel={false}
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
                summary={runnerState.summary ?? null}
                onClose={() => setSummaryModalOpen(false)}
            />
        </>
    );
};

export default CalibrationRunnerPanel;
