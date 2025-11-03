import React from 'react';

interface GridConfiguratorProps {
    rows: number;
    cols: number;
    onSizeChange: (rows: number, cols: number) => void;
    assignedAxes: number;
    assignedTiles: number;
    totalMotors: number;
    unassignedAxes: number;
    recommendedTileCapacity: number;
}

const GridConfigurator: React.FC<GridConfiguratorProps> = ({
    rows,
    cols,
    onSizeChange,
    assignedAxes,
    assignedTiles,
    totalMotors,
    unassignedAxes,
    recommendedTileCapacity,
}) => {
    const handleRowsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newRows = Math.max(1, parseInt(e.target.value, 10) || 1);
        onSizeChange(newRows, cols);
    };

    const handleColsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCols = Math.max(1, parseInt(e.target.value, 10) || 1);
        onSizeChange(rows, newCols);
    };

    const tileCount = rows * cols;
    const overRecommended = recommendedTileCapacity > 0 && tileCount > recommendedTileCapacity;

    return (
        <div className="flex flex-col gap-3 p-3 rounded-md bg-black/20 mb-4">
            <div className="flex items-center flex-wrap gap-x-6 gap-y-4">
                <div className="flex items-center gap-2">
                    <label htmlFor="rows" className="font-medium text-gray-400">
                        Rows:
                    </label>
                    <input
                        type="number"
                        id="rows"
                        value={rows}
                        onChange={handleRowsChange}
                        className="w-20 bg-gray-700 border border-gray-600 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        min="1"
                        max="32"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="cols" className="font-medium text-gray-400">
                        Cols:
                    </label>
                    <input
                        type="number"
                        id="cols"
                        value={cols}
                        onChange={handleColsChange}
                        className="w-20 bg-gray-700 border border-gray-600 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        min="1"
                        max="32"
                    />
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <span className="rounded bg-gray-800/80 px-2 py-1 font-semibold text-gray-200">
                    Grid tiles: {tileCount}
                </span>
                <span className="rounded bg-gray-800/80 px-2 py-1">
                    Assigned tiles: {assignedTiles}
                </span>
                <span className="rounded bg-gray-800/80 px-2 py-1">
                    Assigned axes: {assignedAxes}
                </span>
                <span className="rounded bg-gray-800/80 px-2 py-1">
                    Unassigned axes: {unassignedAxes}
                </span>
                {totalMotors > 0 && (
                    <span className="rounded bg-gray-800/80 px-2 py-1">
                        Discovered motors: {totalMotors}
                    </span>
                )}
            </div>
            {overRecommended ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
                    Layout exceeds the recommended capacity of {recommendedTileCapacity} tile
                    {recommendedTileCapacity === 1 ? '' : 's'} based on {totalMotors} discovered
                    motor{totalMotors === 1 ? '' : 's'}. You can continue, but expect orphan axes.
                </div>
            ) : recommendedTileCapacity > 0 ? (
                <div className="rounded-md border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-300">
                    Recommended capacity: up to {recommendedTileCapacity} tile
                    {recommendedTileCapacity === 1 ? '' : 's'} ({totalMotors} motors discovered).
                </div>
            ) : null}
        </div>
    );
};

export default GridConfigurator;
