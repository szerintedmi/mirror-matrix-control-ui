import React from 'react';

import MotorStatusOverview from '../components/MotorStatusOverview';
import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { useStatusStore } from '../context/StatusContext';
import { computeDirectOverlaps } from '../utils/tileOverlap';

import type { MirrorConfig, Pattern } from '../types';

interface PlaybackPageProps {
    patterns: Pattern[];
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const PatternThumbnail: React.FC<{ pattern: Pattern; onActivate: () => void }> = ({
    pattern,
    onActivate,
}) => {
    const canvasWidth = Math.max(pattern.canvas.width, TILE_PLACEMENT_UNIT);
    const canvasHeight = Math.max(pattern.canvas.height, TILE_PLACEMENT_UNIT);
    const aspectRatio = canvasWidth / canvasHeight;
    const containerStyle: React.CSSProperties = {
        paddingBottom: `${(1 / aspectRatio) * 100}%`,
        position: 'relative',
    };

    const rows = Math.max(1, Math.round(pattern.canvas.height / TILE_PLACEMENT_UNIT));
    const cols = Math.max(1, Math.round(pattern.canvas.width / TILE_PLACEMENT_UNIT));
    const footprints = React.useMemo(
        () =>
            pattern.tiles.map((tile) => ({
                id: tile.id,
                centerX: tile.center.x,
                centerY: tile.center.y,
                width: tile.size.width,
                height: tile.size.height,
            })),
        [pattern.tiles],
    );
    const overlaps = React.useMemo(() => computeDirectOverlaps(footprints), [footprints]);
    const tileMap = React.useMemo(
        () => new Map(footprints.map((tile) => [tile.id, tile])),
        [footprints],
    );
    const maxCount = React.useMemo(
        () => overlaps.reduce((max, record) => Math.max(max, record.count), 1),
        [overlaps],
    );

    return (
        <button
            type="button"
            onClick={onActivate}
            className="flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-900/60 p-2 text-left transition hover:border-emerald-400"
        >
            <div style={containerStyle}>
                <svg
                    viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="absolute left-0 top-0 h-full w-full rounded-md bg-gray-800"
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
            <div className="flex flex-col gap-1">
                <span className="font-semibold text-gray-100">{pattern.name}</span>
                <span className="text-xs text-gray-400">
                    {pattern.tiles.length} mirrors • {rows} x {cols} cells
                </span>
            </div>
        </button>
    );
};

const PlaybackPage: React.FC<PlaybackPageProps> = ({ patterns, gridSize, mirrorConfig }) => {
    const { drivers } = useStatusStore();

    const handlePlaybackStart = () => {
        window.alert('Playback not implemented yet');
    };

    return (
        <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 shadow-inner">
                <h2 className="mb-4 text-lg font-semibold text-gray-100">Array Overview</h2>
                <MotorStatusOverview
                    rows={gridSize.rows}
                    cols={gridSize.cols}
                    mirrorConfig={mirrorConfig}
                    drivers={drivers}
                />
            </section>

            <section className="rounded-lg bg-gray-800/50 p-4 shadow-lg ring-1 ring-white/10">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-100">Playback Queue</h2>
                    <span className="text-xs uppercase tracking-wide text-gray-500">
                        {patterns.length} pattern{patterns.length === 1 ? '' : 's'}
                    </span>
                </div>
                {patterns.length === 0 ? (
                    <div className="rounded-md border border-gray-700 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
                        No patterns available for playback yet.
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                        {patterns.map((pattern) => (
                            <PatternThumbnail
                                key={pattern.id}
                                pattern={pattern}
                                onActivate={handlePlaybackStart}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default PlaybackPage;
