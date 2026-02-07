import React, { useMemo } from 'react';

import type {
    AlignmentPauseState,
    ShapeMetrics,
    TileAlignmentState,
} from '@/hooks/useAlignmentController';
import type { AlignmentRunSummary } from '@/services/alignmentRunStorage';

interface AlignmentProgressPanelProps {
    phase: string;
    tileStates: Record<string, TileAlignmentState>;
    baselineMetrics: ShapeMetrics | null;
    currentMetrics: ShapeMetrics | null;
    pauseState: AlignmentPauseState | null;
    lastRun: AlignmentRunSummary | null;
    onExportJson: () => void;
}

const toDisplayNumber = (value: number | null | undefined, digits = 2): string =>
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

const AlignmentProgressPanel: React.FC<AlignmentProgressPanelProps> = ({
    phase,
    tileStates,
    baselineMetrics,
    currentMetrics,
    pauseState,
    lastRun,
    onExportJson,
}) => {
    const orderedTiles = useMemo(
        () =>
            Object.values(tileStates).sort((a, b) =>
                a.row === b.row ? a.col - b.col : a.row - b.row,
            ),
        [tileStates],
    );

    const counts = useMemo(() => {
        return orderedTiles.reduce(
            (acc, tile) => {
                acc.total += 1;
                if (tile.status === 'converged') acc.converged += 1;
                if (tile.status === 'partial') acc.partial += 1;
                if (tile.status === 'skipped') acc.skipped += 1;
                if (tile.status === 'error') acc.error += 1;
                if (tile.status === 'max-iterations') acc.maxIterations += 1;
                return acc;
            },
            { total: 0, converged: 0, partial: 0, skipped: 0, error: 0, maxIterations: 0 },
        );
    }, [orderedTiles]);

    return (
        <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-100">Convergence Progress</h2>
                <button
                    type="button"
                    onClick={onExportJson}
                    disabled={!lastRun}
                    className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Export results JSON
                </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-300 md:grid-cols-3 lg:grid-cols-6">
                <div>Total: {counts.total}</div>
                <div>Converged: {counts.converged}</div>
                <div>Partial: {counts.partial}</div>
                <div>Skipped: {counts.skipped}</div>
                <div>Error: {counts.error}</div>
                <div>Max-Iter: {counts.maxIterations}</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-300 md:grid-cols-2">
                <div className="rounded border border-gray-800 bg-gray-900 p-2">
                    <div className="font-medium text-gray-100">Baseline</div>
                    <div>Area: {toDisplayNumber(baselineMetrics?.area, 0)}</div>
                    <div>Eccentricity: {toDisplayNumber(baselineMetrics?.eccentricity, 3)}</div>
                </div>
                <div className="rounded border border-gray-800 bg-gray-900 p-2">
                    <div className="font-medium text-gray-100">Current</div>
                    <div>Area: {toDisplayNumber(currentMetrics?.area, 0)}</div>
                    <div>Eccentricity: {toDisplayNumber(currentMetrics?.eccentricity, 3)}</div>
                </div>
            </div>

            {pauseState && (
                <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <div className="font-semibold uppercase">Paused ({pauseState.reason})</div>
                    <div>{pauseState.message}</div>
                </div>
            )}

            <div className="mt-3 overflow-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-xs text-gray-300">
                    <thead>
                        <tr className="border-b border-gray-800 text-gray-400">
                            <th className="px-2 py-1">Tile</th>
                            <th className="px-2 py-1">Status</th>
                            <th className="px-2 py-1">X Status</th>
                            <th className="px-2 py-1">Y Status</th>
                            <th className="px-2 py-1">X Corr</th>
                            <th className="px-2 py-1">Y Corr</th>
                            <th className="px-2 py-1">Final Ecc</th>
                            <th className="px-2 py-1">Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orderedTiles.map((tile) => (
                            <tr key={tile.key} className="border-b border-gray-900">
                                <td className="px-2 py-1">
                                    {tile.row},{tile.col}
                                </td>
                                <td className="px-2 py-1">{tile.status}</td>
                                <td className="px-2 py-1">
                                    {tile.axes.x.status} ({tile.axes.x.motor?.motorId ?? '—'})
                                </td>
                                <td className="px-2 py-1">
                                    {tile.axes.y.status} ({tile.axes.y.motor?.motorId ?? '—'})
                                </td>
                                <td className="px-2 py-1">{tile.correction.x}</td>
                                <td className="px-2 py-1">{tile.correction.y}</td>
                                <td className="px-2 py-1">
                                    {toDisplayNumber(tile.finalEccentricity, 3)}
                                </td>
                                <td className="px-2 py-1 text-red-300">{tile.error ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <p className="mt-2 text-xs text-gray-500">Phase: {phase}</p>
        </section>
    );
};

export default AlignmentProgressPanel;
