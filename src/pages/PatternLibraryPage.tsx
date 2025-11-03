import React, { useMemo } from 'react';

import MotorStatusOverview from '../components/MotorStatusOverview';
import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { useStatusStore } from '../context/StatusContext';
import {
    calculateDisplayIntensity,
    intensityToFill,
    intensityToStroke,
} from '../utils/patternIntensity';

import type { NavigationControls } from '../App';
import type { MirrorConfig, Pattern, PatternCanvas } from '../types';

interface PatternLibraryPageProps {
    navigation: NavigationControls;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    patterns: Pattern[];
    onDeletePattern: (patternId: string) => void;
    wallDistance: number;
    horizontalAngle: number;
    verticalAngle: number;
    lightAngleHorizontal: number;
    lightAngleVertical: number;
}

const PatternPreview: React.FC<{ pattern: Pattern }> = ({ pattern }) => {
    const canvasWidth = Math.max(pattern.canvas.width, TILE_PLACEMENT_UNIT);
    const canvasHeight = Math.max(pattern.canvas.height, TILE_PLACEMENT_UNIT);
    const aspectRatio = canvasWidth / canvasHeight;
    const containerStyle: React.CSSProperties = {
        paddingBottom: `${(1 / aspectRatio) * 100}%`,
        position: 'relative',
    };

    const { entries, maxCount } = useMemo(() => {
        const aggregates = new Map<
            string,
            { x: number; y: number; width: number; height: number; count: number }
        >();

        for (const tile of pattern.tiles) {
            const row = Math.round(tile.center.y / TILE_PLACEMENT_UNIT - 0.5);
            const col = Math.round(tile.center.x / TILE_PLACEMENT_UNIT - 0.5);
            const key = `${row}-${col}`;
            const existing = aggregates.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                aggregates.set(key, {
                    x: col * TILE_PLACEMENT_UNIT,
                    y: row * TILE_PLACEMENT_UNIT,
                    width: tile.size.width,
                    height: tile.size.height,
                    count: 1,
                });
            }
        }

        const aggregateEntries = Array.from(aggregates.entries()).map(([key, value]) => ({
            key,
            ...value,
        }));
        const maxCount = aggregateEntries.reduce((acc, entry) => Math.max(acc, entry.count), 0);
        return {
            entries: aggregateEntries,
            maxCount: maxCount > 0 ? maxCount : 1,
        };
    }, [pattern.tiles]);

    return (
        <div style={containerStyle}>
            <svg
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                preserveAspectRatio="xMidYMid meet"
                className="absolute top-0 left-0 w-full h-full bg-gray-800"
            >
                <rect
                    x={0}
                    y={0}
                    width={canvasWidth}
                    height={canvasHeight}
                    fill="rgba(17, 24, 39, 0.65)"
                />
                {entries.map((entry) => {
                    const intensity = calculateDisplayIntensity(entry.count, maxCount);
                    const fill = intensityToFill(intensity);
                    const stroke = intensityToStroke(intensity);
                    return (
                        <g key={entry.key} pointerEvents="none">
                            <rect
                                x={entry.x}
                                y={entry.y}
                                width={entry.width}
                                height={entry.height}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={Math.max(entry.width * 0.12, 0.6)}
                                rx={entry.width * 0.1}
                                ry={entry.height * 0.1}
                            />
                            <text
                                x={entry.x + entry.width / 2}
                                y={entry.y + entry.height / 2 + entry.height * 0.1}
                                textAnchor="middle"
                                fontSize={Math.max(entry.width * 0.32, 4)}
                                fill="rgba(15, 23, 42, 0.5)"
                                fontWeight={500}
                                pointerEvents="none"
                            >
                                {entry.count}
                            </text>
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
        gridSize,
        mirrorConfig,
        patterns,
        onDeletePattern,
        wallDistance,
        horizontalAngle,
        verticalAngle,
        lightAngleHorizontal,
        lightAngleVertical,
    } = props;

    const { drivers } = useStatusStore();

    const calculateProjectedSize = (canvas: PatternCanvas) => {
        const MIRROR_DIMENSION_M = 0.05; // 50mm
        const degToRad = (deg: number) => deg * (Math.PI / 180);

        const cols = Math.max(1, Math.round(canvas.width / TILE_PLACEMENT_UNIT));
        const rows = Math.max(1, Math.round(canvas.height / TILE_PLACEMENT_UNIT));

        const arrayWidth = cols * MIRROR_DIMENSION_M;
        const arrayHeight = rows * MIRROR_DIMENSION_M;

        const wallH = horizontalAngle;
        const wallV = verticalAngle;
        const lightH = lightAngleHorizontal;
        const lightV = lightAngleVertical;

        // Start with a base projection that scales linearly with distance.
        // This assumes a divergence that makes projected size = array size at 1m.
        const baseWidth = arrayWidth * wallDistance;
        const baseHeight = arrayHeight * wallDistance;

        let projectedWidth: number | null = null;
        const lightHRad = degToRad(lightH);
        const totalHAngleRad = degToRad(wallH + lightH);
        if (Math.abs(totalHAngleRad) < Math.PI / 2) {
            // Apply keystone correction based on light and wall angles.
            projectedWidth = (baseWidth * Math.cos(lightHRad)) / Math.cos(totalHAngleRad);
        }

        let projectedHeight: number | null = null;
        const lightVRad = degToRad(lightV);
        const totalVAngleRad = degToRad(wallV + lightV);
        if (Math.abs(totalVAngleRad) < Math.PI / 2) {
            // Apply keystone correction based on light and wall angles.
            projectedHeight = (baseHeight * Math.cos(lightVRad)) / Math.cos(totalVAngleRad);
        }

        const widthStr = projectedWidth !== null ? `${projectedWidth.toFixed(2)}m` : 'Infinite';
        const heightStr = projectedHeight !== null ? `${projectedHeight.toFixed(2)}m` : 'Infinite';
        const distanceStr = `${wallDistance.toFixed(1)}m`;
        return { width: widthStr, height: heightStr, distance: distanceStr };
    };

    return (
        <div className="flex flex-col h-screen p-4 sm:p-6 lg:p-8">
            <header className="mb-6 flex flex-wrap justify-between items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-4xl font-bold text-cyan-400 tracking-tight">
                        Pattern Library
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Manage your light patterns and configure the simulation.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigation.navigateTo('configurator')}
                        className="px-4 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors border border-gray-600"
                    >
                        Configure Array
                    </button>
                    <button
                        onClick={() => navigation.navigateTo('simulation')}
                        className="px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
                    >
                        Go to Simulation
                    </button>
                    <button
                        onClick={() => navigation.editPattern(null)}
                        className="px-4 py-2 rounded-md bg-cyan-600 text-white font-semibold hover:bg-cyan-500 transition-colors"
                    >
                        Create New Pattern
                    </button>
                </div>
            </header>

            <section className="mb-6">
                <MotorStatusOverview
                    rows={gridSize.rows}
                    cols={gridSize.cols}
                    mirrorConfig={mirrorConfig}
                    drivers={drivers}
                />
            </section>

            <main className="flex-grow bg-gray-800/50 rounded-lg p-4 shadow-lg ring-1 ring-white/10 flex flex-col min-h-0">
                <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex-shrink-0">
                    Saved Patterns
                </h2>
                <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                    {patterns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-12 w-12 mb-2"
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            {patterns.map((pattern) => {
                                const projectedSize = calculateProjectedSize(pattern.canvas);
                                const inferredRows = Math.max(
                                    1,
                                    Math.round(pattern.canvas.height / TILE_PLACEMENT_UNIT),
                                );
                                const inferredCols = Math.max(
                                    1,
                                    Math.round(pattern.canvas.width / TILE_PLACEMENT_UNIT),
                                );
                                return (
                                    <div
                                        key={pattern.id}
                                        className="bg-gray-900/50 rounded-lg overflow-hidden border border-gray-700 hover:border-cyan-500 transition-colors group flex flex-col"
                                    >
                                        <div className="p-1">
                                            <PatternPreview pattern={pattern} />
                                        </div>
                                        <div className="p-3 flex flex-col flex-grow">
                                            <h3 className="font-semibold text-gray-200 truncate">
                                                {pattern.name}
                                            </h3>
                                            <p className="text-sm text-gray-400 font-mono">
                                                {inferredRows}x{inferredCols} - {pattern.tiles.length}{' '}
                                                tiles
                                            </p>

                                            <div className="mt-2 pt-2 border-t border-gray-700/50 text-xs">
                                                <p className="text-gray-400 mb-1">
                                                    Est. Projection (WxH @ Dist):
                                                </p>
                                                <p className="font-mono text-cyan-400 text-sm">
                                                    {projectedSize.width} &times;{' '}
                                                    {projectedSize.height} @{' '}
                                                    {projectedSize.distance}
                                                </p>
                                            </div>

                                            <div className="mt-3 flex justify-end gap-2 mt-auto">
                                                <button
                                                    onClick={() =>
                                                        navigation.editPattern(pattern.id)
                                                    }
                                                    className="text-sm px-3 py-1 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
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
                                                    className="text-sm px-3 py-1 rounded-md bg-red-800/70 text-red-200 hover:bg-red-700/80 transition-colors"
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
