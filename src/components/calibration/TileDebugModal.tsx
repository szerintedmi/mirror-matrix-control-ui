import React from 'react';

import TileAxisAction from '@/components/calibration/TileAxisAction';
import Modal from '@/components/Modal';
import type { TileCalibrationResult, TileRunState } from '@/services/calibrationRunner';
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

interface TileDebugModalProps {
    open: boolean;
    entry: TileRunState | null;
    summaryTile: TileCalibrationResult | null;
    onClose: () => void;
    stepTestSettings: { deltaSteps: number };
    getTelemetryForMotor: (motor: Motor | null) => MotorTelemetry | undefined;
}

const TileDebugModal: React.FC<TileDebugModalProps> = ({
    open,
    entry,
    summaryTile,
    onClose,
    stepTestSettings,
    getTelemetryForMotor,
}) => {
    const tileLabel = entry ? `[${entry.tile.row},${entry.tile.col}]` : 'Tile';
    if (!entry) {
        return (
            <Modal open={open} onClose={onClose} title="Tile calibration debug">
                <p className="text-sm text-gray-300">Select a tile from the grid to inspect.</p>
            </Modal>
        );
    }

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
        inferredBounds,
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

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Tile ${tileLabel} – debug metrics`}
            contentClassName="w-auto max-w-4xl resize overflow-auto"
            bodyClassName="px-0 py-0 max-h-[80vh] overflow-y-auto"
        >
            <div className="px-5 py-6">
                <div className="space-y-5 text-sm text-gray-200">
                    <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <span className="font-mono text-lg text-gray-100">{tileLabel}</span>
                            <span className="text-xs uppercase tracking-wide text-gray-400">
                                Status:{' '}
                                <span className="text-gray-100 capitalize">{entry.status}</span>
                            </span>
                        </div>
                        {entry.error && (
                            <p className="mt-1 text-xs text-amber-200">{entry.error}</p>
                        )}
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-md border border-gray-800/70 bg-gray-950/60 p-3">
                                <div className="flex flex-wrap items-center justify-start gap-2">
                                    <TileAxisAction
                                        axis="x"
                                        motor={entry.assignment.x}
                                        telemetry={telemetryX}
                                        layout="inline"
                                        className="text-[10px]"
                                    />
                                </div>
                                <p className="mt-1 font-mono text-xs text-gray-100">
                                    {getAxisAssignmentLabel(entry, 'x')}
                                </p>
                            </div>
                            <div className="rounded-md border border-gray-800/70 bg-gray-950/60 p-3">
                                <div className="flex flex-wrap items-center justify-start gap-2">
                                    <TileAxisAction
                                        axis="y"
                                        motor={entry.assignment.y}
                                        telemetry={telemetryY}
                                        layout="inline"
                                        className="text-[10px]"
                                    />
                                </div>
                                <p className="mt-1 font-mono text-xs text-gray-100">
                                    {getAxisAssignmentLabel(entry, 'y')}
                                </p>
                            </div>
                        </div>
                        {homeTimestamp && (
                            <p className="mt-2 text-xs text-gray-400">
                                Last capture: {formatTimestamp(homeTimestamp)}
                            </p>
                        )}
                    </section>
                    {hasMetrics ? (
                        <>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="space-y-4">
                                    <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
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
                                                value={formatDecimal(adjustedHome?.x ?? null)}
                                                formula={formulas.adjustedHomeXFormula}
                                            />
                                            <DebugStat
                                                label="adjustedHome.y"
                                                value={formatDecimal(adjustedHome?.y ?? null)}
                                                formula={formulas.adjustedHomeYFormula}
                                            />
                                        </div>
                                    </section>
                                    {measurementStats ? (
                                        <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
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
                                                        measurementStats.passed ? 'PASS' : 'FAIL'
                                                    }
                                                    formula="PASS indicates every sample stayed within the configured deviation window."
                                                />
                                                <DebugStat
                                                    label="nMAD.x"
                                                    value={formatPercent(measurementStats.nMad.x)}
                                                    formula="Normalized median absolute deviation (1.4826 × MAD) of normalized X across sampled frames."
                                                />
                                                <DebugStat
                                                    label="nMAD.y"
                                                    value={formatPercent(measurementStats.nMad.y)}
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
                                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
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
                                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                                            Derived offsets
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <DebugStat
                                                label="homeOffset.dx"
                                                value={formatDecimal(homeOffset?.dx ?? null, {
                                                    digits: 4,
                                                    signed: true,
                                                })}
                                                formula={formulas.offsetXFormula}
                                            />
                                            <DebugStat
                                                label="homeOffset.dy"
                                                value={formatDecimal(homeOffset?.dy ?? null, {
                                                    digits: 4,
                                                    signed: true,
                                                })}
                                                formula={formulas.offsetYFormula}
                                            />
                                        </div>
                                    </section>
                                    <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                                            Step conversions (derived)
                                        </p>
                                        <div className="grid gap-4">
                                            <div>
                                                <p className="mb-1 text-[10px] uppercase tracking-wide text-emerald-300">
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
                                                <p className="mb-1 text-[10px] uppercase tracking-wide text-emerald-300">
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
                                                <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-300">
                                                    Alignment steps
                                                </p>
                                                <div className="grid gap-2">
                                                    <DebugStat
                                                        label="alignmentSteps.x"
                                                        value={formatStepValue(alignmentStepsX)}
                                                        formula={formulas.alignmentStepsFormulaX}
                                                    />
                                                    <DebugStat
                                                        label="alignmentSteps.y"
                                                        value={formatStepValue(alignmentStepsY)}
                                                        formula={formulas.alignmentStepsFormulaY}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                            {inferredBounds ? (
                                <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4 text-sm text-gray-100">
                                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                                        Reach estimates (normalized)
                                    </p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <DebugStat
                                            label="bounds.x.min"
                                            value={formatDecimal(inferredBounds.x.min, {
                                                digits: 4,
                                                signed: true,
                                            })}
                                            formula="Intersection of per-tile X reach relative to the grid origin (normalized [-1,1])."
                                        />
                                        <DebugStat
                                            label="bounds.x.max"
                                            value={formatDecimal(inferredBounds.x.max, {
                                                digits: 4,
                                                signed: true,
                                            })}
                                            formula="Intersection of per-tile X reach relative to the grid origin (normalized [-1,1])."
                                        />
                                        <DebugStat
                                            label="bounds.y.min"
                                            value={formatDecimal(inferredBounds.y.min, {
                                                digits: 4,
                                                signed: true,
                                            })}
                                            formula="Intersection of per-tile Y reach relative to the grid origin (normalized [-1,1])."
                                        />
                                        <DebugStat
                                            label="bounds.y.max"
                                            value={formatDecimal(inferredBounds.y.max, {
                                                digits: 4,
                                                signed: true,
                                            })}
                                            formula="Intersection of per-tile Y reach relative to the grid origin (normalized [-1,1])."
                                        />
                                    </div>
                                </section>
                            ) : null}
                            <section className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                                <p className="mb-2 text-xs uppercase tracking-wide">
                                    Informational (not used)
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <DebugStat
                                        label="home.response"
                                        value={formatDecimal(home?.response ?? null, { digits: 3 })}
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
                        </>
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
