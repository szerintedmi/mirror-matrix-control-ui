import React, { useCallback } from 'react';

import type {
    AlignmentRunSummaryOutput,
    AlignmentState,
    TileAlignmentState,
    TileAlignmentStatus,
} from '@/hooks/useAlignmentController';
import type { ConvergenceStatus } from '@/services/alignment';

interface AlignmentProgressPanelProps {
    state: AlignmentState;
    runSummary: AlignmentRunSummaryOutput | null;
    onExport: (summary: AlignmentRunSummaryOutput) => void;
    convergenceStatus: ConvergenceStatus | null;
}

const STATUS_LABEL: Record<TileAlignmentStatus, string> = {
    pending: 'Pending',
    'in-progress': 'Running',
    converged: 'Converged',
    partial: 'Partial',
    'max-iterations': 'Max Iters',
    skipped: 'Skipped',
    error: 'Error',
};

const STATUS_COLOR: Record<TileAlignmentStatus, string> = {
    pending: 'text-gray-500',
    'in-progress': 'text-blue-400',
    converged: 'text-emerald-400',
    partial: 'text-amber-400',
    'max-iterations': 'text-amber-400',
    skipped: 'text-gray-500',
    error: 'text-red-400',
};

const STEP_OUTCOME_COLOR: Record<string, string> = {
    accepted: 'text-emerald-400',
    rejected: 'text-amber-400',
    converged: 'text-emerald-300',
    'bounds-exceeded': 'text-red-400',
};

