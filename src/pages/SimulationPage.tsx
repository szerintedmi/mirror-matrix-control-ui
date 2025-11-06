import React, { useMemo } from 'react';

import BabylonSimView from '../components/BabylonSimView';
import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { MAX_WALL_DISTANCE_M, MIN_WALL_DISTANCE_M } from '../constants/projection';
import { computeProjectionFootprint } from '../utils/projectionGeometry';

import type { Pattern, ProjectionSettings } from '../types';

interface SimulationPageProps {
    gridSize: { rows: number; cols: number };
    projectionSettings: ProjectionSettings;
    onUpdateProjection: (patch: Partial<ProjectionSettings>) => void;
    patterns: Pattern[];
    activePatternId: string | null;
    onSelectPattern: (patternId: string | null) => void;
}

const SliderControl: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
    unit: string;
}> = ({ label, value, onChange, min, max, step, unit }) => (
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

const SimulationPage: React.FC<SimulationPageProps> = ({
    gridSize,
    projectionSettings,
    onUpdateProjection,
    patterns,
    activePatternId,
    onSelectPattern,
}) => {
    const activePattern = useMemo(
        () => patterns.find((pattern) => pattern.id === activePatternId) ?? null,
        [patterns, activePatternId],
    );

    const footprint = useMemo(
        () =>
            computeProjectionFootprint({
                gridSize,
                pattern: activePattern,
                settings: projectionSettings,
            }),
        [activePattern, gridSize, projectionSettings],
    );

    const selectedStats = useMemo(() => {
        if (activePattern) {
            const rows = Math.max(1, Math.round(activePattern.canvas.height / TILE_PLACEMENT_UNIT));
            const cols = Math.max(1, Math.round(activePattern.canvas.width / TILE_PLACEMENT_UNIT));
            return {
                rows,
                cols,
                tiles: activePattern.tiles.length,
            };
        }
        return {
            rows: gridSize.rows,
            cols: gridSize.cols,
            tiles: gridSize.rows * gridSize.cols,
        };
    }, [activePattern, gridSize]);

    const patternOptions = patterns.length === 0 ? [] : patterns;

    const handleSliderChange = (field: keyof ProjectionSettings) => (value: number) => {
        onUpdateProjection({ [field]: value });
    };

    const formattedWidth =
        footprint.projectedWidth !== null ? `${footprint.projectedWidth.toFixed(2)} m` : 'Infinite';
    const formattedHeight =
        footprint.projectedHeight !== null
            ? `${footprint.projectedHeight.toFixed(2)} m`
            : 'Infinite';

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
            <main className="flex flex-col gap-8 min-h-0 md:flex-row">
                <aside className="w-full md:w-80 lg:w-96 bg-gray-800/50 rounded-lg p-6 shadow-lg ring-1 ring-white/10 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
                    <h2 className="text-xl font-semibold text-gray-100">Controls</h2>

                    <div className="space-y-5">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-3">
                                Pattern Source
                            </h3>
                            {patterns.length === 0 ? (
                                <p className="text-sm text-gray-400">
                                    Create a pattern first to preview its wall projection. The grid
                                    layout will be shown until then.
                                </p>
                            ) : (
                                <select
                                    className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                    value={activePatternId ?? ''}
                                    onChange={(e) =>
                                        onSelectPattern(
                                            e.target.value.length > 0 ? e.target.value : null,
                                        )
                                    }
                                >
                                    <option value="">Full grid (no pattern)</option>
                                    {patternOptions.map((pattern) => (
                                        <option key={pattern.id} value={pattern.id}>
                                            {pattern.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <div className="mt-3 text-xs text-gray-400 border border-gray-700/60 rounded-md p-2 bg-gray-900/60">
                                <div className="flex justify-between">
                                    <span>Rows</span>
                                    <span className="font-mono text-cyan-300">
                                        {selectedStats.rows}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Cols</span>
                                    <span className="font-mono text-cyan-300">
                                        {selectedStats.cols}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tiles</span>
                                    <span className="font-mono text-cyan-300">
                                        {selectedStats.tiles}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-3">
                                Wall & Projection
                            </h3>
                            <SliderControl
                                label="Wall Distance"
                                value={projectionSettings.wallDistance}
                                onChange={handleSliderChange('wallDistance')}
                                min={MIN_WALL_DISTANCE_M}
                                max={MAX_WALL_DISTANCE_M}
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
                                value={projectionSettings.wallAngleHorizontal}
                                onChange={handleSliderChange('wallAngleHorizontal')}
                                min={-45}
                                max={45}
                                step={0.5}
                                unit="°"
                            />
                            <SliderControl
                                label="Vertical Angle"
                                value={projectionSettings.wallAngleVertical}
                                onChange={handleSliderChange('wallAngleVertical')}
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
                                value={projectionSettings.lightAngleHorizontal}
                                onChange={handleSliderChange('lightAngleHorizontal')}
                                min={-45}
                                max={45}
                                step={0.5}
                                unit="°"
                            />
                            <SliderControl
                                label="Vertical Angle"
                                value={projectionSettings.lightAngleVertical}
                                onChange={handleSliderChange('lightAngleVertical')}
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
                                    {formattedWidth}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Est. Height:</span>
                                <span className="font-mono text-cyan-300 text-base">
                                    {formattedHeight}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Wall Distance:</span>
                                <span className="font-mono text-cyan-300 text-base">
                                    {projectionSettings.wallDistance.toFixed(1)} m
                                </span>
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="flex-grow flex flex-col min-h-0 min-w-0">
                    <BabylonSimView
                        gridSize={gridSize}
                        settings={projectionSettings}
                        pattern={activePattern}
                    />
                </div>
            </main>
        </div>
    );
};

export default SimulationPage;
