import React, { useCallback, useMemo, useState } from 'react';

import MotorActionButtons from '@/components/MotorActionButtons';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { DriverView } from '@/context/StatusContext';
import { useMotorController } from '@/hooks/useMotorController';
import type {
    CalibrationRunnerSettings,
    CalibrationRunnerState,
    CalibrationRunSummary,
    TileRunState,
} from '@/services/calibrationRunner';
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

const formatPercent = (
    value: number | null | undefined,
    { signed = false }: { signed?: boolean } = {},
): string => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    const percent = (value * 100).toFixed(2);
    if (!signed) {
        return `${percent}%`;
    }
    return value > 0 ? `+${percent}%` : `${percent}%`;
};

const formatPerKilostep = (value: number | null | undefined): string => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    const scaled = value * 1000;
    const digits = Math.abs(scaled) >= 10 ? 1 : 2;
    const formatted = scaled.toFixed(digits);
    return scaled > 0 ? `+${formatted}` : formatted;
};

const clampSteps = (value: number): number =>
    Math.min(MOTOR_MAX_POSITION_STEPS, Math.max(MOTOR_MIN_POSITION_STEPS, value));

const convertNormalizedToSteps = (
    value: number | null | undefined,
    perStep: number | null | undefined,
): number | null => {
    if (
        value === null ||
        value === undefined ||
        Number.isNaN(value) ||
        perStep === null ||
        perStep === undefined ||
        perStep === 0 ||
        Number.isNaN(perStep)
    ) {
        return null;
    }
    const steps = Math.round(value / perStep);
    if (!Number.isFinite(steps)) {
        return null;
    }
    return clampSteps(steps);
};