const AlignmentProgressPanel: React.FC<AlignmentProgressPanelProps> = ({
    state,
    runSummary,
    onExport,
    convergenceStatus,
}) => {
    const tiles = Object.values(state.tileStates);
    const hasTiles = tiles.length > 0;

    const handleExport = useCallback(() => {
        if (runSummary) onExport(runSummary);
    }, [runSummary, onExport]);

    if (!hasTiles && !runSummary) return null;

    return (
        <div className="flex flex-col gap-3">
            {/* Aggregate metrics */}
            {runSummary && (
                <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                        Run Summary
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <MetricRow
                            label="Converged"
                            value={String(runSummary.tilesConverged)}
                            className="text-emerald-400"
                        />
                        <MetricRow
                            label="Partial"
                            value={String(runSummary.tilesPartial)}
                            className="text-amber-400"
                        />
                        <MetricRow
                            label="Skipped"
                            value={String(runSummary.tilesSkipped)}
                            className="text-gray-500"
                        />
                        <MetricRow
                            label="Errored"
                            value={String(runSummary.tilesErrored)}
                            className="text-red-400"
                        />
                        {runSummary.areaReductionPercent !== null && (
                            <MetricRow
                                label="Area Reduction"
                                value={`${runSummary.areaReductionPercent.toFixed(1)}%`}
                                className={
                                    runSummary.areaReductionPercent > 0
                                        ? 'text-emerald-400'
                                        : 'text-amber-400'
                                }
                            />
                        )}
                        {runSummary.baselineMetrics && (
                            <MetricRow
                                label="Baseline Ecc."
                                value={runSummary.baselineMetrics.eccentricity.toFixed(3)}
                                className="text-gray-300"
                            />
                        )}
                        {runSummary.finalMetrics && (
                            <MetricRow
                                label="Final Ecc."
                                value={runSummary.finalMetrics.eccentricity.toFixed(3)}
                                className="text-gray-300"
                            />
                        )}
                    </div>
                    <button
                        onClick={handleExport}
                        className="mt-2 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                    >
                        Export JSON
                    </button>
                </section>
            )}

            {/* Active Tile Convergence */}
            {convergenceStatus && (
                <section className="rounded-lg border border-blue-500/30 bg-gray-800/50 p-3">
                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-blue-400 uppercase">
                        Active Tile Convergence
                    </h3>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Tile</span>
                            <span className="font-mono text-gray-300">
                                {convergenceStatus.tile}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Axis</span>
                            <span className="font-mono text-gray-300">
                                {convergenceStatus.axis.toUpperCase()}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Iteration</span>
                            <span className="font-mono text-gray-300">
                                {convergenceStatus.iteration} / {convergenceStatus.maxIterations}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Reference Area</span>
                            <span className="font-mono text-gray-300">
                                {convergenceStatus.referenceArea.toFixed(0)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Current Area</span>
                            <span className="font-mono text-gray-300">
                                {convergenceStatus.currentArea.toFixed(0)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Area Difference</span>
                            <span
                                className={`font-mono ${
                                    convergenceStatus.areaDifference > 0
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                }`}
                            >
                                {convergenceStatus.areaDifference > 0 ? '+' : ''}
                                {convergenceStatus.areaDifference.toFixed(0)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Area Gap</span>
                            <span
                                className={`font-mono ${
                                    convergenceStatus.areaGap > 0.1
                                        ? 'text-amber-400'
                                        : convergenceStatus.areaGap >
                                            convergenceStatus.convergenceThreshold
                                          ? 'text-yellow-400'
                                          : 'text-emerald-400'
                                }`}
                            >
                                {(convergenceStatus.areaGap * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Step Size</span>
                            <span className="font-mono text-gray-300">
                                {convergenceStatus.activeStepSize}
                            </span>
                        </div>
                        {convergenceStatus.direction !== undefined && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Direction</span>
                                <span className="font-mono text-gray-300">
                                    {convergenceStatus.direction > 0 ? '+' : '\u2212'}
                                </span>
                            </div>
                        )}
                        {convergenceStatus.trialPosition !== undefined && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Trial Position</span>
                                <span className="font-mono text-gray-300">
                                    {convergenceStatus.trialPosition}
                                </span>
                            </div>
                        )}
                        {convergenceStatus.trialArea !== undefined && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Trial Area</span>
                                <span
                                    className={`font-mono ${
                                        convergenceStatus.trialArea < convergenceStatus.currentArea
                                            ? 'text-emerald-400'
                                            : 'text-amber-400'
                                    }`}
                                >
                                    {convergenceStatus.trialArea.toFixed(0)}
                                </span>
                            </div>
                        )}
                        {convergenceStatus.stepOutcome && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Step Outcome</span>
                                <span
                                    className={`font-mono font-medium ${STEP_OUTCOME_COLOR[convergenceStatus.stepOutcome]}`}
                                >
                                    {convergenceStatus.stepOutcome}
                                </span>
                            </div>
                        )}
                        {convergenceStatus.consecutiveRejections !== undefined &&
                            convergenceStatus.consecutiveRejections > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Consecutive Rejections</span>
                                    <span className="font-mono text-amber-400">
                                        {convergenceStatus.consecutiveRejections}
                                    </span>
                                </div>
                            )}
                        {/* Convergence progress bar */}
                        <div className="pt-1">
                            <div className="h-1.5 w-full rounded-full bg-gray-700">
                                <div
                                    className={`h-1.5 rounded-full transition-all ${
                                        convergenceStatus.areaGap <=
                                        convergenceStatus.convergenceThreshold
                                            ? 'bg-emerald-500'
                                            : 'bg-blue-500'
                                    }`}
                                    style={{
                                        width: `${Math.max(0, Math.min(100, (1 - convergenceStatus.areaGap) * 100))}%`,
                                    }}
                                />
                            </div>
                            <div className="mt-0.5 flex justify-between text-[10px] text-gray-500">
                                <span>0%</span>
                                <span>
                                    {((1 - convergenceStatus.areaGap) * 100).toFixed(0)}% converged
                                </span>
                                <span>100%</span>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Baseline / current metrics while running */}
            {!runSummary && state.baselineMetrics && (
                <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                        Metrics
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <MetricRow
                            label="Baseline Area"
                            value={state.baselineMetrics.area.toFixed(0)}
                            className="text-gray-300"
                        />
                        <MetricRow
                            label="Baseline Ecc."
                            value={state.baselineMetrics.eccentricity.toFixed(3)}
                            className="text-gray-300"
                        />
                        {state.currentMetrics && (
                            <>
                                <MetricRow
                                    label="Current Area"
                                    value={state.currentMetrics.area.toFixed(0)}
                                    className="text-gray-300"
                                />
                                <MetricRow
                                    label="Current Ecc."
                                    value={state.currentMetrics.eccentricity.toFixed(3)}
                                    className="text-gray-300"
                                />
                            </>
                        )}
                    </div>
                </section>
            )}

            {/* Per-tile status table */}
            {hasTiles && (
                <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                        Tile Status
                    </h3>
                    <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead>
                                <tr className="border-b border-gray-700 text-gray-500">
                                    <th className="pr-2 pb-1 font-medium">Tile</th>
                                    <th className="pr-2 pb-1 font-medium">Status</th>
                                    <th className="pr-2 pb-1 font-medium">X Corr</th>
                                    <th className="pr-2 pb-1 font-medium">Y Corr</th>
                                    <th className="pb-1 font-medium">Ecc.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tiles.map((tile) => (
                                    <TileRow
                                        key={tile.key}
                                        tile={tile}
                                        isActive={state.activeTile === tile.key}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
};

const MetricRow: React.FC<{ label: string; value: string; className: string }> = ({
    label,
    value,
    className,
}) => (
    <div className="flex justify-between">
        <span className="text-gray-500">{label}</span>
        <span className={`font-mono ${className}`}>{value}</span>
    </div>
);

const TileRow: React.FC<{ tile: TileAlignmentState; isActive: boolean }> = ({ tile, isActive }) => (
    <tr className={`border-b border-gray-800 ${isActive ? 'bg-blue-500/10' : ''}`}>
        <td className="py-0.5 pr-2 font-mono text-gray-300">{tile.key}</td>
        <td className={`py-0.5 pr-2 ${STATUS_COLOR[tile.status]}`}>{STATUS_LABEL[tile.status]}</td>
        <td className="py-0.5 pr-2 font-mono text-gray-400">
            {tile.correction.x !== 0 ? (tile.correction.x > 0 ? '+' : '') + tile.correction.x : '—'}
        </td>
        <td className="py-0.5 pr-2 font-mono text-gray-400">
            {tile.correction.y !== 0 ? (tile.correction.y > 0 ? '+' : '') + tile.correction.y : '—'}
        </td>
        <td className="py-0.5 font-mono text-gray-400">
            {tile.finalEccentricity !== null ? tile.finalEccentricity.toFixed(3) : '—'}
        </td>
    </tr>
);

export default AlignmentProgressPanel;
