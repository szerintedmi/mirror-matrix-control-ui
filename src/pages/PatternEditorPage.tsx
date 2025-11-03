import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MAX_CANVAS_CELLS, MIN_CANVAS_CELLS, TILE_PLACEMENT_UNIT } from '../constants/pattern';
import {
    calculateDisplayIntensity,
    intensityToFill,
    intensityToStroke,
} from '../utils/patternIntensity';

import type { NavigationControls } from '../App';
import type { Pattern } from '../types';

interface PatternEditorPageProps {
    navigation: NavigationControls;
    onSave: (pattern: Pattern) => void;
    existingPattern: Pattern | null;
    mirrorCount: number;
    defaultCanvasSize: { rows: number; cols: number };
}

type Tool = 'paint' | 'erase';

interface TileDraft {
    id: string;
    row: number;
    col: number;
    createdAt: number;
}

interface HoverState {
    row: number;
    col: number;
}

const selectLatestTile = (drafts: TileDraft[], row: number, col: number): TileDraft | null => {
    let candidate: TileDraft | null = null;
    for (const tile of drafts) {
        if (tile.row !== row || tile.col !== col) {
            continue;
        }
        if (!candidate || tile.createdAt >= candidate.createdAt) {
            candidate = tile;
        }
    }
    return candidate;
};

const makeCellKey = (row: number, col: number): string => `${row}-${col}`;

const clampCanvasCells = (value: number): number =>
    Math.min(MAX_CANVAS_CELLS, Math.max(MIN_CANVAS_CELLS, value));

const generatePatternId = (): string => {
    if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
        return globalThis.crypto.randomUUID();
    }
    return `pattern-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const generateTileId = (): string => {
    if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
        return globalThis.crypto.randomUUID();
    }
    return `tile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const useElementSize = <T extends HTMLElement>(): [
    React.MutableRefObject<T | null>,
    { width: number; height: number },
] => {
    const ref = useRef<T | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const resizeObserver = new ResizeObserver((entries) => {
            if (!entries || entries.length === 0) return;
            const { width, height } = entries[0].contentRect;
            setSize({ width, height });
        });

        resizeObserver.observe(element);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    return [ref, size];
};

