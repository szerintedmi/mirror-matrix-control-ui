import React from 'react';

import { MAX_CANVAS_CELLS, MIN_CANVAS_CELLS } from '../constants/pattern';

import type { EditorTool } from '../types/patternEditor';

interface LegacyPatternEditorSidebarProps {
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

const LegacyPatternEditorSidebar: React.FC<LegacyPatternEditorSidebarProps> = (props) => {
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
        <aside className="flex w-full flex-shrink-0 flex-col gap-6 rounded-lg bg-gray-800/50 p-4 ring-1 ring-white/10 md:w-72 lg:w-80">
            <div>
                <label htmlFor="patternName" className="block text-sm font-medium text-gray-300">
                    Pattern Name
                </label>
                <input
                    type="text"
                    id="patternName"
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
            </div>

            <div className="rounded-lg bg-gray-800/50 p-3 text-center shadow-md ring-1 ring-white/10">
                <p className="text-sm text-gray-400">Active Tiles</p>
                <p
                    data-testid="active-tile-count"
                    className={`mt-1 font-mono text-2xl font-bold transition-colors ${
                        pixelCountError ? 'text-red-500' : 'text-cyan-300'
                    }`}
                >
                    {usedTiles} / {mirrorCount}
                </p>
            </div>

            <div>
                <div className="mt-2 inline-flex gap-2">
                    <button
                        type="button"
                        onClick={() => onToolChange('place')}
                        aria-pressed={activeTool === 'place'}
                        className={`rounded-md border px-3 py-1.5 transition-colors ${
                            activeTool === 'place'
                                ? 'border-cyan-400 bg-cyan-600 text-white'
                                : 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600'
                        }`}
                    >
                        Place (P)
                    </button>
                    <button
                        type="button"
                        onClick={() => onToolChange('remove')}
                        aria-pressed={activeTool === 'remove'}
                        className={`rounded-md border px-3 py-1.5 transition-colors ${
                            activeTool === 'remove'
                                ? 'border-rose-400 bg-rose-600 text-white'
                                : 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600'
                        }`}
                    >
                        Remove (R)
                    </button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-gray-400">Snap to grid (S)</span>
                    <button
                        type="button"
                        onClick={onToggleSnap}
                        aria-pressed={isSnapMode}
                        aria-label="Toggle snap to grid (S)"
                        data-testid="snap-toggle"
                        className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                            isSnapMode
                                ? 'border-cyan-400 bg-cyan-700/60 text-white'
                                : 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600'
                        }`}
                    >
                        {isSnapMode ? 'On' : 'Off'}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-300">Canvas Size</h3>
                <div className="flex items-center gap-2">
                    <label htmlFor="canvasRows" className="w-12 font-medium text-gray-400">
                        Rows:
                    </label>
                    <input
                        type="number"
                        id="canvasRows"
                        value={canvasSize.rows}
                        onChange={(event) => onCanvasSizeChange('rows', event.target.value)}
                        className="w-full rounded-md border border-gray-600 bg-gray-700 p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        min={MIN_CANVAS_CELLS}
                        max={MAX_CANVAS_CELLS}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="canvasCols" className="w-12 font-medium text-gray-400">
                        Cols:
                    </label>
                    <input
                        type="number"
                        id="canvasCols"
                        value={canvasSize.cols}
                        onChange={(event) => onCanvasSizeChange('cols', event.target.value)}
                        className="w-full rounded-md border border-gray-600 bg-gray-700 p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        min={MIN_CANVAS_CELLS}
                        max={MAX_CANVAS_CELLS}
                    />
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">Shift Tiles</h3>
                <div className="grid grid-cols-3 gap-2">
                    <div />
                    <button
                        onClick={() => onShift('up')}
                        className="rounded-md bg-gray-700 p-2 text-gray-200 transition-colors hover:bg-gray-600"
                        aria-label="Shift all tiles up"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-5"
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
                        className="rounded-md bg-gray-700 p-2 text-gray-200 transition-colors hover:bg-gray-600"
                        aria-label="Shift all tiles left"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-5"
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
                        className="rounded-md bg-gray-700 p-2 text-gray-200 transition-colors hover:bg-gray-600"
                        aria-label="Shift all tiles down"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-5"
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
                        className="rounded-md bg-gray-700 p-2 text-gray-200 transition-colors hover:bg-gray-600"
                        aria-label="Shift all tiles right"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-5"
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
                    className="w-full rounded-md bg-red-800/70 px-3 py-2 text-red-200 transition-colors hover:bg-red-700/80"
                >
                    Clear Canvas
                </button>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!historyState.canUndo}
                        data-testid="undo-button"
                        className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            historyState.canUndo
                                ? 'border-gray-500 bg-gray-700 text-gray-100 hover:bg-gray-600'
                                : 'cursor-not-allowed border-gray-700 bg-gray-800/70 text-gray-500'
                        }`}
                    >
                        Undo (⌘Z / Ctrl+Z)
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!historyState.canRedo}
                        data-testid="redo-button"
                        className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            historyState.canRedo
                                ? 'border-gray-500 bg-gray-700 text-gray-100 hover:bg-gray-600'
                                : 'cursor-not-allowed border-gray-700 bg-gray-800/70 text-gray-500'
                        }`}
                    >
                        Redo (⇧⌘Z / Ctrl+Shift+Z)
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default LegacyPatternEditorSidebar;
