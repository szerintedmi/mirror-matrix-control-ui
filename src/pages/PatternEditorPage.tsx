import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    FREE_OVERLAP_DISTANCE,
    MAX_CANVAS_CELLS,
    MIN_CANVAS_CELLS,
    SNAP_OVERLAP_EPSILON,
    TILE_PLACEMENT_UNIT,
} from '../constants/pattern';
import { useHeatmapImage } from '../hooks/useHeatmapImage';
import { computeCanvasCoverage, rasterizeTileCoverage } from '../utils/patternIntensity';

import type { NavigationControls } from '../App';
import type { Pattern } from '../types';

interface PatternEditorPageProps {
    navigation: NavigationControls;
    onSave: (pattern: Pattern) => void;
    existingPattern: Pattern | null;
    mirrorCount: number;
    defaultCanvasSize: { rows: number; cols: number };
}

type Tool = 'place' | 'remove';

interface TileDraft {
    id: string;
    centerX: number;
    centerY: number;
    createdAt: number;
}

interface HoverState {
    centerX: number;
    centerY: number;
    row: number;
    col: number;
}

const TILE_HALF = TILE_PLACEMENT_UNIT / 2;
const HISTORY_LIMIT = 200;

const findNearestTileWithinThreshold = (
    tiles: TileDraft[],
    centerX: number,
    centerY: number,
    threshold: number,
): TileDraft | null => {
    const thresholdSq = threshold * threshold;
    let candidate: TileDraft | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of tiles) {
        const dx = tile.centerX - centerX;
        const dy = tile.centerY - centerY;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= thresholdSq && distanceSq < bestDistance) {
            candidate = tile;
            bestDistance = distanceSq;
        }
    }
    return candidate;
};

const selectTileUnderPointer = (
    tiles: TileDraft[],
    centerX: number,
    centerY: number,
    threshold: number,
): TileDraft | null => {
    const half = TILE_PLACEMENT_UNIT / 2;
    let coveringTile: TileDraft | null = null;
    for (const tile of tiles) {
        const withinX = Math.abs(tile.centerX - centerX) <= half;
        const withinY = Math.abs(tile.centerY - centerY) <= half;
        if (withinX && withinY) {
            if (!coveringTile || tile.createdAt >= coveringTile.createdAt) {
                coveringTile = tile;
            }
        }
    }

    if (coveringTile) {
        return coveringTile;
    }

    return findNearestTileWithinThreshold(tiles, centerX, centerY, threshold);
};

const tileCenterToCell = (centerX: number, centerY: number): { row: number; col: number } => ({
    row: Math.floor(centerY / TILE_PLACEMENT_UNIT),
    col: Math.floor(centerX / TILE_PLACEMENT_UNIT),
});

