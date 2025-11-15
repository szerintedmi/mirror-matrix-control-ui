import React from 'react';

import TileAxisAction from '@/components/calibration/TileAxisAction';
import Modal from '@/components/Modal';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { TileCalibrationResult, TileRunState } from '@/services/calibrationRunner';
import type { Motor, MotorTelemetry } from '@/types';

import {
    convertNormalizedToSteps,
    formatDecimal,
    formatPercent,
    formatStepValue,
    formatTimestamp,
} from './calibrationMetricsFormatters';

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
    const metrics = entry.metrics ?? {};
    const home = metrics.home ?? summaryTile?.homeMeasurement ?? null;
    const idealTarget = metrics.idealTarget ?? summaryTile?.idealTarget ?? null;
    const homeOffset = metrics.homeOffset ?? summaryTile?.homeOffset ?? null;
    const stepToDisplacement =
        metrics.stepToDisplacement ?? summaryTile?.stepToDisplacement ?? null;
    const sizeDeltaAtStepTest =
        metrics.sizeDeltaAtStepTest ?? summaryTile?.sizeDeltaAtStepTest ?? null;
    const perStepX = stepToDisplacement?.x ?? null;
    const perStepY = stepToDisplacement?.y ?? null;

    const homeStepsX = convertNormalizedToSteps(
        home?.x ?? null,
        perStepX,
        MOTOR_MIN_POSITION_STEPS,
        MOTOR_MAX_POSITION_STEPS,
    );
    const homeStepsY = convertNormalizedToSteps(
        home?.y ?? null,
        perStepY,
        MOTOR_MIN_POSITION_STEPS,
        MOTOR_MAX_POSITION_STEPS,
    );
    const offsetStepsX = convertNormalizedToSteps(
        homeOffset?.dx ?? null,
        perStepX,
        MOTOR_MIN_POSITION_STEPS,
        MOTOR_MAX_POSITION_STEPS,
    );
    const offsetStepsY = convertNormalizedToSteps(
        homeOffset?.dy ?? null,
        perStepY,
        MOTOR_MIN_POSITION_STEPS,
        MOTOR_MAX_POSITION_STEPS,
    );
    const alignmentStepsX = homeOffset
        ? convertNormalizedToSteps(
              -homeOffset.dx,
              perStepX,
              MOTOR_MIN_POSITION_STEPS,
              MOTOR_MAX_POSITION_STEPS,
          )
        : null;
    const alignmentStepsY = homeOffset
        ? convertNormalizedToSteps(
              -homeOffset.dy,
              perStepY,
              MOTOR_MIN_POSITION_STEPS,
              MOTOR_MAX_POSITION_STEPS,
          )
        : null;
    const measuredShiftX =
        perStepX !== null && Number.isFinite(perStepX) && stepTestSettings.deltaSteps > 0
            ? perStepX * stepTestSettings.deltaSteps
            : null;
    const measuredShiftY =
        perStepY !== null && Number.isFinite(perStepY) && stepTestSettings.deltaSteps > 0
            ? perStepY * stepTestSettings.deltaSteps
            : null;
    const sizeAfterStep =
        home?.size !== null && home?.size !== undefined && sizeDeltaAtStepTest !== null
            ? home.size + sizeDeltaAtStepTest
            : null;
    const hasMetrics = Boolean(
        home ||
            idealTarget ||
            homeOffset ||
            (stepToDisplacement && (stepToDisplacement.x || stepToDisplacement.y)),
    );

    const axisAssignmentLabel = (axis: 'x' | 'y'): string => {
        const motor = entry.assignment[axis];
        if (!motor) {
            return 'Unassigned';
        }
        return `${motor.nodeMac} · M${motor.motorIndex}`;
    };

    const homeTimestamp = home?.capturedAt ?? null;

    const idealXFormula =
        idealTarget && home && homeOffset
            ? `\`home.x - homeOffset.dx = ${formatDecimal(home.x)} - ${formatDecimal(
                  homeOffset.dx,
                  {
                      digits: 4,
                      signed: true,
                  },
              )}\``
            : '`home.x - homeOffset.dx`';
    const idealYFormula =
        idealTarget && home && homeOffset
            ? `\`home.y - homeOffset.dy = ${formatDecimal(home.y)} - ${formatDecimal(
                  homeOffset.dy,
                  {
                      digits: 4,
                      signed: true,
                  },
              )}\``
            : '`home.y - homeOffset.dy`';
    const offsetXFormula =
        homeOffset && home && idealTarget
            ? `\`home.x - idealTarget.x = ${formatDecimal(home.x)} - ${formatDecimal(idealTarget.x)}\``
            : '`home.x - idealTarget.x`';
    const offsetYFormula =
        homeOffset && home && idealTarget
            ? `\`home.y - idealTarget.y = ${formatDecimal(home.y)} - ${formatDecimal(idealTarget.y)}\``
            : '`home.y - idealTarget.y`';

    const homeStepsFormulaX =
        home?.x !== null && home?.x !== undefined && perStepX
            ? `\`home.x ÷ stepToDisplacement.x = ${formatDecimal(home.x)} ÷ ${formatDecimal(
                  perStepX,
                  {
                      digits: 6,
                  },
              )}\``
            : '`home.x ÷ stepToDisplacement.x`';
    const homeStepsFormulaY =
        home?.y !== null && home?.y !== undefined && perStepY
            ? `\`home.y ÷ stepToDisplacement.y = ${formatDecimal(home.y)} ÷ ${formatDecimal(
                  perStepY,
                  {
                      digits: 6,
                  },
              )}\``
            : '`home.y ÷ stepToDisplacement.y`';
    const offsetStepsFormulaX =
        homeOffset && perStepX
            ? `\`homeOffset.dx ÷ stepToDisplacement.x = ${formatDecimal(homeOffset.dx, {
                  digits: 4,
                  signed: true,
              })} ÷ ${formatDecimal(perStepX, { digits: 6 })}\``
            : '`homeOffset.dx ÷ stepToDisplacement.x`';
    const offsetStepsFormulaY =
        homeOffset && perStepY
            ? `\`homeOffset.dy ÷ stepToDisplacement.y = ${formatDecimal(homeOffset.dy, {
                  digits: 4,
                  signed: true,
              })} ÷ ${formatDecimal(perStepY, { digits: 6 })}\``
            : '`homeOffset.dy ÷ stepToDisplacement.y`';
    const alignmentStepsFormulaX =
        homeOffset && perStepX
            ? `\`-homeOffset.dx ÷ stepToDisplacement.x = ${formatDecimal(-homeOffset.dx, {
                  digits: 4,
                  signed: true,
              })} ÷ ${formatDecimal(perStepX, { digits: 6 })}\``
            : '`-homeOffset.dx ÷ stepToDisplacement.x`';
    const alignmentStepsFormulaY =
        homeOffset && perStepY
            ? `\`-homeOffset.dy ÷ stepToDisplacement.y = ${formatDecimal(-homeOffset.dy, {
                  digits: 4,
                  signed: true,
              })} ÷ ${formatDecimal(perStepY, { digits: 6 })}\``
            : '`-homeOffset.dy ÷ stepToDisplacement.y`';

    const perStepFormulaX =
        perStepX && measuredShiftX
            ? `\`Δnorm_x ÷ deltaSteps = ${formatDecimal(measuredShiftX, {
                  digits: 4,
                  signed: true,
              })} ÷ ${stepTestSettings.deltaSteps}\``
            : '`Δnorm_x ÷ deltaSteps`';
    const perStepFormulaY =
        perStepY && measuredShiftY
            ? `\`Δnorm_y ÷ deltaSteps = ${formatDecimal(measuredShiftY, {
                  digits: 4,
                  signed: true,
              })} ÷ ${stepTestSettings.deltaSteps}\``
            : '`Δnorm_y ÷ deltaSteps`';
    const measuredShiftFormulaX =
        perStepX && measuredShiftX
            ? `\`stepToDisplacement.x × deltaSteps = ${formatDecimal(perStepX, {
                  digits: 6,
              })} × ${stepTestSettings.deltaSteps}\``
            : '`stepToDisplacement.x × deltaSteps`';
    const measuredShiftFormulaY =
        perStepY && measuredShiftY
            ? `\`stepToDisplacement.y × deltaSteps = ${formatDecimal(perStepY, {
                  digits: 6,
              })} × ${stepTestSettings.deltaSteps}\``
            : '`stepToDisplacement.y × deltaSteps`';
    const sizeDeltaFormula =
        sizeDeltaAtStepTest !== null && home?.size !== undefined && home?.size !== null
            ? `\`size_after_step - home.size = ${formatDecimal(sizeAfterStep, {
                  digits: 4,
              })} - ${formatDecimal(home.size)}\``
            : '`size_after_step - home.size`';
    const sizeAfterStepFormula =
        sizeDeltaAtStepTest !== null && home?.size !== undefined && home?.size !== null
            ? `\`home.size + sizeDeltaAtStepTest = ${formatDecimal(home.size)} + ${formatDecimal(
                  sizeDeltaAtStepTest,
                  { digits: 4, signed: true },
              )}\``
            : '`home.size + sizeDeltaAtStepTest`';

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
                                    {axisAssignmentLabel('x')}
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
                                    {axisAssignmentLabel('y')}
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
                                <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                                        Measured values (normalized)
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
                                            label="home.response"
                                            value={formatDecimal(home?.response ?? null, {
                                                digits: 3,
                                            })}
                                            formula="Detector confidence (KeyPoint.response). Always zero with WASM and not reliable with JS fallback."
                                        />
                                        <DebugStat
                                            label="idealTarget.x"
                                            value={formatDecimal(idealTarget?.x ?? null)}
                                            formula={idealXFormula}
                                        />
                                        <DebugStat
                                            label="idealTarget.y"
                                            value={formatDecimal(idealTarget?.y ?? null)}
                                            formula={idealYFormula}
                                        />
                                        <DebugStat
                                            label="homeOffset.dx"
                                            value={formatDecimal(homeOffset?.dx ?? null, {
                                                digits: 4,
                                                signed: true,
                                            })}
                                            formula={offsetXFormula}
                                        />
                                        <DebugStat
                                            label="homeOffset.dy"
                                            value={formatDecimal(homeOffset?.dy ?? null, {
                                                digits: 4,
                                                signed: true,
                                            })}
                                            formula={offsetYFormula}
                                        />
                                    </div>
                                </section>
                                <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                                        Step conversions
                                    </p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <DebugStat
                                            label="homeSteps.x"
                                            value={formatStepValue(homeStepsX)}
                                            formula={homeStepsFormulaX}
                                        />
                                        <DebugStat
                                            label="homeSteps.y"
                                            value={formatStepValue(homeStepsY)}
                                            formula={homeStepsFormulaY}
                                        />
                                        <DebugStat
                                            label="offsetSteps.x"
                                            value={formatStepValue(offsetStepsX)}
                                            formula={offsetStepsFormulaX}
                                        />
                                        <DebugStat
                                            label="offsetSteps.y"
                                            value={formatStepValue(offsetStepsY)}
                                            formula={offsetStepsFormulaY}
                                        />
                                        <DebugStat
                                            label="alignmentSteps.x"
                                            value={formatStepValue(alignmentStepsX)}
                                            formula={alignmentStepsFormulaX}
                                        />
                                        <DebugStat
                                            label="alignmentSteps.y"
                                            value={formatStepValue(alignmentStepsY)}
                                            formula={alignmentStepsFormulaY}
                                        />
                                    </div>
                                </section>
                            </div>
                            <section className="rounded-lg border border-gray-800/70 bg-gray-950/40 p-4">
                                <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                                    Step test snapshot
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <DebugStat
                                        label="stepToDisplacement.x"
                                        value={formatDecimal(perStepX, { digits: 6 })}
                                        formula={perStepFormulaX}
                                    />
                                    <DebugStat
                                        label="stepToDisplacement.y"
                                        value={formatDecimal(perStepY, { digits: 6 })}
                                        formula={perStepFormulaY}
                                    />
                                    <DebugStat
                                        label="Δnorm_x"
                                        value={formatDecimal(measuredShiftX, {
                                            digits: 4,
                                            signed: true,
                                        })}
                                        formula={measuredShiftFormulaX}
                                    />
                                    <DebugStat
                                        label="Δnorm_y"
                                        value={formatDecimal(measuredShiftY, {
                                            digits: 4,
                                            signed: true,
                                        })}
                                        formula={measuredShiftFormulaY}
                                    />
                                    <DebugStat
                                        label="sizeDeltaAtStepTest"
                                        value={`${formatDecimal(sizeDeltaAtStepTest, { digits: 4, signed: true })} (${formatPercent(sizeDeltaAtStepTest, { signed: true })})`}
                                        formula={sizeDeltaFormula}
                                    />
                                    <DebugStat
                                        label="size_after_step"
                                        value={formatDecimal(sizeAfterStep, { digits: 4 })}
                                        formula={sizeAfterStepFormula}
                                    />
                                    <DebugStat
                                        label="deltaSteps"
                                        value={`${stepTestSettings.deltaSteps} steps`}
                                        formula="`deltaSteps` is the fixed step magnitude used during characterization."
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

interface DebugStatProps {
    label: string;
    value: string;
    formula?: React.ReactNode;
}

const DebugStat: React.FC<DebugStatProps> = ({ label, value, formula }) => {
    const renderFormula = (content: React.ReactNode) => {
        if (typeof content === 'string') {
            const segments = content.split(/`([^`]+)`/g);
            return segments.map((segment, index) =>
                index % 2 === 1 ? (
                    <code key={`${segment}-${index}`} className="font-mono text-emerald-200">
                        {segment}
                    </code>
                ) : (
                    <span key={index}>{segment}</span>
                ),
            );
        }
        return content;
    };

    return (
        <div className="rounded-md border border-gray-800/70 bg-gray-950/50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 font-mono text-base text-gray-100">{value}</p>
            {formula ? (
                <p className="mt-1 text-xs text-gray-400">{renderFormula(formula)}</p>
            ) : null}
        </div>
    );
};

export default TileDebugModal;
