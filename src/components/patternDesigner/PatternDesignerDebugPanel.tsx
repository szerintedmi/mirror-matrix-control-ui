import React from 'react';

import type { DesignerCoordinate, PatternEditMode } from './types';
import type { Pattern } from '../../types';

interface PatternDesignerDebugPanelProps {
    pattern: Pattern | null;
    hoverPoint: DesignerCoordinate | null;
    blobRadius: number;
    editMode: PatternEditMode;
    calibrationTileBounds: Array<{
        id: string;
        xMin: number;
        xMax: number;
        yMin: number;
        yMax: number;
    }>;
}

const formatCoordinate = (value: number): string => value.toFixed(3);
const formatMode = (mode: PatternEditMode): string =>
    mode === 'placement' ? 'Placement' : 'Erase';

const PatternDesignerDebugPanel: React.FC<PatternDesignerDebugPanelProps> = ({
    pattern,
    hoverPoint,
    blobRadius,
    editMode,
    calibrationTileBounds,
}) => {
    const points = pattern?.points ?? [];

    return (
        <section className="rounded-lg bg-gray-900/70 p-4 text-sm text-gray-200 shadow-lg ring-1 ring-white/10">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-100">Debug View</h3>
                    <span className="text-xs uppercase tracking-wide text-gray-500">
                        Normalized Coordinates
                    </span>
                </div>
                <p className="text-xs text-gray-500">Range: -1.000 – 1.000 on both axes.</p>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-md bg-gray-800/60 p-3">
                        <dt className="text-xs uppercase tracking-wide text-gray-400">Mode</dt>
                        <dd className="font-mono text-sm text-gray-100">{formatMode(editMode)}</dd>
                    </div>
                    <div className="rounded-md bg-gray-800/60 p-3">
                        <dt className="text-xs uppercase tracking-wide text-gray-400">
                            Blob Radius
                        </dt>
                        <dd className="font-mono text-sm text-gray-100">
                            {formatCoordinate(blobRadius)}
                        </dd>
                    </div>
                </dl>
                <dl className="grid grid-cols-1 gap-3">
                    <div className="rounded-md bg-gray-800/60 p-3">
                        <dt className="text-xs uppercase tracking-wide text-gray-400">Pointer</dt>
                        <dd className="font-mono text-sm text-gray-100 min-w-[200px]">
                            {hoverPoint
                                ? `x: ${formatCoordinate(hoverPoint.x)}  y: ${formatCoordinate(hoverPoint.y)}`
                                : '—'}
                        </dd>
                    </div>
                </dl>
                <details className="rounded-md bg-gray-800/60 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-100">
                        Blobs ({points.length})
                    </summary>
                    {points.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">No blobs on the canvas yet.</p>
                    ) : (
                        <ul className="mt-2 space-y-1 text-xs text-gray-200">
                            {points.map((point, index) => (
                                <li
                                    key={point.id}
                                    className="flex flex-wrap items-center gap-3 rounded bg-gray-900/40 px-2 py-1 font-mono"
                                >
                                    <span className="text-gray-400">#{index + 1}</span>
                                    <span>x: {formatCoordinate(point.x)}</span>
                                    <span>y: {formatCoordinate(point.y)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </details>
                <details className="rounded-md bg-gray-800/60 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-100">
                        Calibration Tiles ({calibrationTileBounds.length})
                    </summary>
                    {calibrationTileBounds.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">
                            Select a calibration profile to inspect tile bounds.
                        </p>
                    ) : (
                        <div className="mt-2 space-y-2">
                            {calibrationTileBounds.map((tile) => (
                                <div
                                    key={tile.id}
                                    className="rounded bg-gray-900/40 p-2 text-[11px] text-gray-200"
                                >
                                    <p className="font-mono text-[11px] text-gray-400">
                                        Tile {tile.id}
                                    </p>
                                    <div className="mt-1 grid grid-cols-2 gap-1 font-mono">
                                        <span>x min: {formatCoordinate(tile.xMin)}</span>
                                        <span>x max: {formatCoordinate(tile.xMax)}</span>
                                        <span>y min: {formatCoordinate(tile.yMin)}</span>
                                        <span>y max: {formatCoordinate(tile.yMax)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </details>
            </div>
        </section>
    );
};

export default PatternDesignerDebugPanel;
