import React, { useMemo } from 'react';
import type { NavigationControls } from '../App';

interface SimulationPageProps {
    navigation: NavigationControls;
    gridSize: { rows: number; cols: number };
    wallDistance: number;
    onWallDistanceChange: (value: number) => void;
    horizontalAngle: number;
    onHorizontalAngleChange: (value: number) => void;
    verticalAngle: number;
    onVerticalAngleChange: (value: number) => void;
    lightAngleHorizontal: number;
    onLightAngleHorizontalChange: (value: number) => void;
    lightAngleVertical: number;
    onLightAngleVerticalChange: (value: number) => void;
}

const SliderControl: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
    unit: string;
}> = ({ label, value, onChange, min, max, step, unit }) => {
    return (
        <div className="flex flex-col">
            <div className="flex justify-between items-baseline mb-1">
                <label className="text-sm text-gray-300 font-medium">{label}</label>
                <span className="font-mono text-cyan-300 bg-gray-900 px-2 py-0.5 rounded-md text-sm">
                    {value.toFixed(1)}
                    {unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
        </div>
    );
};

const SimulationPreview: React.FC<Omit<SimulationPageProps, 'navigation' | 'gridSize'>> = (
    props,
) => {
    const {
        wallDistance,
        horizontalAngle,
        verticalAngle,
        lightAngleHorizontal,
        lightAngleVertical,
    } = props;

    const degToRad = (deg: number) => deg * (Math.PI / 180);

    const viewBoxWidth = 400;
    const viewBoxHeight = 200;

    // Layout constants
    const mirrorSize = 40;
    const mirrorX = viewBoxWidth * 0.3;
    const groundY = viewBoxHeight * 0.9;

    const renderView = (isTopView: boolean) => {
        const lightAngle = isTopView ? lightAngleHorizontal : lightAngleVertical;
        const wallAngle = isTopView ? horizontalAngle : verticalAngle;

        const lightRad = degToRad(lightAngle);
        // Correct reflection: angle of reflection = angle of incidence
        const reflectedRad = degToRad(-lightAngle);
        const wallRad = degToRad(wallAngle);

        const mirrorY = isTopView ? viewBoxHeight / 2 : groundY - mirrorSize / 2;

        // Incoming ray
        const sourceDist = 50;
        const sourceX = mirrorX - sourceDist * Math.cos(lightRad);
        const sourceY = mirrorY - sourceDist * Math.sin(lightRad);

        // Reflected ray logic
        let endX = mirrorX + 1000 * Math.cos(reflectedRad);
        let endY = mirrorY + 1000 * Math.sin(reflectedRad);

        // Wall position and geometry
        const wallBaseX = mirrorX + (wallDistance / 20) * 150; // Scale distance

        const wallLen = isTopView ? 120 : viewBoxHeight;
        const wallX1 = wallBaseX - (wallLen / 2) * Math.sin(wallRad);
        const wallY1 =
            (isTopView ? viewBoxHeight / 2 : groundY) + (wallLen / 2) * Math.cos(wallRad);
        const wallX2 = wallBaseX + (wallLen / 2) * Math.sin(wallRad);
        const wallY2 =
            (isTopView ? viewBoxHeight / 2 : groundY) - (wallLen / 2) * Math.cos(wallRad);

        // Line-line intersection
        const x1 = mirrorX,
            y1 = mirrorY;
        const x2 = endX,
            y2 = endY;
        const x3 = wallX1,
            y3 = wallY1;
        const x4 = wallX2,
            y4 = wallY2;

        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (den !== 0) {
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
            const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

            if (t > 0 && u >= 0 && u <= 1) {
                endX = x1 + t * (x2 - x1);
                endY = y1 + t * (y2 - y1);
            }
        }

        // Intersection with ground for side view
        if (!isTopView && endY > groundY) {
            const slope = Math.tan(reflectedRad);
            if (Math.abs(slope) > 0.001) {
                endX = mirrorX + (groundY - mirrorY) / slope;
                endY = groundY;
            }
        }

        return (
            <div className="relative w-full h-full bg-gray-900/50 rounded-md border border-gray-700 overflow-hidden">
                <span className="absolute top-2 left-3 text-xs text-gray-500">
                    {isTopView ? 'Top View' : 'Side View'}
                </span>
                <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full h-full">
                    {/* Ground Line */}
                    {!isTopView && (
                        <line
                            x1="0"
                            y1={groundY}
                            x2={viewBoxWidth}
                            y2={groundY}
                            stroke="#4A5568"
                            strokeWidth="1"
                        />
                    )}

                    {/* Incoming Ray */}
                    <line
                        x1={sourceX}
                        y1={sourceY}
                        x2={mirrorX}
                        y2={mirrorY}
                        stroke="#FBBF24"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                    />
                    <circle cx={sourceX} cy={sourceY} r="5" fill="#FBBF24" />

                    {/* Mirror */}
                    <line
                        x1={mirrorX}
                        y1={mirrorY - mirrorSize / 2}
                        x2={mirrorX}
                        y2={mirrorY + mirrorSize / 2}
                        stroke="#22D3EE"
                        strokeWidth="4"
                        strokeLinecap="round"
                    />

                    {/* Reflected Ray */}
                    <line
                        x1={mirrorX}
                        y1={mirrorY}
                        x2={endX}
                        y2={endY}
                        stroke="#FBBF24"
                        strokeWidth="2.5"
                    />

                    {/* Wall */}
                    <line
                        x1={wallX1}
                        y1={isTopView ? wallY1 : 0}
                        x2={wallX2}
                        y2={isTopView ? wallY2 : groundY}
                        stroke="#E5E7EB"
                        strokeWidth="3"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-4 w-full h-full">
            {renderView(true)}
            {renderView(false)}
        </div>
    );
};

const SimulationPage: React.FC<SimulationPageProps> = (props) => {
    const { navigation, gridSize, ...sliderProps } = props;

    const projectedSize = useMemo(() => {
        const MIRROR_DIMENSION_M = 0.05; // 50mm
        const degToRad = (deg: number) => deg * (Math.PI / 180);

        const arrayWidth = gridSize.cols * MIRROR_DIMENSION_M;
        const arrayHeight = gridSize.rows * MIRROR_DIMENSION_M;

        const {
            wallDistance,
            horizontalAngle: wallH,
            verticalAngle: wallV,
            lightAngleHorizontal: lightH,
            lightAngleVertical: lightV,
        } = sliderProps;

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

        return { width: projectedWidth, height: projectedHeight };
    }, [gridSize, sliderProps]);

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-200">
            <div className="flex-shrink-0 p-4 sm:p-6 lg:p-8 pb-0">
                <header className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-cyan-400 tracking-tight">
                            Simulation
                        </h1>
                        <p className="text-gray-400 mt-1">
                            Adjust parameters to see how patterns are projected.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigation.navigateTo('library')}
                            className="px-4 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors border border-gray-600"
                        >
                            &larr; Back to Library
                        </button>
                    </div>
                </header>
            </div>

            <main className="flex-grow flex md:flex-row flex-col gap-8 min-h-0 p-4 sm:p-6 lg:p-8">
                <aside className="w-full md:w-80 lg:w-96 bg-gray-800/50 rounded-lg p-6 shadow-lg ring-1 ring-white/10 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
                    <h2 className="text-xl font-semibold text-gray-100">Controls</h2>

                    <div className="space-y-5">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-3">
                                Wall & Projection
                            </h3>
                            <SliderControl
                                label="Wall Distance"
                                value={sliderProps.wallDistance}
                                onChange={sliderProps.onWallDistanceChange}
                                min={1}
                                max={20}
                                step={0.1}
                                unit="m"
                            />
                        </div>
                        <div>
                            <h3 className="text-md font-medium text-gray-300 mb-3">
                                Wall Orientation
                            </h3>
                            <SliderControl
                                label="Horizontal Angle"
                                value={sliderProps.horizontalAngle}
                                onChange={sliderProps.onHorizontalAngleChange}
                                min={-45}
                                max={45}
                                step={0.5}
                                unit="°"
                            />
                            <SliderControl
                                label="Vertical Angle"
                                value={sliderProps.verticalAngle}
                                onChange={sliderProps.onVerticalAngleChange}
                                min={-45}
                                max={45}
                                step={0.5}
                                unit="°"
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-3">
                                Light Source
                            </h3>
                            <SliderControl
                                label="Horizontal Angle"
                                value={sliderProps.lightAngleHorizontal}
                                onChange={sliderProps.onLightAngleHorizontalChange}
                                min={-45}
                                max={45}
                                step={0.5}
                                unit="°"
                            />
                            <SliderControl
                                label="Vertical Angle"
                                value={sliderProps.lightAngleVertical}
                                onChange={sliderProps.onLightAngleVerticalChange}
                                min={-45}
                                max={45}
                                step={0.5}
                                unit="°"
                            />
                        </div>
                    </div>

                    <div className="mt-auto pt-5 border-t border-gray-700/50">
                        <h3 className="text-lg font-semibold text-gray-200 mb-3">
                            Projected Pattern Size
                        </h3>
                        <div className="bg-gray-900/70 p-3 rounded-md space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Est. Width:</span>
                                <span className="font-mono text-cyan-300 text-base">
                                    {projectedSize.width !== null
                                        ? `${projectedSize.width.toFixed(2)} m`
                                        : 'Infinite'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Est. Height:</span>
                                <span className="font-mono text-cyan-300 text-base">
                                    {projectedSize.height !== null
                                        ? `${projectedSize.height.toFixed(2)} m`
                                        : 'Infinite'}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 pt-2 border-t border-gray-700/50 mt-2">
                                Based on a {gridSize.cols}x{gridSize.rows} array of 50mm mirrors.
                            </p>
                        </div>
                    </div>
                </aside>

                <div className="flex-grow flex flex-col min-h-0 min-w-0">
                    <SimulationPreview {...sliderProps} />
                </div>
            </main>
        </div>
    );
};

export default SimulationPage;
