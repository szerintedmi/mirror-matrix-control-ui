import React, { useState } from 'react';

import Modal from '@/components/Modal';
import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '@/constants/control';
import type {
    TileAddress,
    TileCalibrationResult,
    TileRunState,
} from '@/services/calibration/types';
import type { Motor, MotorTelemetry } from '@/types';
import { computeTileMetrics, getAxisAssignmentLabel } from '@/utils/tileCalibrationCalculations';
import { generateTileFormulas } from '@/utils/tileCalibrationFormulas';

import {
    formatDecimal,
    formatPercent,
    formatStepValue,
    formatTimestamp,
} from './calibrationMetricsFormatters';
import DebugStat from './DebugStat';

/** Render steps-since-home warning icon with value */
const StepsWarningBadge: React.FC<{ telemetry?: MotorTelemetry }> = ({ telemetry }) => {
    if (!telemetry) return <span className="text-gray-500">--</span>;
    const steps = telemetry.stepsSinceHome;

    const hasWarning = steps >= STEPS_SINCE_HOME_WARNING;
    const isCritical = steps >= STEPS_SINCE_HOME_CRITICAL;
    const colorClass = isCritical
        ? 'text-red-400'
        : hasWarning
          ? 'text-amber-400'
          : 'text-gray-300';
    const title = hasWarning
        ? `${steps.toLocaleString()} steps since last home${isCritical ? ' (critical)' : ''}`
        : `${steps.toLocaleString()} steps since last home`;

    return (
        <span className={`flex items-center gap-1 ${colorClass}`} title={title}>
            {hasWarning && (
                <svg className="size-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M10 2a1 1 0 01.894.553l6 12A1 1 0 0116 16H4a1 1 0 01-.894-1.447l6-12A1 1 0 0110 2zM10 5.618L5.764 14h8.472L10 5.618z" />
                </svg>
            )}
            <span className="font-mono">{steps.toLocaleString()}</span>
        </span>
    );
};

interface TileDebugModalProps {
    open: boolean;
    entry: TileRunState | null;
    summaryTile: TileCalibrationResult | null;
    displayStatus?:
        | 'pending'
        | 'staged'
        | 'measuring'
        | 'completed'
        | 'partial'
        | 'failed'
        | 'skipped'
        | 'calibrated';
    onClose: () => void;
    stepTestSettings: { deltaSteps: number };
    getTelemetryForMotor: (motor: Motor | null) => MotorTelemetry | undefined;
    /** Whether calibration is currently active (disables tile actions) */
    isCalibrationActive?: boolean;
    /** Callback to home a single motor axis */
    onHomeMotor?: (motor: Motor) => void;
    /** Callback to home the tile (both axes) */
    onHomeTile?: (tile: TileAddress, motors: { x: Motor | null; y: Motor | null }) => void;
    /** Callback to move tile to staging position */
    onMoveToStage?: (tile: TileAddress, motors: { x: Motor | null; y: Motor | null }) => void;
    /** Callback to nudge a single motor */
    onNudgeMotor?: (motor: Motor, currentPosition: number) => void;
    /** Callback to start single-tile recalibration */
    onRecalibrateTile?: (tile: TileAddress) => void;
}

