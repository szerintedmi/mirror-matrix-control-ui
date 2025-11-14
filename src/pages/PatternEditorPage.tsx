import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PatternCanvas from '../components/PatternCanvas';
import PatternEditorSidebar from '../components/PatternEditorSidebar';
import { MAX_CANVAS_CELLS, MIN_CANVAS_CELLS, TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { usePatternEditorInteractions } from '../hooks/usePatternEditorInteractions';
import { computeDirectOverlaps } from '../utils/tileOverlap';

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
    onSave: (pattern: Pattern) => void;
    existingPattern: Pattern | null;
    mirrorCount: number;
    defaultCanvasSize: { rows: number; cols: number };
    onBack?: () => void;
}

const PatternEditorPage: React.FC<PatternEditorPageProps> = ({
    onSave,
    existingPattern,
    mirrorCount,
    defaultCanvasSize,
    onBack,
}) => {
    const [name, setName] = useState('');
    const [canvasSize, setCanvasSize] = useState(defaultCanvasSize);
    const [pixelCountError, setPixelCountError] = useState(false);
    const [activeTool, setActiveTool] = useState<EditorTool>('place');
    const [isSnapMode, setIsSnapMode] = useState(true);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [baseline, setBaseline] = useState({ name: 'New Pattern', tileSignature: '' });

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
        if (window.confirm('Are you sure you want to clear all tiles?')) {
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
        <div className="flex min-h-0 flex-col gap-4 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-white/40 hover:bg-white/10"
                    >
                        Back to Library
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-md bg-cyan-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 sm:ml-auto"
                >
                    Save Pattern
                </button>
            </div>
            <div className="flex flex-grow flex-col gap-6 min-h-0 md:flex-row">
                <PatternEditorSidebar {...sidebarProps} />
                <main className="flex-grow bg-gray-800/50 rounded-lg ring-1 ring-white/10 p-4 flex items-center justify-center min-h-0">
                    <div
                        ref={containerRef}
                        className="w-full h-full flex min-h-0 min-w-0 items-center justify-center"
                    >
                        <div style={surfaceStyle} className="relative max-h-full max-w-full">
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
        </div>
    );
};

export default PatternEditorPage;