const formatStepValue = (value: number | null): string => {
    if (value === null || Number.isNaN(value)) {
        return '—';
    }
    const formatted = value.toLocaleString();
    return value > 0 ? `+${formatted}` : formatted;
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
    const [showAlignmentOverlay, setShowAlignmentOverlay] = useState(false);
    const gapPercent = runnerSettings.gridGapNormalized * 100;

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


    return (
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
            {runnerState.error && <p className="mt-3 text-sm text-rose-300">{runnerState.error}</p>}
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
                    <p className="font-semibold text-gray-400">{runnerState.progress.skipped}</p>
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p>
                                Ideal footprint:{' '}
                                {(blueprint.idealTileFootprint.width * 100).toFixed(2)}% ×{' '}
                                {(blueprint.idealTileFootprint.height * 100).toFixed(2)}%
                            </p>
                            <p>Gap: {(blueprint.tileGap * 100).toFixed(2)}%</p>
                        </div>
                        <button
                            type="button"
                            className={`rounded-md border border-emerald-500/70 px-3 py-1 text-xs font-semibold transition-colors ${showAlignmentOverlay ? 'bg-emerald-600/60 text-white' : 'bg-emerald-950/30 text-emerald-200 hover:bg-emerald-800/40'}`}
                            onClick={() => setShowAlignmentOverlay((prev) => !prev)}
                        >
                            {showAlignmentOverlay ? 'Hide aligned map' : 'Show aligned map'}
                        </button>
                    </div>
                </div>
            )}
            {showAlignmentOverlay && runnerState.summary && (
                <CalibrationAlignmentOverlay summary={runnerState.summary} />
            )}
            <div className="mt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Tile statuses</p>
                <div className="grid gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {tileEntries.map((entry) => (
                        <div
                            key={entry.tile.key}
                            className={`rounded-md border px-2 py-2 text-xs ${getTileStatusClasses(entry.status)}`}
                        >
                            <div className="font-semibold">
                                R{entry.tile.row + 1}C{entry.tile.col + 1}
                            </div>
                            <div className="capitalize">{entry.status}</div>
                            {entry.status === 'completed' &&
                                entry.metrics &&
                                (() => {
                                    const metrics = entry.metrics;
                                    const perStepX = metrics.stepToDisplacement?.x ?? null;
                                    const perStepY = metrics.stepToDisplacement?.y ?? null;
                                    const homeStepsX = convertNormalizedToSteps(
                                        metrics.home?.x ?? null,
                                        perStepX,
                                    );
                                    const homeStepsY = convertNormalizedToSteps(
                                        metrics.home?.y ?? null,
                                        perStepY,
                                    );
                                    const deltaStepsX = convertNormalizedToSteps(
                                        metrics.homeOffset?.dx ?? null,
                                        perStepX,
                                    );
                                    const deltaStepsY = convertNormalizedToSteps(
                                        metrics.homeOffset?.dy ?? null,
                                        perStepY,
                                    );
                                    return (
                                        <div className="mt-2 space-y-1 text-[10px] text-gray-200">
                                            <div>
                                                home ({formatStepValue(homeStepsX)},{' '}
                                                {formatStepValue(homeStepsY)})
                                            </div>
                                            <div>
                                                Δ steps x {formatStepValue(deltaStepsX)} · y{' '}
                                                {formatStepValue(deltaStepsY)}
                                            </div>
                                            <div>
                                                size {formatPercent(metrics.home?.size ?? null)} · Δ{' '}
                                                {formatPercent(
                                                    metrics.sizeDeltaAtStepTest ?? null,
                                                    {
                                                        signed: true,
                                                    },
                                                )}
                                            </div>
                                            <div>
                                                disp/1k x {formatPerKilostep(perStepX)} · y{' '}
                                                {formatPerKilostep(perStepY)}
                                            </div>
                                        </div>
                                    );
                                })()}
                            {entry.error && (
                                <div
                                    className={`mt-2 text-[10px] ${
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
                                <div className="mt-2 rounded-md border border-gray-800/80 bg-gray-950/50 p-2 text-[10px] text-gray-200">
                                    <TileAxisAction
                                        axis="x"
                                        motor={entry.assignment.x}
                                        telemetry={getTelemetryForMotor(entry.assignment.x)}
                                    />
                                    <TileAxisAction
                                        axis="y"
                                        motor={entry.assignment.y}
                                        telemetry={getTelemetryForMotor(entry.assignment.y)}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default CalibrationRunnerPanel;

interface TileAxisActionProps {
    axis: 'x' | 'y';
    motor: Motor | null;
    telemetry?: MotorTelemetry;
}

const TileAxisAction: React.FC<TileAxisActionProps> = ({ axis, motor, telemetry }) => {
    const controller = useMotorController(motor, telemetry);
    if (!motor) {
        return <div className="text-[10px] text-gray-500">{axis.toUpperCase()}: Unassigned</div>;
    }
    return (
        <div className="mt-1 first:mt-0">
            <MotorActionButtons
                motor={motor}
                telemetry={telemetry}
                controller={controller}
                compact
                showHome={false}
                showStepsBadge={false}
                dataTestIdPrefix={`calibration-runner-${motor.nodeMac}-${motor.motorIndex}-${axis}`}
                label={axis.toUpperCase()}
            />
        </div>
    );
};

interface CalibrationAlignmentOverlayProps {
    summary: CalibrationRunSummary;
}

const CalibrationAlignmentOverlay: React.FC<CalibrationAlignmentOverlayProps> = ({ summary }) => {
    const blueprint = summary.gridBlueprint;
    if (!blueprint) {
        return null;
    }
    const tileList = Object.values(summary.tiles);
    if (tileList.length === 0) {
        return null;
    }
    const cols =
        tileList.reduce((max, entry) => (entry.tile.col > max ? entry.tile.col : max), 0) + 1;
    const spacingX = blueprint.idealTileFootprint.width + blueprint.tileGap;
    const spacingY = blueprint.idealTileFootprint.height + blueprint.tileGap;
    const overlaySize = 260;
    const padding = 16;
    const innerSize = overlaySize - padding * 2;
    const toPx = (value: number) => padding + value * innerSize;

    const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

    return (
        <div className="mt-3 rounded-lg border border-emerald-700/40 bg-gray-950/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Aligned Tile Preview
            </p>
            <div
                className="relative mt-3 rounded border border-gray-800 bg-black/40"
                style={{ width: overlaySize, height: overlaySize }}
            >
                {tileList.map((entry) => {
                    const mirroredCol = cols - 1 - entry.tile.col;
                    const idealCenterX =
                        blueprint.gridOrigin.x +
                        mirroredCol * spacingX +
                        blueprint.idealTileFootprint.width / 2;
                    const idealCenterY =
                        blueprint.gridOrigin.y +
                        entry.tile.row * spacingY +
                        blueprint.idealTileFootprint.height / 2;
                    const widthPx = Math.max(4, blueprint.idealTileFootprint.width * innerSize);
                    const heightPx = Math.max(4, blueprint.idealTileFootprint.height * innerSize);
                    const left = toPx(idealCenterX - blueprint.idealTileFootprint.width / 2);
                    const top = toPx(idealCenterY - blueprint.idealTileFootprint.height / 2);
                    const homeMeasurement = entry.homeMeasurement;
                    const measurementX = homeMeasurement
                        ? toPx(clampUnit(homeMeasurement.x))
                        : null;
                    const measurementY = homeMeasurement
                        ? toPx(clampUnit(homeMeasurement.y))
                        : null;
                    return (
                        <div
                            key={entry.tile.key}
                            className="absolute"
                            style={{ left, top, width: widthPx, height: heightPx }}
                        >
                            <div className="flex h-full w-full items-center justify-center rounded border border-emerald-400/60 bg-emerald-400/10 text-[10px] text-emerald-100">
                                [{entry.tile.row + 1},{entry.tile.col + 1}]
                            </div>
                            {measurementX !== null && measurementY !== null && (
                                <span
                                    className="absolute -translate-x-1/2 -translate-y-1/2 text-[8px] text-cyan-200"
                                    style={{ left: measurementX - left, top: measurementY - top }}
                                >
                                    ●
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="mt-2 flex gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm border border-emerald-400/70 bg-emerald-400/20" />
                    Target square
                </span>
                <span className="flex items-center gap-1">
                    <span className="text-cyan-300">●</span>
                    Measured home
                </span>
            </div>
        </div>
    );
};
