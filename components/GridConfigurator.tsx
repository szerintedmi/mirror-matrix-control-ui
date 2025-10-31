import React from 'react';

interface GridConfiguratorProps {
    rows: number;
    cols: number;
    onSizeChange: (rows: number, cols: number) => void;
    isTestMode: boolean;
    onTestModeChange: (enabled: boolean) => void;
}

const GridConfigurator: React.FC<GridConfiguratorProps> = ({ rows, cols, onSizeChange, isTestMode, onTestModeChange }) => {
    
    const handleRowsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newRows = Math.max(1, parseInt(e.target.value, 10) || 1);
        onSizeChange(newRows, cols);
    };

    const handleColsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCols = Math.max(1, parseInt(e.target.value, 10) || 1);
        onSizeChange(rows, newCols);
    };

    return (
        <div className="flex items-center flex-wrap gap-x-6 gap-y-4 p-2 rounded-md bg-black/20 mb-4">
            <div className="flex items-center gap-2">
                <label htmlFor="rows" className="font-medium text-gray-400">Rows:</label>
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
                <label htmlFor="cols" className="font-medium text-gray-400">Cols:</label>
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
            <div className="flex items-center gap-3 ml-auto">
                <label htmlFor="testModeToggle" className="font-medium text-gray-400">Click to move</label>
                 <button
                    id="testModeToggle"
                    onClick={() => onTestModeChange(!isTestMode)}
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500 ${isTestMode ? 'bg-cyan-500' : 'bg-gray-600'}`}
                    aria-checked={isTestMode}
                    role="switch"
                >
                    <span className="sr-only">Enable click to move mode</span>
                    <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isTestMode ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                </button>
            </div>
        </div>
    );
};

export default GridConfigurator;
