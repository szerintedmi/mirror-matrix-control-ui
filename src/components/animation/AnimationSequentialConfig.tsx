import React from 'react';

import type { AnimationPath, MirrorOrderStrategy, SequentialModeConfig } from '@/types/animation';

interface AnimationSequentialConfigProps {
    config: SequentialModeConfig | undefined;
    paths: AnimationPath[];
    gridSize: { rows: number; cols: number };
    onChange: (config: SequentialModeConfig) => void;
    disabled?: boolean;
}

const ORDER_STRATEGIES: { value: MirrorOrderStrategy; label: string; description: string }[] = [
    { value: 'row-major', label: 'Row by Row', description: 'Left to right, top to bottom' },
    { value: 'col-major', label: 'Column by Column', description: 'Top to bottom, left to right' },
    { value: 'spiral', label: 'Spiral', description: 'Outside to center spiral pattern' },
];

const AnimationSequentialConfig: React.FC<AnimationSequentialConfigProps> = ({
    config,
    paths,
    gridSize,
    onChange,
    disabled = false,
}) => {
    const totalMirrors = gridSize.rows * gridSize.cols;

    const handlePathChange = (pathId: string) => {
        onChange({
            ...(config ?? { pathId: '', offsetMs: 100, orderBy: 'row-major' }),
            pathId,
        });
    };

    const handleOffsetChange = (offsetMs: number) => {
        onChange({
            ...(config ?? { pathId: '', offsetMs: 100, orderBy: 'row-major' }),
            offsetMs: Math.max(0, offsetMs),
        });
    };

    const handleOrderChange = (orderBy: MirrorOrderStrategy) => {
        onChange({
            ...(config ?? { pathId: '', offsetMs: 100, orderBy: 'row-major' }),
            orderBy,
        });
    };

    const selectedPath = paths.find((p) => p.id === config?.pathId);
    const estimatedDuration = selectedPath
        ? (selectedPath.waypoints.length - 1) * 500 + totalMirrors * (config?.offsetMs ?? 100)
        : 0;

    return (
        <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-gray-200">Sequential Mode Settings</h3>

            {/* Path Selection */}
            <div className="flex flex-col gap-1">
                <label
                    htmlFor="sequential-path-select"
                    className="text-xs font-medium text-gray-400"
                >
                    Shared Path
                </label>
                <select
                    id="sequential-path-select"
                    value={config?.pathId ?? ''}
                    onChange={(e) => handlePathChange(e.target.value)}
                    disabled={disabled || paths.length === 0}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <option value="">Select a path...</option>
                    {paths.map((path) => (
                        <option key={path.id} value={path.id}>
                            {path.name} ({path.waypoints.length} waypoints)
                        </option>
                    ))}
                </select>
                {paths.length === 0 && (
                    <p className="text-xs text-amber-400">Create a path first</p>
                )}
            </div>

            {/* Mirror Order */}
            <fieldset className="flex flex-col gap-1">
                <legend className="text-xs font-medium text-gray-400">Mirror Order</legend>
                <div className="grid grid-cols-1 gap-2">
                    {ORDER_STRATEGIES.map((strategy) => {
                        const inputId = `mirror-order-${strategy.value}`;
                        return (
                            // eslint-disable-next-line jsx-a11y/label-has-associated-control
                            <label
                                key={strategy.value}
                                htmlFor={inputId}
                                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                                    config?.orderBy === strategy.value
                                        ? 'border-cyan-500 bg-cyan-600/10'
                                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                                } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                                <input
                                    id={inputId}
                                    type="radio"
                                    name="mirrorOrder"
                                    value={strategy.value}
                                    checked={config?.orderBy === strategy.value}
                                    onChange={() => handleOrderChange(strategy.value)}
                                    disabled={disabled}
                                    className="mt-0.5"
                                />
                                <span className="flex flex-1 flex-col">
                                    <span className="text-sm font-medium text-gray-200">
                                        {strategy.label}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {strategy.description}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            {/* Time Offset */}
            <div className="flex flex-col gap-1">
                <label
                    htmlFor="sequential-offset-slider"
                    className="text-xs font-medium text-gray-400"
                >
                    Time Offset Between Mirrors
                </label>
                <div className="flex items-center gap-3">
                    <input
                        id="sequential-offset-slider"
                        type="range"
                        min={0}
                        max={500}
                        step={10}
                        value={config?.offsetMs ?? 100}
                        onChange={(e) => handleOffsetChange(parseInt(e.target.value, 10))}
                        disabled={disabled}
                        className="flex-1"
                    />
                    <div className="w-20 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-center text-sm text-gray-200">
                        {config?.offsetMs ?? 100} ms
                    </div>
                </div>
                <p className="text-xs text-gray-500">
                    Delay before each successive mirror starts its animation
                </p>
            </div>

            {/* Summary */}
            <div className="rounded-md bg-gray-800/50 p-3">
                <h4 className="text-xs font-medium text-gray-400">Summary</h4>
                <div className="mt-2 space-y-1 text-sm">
                    <p className="text-gray-300">
                        <span className="text-gray-500">Mirrors:</span> {totalMirrors}
                    </p>
                    <p className="text-gray-300">
                        <span className="text-gray-500">Path:</span>{' '}
                        {selectedPath
                            ? `${selectedPath.name} (${selectedPath.waypoints.length} pts)`
                            : 'None selected'}
                    </p>
                    <p className="text-gray-300">
                        <span className="text-gray-500">Est. Duration:</span>{' '}
                        {estimatedDuration > 0 ? `~${(estimatedDuration / 1000).toFixed(1)}s` : '-'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AnimationSequentialConfig;
