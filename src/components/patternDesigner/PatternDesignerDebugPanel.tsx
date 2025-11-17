import React from 'react';

import type { DesignerCoordinate } from './types';
import type { Pattern } from '../../types';

interface PatternDesignerDebugPanelProps {
    pattern: Pattern | null;
    hoverPoint: DesignerCoordinate | null;
    blobRadius: number;
    deleteRadius: number;
}

const formatCoordinate = (value: number): string => value.toFixed(3);

const PatternDesignerDebugPanel: React.FC<PatternDesignerDebugPanelProps> = ({
    pattern,
    hoverPoint,
    blobRadius,
    deleteRadius,
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
                <p className="text-xs text-gray-500">Range: 0.000 – 1.000 on both axes.</p>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-md bg-gray-800/60 p-3">
                        <dt className="text-xs uppercase tracking-wide text-gray-400">
                            Blob Radius
                        </dt>
                        <dd className="font-mono text-sm text-gray-100">
                            {formatCoordinate(blobRadius)}
                        </dd>
                    </div>
                    <div className="rounded-md bg-gray-800/60 p-3">
                        <dt className="text-xs uppercase tracking-wide text-gray-400">
                            Delete Radius
                        </dt>
                        <dd className="font-mono text-sm text-gray-100">
                            {formatCoordinate(deleteRadius)}
                        </dd>
                    </div>
                    <div className="rounded-md bg-gray-800/60 p-3">
                        <dt className="text-xs uppercase tracking-wide text-gray-400">Pointer</dt>
                        <dd className="font-mono text-sm text-gray-100">
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
            </div>
        </section>
    );
};

export default PatternDesignerDebugPanel;