const isIntensityDebugEnabled = (): boolean =>
    typeof window !== 'undefined' &&
    window.localStorage?.getItem('debugPatternIntensity') === 'true';

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
    const historyRef = useRef<{ past: TileDraft[][]; future: TileDraft[][] }>({
        past: [],
        future: [],
    });
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [pixelCountError, setPixelCountError] = useState(false);
    const [activeTool, setActiveTool] = useState<Tool>('place');
    const [isSnapMode, setIsSnapMode] = useState(true);
    const [isPointerDown, setIsPointerDown] = useState(false);
    const [hoverState, setHoverState] = useState<HoverState | null>(null);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [baseline, setBaseline] = useState({ name: 'New Pattern', tileSignature: '' });
    const [debugEnabled, setDebugEnabled] = useState<boolean>(() => isIntensityDebugEnabled());

    const [containerRef, containerSize] = useElementSize<HTMLDivElement>();
    const drawingSurfaceRef = useRef<SVGSVGElement | null>(null);
    const dragVisitedCellsRef = useRef<Set<string>>(new Set());
    const pixelErrorTimeoutRef = useRef<number | null>(null);

    const syncHistoryState = useCallback(() => {
        setHistoryState({
            canUndo: historyRef.current.past.length > 0,
            canRedo: historyRef.current.future.length > 0,
        });
    }, []);

    const applyTileUpdate = useCallback(
        (
            updater: (prev: TileDraft[]) => TileDraft[],
            options?: { recordHistory?: boolean; resetHistory?: boolean },
        ) => {
            const recordHistory = options?.recordHistory ?? true;
            const resetHistory = options?.resetHistory ?? false;

            setTiles((prev) => {
                const next = updater(prev);
                if (resetHistory) {
                    historyRef.current = { past: [], future: [] };
                    syncHistoryState();
                    return next;
                }
                if (recordHistory && next !== prev) {
                    const past =
                        historyRef.current.past.length >= HISTORY_LIMIT
                            ? [...historyRef.current.past.slice(1), prev]
                            : [...historyRef.current.past, prev];
                    historyRef.current = { past, future: [] };
                    syncHistoryState();
                }
                return next;
            });
        },
        [syncHistoryState],
    );

    const undoTiles = useCallback(() => {
        setTiles((prev) => {
            const { past, future } = historyRef.current;
            if (past.length === 0) {
                return prev;
            }
            const previous = past[past.length - 1];
            historyRef.current = {
                past: past.slice(0, -1),
                future: [prev, ...future],
            };
            syncHistoryState();
            return previous;
        });
    }, [syncHistoryState]);

    const redoTiles = useCallback(() => {
        setTiles((prev) => {
            const { past, future } = historyRef.current;
            if (future.length === 0) {
                return prev;
            }
            const [next, ...restFuture] = future;
            historyRef.current = {
                past: [...past, prev],
                future: restFuture,
            };
            syncHistoryState();
            return next;
        });
    }, [syncHistoryState]);

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
                    const centerX = tile.center.x;
                    const centerY = tile.center.y;
                    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
                        return;
                    }
                    const withinX =
                        centerX >= TILE_HALF &&
                        centerX <= inferredCols * TILE_PLACEMENT_UNIT - TILE_HALF;
                    const withinY =
                        centerY >= TILE_HALF &&
                        centerY <= inferredRows * TILE_PLACEMENT_UNIT - TILE_HALF;
                    if (!withinX || !withinY) {
                        return;
                    }
                    hydratedTiles.push({
                        id: tile.id,
                        centerX,
                        centerY,
                        createdAt: Date.now() + index,
                    });
                });

                setName(existingPattern.name);
                setCanvasSize({ rows: inferredRows, cols: inferredCols });
                applyTileUpdate(() => hydratedTiles, { recordHistory: false, resetHistory: true });
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
                applyTileUpdate(() => [], { recordHistory: false, resetHistory: true });
                setBaseline({ name: 'New Pattern', tileSignature: '' });
            }
            setHasHydrated(true);
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [applyTileUpdate, existingPattern, defaultCanvasSize]);

    useEffect(() => {
        return () => {
            if (pixelErrorTimeoutRef.current !== null) {
                window.clearTimeout(pixelErrorTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        dragVisitedCellsRef.current.clear();
    }, [isSnapMode]);

    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) {
                return false;
            }
            const tag = target.tagName.toLowerCase();
            return (
                target.isContentEditable ||
                tag === 'input' ||
                tag === 'textarea' ||
                tag === 'select'
            );
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) {
                return;
            }
            const key = event.key.toLowerCase();
            const hasMeta = event.metaKey || event.ctrlKey;

            if (hasMeta && !event.altKey) {
                if (key === 'z') {
                    event.preventDefault();
                    if (event.shiftKey) {
                        redoTiles();
                    } else {
                        undoTiles();
                    }
                    return;
                }
                if (!event.shiftKey && key === 'y') {
                    event.preventDefault();
                    redoTiles();
                    return;
                }
            }

            if (hasMeta || event.altKey) {
                return;
            }

            if (key === 'p') {
                event.preventDefault();
                setActiveTool('place');
                return;
            }
            if (key === 'r') {
                event.preventDefault();
                setActiveTool('remove');
                return;
            }
            if (key === 's') {
                event.preventDefault();
                setIsSnapMode((prev) => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [redoTiles, setActiveTool, setIsSnapMode, undoTiles]);

    const triggerPointLimit = useCallback(() => {
        if (pixelErrorTimeoutRef.current !== null) {
            window.clearTimeout(pixelErrorTimeoutRef.current);
        }
        setPixelCountError(true);
        pixelErrorTimeoutRef.current = window.setTimeout(() => setPixelCountError(false), 600);
    }, []);

    const isCenterWithin = useCallback(
        (centerX: number, centerY: number) => {
            const maxX = canvasSize.cols * TILE_PLACEMENT_UNIT - TILE_HALF;
            const maxY = canvasSize.rows * TILE_PLACEMENT_UNIT - TILE_HALF;
            return (
                centerX >= TILE_HALF && centerX <= maxX && centerY >= TILE_HALF && centerY <= maxY
            );
        },
        [canvasSize.cols, canvasSize.rows],
    );

    const canvasWidth = canvasSize.cols * TILE_PLACEMENT_UNIT;
    const canvasHeight = canvasSize.rows * TILE_PLACEMENT_UNIT;

    const tileFootprints = useMemo(
        () =>
            tiles.map((tile) => ({
                id: tile.id,
                centerX: tile.centerX,
                centerY: tile.centerY,
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            })),
        [tiles],
    );

    const coverage = useMemo(
        () => computeCanvasCoverage(tileFootprints, canvasSize.rows, canvasSize.cols),
        [canvasSize.cols, canvasSize.rows, tileFootprints],
    );

    const rasterizedHeatmap = useMemo(
        () => rasterizeTileCoverage(tileFootprints, canvasWidth, canvasHeight),
        [canvasHeight, canvasWidth, tileFootprints],
    );

    const heatmapTexture = useHeatmapImage(rasterizedHeatmap);

    const hoveredTile = useMemo(() => {
        if (activeTool !== 'remove' || !hoverState) {
            return null;
        }
        return (
            selectTileUnderPointer(
                tiles,
                hoverState.centerX,
                hoverState.centerY,
                isSnapMode ? SNAP_OVERLAP_EPSILON : FREE_OVERLAP_DISTANCE,
            ) ?? null
        );
    }, [activeTool, hoverState, isSnapMode, tiles]);

    const removeHighlight = useMemo(() => {
        if (activeTool !== 'remove' || !hoveredTile) {
            return null;
        }
        return { centerX: hoveredTile.centerX, centerY: hoveredTile.centerY };
    }, [activeTool, hoveredTile]);

    useEffect(() => {
        const syncDebugFlag = () => {
            setDebugEnabled((prev) => {
                const next = isIntensityDebugEnabled();
                return prev === next ? prev : next;
            });
        };
        syncDebugFlag();
        const interval = window.setInterval(syncDebugFlag, 1000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!debugEnabled || coverage.cells.length === 0) {
            return;
        }

        console.groupCollapsed(
            '[Intensity Debug]',
            `mode=${isSnapMode ? 'snap' : 'free'}`,
            `maxCell=${coverage.maxCount}`,
            `litCells=${coverage.cells.length}`,
        );
        console.table(
            [...coverage.cells]
                .sort((a, b) => b.count - a.count)
                .slice(0, 20)
                .map((cell) => ({
                    row: cell.row,
                    col: cell.col,
                    count: cell.count,
                    intensity: cell.intensity.toFixed(3),
                })),
        );
        console.groupEnd();
    }, [coverage, debugEnabled, isSnapMode]);

    const getPointerTarget = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            const surface = drawingSurfaceRef.current;
            if (!surface) {
                return null;
            }
            const rect = surface.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return null;
            }
            const relativeX = ((event.clientX - rect.left) / rect.width) * canvasWidth;
            const relativeY = ((event.clientY - rect.top) / rect.height) * canvasHeight;

            let centerX: number;
            let centerY: number;
            let row: number;
            let col: number;

            if (isSnapMode) {
                col = Math.min(
                    Math.floor(relativeX / TILE_PLACEMENT_UNIT),
                    Math.max(canvasSize.cols - 1, 0),
                );
                row = Math.min(
                    Math.floor(relativeY / TILE_PLACEMENT_UNIT),
                    Math.max(canvasSize.rows - 1, 0),
                );
                centerX = (col + 0.5) * TILE_PLACEMENT_UNIT;
                centerY = (row + 0.5) * TILE_PLACEMENT_UNIT;
            } else {
                centerX = Math.min(Math.max(relativeX, TILE_HALF), canvasWidth - TILE_HALF);
                centerY = Math.min(Math.max(relativeY, TILE_HALF), canvasHeight - TILE_HALF);
                const cell = tileCenterToCell(centerX, centerY);
                row = cell.row;
                col = cell.col;
            }

            if (!isCenterWithin(centerX, centerY)) {
                return null;
            }
            return { centerX, centerY, row, col };
        },
        [canvasHeight, canvasWidth, canvasSize.cols, canvasSize.rows, isCenterWithin, isSnapMode],
    );

    const applyToolToTarget = useCallback(
        (target: { centerX: number; centerY: number; row: number; col: number }) => {
            const visited = dragVisitedCellsRef.current;
            const visitedKey = isSnapMode
                ? `snap-${target.row}-${target.col}`
                : `free-${target.centerX.toFixed(1)}-${target.centerY.toFixed(1)}`;

            if (activeTool === 'place') {
                if (visited.has(visitedKey)) {
                    return;
                }
                applyTileUpdate((prev) => {
                    if (prev.length >= mirrorCount) {
                        triggerPointLimit();
                        return prev;
                    }
                    visited.add(visitedKey);
                    return [
                        ...prev,
                        {
                            id: generateTileId(),
                            centerX: target.centerX,
                            centerY: target.centerY,
                            createdAt: Date.now(),
                        },
                    ];
                });
            } else {
                applyTileUpdate((prev) => {
                    if (prev.length === 0) {
                        return prev;
                    }
                    const candidate = selectTileUnderPointer(
                        prev,
                        target.centerX,
                        target.centerY,
                        isSnapMode ? SNAP_OVERLAP_EPSILON : FREE_OVERLAP_DISTANCE,
                    );
                    if (!candidate) {
                        return prev;
                    }
                    visited.add(visitedKey);
                    return prev.filter((tile) => tile.id !== candidate.id);
                });
            }
        },
        [activeTool, applyTileUpdate, isSnapMode, mirrorCount, triggerPointLimit],
    );

    const updateHover = useCallback(
        (target: { centerX: number; centerY: number; row: number; col: number }) => {
            if (!isCenterWithin(target.centerX, target.centerY)) {
                setHoverState(null);
                return;
            }
            setHoverState({
                centerX: target.centerX,
                centerY: target.centerY,
                row: target.row,
                col: target.col,
            });
        },
        [isCenterWithin],
    );

    const clearHover = useCallback(() => {
        setHoverState(null);
    }, []);

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            if (event.button !== 0 && event.pointerType !== 'touch') {
                return;
            }
            const target = getPointerTarget(event);
            if (!target) {
                return;
            }
            event.preventDefault();
            dragVisitedCellsRef.current.clear();
            setIsPointerDown(true);
            updateHover(target);
            event.currentTarget.setPointerCapture(event.pointerId);
            applyToolToTarget(target);
        },
        [applyToolToTarget, getPointerTarget, updateHover],
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            const target = getPointerTarget(event);
            if (!target) {
                clearHover();
                return;
            }
            updateHover(target);
            if (isPointerDown) {
                applyToolToTarget(target);
            }
        },
        [applyToolToTarget, clearHover, getPointerTarget, isPointerDown, updateHover],
    );

    const handlePointerUp = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
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
        },
        [isPointerDown],
    );

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
                    x: tile.centerX,
                    y: tile.centerY,
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
                .map((tile) => `${tile.centerX.toFixed(3)}-${tile.centerY.toFixed(3)}`)
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
        const clamped = clampCanvasCells(
            Number.isNaN(numericValue) ? MIN_CANVAS_CELLS : numericValue,
        );
        const nextSize = { ...canvasSize, [axis]: clamped } as { rows: number; cols: number };
        setCanvasSize(nextSize);

        const maxX = nextSize.cols * TILE_PLACEMENT_UNIT - TILE_HALF;
        const maxY = nextSize.rows * TILE_PLACEMENT_UNIT - TILE_HALF;
        applyTileUpdate((prev) =>
            prev.filter(
                (tile) =>
                    tile.centerX >= TILE_HALF &&
                    tile.centerX <= maxX &&
                    tile.centerY >= TILE_HALF &&
                    tile.centerY <= maxY,
            ),
        );
        setHoverState((prev) => {
            if (!prev) {
                return prev;
            }
            if (
                prev.centerX < TILE_HALF ||
                prev.centerX > maxX ||
                prev.centerY < TILE_HALF ||
                prev.centerY > maxY
            ) {
                return null;
            }
            return prev;
        });
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
                if (isCenterWithin(newCenterX, newCenterY)) {
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
                        <label
                            htmlFor="patternName"
                            className="block text-sm font-medium text-gray-300"
                        >
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
                                onClick={() => setActiveTool('place')}
                                className={`px-3 py-1.5 rounded-md border transition-colors ${activeTool === 'place' ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'}`}
                            >
                                Place (P)
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTool('remove')}
                                className={`px-3 py-1.5 rounded-md border transition-colors ${activeTool === 'remove' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'}`}
                            >
                                Remove (R)
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 leading-snug">
                            Place adds tiles (drag to draw). Remove deletes the highlighted tile,
                            making it easy to tidy overlaps quickly.
                        </p>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-sm text-gray-400">Snap to grid (S)</span>
                            <button
                                type="button"
                                onClick={() => setIsSnapMode((prev) => !prev)}
                                className={`px-3 py-1 rounded-md border text-sm transition-colors ${isSnapMode ? 'bg-cyan-700/60 border-cyan-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'}`}
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
                                    onClick={undoTiles}
                                    disabled={!historyState.canUndo}
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
                                    onClick={redoTiles}
                                    disabled={!historyState.canRedo}
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
                                Shortcuts: P place, R remove, S snap, ⌘/Ctrl+Z undo, ⇧⌘/Ctrl+Shift+Z
                                redo.
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
                                onClick={() => handleShift('left')}
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
                                onClick={() => handleShift('down')}
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
                                onClick={() => handleShift('right')}
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
                                {heatmapTexture && (
                                    <image
                                        x={0}
                                        y={0}
                                        width={canvasWidth}
                                        height={canvasHeight}
                                        preserveAspectRatio="none"
                                        xlinkHref={heatmapTexture}
                                        style={{ imageRendering: 'pixelated' }}
                                    />
                                )}
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
                                {isSnapMode &&
                                    coverage.cells.map((cell) => {
                                        if (cell.count <= 1) {
                                            return null;
                                        }
                                        const x = cell.col * TILE_PLACEMENT_UNIT;
                                        const y = cell.row * TILE_PLACEMENT_UNIT;
                                        return (
                                            <text
                                                key={`count-${cell.row}-${cell.col}`}
                                                x={x + TILE_PLACEMENT_UNIT / 2}
                                                y={
                                                    y +
                                                    TILE_PLACEMENT_UNIT / 2 +
                                                    TILE_PLACEMENT_UNIT * 0.1
                                                }
                                                textAnchor="middle"
                                                fontSize={Math.max(
                                                    TILE_PLACEMENT_UNIT * 0.32,
                                                    4,
                                                )}
                                                fill="rgba(15, 23, 42, 0.55)"
                                                pointerEvents="none"
                                                fontWeight={500}
                                            >
                                                {cell.count}
                                            </text>
                                        );
                                    })}
                                {activeTool === 'place' && hoverState && (
                                    <rect
                                        x={hoverState.centerX - TILE_HALF}
                                        y={hoverState.centerY - TILE_HALF}
                                        width={TILE_PLACEMENT_UNIT}
                                        height={TILE_PLACEMENT_UNIT}
                                        fill="rgba(34, 211, 238, 0.12)"
                                        stroke="rgba(34, 211, 238, 0.55)"
                                        strokeWidth={Math.max(TILE_PLACEMENT_UNIT * 0.14, 0.6)}
                                        strokeDasharray={`${TILE_PLACEMENT_UNIT * 0.3} ${TILE_PLACEMENT_UNIT * 0.2}`}
                                        pointerEvents="none"
                                        rx={TILE_PLACEMENT_UNIT * 0.18}
                                        ry={TILE_PLACEMENT_UNIT * 0.18}
                                    />
                                )}
                                {removeHighlight && (
                                    <rect
                                        x={removeHighlight.centerX - TILE_HALF}
                                        y={removeHighlight.centerY - TILE_HALF}
                                        width={TILE_PLACEMENT_UNIT}
                                        height={TILE_PLACEMENT_UNIT}
                                        fill="rgba(248, 113, 113, 0.08)"
                                        stroke="rgba(248, 113, 113, 0.65)"
                                        strokeWidth={Math.max(TILE_PLACEMENT_UNIT * 0.14, 0.6)}
                                        pointerEvents="none"
                                        rx={TILE_PLACEMENT_UNIT * 0.18}
                                        ry={TILE_PLACEMENT_UNIT * 0.18}
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
                                        Click or drag to place tiles
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
