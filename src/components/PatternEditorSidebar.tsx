import React from 'react';

import {
    MAX_CANVAS_CELLS,
    MIN_CANVAS_CELLS,
    TILE_PLACEMENT_UNIT,
} from '../constants/pattern';

import type { EditorTool } from '../types/patternEditor';

interface PatternEditorSidebarProps {
    name: string;
    onNameChange: (value: string) => void;
    usedTiles: number;
    mirrorCount: number;
    pixelCountError: boolean;
    activeTool: EditorTool;
    onToolChange: (tool: EditorTool) => void;
    isSnapMode: boolean;
    onToggleSnap: () => void;
    historyState: { canUndo: boolean; canRedo: boolean };
    onUndo: () => void;
    onRedo: () => void;
    canvasSize: { rows: number; cols: number };
    onCanvasSizeChange: (axis: 'rows' | 'cols', value: string) => void;
    onShift: (direction: 'up' | 'down' | 'left' | 'right') => void;
    onClear: () => void;
}

const PatternEditorSidebar: React.FC<PatternEditorSidebarProps> = (props) => {
    const {
        name,
        onNameChange,
        usedTiles,
        mirrorCount,
        pixelCountError,
        activeTool,
        onToolChange,
        isSnapMode,
        onToggleSnap,
        historyState,
        onUndo,
        onRedo,
        canvasSize,
        onCanvasSizeChange,
        onShift,
        onClear,
    } = props;

    return (
        <aside className="w-full md:w-72 lg:w-80 bg-gray-800/50 rounded-lg p-4 ring-1 ring-white/10 flex-shrink-0 flex flex-col gap-6 overflow-y-auto">
            <div>
                <label htmlFor="patternName" className="block text-sm font-medium text-gray-300">
                    Pattern Name
                </label>
                <input
                    type="text"
                    id="patternName"
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
            </div>

            <div>
                <h3 className="text-sm font-medium text-gray-300">Tool</h3>
                <div className="mt-2 inline-flex gap-2">
                    <button
                        type="button"
                        onClick={() => onToolChange('place')}
                        aria-pressed={activeTool === 'place'}
                        className={`px-3 py-1.5 rounded-md border transition-colors ${
                            activeTool === 'place'
                                ? 'bg-cyan-600 border-cyan-400 text-white'
                                : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                        }`}
                    >
                        Place (P)
                    </button>
                    <button
                        type="button"
                        onClick={() => onToolChange('remove')}
                        aria-pressed={activeTool === 'remove'}
                        className={`px-3 py-1.5 rounded-md border transition-colors ${
                            activeTool === 'remove'
                                ? 'bg-rose-600 border-rose-400 text-white'
                                : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                        }`}
                    >
                        Remove (R)
                    </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-snug">
                    Place adds tiles (drag to draw). Remove deletes the highlighted tile, making it easy
                    to tidy overlaps quickly.
                </p>
                <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-gray-400">Snap to grid (S)</span>
                    <button
                        type="button"
                        onClick={onToggleSnap}
                        aria-pressed={isSnapMode}
                        aria-label="Toggle snap to grid (S)"
                        data-testid="snap-toggle"
                        className={`px-3 py-1 rounded-md border text-sm transition-colors ${
                            isSnapMode
                                ? 'bg-cyan-700/60 border-cyan-400 text-white'
                                : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                        }`}
                    >
                        {isSnapMode ? 'On' : 'Off'}
                    </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-snug">
                    Turn snap off to position tiles freely and explore overlap intensity.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onUndo}
                            disabled={!historyState.canUndo}
                            data-testid="undo-button"
                            className={`flex-1 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                historyState.canUndo
                                    ? 'bg-gray-700 border-gray-500 text-gray-100 hover:bg-gray-600'
                                    : 'bg-gray-800/70 border-gray-700 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            Undo (⌘Z / Ctrl+Z)
                        </button>
                        <button
                            type="button"
                            onClick={onRedo}
                            disabled={!historyState.canRedo}
                            data-testid="redo-button"
                            className={`flex-1 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                historyState.canRedo
                                    ? 'bg-gray-700 border-gray-500 text-gray-100 hover:bg-gray-600'
                                    : 'bg-gray-800/70 border-gray-700 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            Redo (⇧⌘Z / Ctrl+Shift+Z)
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 leading-snug">
                        Shortcuts: P place, R remove, S snap, ⌘/Ctrl+Z undo, ⇧⌘/Ctrl+Shift+Z redo.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-300">Canvas Size</h3>
                <div className="flex items-center gap-2">
                    <label htmlFor="canvasRows" className="font-medium text-gray-400 w-12">
                        Rows:
                    </label>
                    <input
                        type="number"
                        id="canvasRows"
                        value={canvasSize.rows}
                        onChange={(event) => onCanvasSizeChange('rows', event.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        min={MIN_CANVAS_CELLS}
                        max={MAX_CANVAS_CELLS}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="canvasCols" className="font-medium text-gray-400 w-12">
                        Cols:
                    </label>
                    <input
                        type="number"
                        id="canvasCols"
                        value={canvasSize.cols}
                        onChange={(event) => onCanvasSizeChange('cols', event.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        min={MIN_CANVAS_CELLS}
                        max={MAX_CANVAS_CELLS}
                    />
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">Quick Actions</h3>
                <div className="grid grid-cols-3 gap-2">
                    <div />
                    <button
                        onClick={() => onShift('up')}
                        className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                        aria-label="Shift all tiles up"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a.75.75 0 01-.75-.75V4.66l-2.22 2.28a.75.75 0 11-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 11-1.06 1.06L10.75 4.66v12.59A.75.75 0 0110 18z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                    <div />
                    <button
                        onClick={() => onShift('left')}
                        className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                        aria-label="Shift all tiles left"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M18 10a.75.75 0 01-.75.75H4.66l2.28 2.22a.75.75 0 11-1.06 1.06l-3.5-3.5a.75.75 0 010-1.06l3.5-3.5a.75.75 0 111.06 1.06L4.66 9.92h12.59A.75.75 0 0118 10z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                    <button
                        onClick={() => onShift('down')}
                        className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                        aria-label="Shift all tiles down"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 2a.75.75 0 01.75.75v12.59l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V2.75A.75.75 0 0110 2z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                    <button
                        onClick={() => onShift('right')}
                        className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                        aria-label="Shift all tiles right"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M2 10a.75.75 0 01.75-.75h12.59l-2.22-2.22a.75.75 0 111.06-1.06l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 11-1.06-1.06l2.22-2.22H2.75A.75.75 0 012 10z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                </div>
                <button
                    onClick={onClear}
                    className="w-full px-3 py-2 rounded-md bg-red-800/70 text-red-200 hover:bg-red-700/80 transition-colors"
                >
                    Clear Canvas
                </button>
                <p className="text-xs text-gray-500 leading-snug">
                    Each tile is {TILE_PLACEMENT_UNIT} units square. Shifting respects current snap mode.
                </p>
            </div>

            <div className="text-center bg-gray-800/50 ring-1 ring-white/10 p-3 rounded-lg shadow-md">
                <p className="text-gray-400 text-sm">Active Tiles</p>
                <p
                    data-testid="active-tile-count"
                    className={`font-mono text-2xl font-bold mt-1 transition-colors ${
                        pixelCountError ? 'text-red-500' : 'text-cyan-300'
                    }`}
                >
                    {usedTiles} / {mirrorCount}
                </p>
            </div>
        </aside>
    );
};

export default PatternEditorSidebar;
