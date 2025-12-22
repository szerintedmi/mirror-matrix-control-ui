import React, { useMemo } from 'react';

import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { calculateProjectionSpan, inferGridFromCanvas } from '../utils/projectionGeometry';
import { computeDirectOverlaps } from '../utils/tileOverlap';

import type { NavigationControls } from '../App';
import type { LegacyPattern, LegacyPatternCanvas, ProjectionSettings } from '../types';

interface PatternLibraryPageProps {
    navigation: NavigationControls;
    patterns: LegacyPattern[];
    onDeletePattern: (patternId: string) => void;
    projectionSettings: ProjectionSettings;
    activePatternId: string | null;
    onSelectActivePattern: (patternId: string) => void;
}

const PatternPreview: React.FC<{ pattern: LegacyPattern }> = ({ pattern }) => {
    const canvasWidth = Math.max(pattern.canvas.width, TILE_PLACEMENT_UNIT);
    const canvasHeight = Math.max(pattern.canvas.height, TILE_PLACEMENT_UNIT);
    const aspectRatio = canvasWidth / canvasHeight;
    const containerStyle: React.CSSProperties = {
        paddingBottom: `${(1 / aspectRatio) * 100}%`,
        position: 'relative',
    };
    const footprints = useMemo(() => {
        return pattern.tiles.map((tile) => ({
            id: tile.id,
            centerX: tile.center.x,
            centerY: tile.center.y,
            width: tile.size.width,
            height: tile.size.height,
        }));
    }, [pattern.tiles]);

    const overlaps = useMemo(() => computeDirectOverlaps(footprints), [footprints]);
    const tileMap = useMemo(() => new Map(footprints.map((tile) => [tile.id, tile])), [footprints]);
    const maxCount = overlaps.reduce((max, record) => Math.max(max, record.count), 1);

    return (
        <div style={containerStyle}>
            <svg
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                preserveAspectRatio="xMidYMid meet"
                className="absolute top-0 left-0 size-full bg-gray-800"
            >
                <rect
                    x={0}
                    y={0}
                    width={canvasWidth}
                    height={canvasHeight}
                    fill="rgba(17, 24, 39, 0.65)"
                />
                {overlaps.map((entry) => {
                    const tile = tileMap.get(entry.id);
                    if (!tile) {
                        return null;
                    }
                    const opacity = maxCount > 0 ? 1 / maxCount : 1;
                    return (
                        <g key={`preview-${entry.id}`} pointerEvents="none">
                            <circle
                                cx={tile.centerX}
                                cy={tile.centerY}
                                r={TILE_PLACEMENT_UNIT / 2}
                                fill="#f8fafc"
                                fillOpacity={opacity}
                            />
                            {entry.count > 1 && (
                                <text
                                    x={tile.centerX}
                                    y={tile.centerY + TILE_PLACEMENT_UNIT * 0.1}
                                    textAnchor="middle"
                                    fontSize={Math.max(TILE_PLACEMENT_UNIT * 0.32, 4)}
                                    fill="rgba(15, 23, 42, 0.55)"
                                    fontWeight={500}
                                >
                                    {entry.count}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

const PatternLibraryPage: React.FC<PatternLibraryPageProps> = (props) => {
    const {
        navigation,
        patterns,
        onDeletePattern,
        projectionSettings,
        activePatternId,
        onSelectActivePattern,
    } = props;

    const formatProjectedSize = (canvas: LegacyPatternCanvas) => {
        const derivedGrid = inferGridFromCanvas(canvas);
        const span = calculateProjectionSpan(derivedGrid, projectionSettings);
        const widthStr = span.width !== null ? `${span.width.toFixed(2)}m` : 'Infinite';
        const heightStr = span.height !== null ? `${span.height.toFixed(2)}m` : 'Infinite';
        const distanceStr = `${projectionSettings.wallDistance.toFixed(1)}m`;
        return { width: widthStr, height: heightStr, distance: distanceStr };
    };

    return (
        <div className="flex flex-col gap-6">
            <section className="flex justify-end">
                <button
                    onClick={() => navigation.editPattern(null)}
                    className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
                >
                    Create New Pattern
                </button>
            </section>

            <main className="flex flex-col gap-4 rounded-lg bg-gray-800/50 p-4 shadow-lg ring-1 ring-white/10">
                <h2 className="text-lg font-semibold text-gray-100">Saved Patterns</h2>
                <div className="-mr-2 flex-grow overflow-y-auto pr-2">
                    {patterns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-gray-500">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="size-12"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                                />
                            </svg>
                            <p>No patterns created yet.</p>
                            <p className="text-sm">
                                Click &ldquo;Create New Pattern&rdquo; to get started.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {patterns.map((pattern) => {
                                const projectedSize = formatProjectedSize(pattern.canvas);
                                const inferredRows = Math.max(
                                    1,
                                    Math.round(pattern.canvas.height / TILE_PLACEMENT_UNIT),
                                );
                                const inferredCols = Math.max(
                                    1,
                                    Math.round(pattern.canvas.width / TILE_PLACEMENT_UNIT),
                                );
                                const isActive = pattern.id === activePatternId;
                                return (
                                    <div
                                        key={pattern.id}
                                        className="group flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50 transition-colors hover:border-cyan-500"
                                    >
                                        <div className="p-1">
                                            <PatternPreview pattern={pattern} />
                                        </div>
                                        <div className="flex flex-grow flex-col gap-2 p-3">
                                            <h3 className="truncate font-semibold text-gray-200">
                                                {pattern.name}
                                            </h3>
                                            <p className="font-mono text-sm text-gray-400">
                                                {inferredRows}x{inferredCols} -{' '}
                                                {pattern.tiles.length} tiles
                                            </p>
                                            {isActive && (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-cyan-300 uppercase">
                                                    <span className="size-2 animate-pulse rounded-full bg-cyan-400" />
                                                    Active in Simulation
                                                </span>
                                            )}

                                            <div className="mt-2 border-t border-gray-700/50 pt-2 text-xs">
                                                <p className="mb-1 text-gray-400">
                                                    Est. Projection (WxH @ Dist):
                                                </p>
                                                <p className="font-mono text-sm text-cyan-400">
                                                    {projectedSize.width} &times;{' '}
                                                    {projectedSize.height} @{' '}
                                                    {projectedSize.distance}
                                                </p>
                                            </div>

                                            <div className="mt-auto flex justify-end gap-2">
                                                <button
                                                    onClick={() =>
                                                        onSelectActivePattern(pattern.id)
                                                    }
                                                    disabled={isActive}
                                                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                                                        isActive
                                                            ? 'cursor-default border-cyan-500/30 bg-cyan-900/40 text-cyan-100'
                                                            : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
                                                    }`}
                                                >
                                                    {isActive ? 'Active' : 'Set Active'}
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        navigation.editPattern(pattern.id)
                                                    }
                                                    className="rounded-md bg-gray-700 px-3 py-1 text-sm text-gray-200 transition-colors hover:bg-gray-600"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (
                                                            window.confirm(
                                                                `Delete "${pattern.name}"?`,
                                                            )
                                                        )
                                                            onDeletePattern(pattern.id);
                                                    }}
                                                    className="rounded-md bg-red-800/70 px-3 py-1 text-sm text-red-200 transition-colors hover:bg-red-700/80"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default PatternLibraryPage;
