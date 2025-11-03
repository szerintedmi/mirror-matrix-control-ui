import React from 'react';

import MotorStatusOverview from '../components/MotorStatusOverview';
import { useStatusStore } from '../context/StatusContext';

import type { NavigationControls } from '../App';
import type { MirrorConfig, Pattern } from '../types';

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
    const { canvasSize, litPixels } = pattern;
    const { rows, cols } = canvasSize;
    const aspectRatio = cols / rows;
    const containerStyle: React.CSSProperties = {
        paddingBottom: `${100 / aspectRatio}%`,
        position: 'relative',
    };
    return (
        <div style={containerStyle}>
            <div
                className="absolute top-0 left-0 w-full h-full grid gap-px bg-gray-800"
                style={{
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                }}
            >
                {Array.from({ length: rows * cols }).map((_, i) => {
                    const row = Math.floor(i / cols);
                    const col = i % cols;
                    const isLit = litPixels.has(`${row}-${col}`);
                    return (
                        <div
                            key={`${row}-${col}`}
                            className={isLit ? 'bg-cyan-400' : 'bg-gray-700/50'}
                        />
                    );
                })}
            </div>
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

    const calculateProjectedSize = (canvasSize: { rows: number; cols: number }) => {
        const MIRROR_DIMENSION_M = 0.05; // 50mm
        const degToRad = (deg: number) => deg * (Math.PI / 180);

        const arrayWidth = canvasSize.cols * MIRROR_DIMENSION_M;
        const arrayHeight = canvasSize.rows * MIRROR_DIMENSION_M;

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
                                const projectedSize = calculateProjectedSize(pattern.canvasSize);
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
                                                {pattern.canvasSize.rows}x{pattern.canvasSize.cols}{' '}
                                                - {pattern.litPixels.size} pixels
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