const PatternEditorPage: React.FC<PatternEditorPageProps> = ({
    navigation,
    onSave,
    existingPattern,
    mirrorCount,
    defaultCanvasSize,
}) => {
    const [name, setName] = useState('');
    const [canvasSize, setCanvasSize] = useState(defaultCanvasSize);
    const [tiles, setTiles] = useState<TileDraft[]>([]);
    const [pixelCountError, setPixelCountError] = useState(false);
    const [activeTool, setActiveTool] = useState<Tool>('paint');
    const [isPointerDown, setIsPointerDown] = useState(false);
    const [hoverState, setHoverState] = useState<HoverState | null>(null);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [baseline, setBaseline] = useState({ name: 'New Pattern', tileSignature: '' });

    const [containerRef, containerSize] = useElementSize<HTMLDivElement>();
    const drawingSurfaceRef = useRef<SVGSVGElement | null>(null);
    const dragVisitedCellsRef = useRef<Set<string>>(new Set());
    const pixelErrorTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            dragVisitedCellsRef.current.clear();
            const fallbackRows = clampCanvasCells(defaultCanvasSize.rows);
            const fallbackCols = clampCanvasCells(defaultCanvasSize.cols);

            if (existingPattern) {
                const inferredRows = clampCanvasCells(
                    Math.max(1, Math.round(existingPattern.canvas.height / TILE_PLACEMENT_UNIT)),
                );
                const inferredCols = clampCanvasCells(
                    Math.max(1, Math.round(existingPattern.canvas.width / TILE_PLACEMENT_UNIT)),
                );

                const hydratedTiles: TileDraft[] = [];
                existingPattern.tiles.forEach((tile, index) => {
                    const row = Math.round(tile.center.y / TILE_PLACEMENT_UNIT - 0.5);
                    const col = Math.round(tile.center.x / TILE_PLACEMENT_UNIT - 0.5);
                    if (!Number.isFinite(row) || !Number.isFinite(col)) {
                        return;
                    }
                    if (row < 0 || col < 0 || row >= inferredRows || col >= inferredCols) {
                        return;
                    }
                    hydratedTiles.push({
                        id: tile.id,
                        row,
                        col,
                        createdAt: Date.now() + index,
                    });
                });

                setName(existingPattern.name);
                setCanvasSize({ rows: inferredRows, cols: inferredCols });
                setTiles(hydratedTiles);
                setBaseline({
                    name: existingPattern.name.trim(),
                    tileSignature: hydratedTiles
                        .map((tile) => makeCellKey(tile.row, tile.col))
                        .sort()
                        .join('|'),
                });
            } else {
                setName('New Pattern');
                setCanvasSize({ rows: fallbackRows, cols: fallbackCols });
                setTiles([]);
                setBaseline({ name: 'New Pattern', tileSignature: '' });
            }
            setHasHydrated(true);
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [existingPattern, defaultCanvasSize]);

    useEffect(() => {
        return () => {
            if (pixelErrorTimeoutRef.current !== null) {
                window.clearTimeout(pixelErrorTimeoutRef.current);
            }
        };
    }, []);

    const triggerPointLimit = useCallback(() => {
        if (pixelErrorTimeoutRef.current !== null) {
            window.clearTimeout(pixelErrorTimeoutRef.current);
        }
        setPixelCountError(true);
        pixelErrorTimeoutRef.current = window.setTimeout(() => setPixelCountError(false), 600);
    }, []);

    const isCellWithin = useCallback(
        (row: number, col: number) =>
            row >= 0 && col >= 0 && row < canvasSize.rows && col < canvasSize.cols,
        [canvasSize.rows, canvasSize.cols],
    );

    const canvasWidth = canvasSize.cols * TILE_PLACEMENT_UNIT;
    const canvasHeight = canvasSize.rows * TILE_PLACEMENT_UNIT;

    const { cellEntries, maxOverlap } = useMemo(() => {
        const aggregates = new Map<string, { row: number; col: number; tiles: TileDraft[] }>();
        for (const tile of tiles) {
            const key = makeCellKey(tile.row, tile.col);
            const entry = aggregates.get(key);
            if (entry) {
                entry.tiles.push(tile);
            } else {
                aggregates.set(key, { row: tile.row, col: tile.col, tiles: [tile] });
            }
        }
        const entries = Array.from(aggregates.values());
        const maxCount = entries.reduce((acc, entry) => Math.max(acc, entry.tiles.length), 0);
        return {
            cellEntries: entries,
            maxOverlap: maxCount > 0 ? maxCount : 1,
        };
    }, [tiles]);

    const getCellFromPointer = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            const surface = drawingSurfaceRef.current;
            if (!surface) {
                return null;
            }
            const rect = surface.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return null;
            }
            const relativeX = ((event.clientX - rect.left) / rect.width) * canvasSize.cols;
            const relativeY = ((event.clientY - rect.top) / rect.height) * canvasSize.rows;
            const col = Math.floor(relativeX);
            const row = Math.floor(relativeY);
            if (!isCellWithin(row, col)) {
                return null;
            }
            return { row, col };
        },
        [canvasSize.cols, canvasSize.rows, isCellWithin],
    );

    const applyToolToCell = useCallback(
        (row: number, col: number) => {
            if (!isCellWithin(row, col)) {
                return;
            }
            const visited = dragVisitedCellsRef.current;
            const key = makeCellKey(row, col);

            if (activeTool === 'paint') {
                if (visited.has(key)) {
                    return;
                }
                setTiles((prev) => {
                    if (prev.length >= mirrorCount) {
                        triggerPointLimit();
                        return prev;
                    }
                    visited.add(key);
                    return [
                        ...prev,
                        {
                            id: generateTileId(),
                            row,
                            col,
                            createdAt: Date.now(),
                        },
                    ];
                });
            } else {
                setTiles((prev) => {
                    const candidate = selectLatestTile(prev, row, col);
                    if (!candidate) {
                        return prev;
                    }
                    visited.add(key);
                    return prev.filter((tile) => tile.id !== candidate.id);
                });
            }
        },
        [activeTool, isCellWithin, mirrorCount, triggerPointLimit],
    );

    const updateHover = useCallback(
        (row: number, col: number) => {
            if (!isCellWithin(row, col)) {
                setHoverState(null);
                return;
            }
            setHoverState({ row, col });
        },
        [isCellWithin],
    );

    const clearHover = useCallback(() => {
        setHoverState(null);
    }, []);

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            if (event.button !== 0 && event.pointerType !== 'touch') {
                return;
            }
            const cell = getCellFromPointer(event);
            if (!cell) {
                return;
            }
            event.preventDefault();
            dragVisitedCellsRef.current.clear();
            setIsPointerDown(true);
            updateHover(cell.row, cell.col);
            event.currentTarget.setPointerCapture(event.pointerId);
            applyToolToCell(cell.row, cell.col);
        },
        [applyToolToCell, getCellFromPointer, updateHover],
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            const cell = getCellFromPointer(event);
            if (!cell) {
                clearHover();
                return;
            }
            updateHover(cell.row, cell.col);
            if (isPointerDown) {
                applyToolToCell(cell.row, cell.col);
            }
        },
        [applyToolToCell, clearHover, getCellFromPointer, isPointerDown, updateHover],
    );

    const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        if (!isPointerDown) {
            return;
        }
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // Pointer capture may not be set; ignore
        }
        setIsPointerDown(false);
        dragVisitedCellsRef.current.clear();
    }, [isPointerDown]);

    const handlePointerLeave = useCallback(() => {
        setIsPointerDown(false);
        dragVisitedCellsRef.current.clear();
        clearHover();
    }, [clearHover]);

    const handlePointerCancel = useCallback(() => {
        setIsPointerDown(false);
        dragVisitedCellsRef.current.clear();
        clearHover();
    }, [clearHover]);

    const handleSave = () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            alert('Pattern name cannot be empty.');
            return;
        }

        const nowIso = new Date().toISOString();

        const patternTiles = tiles
            .map((tile) => ({
                id: tile.id,
                center: {
                    x: (tile.col + 0.5) * TILE_PLACEMENT_UNIT,
                    y: (tile.row + 0.5) * TILE_PLACEMENT_UNIT,
                },
                size: { width: TILE_PLACEMENT_UNIT, height: TILE_PLACEMENT_UNIT },
            }))
            .sort((a, b) => {
                if (a.center.y !== b.center.y) {
                    return a.center.y - b.center.y;
                }
                if (a.center.x !== b.center.x) {
                    return a.center.x - b.center.x;
                }
                return a.id.localeCompare(b.id);
            });

        setBaseline({
            name: trimmedName,
            tileSignature: tiles
                .map((tile) => makeCellKey(tile.row, tile.col))
                .sort()
                .join('|'),
        });

        const pattern: Pattern = {
            id: existingPattern?.id ?? generatePatternId(),
            name: trimmedName,
            canvas: { width: canvasWidth, height: canvasHeight },
            tiles: patternTiles,
            createdAt: existingPattern?.createdAt ?? nowIso,
            updatedAt: nowIso,
        };

        onSave(pattern);
    };

    const handleCanvasSizeChange = (axis: 'rows' | 'cols', value: string) => {
        const numericValue = Number.parseInt(value, 10);
        const clamped = clampCanvasCells(Number.isNaN(numericValue) ? MIN_CANVAS_CELLS : numericValue);
        const nextSize = { ...canvasSize, [axis]: clamped } as { rows: number; cols: number };
        setCanvasSize(nextSize);

        setTiles((prev) =>
            prev.filter((tile) => tile.row < nextSize.rows && tile.col < nextSize.cols),
        );
        setHoverState((prev) => {
            if (!prev) {
                return prev;
            }
            if (prev.row >= nextSize.rows || prev.col >= nextSize.cols) {
                return null;
            }
            return prev;
        });
    };

    const handleShift = (direction: 'up' | 'down' | 'left' | 'right') => {
        setTiles((prev) => {
            const next: TileDraft[] = [];
            for (const tile of prev) {
                let newRow = tile.row;
                let newCol = tile.col;
                if (direction === 'up') newRow -= 1;
                if (direction === 'down') newRow += 1;
                if (direction === 'left') newCol -= 1;
                if (direction === 'right') newCol += 1;

                if (isCellWithin(newRow, newCol)) {
                    next.push({ ...tile, row: newRow, col: newCol });
                }
            }
            return next;
        });
    };

    const handleClear = () => {
        if (
            window.confirm(
                'Are you sure you want to clear all tiles? This action cannot be undone.',
            )
        ) {
            setTiles([]);
            clearHover();
        }
    };

    const usedTiles = tiles.length;

    const surfaceStyle: React.CSSProperties = {
        visibility: containerSize.width > 0 ? 'visible' : 'hidden',
    };

    if (containerSize.width > 0 && containerSize.height > 0) {
        const canvasRatio = canvasSize.cols / canvasSize.rows;
        const containerRatio = containerSize.width / containerSize.height;

        let width: number;
        let height: number;

        if (containerRatio > canvasRatio) {
            height = containerSize.height;
            width = height * canvasRatio;
        } else {
            width = containerSize.width;
            height = width / canvasRatio;
        }
        surfaceStyle.width = `${width}px`;
        surfaceStyle.height = `${height}px`;
    }

    const hoveredTileId =
        activeTool === 'erase' && hoverState
            ? selectLatestTile(tiles, hoverState.row, hoverState.col)?.id ?? null
            : null;

    const trimmedName = useMemo(() => name.trim(), [name]);
    const tileSignature = useMemo(
        () => tiles.map((tile) => makeCellKey(tile.row, tile.col)).sort().join('|'),
        [tiles],
    );

    const isDirty = hasHydrated
        ? trimmedName !== baseline.name || tileSignature !== baseline.tileSignature
        : false;

    useEffect(() => {
        if (!isDirty) {
            return;
        }
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const confirmNavigateAway = useCallback(() => {
        if (!isDirty) {
            return true;
        }
        return window.confirm('You have unsaved changes. Leave the pattern editor?');
    }, [isDirty]);

    const handleNavigateBack = useCallback(() => {
        if (confirmNavigateAway()) {
            navigation.navigateTo('library');
        }
    }, [confirmNavigateAway, navigation]);

    return (
        <div className="flex flex-col h-screen p-4 sm:p-6 lg:p-8">
            <header className="mb-2 flex-shrink-0">
                <div className="flex flex-wrap justify-between items-center gap-4">
                    <button
                        onClick={handleNavigateBack}
                        className="px-4 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors border border-gray-600"
                    >
                        &larr; Back to Library
                    </button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 order-first sm:order-none w-full sm:w-auto text-center sm:text-left">
                        {existingPattern ? 'Edit Pattern' : 'Create New Pattern'}
                    </h1>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 rounded-md bg-cyan-600 text-white font-semibold hover:bg-cyan-500 transition-colors"
                    >
                        Save Pattern
                    </button>
                </div>
            </header>

            <div className="flex justify-center my-4">
                <div className="text-center bg-gray-800/50 ring-1 ring-white/10 p-3 rounded-lg w-full max-w-xs shadow-md">
                    <p className="text-gray-400 text-sm">Active Tiles</p>
                    <p
                        className={`font-mono text-2xl font-bold mt-1 transition-colors ${pixelCountError ? 'text-red-500' : 'text-cyan-300'}`}
                    >
                        {usedTiles} / {mirrorCount}
                    </p>
                </div>
            </div>

            <div className="flex-grow flex flex-col md:flex-row gap-6 min-h-0">
                <aside className="w-full md:w-72 lg:w-80 bg-gray-800/50 rounded-lg p-4 ring-1 ring-white/10 flex-shrink-0 flex flex-col gap-6 overflow-y-auto">
                    <div>
                        <label htmlFor="patternName" className="block text-sm font-medium text-gray-300">
                            Pattern Name
                        </label>
                        <input
                            type="text"
                            id="patternName"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-gray-300">Tool</h3>
                        <div className="mt-2 inline-flex gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTool('paint')}
                                className={`px-3 py-1.5 rounded-md border transition-colors ${activeTool === 'paint' ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'}`}
                            >
                                Paint
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTool('erase')}
                                className={`px-3 py-1.5 rounded-md border transition-colors ${activeTool === 'erase' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'}`}
                            >
                                Erase
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 leading-snug">
                            Paint adds tiles (drag to draw). Erase removes the highlighted tile under the cursor.
                        </p>
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
                                onChange={(e) => handleCanvasSizeChange('rows', e.target.value)}
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
                                onChange={(e) => handleCanvasSizeChange('cols', e.target.value)}
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
                                onClick={() => handleShift('up')}
                                className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                                aria-label="Shift all tiles up"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M10 18a.75.75 0 01-.75-.75V4.66l-2.22 2.28a.75.75 0 11-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 11-1.06 1.06L10.75 4.66v12.59A.75.75 0 0110 18z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <div />

                            <button
                                onClick={() => handleShift('left')}
                                className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                                aria-label="Shift all tiles left"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M18 10a.75.75 0 01-.75.75H4.66l2.28 2.22a.75.75 0 11-1.06 1.06l-3.5-3.5a.75.75 0 010-1.06l3.5-3.5a.75.75 0 111.06 1.06L4.66 9.92h12.59A.75.75 0 0118 10z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={() => handleShift('down')}
                                className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                                aria-label="Shift all tiles down"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M10 2a.75.75 0 01.75.75v12.59l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V2.75A.75.75 0 0110 2z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={() => handleShift('right')}
                                className="p-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                                aria-label="Shift all tiles right"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M2 10a.75.75 0 01.75-.75h12.59l-2.22-2.22a.75.75 0 111.06-1.06l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 11-1.06-1.06l2.22-2.22H2.75A.75.75 0 012 10z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                        </div>
                        <button
                            onClick={handleClear}
                            className="w-full px-3 py-2 rounded-md bg-red-800/70 text-red-200 hover:bg-red-700/80 transition-colors"
                        >
                            Clear Canvas
                        </button>
                    </div>
                </aside>

                <main className="flex-grow bg-gray-800/50 rounded-lg ring-1 ring-white/10 p-4 flex items-center justify-center min-h-[320px]">
                    <div
                        ref={containerRef}
                        className="w-full h-full flex items-center justify-center"
                    >
                        <div style={surfaceStyle} className="relative max-h-full w-full">
                            <svg
                                ref={drawingSurfaceRef}
                                width="100%"
                                height="100%"
                                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                                className="w-full h-full touch-none cursor-crosshair"
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerLeave}
                                onPointerCancel={handlePointerCancel}
                                onContextMenu={(event) => event.preventDefault()}
                            >
                                <rect
                                    x={0}
                                    y={0}
                                    width={canvasWidth}
                                    height={canvasHeight}
                                    fill="rgba(17, 24, 39, 0.85)"
                                />
                                {Array.from({ length: canvasSize.cols + 1 }).map((_, index) => {
                                    const position = index * TILE_PLACEMENT_UNIT;
                                    return (
                                        <line
                                            key={`v-${index}`}
                                            x1={position}
                                            y1={0}
                                            x2={position}
                                            y2={canvasHeight}
                                            stroke="rgba(148, 163, 184, 0.12)"
                                            strokeWidth={0.4}
                                            pointerEvents="none"
                                        />
                                    );
                                })}
                                {Array.from({ length: canvasSize.rows + 1 }).map((_, index) => {
                                    const position = index * TILE_PLACEMENT_UNIT;
                                    return (
                                        <line
                                            key={`h-${index}`}
                                            x1={0}
                                            y1={position}
                                            x2={canvasWidth}
                                            y2={position}
                                            stroke="rgba(148, 163, 184, 0.12)"
                                            strokeWidth={0.4}
                                            pointerEvents="none"
                                        />
                                    );
                                })}
                                {cellEntries.map((entry) => {
                                    const cellKey = makeCellKey(entry.row, entry.col);
                                    const count = entry.tiles.length;
                                    const intensity = calculateDisplayIntensity(count, maxOverlap);
                                    const fill = intensityToFill(intensity);
                                    const stroke = intensityToStroke(intensity);
                                    const highlight =
                                        activeTool === 'erase' &&
                                        hoveredTileId !== null &&
                                        entry.tiles.some((tile) => tile.id === hoveredTileId);
                                    const strokeColor = highlight
                                        ? 'rgba(248, 113, 113, 0.95)'
                                        : stroke;
                                    const strokeWidth = highlight
                                        ? Math.max(TILE_PLACEMENT_UNIT * 0.18, 0.9)
                                        : Math.max(TILE_PLACEMENT_UNIT * 0.12, 0.7);
                                    const x = entry.col * TILE_PLACEMENT_UNIT;
                                    const y = entry.row * TILE_PLACEMENT_UNIT;
                                    return (
                                        <g key={cellKey} pointerEvents="none">
                                            <rect
                                                x={x}
                                                y={y}
                                                width={TILE_PLACEMENT_UNIT}
                                                height={TILE_PLACEMENT_UNIT}
                                                fill={fill}
                                                stroke={strokeColor}
                                                strokeWidth={strokeWidth}
                                                rx={TILE_PLACEMENT_UNIT * 0.1}
                                                ry={TILE_PLACEMENT_UNIT * 0.1}
                                            />
                                            <text
                                                x={x + TILE_PLACEMENT_UNIT / 2}
                                                y={y + TILE_PLACEMENT_UNIT / 2 + TILE_PLACEMENT_UNIT * 0.1}
                                                textAnchor="middle"
                                                fontSize={Math.max(TILE_PLACEMENT_UNIT * 0.32, 4)}
                                                fill="rgba(15, 23, 42, 0.5)"
                                                pointerEvents="none"
                                                fontWeight={500}
                                            >
                                                {count}
                                            </text>
                                        </g>
                                    );
                                })}
                                {activeTool === 'paint' && hoverState && (
                                    <rect
                                        x={hoverState.col * TILE_PLACEMENT_UNIT}
                                        y={hoverState.row * TILE_PLACEMENT_UNIT}
                                        width={TILE_PLACEMENT_UNIT}
                                        height={TILE_PLACEMENT_UNIT}
                                        fill="none"
                                        stroke="rgba(34, 211, 238, 0.85)"
                                        strokeWidth={Math.max(TILE_PLACEMENT_UNIT * 0.18, 0.8)}
                                        strokeDasharray={`${TILE_PLACEMENT_UNIT * 0.4} ${TILE_PLACEMENT_UNIT * 0.2}`}
                                        pointerEvents="none"
                                    />
                                )}
                                {tiles.length === 0 && (
                                    <text
                                        x={canvasWidth / 2}
                                        y={canvasHeight / 2}
                                        textAnchor="middle"
                                        fill="rgba(148, 163, 184, 0.55)"
                                        fontSize={Math.max(TILE_PLACEMENT_UNIT * 1.4, 12)}
                                        pointerEvents="none"
                                        fontWeight={500}
                                    >
                                        Click or drag to paint
                                    </text>
                                )}
                            </svg>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default PatternEditorPage;