const TileDebugModal: React.FC<TileDebugModalProps> = ({
    open,
    entry,
    summaryTile,
    displayStatus,
    onClose,
    stepTestSettings,
    getTelemetryForMotor,
    isCalibrationActive = false,
    onHomeMotor,
    onHomeTile,
    onMoveToStage,
    onNudgeMotor,
    onRecalibrateTile,
}) => {
    const [isDebugExpanded, setIsDebugExpanded] = useState(false);
    const tileLabel = entry ? `[${entry.tile.row},${entry.tile.col}]` : 'Tile';
    if (!entry) {
        return (
            <Modal open={open} onClose={onClose} title="Tile calibration debug">
                <p className="text-sm text-gray-300">Select a tile from the grid to inspect.</p>
            </Modal>
        );
    }

    // Use displayStatus if provided, otherwise fall back to entry.status
    const effectiveStatus = displayStatus ?? entry.status;

    // Compute all metrics and formulas using extracted utilities
    const metrics = computeTileMetrics({
        entry,
        summaryTile,
        deltaSteps: stepTestSettings.deltaSteps,
    });
    const formulas = generateTileFormulas(metrics, stepTestSettings.deltaSteps);

    // Destructure commonly used values for cleaner JSX
    const {
        home,
        adjustedHome,
        homeOffset,
        combinedBounds,
        perStepX,
        perStepY,
        stepScaleX,
        stepScaleY,
        alignmentStepsX,
        alignmentStepsY,
        measuredShiftX,
        measuredShiftY,
        sizeAfterStep,
        sizeDeltaAtStepTest,
        hasMetrics,
        homeTimestamp,
        measurementStats,
    } = metrics;

    const telemetryX = getTelemetryForMotor(entry.assignment.x);
    const telemetryY = getTelemetryForMotor(entry.assignment.y);

    const hasMotors = Boolean(entry.assignment.x || entry.assignment.y);
    const canHome = hasMotors && !isCalibrationActive;
    const canMoveToStage = hasMotors && !isCalibrationActive && Boolean(onMoveToStage);
    const canRecalibrate = Boolean(summaryTile) && hasMotors && !isCalibrationActive;

    const handleHomeTile = () => {
        if (onHomeTile) {
            onHomeTile(entry.tile, { x: entry.assignment.x, y: entry.assignment.y });
        }
    };

    const handleMoveToStage = () => {
        if (onMoveToStage) {
            onMoveToStage(entry.tile, { x: entry.assignment.x, y: entry.assignment.y });
        }
    };

    const handleRecalibrate = () => {
        if (onRecalibrateTile && canRecalibrate) {
            onRecalibrateTile(entry.tile);
        }
    };

    const handleNudgeX = () => {
        if (onNudgeMotor && entry.assignment.x) {
            const position = telemetryX?.position ?? 0;
            onNudgeMotor(entry.assignment.x, position);
        }
    };

    const handleNudgeY = () => {
        if (onNudgeMotor && entry.assignment.y) {
            const position = telemetryY?.position ?? 0;
            onNudgeMotor(entry.assignment.y, position);
        }
    };

    const handleHomeX = () => {
        if (onHomeMotor && entry.assignment.x) {
            onHomeMotor(entry.assignment.x);
        }
    };

    const handleHomeY = () => {
        if (onHomeMotor && entry.assignment.y) {
            onHomeMotor(entry.assignment.y);
        }
    };

    // Only show timestamp if it's valid (not epoch 0)
    const showTimestamp = homeTimestamp && homeTimestamp > 86400000; // > 1 day from epoch

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Tile ${tileLabel}`}
            contentClassName="w-auto max-w-4xl resize overflow-auto"
            bodyClassName="px-0 py-0 max-h-[80vh] overflow-y-auto"
        >
            <div className="px-5 py-6">
                <div className="space-y-5 text-sm text-gray-200">
                    {/* Header with status */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs tracking-wide text-gray-400 uppercase">
                            Status:{' '}
                            <span className="text-gray-100 capitalize">{effectiveStatus}</span>
                        </span>
                        {showTimestamp && (
                            <span className="text-xs text-gray-500">
                                Last calibration: {formatTimestamp(homeTimestamp)}
                            </span>
                        )}
                    </div>

                    {entry.error && <p className="text-sm text-amber-200">{entry.error}</p>}

                    {/* Motor info - X and Y Axis */}
                    <div className="grid gap-3 sm:grid-cols-2">
                        {/* X Axis */}
                        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-200">X Axis</span>
                                <span className="font-mono text-xs text-gray-500">
                                    {getAxisAssignmentLabel(entry, 'x')}
                                </span>
                            </div>
                            <div className="mb-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Position</span>
                                    <span className="font-mono text-sm text-gray-100">
                                        {telemetryX?.position ?? '--'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Steps since home</span>
                                    <StepsWarningBadge telemetry={telemetryX} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {entry.assignment.x && onNudgeMotor && (
                                    <button
                                        type="button"
                                        onClick={handleNudgeX}
                                        disabled={isCalibrationActive}
                                        className="flex items-center gap-1.5 rounded border border-cyan-700 bg-cyan-900/40 px-2.5 py-1.5 text-sm text-cyan-200 transition hover:bg-cyan-700/40 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <svg
                                            className="size-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                                            />
                                        </svg>
                                        <span>Nudge</span>
                                    </button>
                                )}
                                {entry.assignment.x && onHomeMotor && (
                                    <button
                                        type="button"
                                        onClick={handleHomeX}
                                        disabled={isCalibrationActive}
                                        className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-sm text-gray-300 transition hover:bg-gray-700/60 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <svg
                                            className="size-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                        </svg>
                                        <span>Home</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Y Axis */}
                        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-200">Y Axis</span>
                                <span className="font-mono text-xs text-gray-500">
                                    {getAxisAssignmentLabel(entry, 'y')}
                                </span>
                            </div>
                            <div className="mb-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Position</span>
                                    <span className="font-mono text-sm text-gray-100">
                                        {telemetryY?.position ?? '--'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Steps since home</span>
                                    <StepsWarningBadge telemetry={telemetryY} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {entry.assignment.y && onNudgeMotor && (
                                    <button
                                        type="button"
                                        onClick={handleNudgeY}
                                        disabled={isCalibrationActive}
                                        className="flex items-center gap-1.5 rounded border border-cyan-700 bg-cyan-900/40 px-2.5 py-1.5 text-sm text-cyan-200 transition hover:bg-cyan-700/40 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <svg
                                            className="size-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                                            />
                                        </svg>
                                        <span>Nudge</span>
                                    </button>
                                )}
                                {entry.assignment.y && onHomeMotor && (
                                    <button
                                        type="button"
                                        onClick={handleHomeY}
                                        disabled={isCalibrationActive}
                                        className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-sm text-gray-300 transition hover:bg-gray-700/60 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <svg
                                            className="size-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                        </svg>
                                        <span>Home</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tile Commands */}
                    {(onHomeTile || onMoveToStage || onRecalibrateTile) && (
                        <div className="flex flex-wrap gap-2">
                            {onHomeTile && (
                                <button
                                    type="button"
                                    onClick={handleHomeTile}
                                    disabled={!canHome}
                                    className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-200 transition hover:bg-emerald-700/40 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                    </svg>
                                    <span>Home Tile</span>
                                </button>
                            )}
                            {onMoveToStage && (
                                <button
                                    type="button"
                                    onClick={handleMoveToStage}
                                    disabled={!canMoveToStage}
                                    className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-700/60 disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Move tile to staging position"
                                >
                                    <svg
                                        className="size-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                        />
                                    </svg>
                                    <span>Move to Stage</span>
                                </button>
                            )}
                            {onRecalibrateTile && (
                                <button
                                    type="button"
                                    onClick={handleRecalibrate}
                                    disabled={!canRecalibrate}
                                    className="flex items-center gap-1.5 rounded border border-amber-700 bg-amber-900/40 px-3 py-1.5 text-sm text-amber-200 transition hover:bg-amber-700/40 disabled:cursor-not-allowed disabled:opacity-50"
                                    title={
                                        !summaryTile
                                            ? 'Run full calibration first'
                                            : 'Recalibrate this tile'
                                    }
                                >
                                    <svg
                                        className="size-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                        />
                                    </svg>
                                    <span>Recalibrate</span>
                                </button>
                            )}
                        </div>
                    )}
                    {/* Collapsible Debug Section */}
                    {hasMetrics ? (
                        <section className="rounded-lg border border-gray-800 bg-gray-950">
                            <button
                                type="button"
                                onClick={() => setIsDebugExpanded(!isDebugExpanded)}
                                className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-gray-900/50"
                            >
                                <span className="text-sm font-medium text-gray-200">Debug</span>
                                <svg
                                    className={`size-4 text-gray-400 transition-transform ${isDebugExpanded ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                    />
                                </svg>
                            </button>
                            {isDebugExpanded && (
                                <div className="space-y-4 border-t border-gray-800 p-4">
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div className="space-y-4">
                                            <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                                <p className="mb-2 text-xs tracking-wide text-gray-500 uppercase">
                                                    Measurements (normalized)
                                                </p>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    <DebugStat
                                                        label="home.x"
                                                        value={formatDecimal(home?.x ?? null)}
                                                        formula="`home.x` comes directly from the detected blob center in normalized preview space."
                                                    />
                                                    <DebugStat
                                                        label="home.y"
                                                        value={formatDecimal(home?.y ?? null)}
                                                        formula="`home.y` comes directly from the detected blob center in normalized preview space."
                                                    />
                                                    <DebugStat
                                                        label="home.size"
                                                        value={formatDecimal(home?.size ?? null)}
                                                        formula="`home.size` is the normalized blob diameter reported by OpenCV."
                                                    />
                                                    <DebugStat
                                                        label="adjustedHome.x"
                                                        value={formatDecimal(
                                                            adjustedHome?.x ?? null,
                                                        )}
                                                        formula={formulas.adjustedHomeXFormula}
                                                    />
                                                    <DebugStat
                                                        label="adjustedHome.y"
                                                        value={formatDecimal(
                                                            adjustedHome?.y ?? null,
                                                        )}
                                                        formula={formulas.adjustedHomeYFormula}
                                                    />
                                                </div>
                                            </section>
                                            {measurementStats ? (
                                                <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                                    <p className="mb-2 text-xs tracking-wide text-gray-500 uppercase">
                                                        Detection stability
                                                    </p>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        <DebugStat
                                                            label="samples.collected"
                                                            value={`${measurementStats.sampleCount} / ${measurementStats.thresholds.minSamples}`}
                                                            formula="Samples captured divided by the minimum required before we trust the blob reading."
                                                        />
                                                        <DebugStat
                                                            label="deviation.threshold"
                                                            value={formatPercent(
                                                                measurementStats.thresholds
                                                                    .maxMedianDeviationPt,
                                                            )}
                                                            formula="Maximum allowed normalized deviation applied to both per-frame and median absolute deviation checks."
                                                        />
                                                        <DebugStat
                                                            label="stability.status"
                                                            value={
                                                                measurementStats.passed
                                                                    ? 'PASS'
                                                                    : 'FAIL'
                                                            }
                                                            formula="PASS indicates every sample stayed within the configured deviation window."
                                                        />
                                                        <DebugStat
                                                            label="nMAD.x"
                                                            value={formatPercent(
                                                                measurementStats.nMad.x,
                                                            )}
                                                            formula="Normalized median absolute deviation (1.4826 × MAD) of normalized X across sampled frames."
                                                        />
                                                        <DebugStat
                                                            label="nMAD.y"
                                                            value={formatPercent(
                                                                measurementStats.nMad.y,
                                                            )}
                                                            formula="Normalized median absolute deviation of normalized Y across sampled frames."
                                                        />
                                                        <DebugStat
                                                            label="nMAD.size"
                                                            value={formatPercent(
                                                                measurementStats.nMad.size,
                                                            )}
                                                            formula="Normalized median absolute deviation of the normalized blob size across sampled frames."
                                                        />
                                                    </div>
                                                </section>
                                            ) : null}
                                            <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                                <p className="mb-2 text-xs tracking-wide text-gray-500 uppercase">
                                                    Step measurements
                                                </p>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    <DebugStat
                                                        label="deltaSteps"
                                                        value={`${stepTestSettings.deltaSteps} steps`}
                                                        formula="Configured move magnitude used during characterization."
                                                    />
                                                    <DebugStat
                                                        label="Δnorm_x"
                                                        value={formatDecimal(measuredShiftX, {
                                                            digits: 4,
                                                            signed: true,
                                                        })}
                                                        formula={formulas.measuredShiftFormulaX}
                                                    />
                                                    <DebugStat
                                                        label="Δnorm_y"
                                                        value={formatDecimal(measuredShiftY, {
                                                            digits: 4,
                                                            signed: true,
                                                        })}
                                                        formula={formulas.measuredShiftFormulaY}
                                                    />
                                                </div>
                                            </section>
                                        </div>
                                        <div className="space-y-4">
                                            <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                                <p className="mb-2 text-xs tracking-wide text-gray-500 uppercase">
                                                    Derived offsets
                                                </p>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    <DebugStat
                                                        label="homeOffset.dx"
                                                        value={formatDecimal(
                                                            homeOffset?.dx ?? null,
                                                            {
                                                                digits: 4,
                                                                signed: true,
                                                            },
                                                        )}
                                                        formula={formulas.offsetXFormula}
                                                    />
                                                    <DebugStat
                                                        label="homeOffset.dy"
                                                        value={formatDecimal(
                                                            homeOffset?.dy ?? null,
                                                            {
                                                                digits: 4,
                                                                signed: true,
                                                            },
                                                        )}
                                                        formula={formulas.offsetYFormula}
                                                    />
                                                </div>
                                            </section>
                                            <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                                <p className="mb-2 text-xs tracking-wide text-gray-500 uppercase">
                                                    Step conversions (derived)
                                                </p>
                                                <div className="grid gap-4">
                                                    <div>
                                                        <p className="mb-1 text-[10px] tracking-wide text-emerald-300 uppercase">
                                                            Per-step factors
                                                        </p>
                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            <DebugStat
                                                                label="stepToDisplacement.x"
                                                                value={formatDecimal(perStepX, {
                                                                    digits: 6,
                                                                })}
                                                                formula={formulas.perStepFormulaX}
                                                            />
                                                            <DebugStat
                                                                label="stepToDisplacement.y"
                                                                value={formatDecimal(perStepY, {
                                                                    digits: 6,
                                                                })}
                                                                formula={formulas.perStepFormulaY}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="mb-1 text-[10px] tracking-wide text-emerald-300 uppercase">
                                                            Step scale (steps per normalized unit)
                                                        </p>
                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            <DebugStat
                                                                label="stepScale.x"
                                                                value={formatDecimal(stepScaleX, {
                                                                    digits: 3,
                                                                })}
                                                                formula={formulas.stepScaleFormulaX}
                                                            />
                                                            <DebugStat
                                                                label="stepScale.y"
                                                                value={formatDecimal(stepScaleY, {
                                                                    digits: 3,
                                                                })}
                                                                formula={formulas.stepScaleFormulaY}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="mb-1 text-[10px] tracking-wide text-gray-300 uppercase">
                                                            Alignment steps
                                                        </p>
                                                        <div className="grid gap-2">
                                                            <DebugStat
                                                                label="alignmentSteps.x"
                                                                value={formatStepValue(
                                                                    alignmentStepsX,
                                                                )}
                                                                formula={
                                                                    formulas.alignmentStepsFormulaX
                                                                }
                                                            />
                                                            <DebugStat
                                                                label="alignmentSteps.y"
                                                                value={formatStepValue(
                                                                    alignmentStepsY,
                                                                )}
                                                                formula={
                                                                    formulas.alignmentStepsFormulaY
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>
                                        </div>
                                    </div>
                                    {combinedBounds ? (
                                        <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4 text-sm text-gray-100">
                                            <p className="mb-2 text-xs tracking-wide text-gray-500 uppercase">
                                                Reach estimates (normalized)
                                            </p>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <DebugStat
                                                    label="bounds.x.min"
                                                    value={formatDecimal(combinedBounds.x.min, {
                                                        digits: 4,
                                                        signed: true,
                                                    })}
                                                    formula="Intersection of per-tile X reach relative to the grid origin (normalized [-1,1])."
                                                />
                                                <DebugStat
                                                    label="bounds.x.max"
                                                    value={formatDecimal(combinedBounds.x.max, {
                                                        digits: 4,
                                                        signed: true,
                                                    })}
                                                    formula="Intersection of per-tile X reach relative to the grid origin (normalized [-1,1])."
                                                />
                                                <DebugStat
                                                    label="bounds.y.min"
                                                    value={formatDecimal(combinedBounds.y.min, {
                                                        digits: 4,
                                                        signed: true,
                                                    })}
                                                    formula="Intersection of per-tile Y reach relative to the grid origin (normalized [-1,1])."
                                                />
                                                <DebugStat
                                                    label="bounds.y.max"
                                                    value={formatDecimal(combinedBounds.y.max, {
                                                        digits: 4,
                                                        signed: true,
                                                    })}
                                                    formula="Intersection of per-tile Y reach relative to the grid origin (normalized [-1,1])."
                                                />
                                            </div>
                                        </section>
                                    ) : null}
                                    <section className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                                        <p className="mb-2 text-xs tracking-wide uppercase">
                                            Informational (not used)
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <DebugStat
                                                label="home.response"
                                                value={formatDecimal(home?.response ?? null, {
                                                    digits: 3,
                                                })}
                                                formula="Detector confidence (KeyPoint.response). WASM always reports 0."
                                            />
                                            <DebugStat
                                                label="size_after_step"
                                                value={formatDecimal(sizeAfterStep, { digits: 4 })}
                                                formula={formulas.sizeAfterStepFormula}
                                            />
                                            <DebugStat
                                                label="sizeDeltaAtStepTest"
                                                value={`${formatDecimal(sizeDeltaAtStepTest, {
                                                    digits: 4,
                                                    signed: true,
                                                })} (${formatPercent(sizeDeltaAtStepTest, { signed: true })})`}
                                                formula={formulas.sizeDeltaFormula}
                                            />
                                        </div>
                                    </section>
                                </div>
                            )}
                        </section>
                    ) : (
                        <section className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                            <p>
                                This tile has not produced any measurements yet.
                                {entry.error ? ` Error: ${entry.error}` : ''}
                            </p>
                        </section>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default TileDebugModal;
