import React from 'react';

import Modal from '@/components/Modal';
import type { CalibrationRunSummary } from '@/services/calibration/types';

import { formatDecimal, formatPercent } from './calibrationMetricsFormatters';

interface CalibrationSummaryModalProps {
    open: boolean;
    summary: CalibrationRunSummary | null;
    onClose: () => void;
}

const CalibrationSummaryModal: React.FC<CalibrationSummaryModalProps> = ({
    open,
    summary,
    onClose,
}) => {
    const blueprint = summary?.gridBlueprint;
    const stepSettings = summary?.stepTestSettings;
    if (!summary || !blueprint) {
        return (
            <Modal open={open} onClose={onClose} title="Calibration summary">
                <p className="text-sm text-gray-300">No calibration measurements available yet.</p>
            </Modal>
        );
    }

    const widthPercent = blueprint.adjustedTileFootprint.width * 100;
    const heightPercent = blueprint.adjustedTileFootprint.height * 100;
    const gapPercentX = (blueprint.tileGap.x ?? 0) * 100;
    const gapPercentY = (blueprint.tileGap.y ?? 0) * 100;
    const spacingXPercent =
        (blueprint.adjustedTileFootprint.width + (blueprint.tileGap.x ?? 0)) * 100;
    const spacingYPercent =
        (blueprint.adjustedTileFootprint.height + (blueprint.tileGap.y ?? 0)) * 100;
    const tileCount = Object.values(summary.tiles).filter(
        (tile) => tile.status === 'completed',
    ).length;

    const widthFormula = `width% = adjustedTileFootprint.width × 100 = ${formatDecimal(blueprint.adjustedTileFootprint.width)} × 100 = ${formatDecimal(widthPercent / 100)} × 100`;
    const heightFormula = `height% = adjustedTileFootprint.height × 100 = ${formatDecimal(blueprint.adjustedTileFootprint.height)} × 100 = ${formatDecimal(heightPercent / 100)} × 100`;
    const gapFormulaX = `gapX% = tileGap.x × 100 = ${formatDecimal(blueprint.tileGap.x ?? 0)} × 100`;
    const gapFormulaY = `gapY% = tileGap.y × 100 = ${formatDecimal(blueprint.tileGap.y ?? 0)} × 100`;
    const spacingXFormula = `spacingX% = width% + gapX% = ${widthPercent.toFixed(2)} + ${gapPercentX.toFixed(2)}`;
    const spacingYFormula = `spacingY% = height% + gapY% = ${heightPercent.toFixed(2)} + ${gapPercentY.toFixed(2)}`;

    return (
        <Modal open={open} onClose={onClose} title="Calibration summary – debug">
            <div className="space-y-6 text-sm text-gray-200">
                <section>
                    <p className="text-xs tracking-wide text-gray-500 uppercase">Grid blueprint</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <SummaryStat
                            label="Adjusted width"
                            value={`${widthPercent.toFixed(2)}%`}
                            formula={widthFormula}
                        />
                        <SummaryStat
                            label="Adjusted height"
                            value={`${heightPercent.toFixed(2)}%`}
                            formula={heightFormula}
                        />
                        <SummaryStat
                            label="Tile gap – X axis"
                            value={`${gapPercentX.toFixed(2)}%`}
                            formula={gapFormulaX}
                        />
                        <SummaryStat
                            label="Tile gap – Y axis"
                            value={`${gapPercentY.toFixed(2)}%`}
                            formula={gapFormulaY}
                        />
                        <SummaryStat
                            label="Spacing X"
                            value={`${spacingXPercent.toFixed(2)}%`}
                            formula={spacingXFormula}
                        />
                        <SummaryStat
                            label="Spacing Y"
                            value={`${spacingYPercent.toFixed(2)}%`}
                            formula={spacingYFormula}
                        />
                        <SummaryStat
                            label="Grid origin (centered)"
                            value={`(${formatPercent(blueprint.gridOrigin.x)}, ${formatPercent(blueprint.gridOrigin.y)})`}
                            formula="gridOrigin marks the top-left corner of the re-centered grid layout (normalized coordinates)."
                        />
                        <SummaryStat
                            label="Camera origin offset"
                            value={`(${formatPercent(blueprint.cameraOriginOffset.x)}, ${formatPercent(blueprint.cameraOriginOffset.y)})`}
                            formula="Add this offset to any grid-centered coordinate to map it back into camera space."
                        />
                    </div>
                </section>
                <section>
                    <p className="text-xs tracking-wide text-gray-500 uppercase">
                        Tiles & measurements
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <SummaryStat
                            label="Calibrated tiles"
                            value={tileCount.toString()}
                            formula="calibratedTiles = number of tile results with status === 'completed'."
                        />
                        <SummaryStat
                            label="Total entries"
                            value={Object.keys(summary.tiles).length.toString()}
                            formula="total tiles = count of entries in summary.tiles."
                        />
                    </div>
                </section>
                {stepSettings && (
                    <section>
                        <p className="text-xs tracking-wide text-gray-500 uppercase">
                            Step test settings
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-1">
                            <SummaryStat
                                label="Delta steps"
                                value={`${stepSettings.deltaSteps}`}
                                formula="deltaSteps = ± steps used during characterization."
                            />
                        </div>
                    </section>
                )}
            </div>
        </Modal>
    );
};

interface SummaryStatProps {
    label: string;
    value: string;
    formula: string;
}

const SummaryStat: React.FC<SummaryStatProps> = ({ label, value, formula }) => (
    <div className="rounded-md border border-gray-800/70 bg-gray-950/50 p-3">
        <p className="text-xs tracking-wide text-gray-500 uppercase">{label}</p>
        <p className="mt-1 font-mono text-base text-gray-100">{value}</p>
        <p className="mt-1 text-xs text-gray-400">{formula}</p>
    </div>
);

export default CalibrationSummaryModal;
