import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PatternCanvas from '../components/PatternCanvas';
import PatternEditorSidebar from '../components/PatternEditorSidebar';
import { MAX_CANVAS_CELLS, MIN_CANVAS_CELLS, TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { usePatternEditorInteractions } from '../hooks/usePatternEditorInteractions';
import { calculateDisplayIntensity } from '../utils/patternIntensity';
import { computeDirectOverlaps } from '../utils/tileOverlap';

import type { NavigationControls } from '../App';
import type { Pattern } from '../types';
import type { EditorTool, TileDraft } from '../types/patternEditor';

const clampCanvasCells = (value: number): number =>
    Math.min(MAX_CANVAS_CELLS, Math.max(MIN_CANVAS_CELLS, value));

const generatePatternId = (): string => {
    if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
        return globalThis.crypto.randomUUID();
    }
    return `pattern-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isOverlapDebugEnabled = (): boolean =>
    typeof window !== 'undefined' && window.localStorage?.getItem('debugCircleOpacity') === 'true';

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

interface PatternEditorPageProps {
    navigation: NavigationControls;
    onSave: (pattern: Pattern) => void;
    existingPattern: Pattern | null;
    mirrorCount: number;
    defaultCanvasSize: { rows: number; cols: number };
}

const PatternEditorPage: React.FC<PatternEditorPageProps> = ({
    navigation,
    onSave,
    existingPattern,
    mirrorCount,
    defaultCanvasSize,
}) => {
    const [name, setName] = useState('');
    const [canvasSize, setCanvasSize] = useState(defaultCanvasSize);
    const [pixelCountError, setPixelCountError] = useState(false);
    const [activeTool, setActiveTool] = useState<EditorTool>('place');
    const [isSnapMode, setIsSnapMode] = useState(true);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [baseline, setBaseline] = useState({ name: 'New Pattern', tileSignature: '' });
    const [overlapDebugEnabled, setOverlapDebugEnabled] = useState<boolean>(() =>
        isOverlapDebugEnabled(),
    );

    const [containerRef, containerSize] = useElementSize<HTMLDivElement>();
    const drawingSurfaceRef = useRef<SVGSVGElement | null>(null);

    const pixelErrorTimeoutRef = useRef<number | null>(null);
    const triggerPointLimit = useCallback(() => {
        if (pixelErrorTimeoutRef.current !== null) {
            window.clearTimeout(pixelErrorTimeoutRef.current);
        }
        setPixelCountError(true);
        pixelErrorTimeoutRef.current = window.setTimeout(() => setPixelCountError(false), 600);
    }, []);

    useEffect(() => {
        return () => {
            if (pixelErrorTimeoutRef.current !== null) {
                window.clearTimeout(pixelErrorTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const sync = () => {
            setOverlapDebugEnabled((prev) => {
                const next = isOverlapDebugEnabled();
                return prev === next ? prev : next;
            });
        };
        sync();
        const interval = window.setInterval(sync, 1000);
        return () => window.clearInterval(interval);
    }, []);

    const canvasWidth = canvasSize.cols * TILE_PLACEMENT_UNIT;
    const canvasHeight = canvasSize.rows * TILE_PLACEMENT_UNIT;

    const {
        tiles,
        hoverState,
        removeHighlight,
        historyState,
        applyTileUpdate,
        replaceTiles,
        clearHover,
        undoTiles,
        redoTiles,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerLeave,
        handlePointerCancel,
    } = usePatternEditorInteractions({
        mirrorCount,
        canvasSize,
        canvasWidth,
        canvasHeight,
        activeTool,
        isSnapMode,
        triggerPointLimit,
        drawingSurfaceRef,
        onToolChange: setActiveTool,
        onSnapToggle: () => setIsSnapMode((prev) => !prev),
    });

    const usedTiles = tiles.length;

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
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
                    const centerX = tile.center.x;
                    const centerY = tile.center.y;
                    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
                        return;
                    }
                    const withinX =
                        centerX >= TILE_PLACEMENT_UNIT / 2 &&
                        centerX <= inferredCols * TILE_PLACEMENT_UNIT - TILE_PLACEMENT_UNIT / 2;
                    const withinY =
                        centerY >= TILE_PLACEMENT_UNIT / 2 &&
                        centerY <= inferredRows * TILE_PLACEMENT_UNIT - TILE_PLACEMENT_UNIT / 2;
                    if (!withinX || !withinY) {
                        return;
                    }
                    hydratedTiles.push({
                        id: tile.id,
                        centerX,
                        centerY,
                        createdAt: Date.now() + index,
                        width: TILE_PLACEMENT_UNIT,
                        height: TILE_PLACEMENT_UNIT,
                    });
                });

                setName(existingPattern.name);
                setCanvasSize({ rows: inferredRows, cols: inferredCols });
                replaceTiles(hydratedTiles);
                setBaseline({
                    name: existingPattern.name.trim(),
                    tileSignature: hydratedTiles
                        .map((tile) => `${tile.centerX.toFixed(3)}-${tile.centerY.toFixed(3)}`)
                        .sort()
                        .join('|'),
                });
            } else {
                setName('New Pattern');
                setCanvasSize({ rows: fallbackRows, cols: fallbackCols });
                replaceTiles([]);
                setBaseline({ name: 'New Pattern', tileSignature: '' });
            }
            setHasHydrated(true);
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [defaultCanvasSize, existingPattern, replaceTiles]);

    const tileFootprints = useMemo(
        () =>
            tiles.map((tile) => ({
                id: tile.id,
                centerX: tile.centerX,
                centerY: tile.centerY,
                width: tile.width,
                height: tile.height,
            })),
        [tiles],
    );

    const overlappingTiles = useMemo(() => computeDirectOverlaps(tileFootprints), [tileFootprints]);

    const overlapCounts = useMemo(
        () => new Map(overlappingTiles.map((entry) => [entry.id, entry.count])),
        [overlappingTiles],
    );
    const maxOverlapCount = useMemo(
        () => overlappingTiles.reduce((max, record) => Math.max(max, record.count), 1),
        [overlappingTiles],
    );
    const overlapDebugRows = useMemo(() => {
        if (!overlapDebugEnabled) {
            return [] as { id: string; count: number; opacity: number }[];
        }
        return tiles.map((tile) => {
            const count = overlapCounts.get(tile.id) ?? 1;
            const opacity = calculateDisplayIntensity(count, maxOverlapCount);
            return { id: tile.id, count, opacity };
        });
    }, [maxOverlapCount, overlapCounts, overlapDebugEnabled, tiles]);

    const [containerWidth, containerHeight] = [containerSize.width, containerSize.height];
    const surfaceStyle: React.CSSProperties = {
        visibility: containerWidth > 0 ? 'visible' : 'hidden',
    };

    if (containerWidth > 0 && containerHeight > 0) {
        const canvasRatio = canvasSize.cols / canvasSize.rows;
        const containerRatio = containerWidth / containerHeight;

        let width: number;
        let height: number;

        if (containerRatio > canvasRatio) {
            height = containerHeight;
            width = height * canvasRatio;
        } else {
            width = containerWidth;
            height = width / canvasRatio;
        }
        surfaceStyle.width = `${width}px`;
        surfaceStyle.height = `${height}px`;
    }

    const trimmedName = useMemo(() => name.trim(), [name]);
    const tileSignature = useMemo(
        () =>
            tiles
                .map((tile) => `${tile.centerX.toFixed(3)}-${tile.centerY.toFixed(3)}`)
                .sort()
                .join('|'),
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

    const handleSave = () => {
        const trimmed = trimmedName;
        if (!trimmed) {
            alert('Pattern name cannot be empty.');
            return;
        }

        const nowIso = new Date().toISOString();

        const patternTiles = tiles
            .map((tile) => ({
                id: tile.id,
                center: { x: tile.centerX, y: tile.centerY },
                size: { width: tile.width, height: tile.height },
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
            name: trimmed,
            tileSignature: tiles
                .map((tile) => `${tile.centerX.toFixed(3)}-${tile.centerY.toFixed(3)}`)
                .sort()
                .join('|'),
        });

        const pattern: Pattern = {
            id: existingPattern?.id ?? generatePatternId(),
            name: trimmed,
            canvas: { width: canvasWidth, height: canvasHeight },
            tiles: patternTiles,
            createdAt: existingPattern?.createdAt ?? nowIso,
            updatedAt: nowIso,
        };

        onSave(pattern);
    };

    const handleCanvasSizeChange = (axis: 'rows' | 'cols', value: string) => {
        const numericValue = Number.parseInt(value, 10);
        const clamped = clampCanvasCells(
            Number.isNaN(numericValue) ? MIN_CANVAS_CELLS : numericValue,
        );
        const nextSize = { ...canvasSize, [axis]: clamped } as { rows: number; cols: number };
        setCanvasSize(nextSize);

        const maxX = nextSize.cols * TILE_PLACEMENT_UNIT - TILE_PLACEMENT_UNIT / 2;
        const maxY = nextSize.rows * TILE_PLACEMENT_UNIT - TILE_PLACEMENT_UNIT / 2;
        applyTileUpdate((prev) =>
            prev.filter(
                (tile) =>
                    tile.centerX >= TILE_PLACEMENT_UNIT / 2 &&
                    tile.centerX <= maxX &&
                    tile.centerY >= TILE_PLACEMENT_UNIT / 2 &&
                    tile.centerY <= maxY,
            ),
        );
    };

    const handleShift = (direction: 'up' | 'down' | 'left' | 'right') => {
        applyTileUpdate((prev) => {
            const next: TileDraft[] = [];
            for (const tile of prev) {
                let deltaX = 0;
                let deltaY = 0;
                if (direction === 'up') deltaY = -TILE_PLACEMENT_UNIT;
                if (direction === 'down') deltaY = TILE_PLACEMENT_UNIT;
                if (direction === 'left') deltaX = -TILE_PLACEMENT_UNIT;
                if (direction === 'right') deltaX = TILE_PLACEMENT_UNIT;

                const newCenterX = tile.centerX + deltaX;
                const newCenterY = tile.centerY + deltaY;
                const withinX =
                    newCenterX >= TILE_PLACEMENT_UNIT / 2 &&
                    newCenterX <= canvasSize.cols * TILE_PLACEMENT_UNIT - TILE_PLACEMENT_UNIT / 2;
                const withinY =
                    newCenterY >= TILE_PLACEMENT_UNIT / 2 &&
                    newCenterY <= canvasSize.rows * TILE_PLACEMENT_UNIT - TILE_PLACEMENT_UNIT / 2;
                if (withinX && withinY) {
                    next.push({ ...tile, centerX: newCenterX, centerY: newCenterY });
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
            applyTileUpdate(() => []);
            clearHover();
        }
    };

    const sidebarProps = {
        name,
        onNameChange: setName,
        usedTiles,
        mirrorCount,
        pixelCountError,
        activeTool,
        onToolChange: setActiveTool,
        isSnapMode,
        onToggleSnap: () => setIsSnapMode((prev) => !prev),
        historyState,
        onUndo: undoTiles,
        onRedo: redoTiles,
        canvasSize,
        onCanvasSizeChange: handleCanvasSizeChange,
        onShift: handleShift,
        onClear: handleClear,
    };

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

            <div className="flex-grow flex flex-col md:flex-row gap-6 min-h-0">
                <PatternEditorSidebar {...sidebarProps} />
                <main className="flex-grow bg-gray-800/50 rounded-lg ring-1 ring-white/10 p-4 flex items-center justify-center min-h-[320px]">
                    <div
                        ref={containerRef}
                        className="w-full h-full flex items-center justify-center"
                    >
                        <div style={surfaceStyle} className="relative max-h-full w-full">
                            <PatternCanvas
                                canvasSize={canvasSize}
                                canvasWidth={canvasWidth}
                                canvasHeight={canvasHeight}
                                tiles={tiles}
                                overlapCounts={overlapCounts}
                                maxOverlapCount={maxOverlapCount}
                                hoverState={hoverState}
                                removeHighlight={removeHighlight}
                                activeTool={activeTool}
                                isSnapMode={isSnapMode}
                                drawingSurfaceRef={drawingSurfaceRef}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerLeave}
                                onPointerCancel={handlePointerCancel}
                            />
                        </div>
                    </div>
                </main>
            </div>
            {overlapDebugEnabled && overlapDebugRows.length > 0 && (
                <div className="mt-4 text-xs text-gray-400 bg-gray-900/70 border border-gray-700 rounded p-3 max-h-40 overflow-auto">
                    <p className="font-semibold text-gray-200 mb-2">Overlap Debug</p>
                    <div className="grid grid-cols-3 gap-2 font-mono">
                        <span>ID</span>
                        <span>Count</span>
                        <span>Opacity</span>
                        {overlapDebugRows.map((row) => (
                            <React.Fragment key={`debug-${row.id}`}>
                                <span className="truncate" title={row.id}>
                                    {row.id.slice(-4)}
                                </span>
                                <span>{row.count}</span>
                                <span>{row.opacity.toFixed(3)}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatternEditorPage;
