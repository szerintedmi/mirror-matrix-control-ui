import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PatternDesignerDebugPanel from '@/components/patternDesigner/PatternDesignerDebugPanel';
import type { DesignerCoordinate, PatternEditMode } from '@/components/patternDesigner/types';
import { loadPatterns, persistPatterns } from '@/services/patternStorage';
import type { Pattern, PatternPoint } from '@/types';
import { centeredDeltaToView, centeredToView, viewToCentered } from '@/utils/centeredCoordinates';

interface PatternDesignerCanvasProps {
    pattern: Pattern;
    editMode: PatternEditMode;
    hoveredPointId: string | null;
    onChange: (nextPattern: Pattern) => void;
    onHoverChange?: (point: DesignerCoordinate | null) => void;
    onHoverPointChange?: (pointId: string | null) => void;
}

const PATTERN_BLOB_RADIUS = 0.04;
const EDIT_MODE_LABEL: Record<PatternEditMode, string> = {
    placement: 'Placement',
    erase: 'Erase',
};

const clampUnit = (value: number): number => {
    if (Number.isNaN(value)) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
};

const createPointId = (): string =>
    `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const PatternDesignerCanvas: React.FC<PatternDesignerCanvasProps> = ({
    pattern,
    editMode,
    hoveredPointId,
    onChange,
    onHoverChange,
    onHoverPointChange,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dragStateRef = useRef<{
        activePointId: string | null;
        moved: boolean;
        suppressNextPointClick: boolean;
    }>({ activePointId: null, moved: false, suppressNextPointClick: false });
    const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

    const handleAddPoint = useCallback(
        (event: React.MouseEvent<Element>) => {
            if (!containerRef.current) {
                return;
            }
            const bounds = containerRef.current.getBoundingClientRect();
            const size = Math.min(bounds.width, bounds.height);
            const originX = bounds.left + (bounds.width - size) / 2;
            const originY = bounds.top + (bounds.height - size) / 2;
            const viewX = clampUnit((event.clientX - originX) / size);
            const viewY = clampUnit((event.clientY - originY) / size);
            const normalizedX = viewToCentered(viewX);
            const normalizedY = viewToCentered(viewY);
            const now = new Date().toISOString();
            const nextPoint: PatternPoint = {
                id: createPointId(),
                x: normalizedX,
                y: normalizedY,
            };
            const nextPattern: Pattern = {
                ...pattern,
                updatedAt: now,
                points: [...pattern.points, nextPoint],
            };
            onChange(nextPattern);
        },
        [onChange, pattern],
    );

    const handleMouseDownPoint = useCallback(
        (pointId: string) => {
            if (editMode !== 'placement') {
                return;
            }
            setDraggingPointId(pointId);
            dragStateRef.current = {
                activePointId: pointId,
                moved: false,
                suppressNextPointClick: false,
            };
        },
        [editMode],
    );

    const handleMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as SVGCircleElement | HTMLElement;
        const { activePointId, moved } = dragStateRef.current;
        const endedOnDraggedPoint =
            target instanceof SVGCircleElement &&
            activePointId !== null &&
            target.dataset.pointId === activePointId;
        setDraggingPointId(null);
        dragStateRef.current = {
            activePointId: null,
            moved: false,
            suppressNextPointClick: moved && endedOnDraggedPoint,
        };
    }, []);

    const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) {
                onHoverChange?.(null);
                return;
            }
            const bounds = containerRef.current.getBoundingClientRect();
            const size = Math.min(bounds.width, bounds.height);
            const originX = bounds.left + (bounds.width - size) / 2;
            const originY = bounds.top + (bounds.height - size) / 2;
            const viewX = clampUnit((event.clientX - originX) / size);
            const viewY = clampUnit((event.clientY - originY) / size);
            const normalizedX = viewToCentered(viewX);
            const normalizedY = viewToCentered(viewY);
            onHoverChange?.({ x: normalizedX, y: normalizedY });
            if (!draggingPointId) {
                return;
            }
            const targetPoint = pattern.points.find((point) => point.id === draggingPointId);
            if (!targetPoint) {
                return;
            }
            if (targetPoint.x !== normalizedX || targetPoint.y !== normalizedY) {
                dragStateRef.current.moved = true;
            }
            const now = new Date().toISOString();
            const nextPattern: Pattern = {
                ...pattern,
                updatedAt: now,
                points: pattern.points.map((point) =>
                    point.id === draggingPointId
                        ? {
                              ...point,
                              x: normalizedX,
                              y: normalizedY,
                          }
                        : point,
                ),
            };
            onChange(nextPattern);
        },
        [draggingPointId, onChange, onHoverChange, pattern],
    );

    const handleMouseLeave = useCallback(() => {
        setDraggingPointId(null);
        dragStateRef.current = { activePointId: null, moved: false, suppressNextPointClick: false };
        onHoverPointChange?.(null);
        onHoverChange?.(null);
    }, [onHoverChange, onHoverPointChange]);

    const handleRemovePoint = useCallback(
        (pointId: string) => {
            const now = new Date().toISOString();
            const nextPattern: Pattern = {
                ...pattern,
                updatedAt: now,
                points: pattern.points.filter((point) => point.id !== pointId),
            };
            onChange(nextPattern);
        },
        [onChange, pattern],
    );

    const handleCanvasClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (editMode !== 'placement') {
                return;
            }
            handleAddPoint(event);
        },
        [editMode, handleAddPoint],
    );

    const handlePointClick = useCallback(
        (event: React.MouseEvent<SVGCircleElement>, pointId: string) => {
            event.stopPropagation();
            if (editMode === 'erase') {
                handleRemovePoint(pointId);
                return;
            }
            if (editMode === 'placement') {
                if (dragStateRef.current.suppressNextPointClick) {
                    dragStateRef.current.suppressNextPointClick = false;
                    return;
                }
                handleAddPoint(event);
            }
        },
        [editMode, handleAddPoint, handleRemovePoint],
    );

    const handlePointMouseEnter = useCallback(
        (pointId: string) => {
            if (editMode !== 'erase') {
                return;
            }
            onHoverPointChange?.(pointId);
        },
        [editMode, onHoverPointChange],
    );

    const handlePointMouseLeave = useCallback(() => {
        onHoverPointChange?.(null);
    }, [onHoverPointChange]);

    return (
        <div className="relative flex aspect-square w-full max-w-xl items-center justify-center bg-gray-900">
            <div
                ref={containerRef}
                className={`h-full w-full select-none ${
                    editMode === 'erase' ? 'cursor-pointer' : 'cursor-crosshair'
                }`}
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                role="presentation"
            >
                <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="xMidYMid meet"
                    className="h-full w-full"
                >
                    <rect x={0} y={0} width={1} height={1} fill="rgb(15,23,42)" />
                    <line
                        x1={0}
                        y1={centeredToView(0)}
                        x2={1}
                        y2={centeredToView(0)}
                        stroke="rgba(148, 163, 184, 0.25)"
                        strokeWidth={0.0015}
                    />
                    <line
                        x1={centeredToView(0)}
                        y1={0}
                        x2={centeredToView(0)}
                        y2={1}
                        stroke="rgba(148, 163, 184, 0.25)"
                        strokeWidth={0.0015}
                    />
                    {pattern.points.map((point) => {
                        const isEraseHover = editMode === 'erase' && hoveredPointId === point.id;
                        return (
                            <circle
                                key={point.id}
                                data-point-id={point.id}
                                cx={centeredToView(point.x)}
                                cy={centeredToView(point.y)}
                                r={centeredDeltaToView(PATTERN_BLOB_RADIUS)}
                                fill={isEraseHover ? '#f87171' : '#22d3ee'}
                                fillOpacity={editMode === 'erase' && !isEraseHover ? 0.45 : 1}
                                stroke={isEraseHover ? '#fecaca' : '#0f172a'}
                                strokeWidth={isEraseHover ? 0.006 : 0.004}
                                onMouseEnter={() => handlePointMouseEnter(point.id)}
                                onMouseLeave={handlePointMouseLeave}
                                onMouseDown={(event) => {
                                    event.stopPropagation();
                                    handleMouseDownPoint(point.id);
                                }}
                                onClick={(event) => handlePointClick(event, point.id)}
                            />
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

const PatternDesignerPage: React.FC = () => {
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );
    const [patterns, setPatterns] = useState<Pattern[]>(() => loadPatterns(resolvedStorage));
    const [selectedPatternId, setSelectedPatternId] = useState<string | null>(
        patterns[0]?.id ?? null,
    );
    const [hoverPoint, setHoverPoint] = useState<DesignerCoordinate | null>(null);
    const [editMode, setEditMode] = useState<PatternEditMode>('placement');
    const [hoveredPatternPointId, setHoveredPatternPointId] = useState<string | null>(null);

    const updateEditMode = useCallback((mode: PatternEditMode) => {
        setEditMode(mode);
        setHoveredPatternPointId(null);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement) {
                const tagName = event.target.tagName.toLowerCase();
                if (
                    tagName === 'input' ||
                    tagName === 'textarea' ||
                    event.target.isContentEditable
                ) {
                    return;
                }
            }
            if (event.key === 'p' || event.key === 'P') {
                updateEditMode('placement');
            } else if (event.key === 'e' || event.key === 'E') {
                updateEditMode('erase');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [updateEditMode]);

    const selectedPattern = useMemo(
        () => patterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
        [patterns, selectedPatternId],
    );

    const handleSelectPattern = useCallback(
        (patternId: string | null) => {
            setSelectedPatternId(patternId);
            setHoverPoint(null);
            setHoveredPatternPointId(null);
        },
        [setHoverPoint, setHoveredPatternPointId, setSelectedPatternId],
    );

    const handlePersist = (nextPatterns: Pattern[]) => {
        setPatterns(nextPatterns);
        persistPatterns(resolvedStorage, nextPatterns);
    };

    const handlePatternChange = (updated: Pattern) => {
        handlePersist(patterns.map((pattern) => (pattern.id === updated.id ? updated : pattern)));
    };

    const handleCreatePattern = () => {
        const now = new Date().toISOString();
        const baseName = 'Pattern';
        let name = baseName;
        const existingNames = new Set(patterns.map((pattern) => pattern.name));
        let suffix = 1;
        while (existingNames.has(name)) {
            name = `${baseName} ${suffix}`;
            suffix += 1;
        }
        const pattern: Pattern = {
            id: `pattern-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            createdAt: now,
            updatedAt: now,
            points: [],
        };
        const next = [...patterns, pattern];
        handlePersist(next);
        handleSelectPattern(pattern.id);
    };

    const handleDeletePattern = (patternId: string) => {
        const next = patterns.filter((pattern) => pattern.id !== patternId);
        handlePersist(next);
        if (selectedPatternId === patternId) {
            handleSelectPattern(next[0]?.id ?? null);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <section className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-gray-100">Patterns</h2>
                <button
                    type="button"
                    onClick={handleCreatePattern}
                    className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
                >
                    Create Pattern
                </button>
            </section>

            <div className="flex flex-col gap-4 rounded-lg bg-gray-800/50 p-4 shadow-lg ring-1 ring-white/10 md:flex-row">
                <div className="w-full md:w-64 md:flex-shrink-0">
                    <h3 className="mb-2 text-sm font-semibold text-gray-200">Pattern Library</h3>
                    {patterns.length === 0 ? (
                        <p className="text-sm text-gray-500">No patterns yet.</p>
                    ) : (
                        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
                            {patterns.map((pattern) => {
                                const isSelected = pattern.id === selectedPatternId;
                                return (
                                    <li key={pattern.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectPattern(pattern.id)}
                                            className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left ${
                                                isSelected
                                                    ? 'bg-cyan-900/60 text-cyan-100'
                                                    : 'bg-gray-900/40 text-gray-200 hover:bg-gray-800'
                                            }`}
                                        >
                                            <span className="truncate">{pattern.name}</span>
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    if (
                                                        window.confirm(
                                                            `Delete pattern "${pattern.name}"?`,
                                                        )
                                                    ) {
                                                        handleDeletePattern(pattern.id);
                                                    }
                                                }}
                                                className="ml-2 rounded bg-red-900/70 px-1.5 py-0.5 text-xs text-red-100 hover:bg-red-800"
                                            >
                                                Delete
                                            </button>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="flex min-h-[320px] flex-1 flex-col gap-4 rounded-md bg-gray-900/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                            <span className="uppercase tracking-wide text-gray-400">Mode</span>
                            <div className="inline-flex rounded-md bg-gray-800/70 p-1">
                                {(['placement', 'erase'] as PatternEditMode[]).map((mode) => {
                                    const isActive = editMode === mode;
                                    const hotkey = mode === 'placement' ? 'P' : 'E';
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => updateEditMode(mode)}
                                            className={`${
                                                isActive
                                                    ? 'bg-cyan-600 text-white'
                                                    : 'text-gray-300 hover:text-white'
                                            } rounded px-3 py-1 text-xs font-semibold transition`}
                                            aria-pressed={isActive}
                                        >
                                            {EDIT_MODE_LABEL[mode]} ({hotkey})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Keyboard shortcuts: press P for placement, E for erase.
                        </p>
                    </div>
                    <div className="flex flex-1 items-center justify-center">
                        {selectedPattern ? (
                            <PatternDesignerCanvas
                                pattern={selectedPattern}
                                editMode={editMode}
                                hoveredPointId={hoveredPatternPointId}
                                onChange={handlePatternChange}
                                onHoverChange={setHoverPoint}
                                onHoverPointChange={setHoveredPatternPointId}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">
                                Create a pattern to start editing.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <PatternDesignerDebugPanel
                pattern={selectedPattern}
                hoverPoint={hoverPoint}
                blobRadius={PATTERN_BLOB_RADIUS}
                editMode={editMode}
            />
        </div>
    );
};

export default PatternDesignerPage;
