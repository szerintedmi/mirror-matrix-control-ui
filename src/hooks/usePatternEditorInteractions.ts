import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MutableRefObject,
    type PointerEvent as ReactPointerEvent,
} from 'react';

import { FREE_OVERLAP_DISTANCE, TILE_PLACEMENT_UNIT } from '../constants/pattern';
import {
    createHistoryStacks,
    pushHistorySnapshot,
    redoHistorySnapshot,
    type HistoryStacks,
    undoHistorySnapshot,
} from '../utils/history';
import { handlePatternShortcut, type ShortcutCallbacks } from '../utils/patternShortcuts';

import type { EditorTool, HoverState, TileDraft } from '../types/patternEditor';

const TILE_HALF = TILE_PLACEMENT_UNIT / 2;
const TILE_RADIUS = TILE_PLACEMENT_UNIT / 2;
const HISTORY_LIMIT = 200;
const FREE_DRAG_MIN_DISTANCE = TILE_PLACEMENT_UNIT * 0.1;
const FREE_DRAG_MAX_DISTANCE = TILE_PLACEMENT_UNIT * 0.75;
const SPEED_FOR_MAX_SPACING = TILE_PLACEMENT_UNIT * 8;

const createTileId = (): string =>
    globalThis.crypto?.randomUUID?.() ??
    `tile-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
    let coveringTile: TileDraft | null = null;
    for (const tile of tiles) {
        const distance = Math.hypot(tile.centerX - centerX, tile.centerY - centerY);
        if (distance <= TILE_RADIUS) {
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

interface UseLegacyPatternEditorInteractionsOptions {
    mirrorCount: number;
    canvasSize: { rows: number; cols: number };
    canvasWidth: number;
    canvasHeight: number;
    activeTool: EditorTool;
    isSnapMode: boolean;
    triggerPointLimit: () => void;
    drawingSurfaceRef: MutableRefObject<SVGSVGElement | null>;
    onToolChange: (tool: EditorTool) => void;
    onSnapToggle: () => void;
}

export interface LegacyPatternEditorInteractions {
    tiles: TileDraft[];
    hoverState: HoverState | null;
    removeHighlight: { centerX: number; centerY: number } | null;
    historyState: { canUndo: boolean; canRedo: boolean };
    applyTileUpdate: (
        updater: (prev: TileDraft[]) => TileDraft[],
        options?: { recordHistory?: boolean; resetHistory?: boolean },
    ) => void;
    replaceTiles: (nextTiles: TileDraft[]) => void;
    clearHover: () => void;
    undoTiles: () => void;
    redoTiles: () => void;
    handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
    handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
    handlePointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
    handlePointerLeave: () => void;
    handlePointerCancel: () => void;
}

export const useLegacyPatternEditorInteractions = (
    options: UseLegacyPatternEditorInteractionsOptions,
): LegacyPatternEditorInteractions => {
    const {
        mirrorCount,
        canvasSize,
        canvasWidth,
        canvasHeight,
        activeTool,
        isSnapMode,
        triggerPointLimit,
        drawingSurfaceRef,
        onToolChange,
        onSnapToggle,
    } = options;

    const [tiles, setTiles] = useState<TileDraft[]>([]);
    const historyRef = useRef<HistoryStacks<TileDraft[]>>(createHistoryStacks<TileDraft[]>());
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [hoverState, setHoverState] = useState<HoverState | null>(null);
    const [isPointerDown, setIsPointerDown] = useState(false);
    const dragVisitedCellsRef = useRef<Set<string>>(new Set());
    const lastFreePlacementRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);

    const syncHistoryState = useCallback(() => {
        setHistoryState({
            canUndo: historyRef.current.past.length > 0,
            canRedo: historyRef.current.future.length > 0,
        });
    }, []);

    useEffect(() => {
        dragVisitedCellsRef.current.clear();
    }, [isSnapMode]);

    const replaceTiles = useCallback(
        (nextTiles: TileDraft[]) => {
            historyRef.current = createHistoryStacks<TileDraft[]>();
            setTiles(nextTiles);
            syncHistoryState();
        },
        [syncHistoryState],
    );

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
                    historyRef.current = createHistoryStacks<TileDraft[]>();
                    syncHistoryState();
                    return next;
                }
                if (recordHistory && next !== prev) {
                    historyRef.current = pushHistorySnapshot(
                        historyRef.current,
                        prev,
                        HISTORY_LIMIT,
                    );
                    syncHistoryState();
                }
                return next;
            });
        },
        [syncHistoryState],
    );

    const undoTiles = useCallback(() => {
        setTiles((prev) => {
            const result = undoHistorySnapshot(historyRef.current, prev);
            if (result.value === prev) {
                return prev;
            }
            historyRef.current = result.history;
            syncHistoryState();
            return result.value;
        });
    }, [syncHistoryState]);

    const redoTiles = useCallback(() => {
        setTiles((prev) => {
            const result = redoHistorySnapshot(historyRef.current, prev);
            if (result.value === prev) {
                return prev;
            }
            historyRef.current = result.history;
            syncHistoryState();
            return result.value;
        });
    }, [syncHistoryState]);

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

    const getPointerTarget = useCallback(
        (event: ReactPointerEvent<SVGSVGElement>) => {
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

            const shouldSnapPointer = isSnapMode && activeTool === 'place';

            let centerX: number;
            let centerY: number;
            let row: number;
            let col: number;

            if (shouldSnapPointer) {
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
        [
            activeTool,
            canvasHeight,
            canvasWidth,
            canvasSize.cols,
            canvasSize.rows,
            drawingSurfaceRef,
            isCenterWithin,
            isSnapMode,
        ],
    );

    const handlePointerTarget = useCallback((target: HoverState) => {
        setHoverState(target);
    }, []);

    const applyToolToTarget = useCallback(
        (target: HoverState) => {
            const visited = dragVisitedCellsRef.current;
            const targetIsSnapped = isSnapMode && activeTool === 'place';
            const visitedKey = targetIsSnapped
                ? `snap-${target.row}-${target.col}`
                : `free-${target.centerX.toFixed(1)}-${target.centerY.toFixed(1)}`;

            if (activeTool === 'place') {
                if (!targetIsSnapped) {
                    const lastPlacement = lastFreePlacementRef.current;
                    if (lastPlacement) {
                        const dx = target.centerX - lastPlacement.x;
                        const dy = target.centerY - lastPlacement.y;
                        const distanceSq = dx * dx + dy * dy;
                        const distance = Math.sqrt(distanceSq);
                        const elapsedMs = performance.now() - lastPlacement.timestamp;
                        const speed = elapsedMs > 0 ? (distance / elapsedMs) * 1000 : 0;
                        const speedRatio = Math.min(Math.max(speed / SPEED_FOR_MAX_SPACING, 0), 1);
                        const requiredSpacing =
                            FREE_DRAG_MIN_DISTANCE +
                            (FREE_DRAG_MAX_DISTANCE - FREE_DRAG_MIN_DISTANCE) * speedRatio;
                        if (distance < requiredSpacing) {
                            return;
                        }
                    }
                }
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
                            id: createTileId(),
                            centerX: target.centerX,
                            centerY: target.centerY,
                            createdAt: Date.now(),
                            width: TILE_PLACEMENT_UNIT,
                            height: TILE_PLACEMENT_UNIT,
                        },
                    ];
                });
                if (targetIsSnapped) {
                    lastFreePlacementRef.current = null;
                } else {
                    lastFreePlacementRef.current = {
                        x: target.centerX,
                        y: target.centerY,
                        timestamp: performance.now(),
                    };
                }
            } else {
                applyTileUpdate((prev) => {
                    if (prev.length === 0) {
                        return prev;
                    }
                    const candidate = selectTileUnderPointer(
                        prev,
                        target.centerX,
                        target.centerY,
                        FREE_OVERLAP_DISTANCE,
                    );
                    if (!candidate) {
                        return prev;
                    }
                    visited.add(visitedKey);
                    return prev.filter((tile) => tile.id !== candidate.id);
                });
                lastFreePlacementRef.current = null;
            }
        },
        [activeTool, applyTileUpdate, isSnapMode, mirrorCount, triggerPointLimit],
    );

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<SVGSVGElement>) => {
            if (event.button !== 0 && event.pointerType !== 'touch') {
                return;
            }
            if (typeof document !== 'undefined') {
                const activeElement = document.activeElement;
                if (activeElement instanceof HTMLElement && activeElement !== document.body) {
                    activeElement.blur();
                }
            }
            const target = getPointerTarget(event);
            if (!target) {
                return;
            }
            event.preventDefault();
            dragVisitedCellsRef.current.clear();
            lastFreePlacementRef.current = null;
            setIsPointerDown(true);
            handlePointerTarget(target);
            event.currentTarget.setPointerCapture(event.pointerId);
            applyToolToTarget(target);
        },
        [applyToolToTarget, getPointerTarget, handlePointerTarget],
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent<SVGSVGElement>) => {
            const target = getPointerTarget(event);
            if (!target) {
                setHoverState(null);
                return;
            }
            handlePointerTarget(target);
            if (isPointerDown) {
                applyToolToTarget(target);
            }
        },
        [applyToolToTarget, getPointerTarget, handlePointerTarget, isPointerDown],
    );

    const releasePointer = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // ignore if capture wasn't set
        }
        setIsPointerDown(false);
        dragVisitedCellsRef.current.clear();
        lastFreePlacementRef.current = null;
    }, []);

    const handlePointerUp = useCallback(
        (event: ReactPointerEvent<SVGSVGElement>) => {
            if (!isPointerDown) {
                return;
            }
            releasePointer(event);
        },
        [isPointerDown, releasePointer],
    );

    const handlePointerLeave = useCallback(() => {
        setIsPointerDown(false);
        dragVisitedCellsRef.current.clear();
        lastFreePlacementRef.current = null;
        setHoverState(null);
    }, []);

    const handlePointerCancel = useCallback(() => {
        setIsPointerDown(false);
        dragVisitedCellsRef.current.clear();
        lastFreePlacementRef.current = null;
        setHoverState(null);
    }, []);

    const removeHighlight = useMemo(() => {
        if (activeTool !== 'remove' || !hoverState) {
            return null;
        }
        const hovered = selectTileUnderPointer(
            tiles,
            hoverState.centerX,
            hoverState.centerY,
            FREE_OVERLAP_DISTANCE,
        );
        if (!hovered) {
            return null;
        }
        return { centerX: hovered.centerX, centerY: hovered.centerY };
    }, [activeTool, hoverState, tiles]);

    const shortcutCallbacksRef = useRef<ShortcutCallbacks | null>(null);

    useEffect(() => {
        shortcutCallbacksRef.current = {
            place: () => onToolChange('place'),
            remove: () => onToolChange('remove'),
            toggleSnap: onSnapToggle,
            undo: undoTiles,
            redo: redoTiles,
        };
    }, [onSnapToggle, onToolChange, redoTiles, undoTiles]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!shortcutCallbacksRef.current) {
                return;
            }
            if (handlePatternShortcut(event, shortcutCallbacksRef.current)) {
                event.preventDefault();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const clearHover = useCallback(() => setHoverState(null), []);

    return {
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
    };
};
