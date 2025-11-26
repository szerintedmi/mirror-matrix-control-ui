import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import CalibrationProfileSelector from '@/components/calibration/CalibrationProfileSelector';
import Modal from '@/components/Modal';
import PatternDesignerDebugPanel from '@/components/patternDesigner/PatternDesignerDebugPanel';
import PatternDesignerToolbar from '@/components/patternDesigner/PatternDesignerToolbar';
import type { DesignerCoordinate, PatternEditMode } from '@/components/patternDesigner/types';
import PatternLibraryList from '@/components/PatternLibraryList';
import { useCalibrationContext } from '@/context/CalibrationContext';
import { usePatternContext } from '@/context/PatternContext';
import { usePlaybackDispatch } from '@/hooks/usePlaybackDispatch';
import { loadGridState } from '@/services/gridStorage';
import { planProfilePlayback } from '@/services/profilePlaybackPlanner';
import type { MirrorConfig, Pattern, PatternPoint } from '@/types';
import { centeredDeltaToView, centeredToView, viewToCentered } from '@/utils/centeredCoordinates';
import {
    createHistoryStacks,
    pushHistorySnapshot,
    redoHistorySnapshot,
    undoHistorySnapshot,
    type HistoryStacks,
} from '@/utils/history';
import {
    transformPatternRotate,
    transformPatternScale,
    transformPatternShift,
} from '@/utils/patternTransforms';

import { calculateMaxOverlapCount } from '../utils/patternOverlaps';

interface PatternDesignerCanvasProps {
    pattern: Pattern;
    editMode: PatternEditMode;
    hoveredPointId: string | null;
    hoverPoint: DesignerCoordinate | null;
    onChange: (nextPattern: Pattern) => void;
    onHoverChange?: (point: DesignerCoordinate | null) => void;
    onHoverPointChange?: (pointId: string | null) => void;
    blobRadius: number;
    showBounds: boolean;
    tileBounds: Array<{
        id: string;
        xMin: number;
        xMax: number;
        yMin: number;
        yMax: number;
    }>;
    invalidPointIds: Set<string>;
    maxOverlapCount: number;
}

interface RenameDialogState {
    patternId: string;
    value: string;
}

const DEFAULT_BLOB_RADIUS = 0.04;
const HISTORY_LIMIT = 50;

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
    hoverPoint,
    onChange,
    onHoverChange,
    onHoverPointChange,
    blobRadius,
    showBounds,
    tileBounds,
    invalidPointIds,
    maxOverlapCount,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dragStateRef = useRef<{
        activePointId: string | null;
        moved: boolean;
        suppressNextPointClick: boolean;
    }>({ activePointId: null, moved: false, suppressNextPointClick: false });
    const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

    const overlapFilterId = useId();
    const baseFillOpacity = maxOverlapCount > 0 ? 1 / maxOverlapCount : 1;
    const maxCompositeAlpha =
        maxOverlapCount > 0 ? 1 - Math.pow(1 - baseFillOpacity, maxOverlapCount) : 1;
    const alphaSlope = maxCompositeAlpha > 0 ? 1 / maxCompositeAlpha : 1;
    const normalizedAlphaSlope = Number.isFinite(alphaSlope) ? alphaSlope : 1;

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
        const target = event.target as SVGGraphicsElement | HTMLElement;
        const { activePointId, moved } = dragStateRef.current;
        const endedOnDraggedPoint =
            target instanceof SVGGraphicsElement &&
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
        (event: React.MouseEvent<SVGGraphicsElement>, pointId: string) => {
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
                    <defs>
                        <filter
                            id={overlapFilterId}
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            filterUnits="objectBoundingBox"
                            colorInterpolationFilters="sRGB"
                        >
                            <feComponentTransfer>
                                <feFuncR type="identity" />
                                <feFuncG type="identity" />
                                <feFuncB type="identity" />
                                <feFuncA type="linear" slope={normalizedAlphaSlope} intercept={0} />
                            </feComponentTransfer>
                        </filter>
                    </defs>
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
                    <g filter={`url(#${overlapFilterId})`}>
                        {pattern.points.map((point) => {
                            const viewX = centeredToView(point.x);
                            const viewY = centeredToView(point.y);
                            const halfSize = centeredDeltaToView(blobRadius);
                            const size = halfSize * 2;
                            return (
                                <rect
                                    key={`fill-${point.id}`}
                                    x={viewX - halfSize}
                                    y={viewY - halfSize}
                                    width={size}
                                    height={size}
                                    fill="#f8fafc"
                                    fillOpacity={baseFillOpacity}
                                    pointerEvents="none"
                                />
                            );
                        })}
                    </g>
                    {pattern.points.map((point) => {
                        const isEraseHover = editMode === 'erase' && hoveredPointId === point.id;
                        const isInvalid = invalidPointIds.has(point.id);
                        const viewX = centeredToView(point.x);
                        const viewY = centeredToView(point.y);
                        const halfSize = centeredDeltaToView(blobRadius);
                        const size = halfSize * 2;
                        return (
                            <rect
                                key={point.id}
                                data-point-id={point.id}
                                x={viewX - halfSize}
                                y={viewY - halfSize}
                                width={size}
                                height={size}
                                fill="transparent"
                                stroke={
                                    isEraseHover
                                        ? '#fecaca'
                                        : isInvalid
                                          ? '#ef4444'
                                          : 'rgba(148, 163, 184, 0.35)'
                                }
                                strokeWidth={isEraseHover || isInvalid ? 0.006 : 0.004}
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
                    {editMode === 'placement' && hoverPoint && (
                        <rect
                            x={centeredToView(hoverPoint.x) - centeredDeltaToView(blobRadius)}
                            y={centeredToView(hoverPoint.y) - centeredDeltaToView(blobRadius)}
                            width={centeredDeltaToView(blobRadius) * 2}
                            height={centeredDeltaToView(blobRadius) * 2}
                            fill="#22d3ee"
                            fillOpacity={0.3}
                            stroke="#22d3ee"
                            strokeWidth={0.002}
                            strokeDasharray="0.01 0.01"
                            pointerEvents="none"
                        />
                    )}
                    {showBounds &&
                        tileBounds.map((bound) => {
                            const xMin = centeredToView(bound.xMin);
                            const xMax = centeredToView(bound.xMax);
                            const yMin = centeredToView(bound.yMin);
                            const yMax = centeredToView(bound.yMax);
                            const width = Math.max(0, xMax - xMin);
                            const height = Math.max(0, yMax - yMin);
                            return (
                                <rect
                                    key={`bounds-${bound.id}`}
                                    x={xMin}
                                    y={yMin}
                                    width={width}
                                    height={height}
                                    fill="none"
                                    stroke="rgba(250, 204, 21, 0.45)"
                                    strokeWidth={0.0008}
                                    pointerEvents="none"
                                />
                            );
                        })}
                </svg>
            </div>
        </div>
    );
};

interface PatternDesignerPageProps {
    gridSize?: { rows: number; cols: number };
    mirrorConfig?: MirrorConfig;
}

const PatternDesignerPage: React.FC<PatternDesignerPageProps> = ({
    gridSize: propsGridSize,
    mirrorConfig: propsMirrorConfig,
}) => {
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );
    const [gridSnapshot] = useState(() => loadGridState(resolvedStorage));

    const gridSize = useMemo(
        () => propsGridSize ?? gridSnapshot?.gridSize ?? { rows: 8, cols: 8 },
        [propsGridSize, gridSnapshot],
    );
    const mirrorConfig = useMemo(
        () => propsMirrorConfig ?? new Map(gridSnapshot?.mirrorConfig ?? []),
        [propsMirrorConfig, gridSnapshot],
    );

    // Pattern Context
    const { patterns, selectedPatternId, selectPattern, addPattern, updatePattern, deletePattern } =
        usePatternContext();

    // Calibration Context
    const {
        profiles: calibrationProfiles,
        selectedProfileId: selectedCalibrationProfileId,
        selectProfile: selectCalibrationProfile,
        selectedProfile: selectedCalibrationProfile,
    } = useCalibrationContext();

    const { playSinglePattern } = usePlaybackDispatch({ gridSize, mirrorConfig });

    const [hoverPoint, setHoverPoint] = useState<DesignerCoordinate | null>(null);
    const [editMode, setEditMode] = useState<PatternEditMode>('placement');
    const [hoveredPatternPointId, setHoveredPatternPointId] = useState<string | null>(null);
    const [renameState, setRenameState] = useState<RenameDialogState | null>(null);
    const [showBounds, setShowBounds] = useState(false);

    // Derive selected pattern first, as it's needed by many handlers
    const selectedPattern = useMemo(
        () => patterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
        [patterns, selectedPatternId],
    );

    // Undo/Redo history
    const historyRef = useRef<HistoryStacks<Pattern>>(createHistoryStacks<Pattern>());
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

    const syncHistoryState = useCallback(() => {
        setHistoryState({
            canUndo: historyRef.current.past.length > 0,
            canRedo: historyRef.current.future.length > 0,
        });
    }, []);

    // Reset history when switching patterns
    useEffect(() => {
        historyRef.current = createHistoryStacks<Pattern>();
        syncHistoryState();
    }, [selectedPatternId, syncHistoryState]);

    const recordSnapshot = useCallback(
        (pattern: Pattern) => {
            historyRef.current = pushHistorySnapshot(historyRef.current, pattern, HISTORY_LIMIT);
            syncHistoryState();
        },
        [syncHistoryState],
    );

    const handleUndo = useCallback(() => {
        if (!selectedPattern || historyRef.current.past.length === 0) return;

        const result = undoHistorySnapshot(historyRef.current, selectedPattern);
        if (result.value === selectedPattern) return;

        historyRef.current = result.history;
        syncHistoryState();
        updatePattern(result.value);
    }, [selectedPattern, updatePattern, syncHistoryState]);

    const handleRedo = useCallback(() => {
        if (!selectedPattern || historyRef.current.future.length === 0) return;

        const result = redoHistorySnapshot(historyRef.current, selectedPattern);
        if (result.value === selectedPattern) return;

        historyRef.current = result.history;
        syncHistoryState();
        updatePattern(result.value);
    }, [selectedPattern, updatePattern, syncHistoryState]);

    // Transform handlers
    const handleShift = useCallback(
        (dx: number, dy: number) => {
            if (!selectedPattern) return;
            recordSnapshot(selectedPattern);
            const transformed = transformPatternShift(selectedPattern, dx, dy);
            updatePattern(transformed);
        },
        [selectedPattern, updatePattern, recordSnapshot],
    );

    const handleScale = useCallback(
        (scaleX: number, scaleY: number) => {
            if (!selectedPattern) return;
            recordSnapshot(selectedPattern);
            const transformed = transformPatternScale(selectedPattern, scaleX, scaleY);
            updatePattern(transformed);
        },
        [selectedPattern, updatePattern, recordSnapshot],
    );

    const handleRotate = useCallback(
        (angleDeg: number) => {
            if (!selectedPattern) return;
            recordSnapshot(selectedPattern);
            const transformed = transformPatternRotate(selectedPattern, angleDeg);
            updatePattern(transformed);
        },
        [selectedPattern, updatePattern, recordSnapshot],
    );

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

            // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows)
            if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                handleUndo();
                return;
            }

            // Redo: Cmd+Shift+Z (Mac) or Ctrl+Shift+Z (Windows) or Ctrl+Y
            if (
                ((event.metaKey || event.ctrlKey) && event.key === 'z' && event.shiftKey) ||
                ((event.metaKey || event.ctrlKey) && event.key === 'y')
            ) {
                event.preventDefault();
                handleRedo();
                return;
            }

            if (event.key === 'p' || event.key === 'P') {
                updateEditMode('placement');
            } else if (event.key === 'e' || event.key === 'E') {
                updateEditMode('erase');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [updateEditMode, handleUndo, handleRedo]);
    const calibratedBlobRadius = useMemo(() => {
        const diameter = selectedCalibrationProfile?.calibrationSpace.blobStats?.maxDiameter;
        if (typeof diameter === 'number' && Number.isFinite(diameter) && diameter > 0) {
            return diameter / 2;
        }
        return DEFAULT_BLOB_RADIUS;
    }, [selectedCalibrationProfile]);
    const placedSpotCount = selectedPattern?.points.length ?? 0;
    const availableSpotCount =
        selectedCalibrationProfile?.metrics.completedTiles ??
        selectedCalibrationProfile?.metrics.totalTiles ??
        0;
    const showSpotSummary = Boolean(selectedCalibrationProfile);
    const spotsOverCapacity = showSpotSummary && placedSpotCount > availableSpotCount;
    const calibrationTileBounds = useMemo(() => {
        if (!selectedCalibrationProfile) {
            return [];
        }
        return Object.entries(selectedCalibrationProfile.tiles)
            .map(([id, tile]) => {
                if (!tile.inferredBounds) {
                    return null;
                }
                return {
                    id,
                    xMin: tile.inferredBounds.x.min,
                    xMax: tile.inferredBounds.x.max,
                    yMin: tile.inferredBounds.y.min,
                    yMax: tile.inferredBounds.y.max,
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    }, [selectedCalibrationProfile]);

    const invalidPointIds = useMemo(() => {
        if (!selectedPattern || !selectedCalibrationProfile) return new Set<string>();

        // Use the playback planner to check for validity against the profile
        const plan = planProfilePlayback({
            pattern: selectedPattern,
            profile: selectedCalibrationProfile,
            gridSize,
            mirrorConfig,
        });

        if (plan.errors.length === 0) {
            return new Set<string>();
        }

        // Collect errors from the planner
        const plannerInvalidIds = new Set<string>();

        plan.errors.forEach((err) => {
            if (err.patternPointId) {
                plannerInvalidIds.add(err.patternPointId);
            }
        });

        // If we have specific point errors from the planner, use them.
        // (This covers capacity issues, out of bounds on specific axes, etc.)
        if (plannerInvalidIds.size > 0) {
            return plannerInvalidIds;
        }

        // If we have a grid mismatch (and thus no specific point errors),
        // OR if we have other global errors but no specific point errors,
        // we fall back to the geometric bounds check.
        // This is useful for "profile_grid_mismatch" so we can still see if points are roughly valid.
        // We also do this if there are NO specific errors but still global errors, just in case.
        const invalid = new Set<string>();
        const bounds = Object.values(selectedCalibrationProfile.tiles)
            .map((t) => {
                if (t.inferredBounds) {
                    return {
                        x: t.inferredBounds.x.min,
                        y: t.inferredBounds.y.min,
                        width: t.inferredBounds.x.max - t.inferredBounds.x.min,
                        height: t.inferredBounds.y.max - t.inferredBounds.y.min,
                    };
                }
                if (t.homeMeasurement) {
                    return {
                        x: t.homeMeasurement.x - t.homeMeasurement.size / 2,
                        y: t.homeMeasurement.y - t.homeMeasurement.size / 2,
                        width: t.homeMeasurement.size,
                        height: t.homeMeasurement.size,
                    };
                }
                return null;
            })
            .filter((b): b is NonNullable<typeof b> => Boolean(b));

        selectedPattern.points.forEach((pt) => {
            // Check if point is inside ANY bounding box
            const isInAny = bounds.some(
                (box) =>
                    pt.x >= box.x &&
                    pt.x <= box.x + box.width &&
                    pt.y >= box.y &&
                    pt.y <= box.y + box.height,
            );
            if (!isInAny) {
                invalid.add(pt.id);
            }
        });

        return invalid;
    }, [selectedPattern, selectedCalibrationProfile, gridSize, mirrorConfig]);

    const maxOverlapCount = useMemo(() => {
        if (!selectedPattern) return 0;
        return calculateMaxOverlapCount(selectedPattern.points, calibratedBlobRadius);
    }, [selectedPattern, calibratedBlobRadius]);

    // Handlers
    const handleCreatePattern = () => {
        const newPattern: Pattern = {
            id: `pattern-${globalThis.crypto.randomUUID()}`,
            name: `Pattern ${patterns.length + 1}`,
            points: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        addPattern(newPattern);
    };

    const handlePatternChange = useCallback(
        (updatedPattern: Pattern, pushToHistory: boolean = true) => {
            if (pushToHistory && selectedPattern) {
                recordSnapshot(selectedPattern);
            }
            updatePattern(updatedPattern);
        },
        [updatePattern, selectedPattern, recordSnapshot],
    );

    // Rename Modal Handlers
    const handleOpenRenameModal = (pattern: Pattern) => {
        setRenameState({ patternId: pattern.id, value: pattern.name });
    };

    const handleCloseRenameModal = () => {
        setRenameState(null);
    };

    const handleRenameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (renameState) {
            setRenameState({ ...renameState, value: e.target.value });
        }
    };

    const handleRenameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (renameState) {
            const pattern = patterns.find((p) => p.id === renameState.patternId);
            if (pattern) {
                updatePattern({
                    ...pattern,
                    name: renameState.value.trim() || pattern.name,
                    updatedAt: new Date().toISOString(),
                });
            }
            setRenameState(null);
        }
    };

    const renameInputId = 'rename-pattern-input';
    const isRenameDisabled = !renameState?.value.trim();

    const [quickPlayMessage, setQuickPlayMessage] = useState<{
        tone: 'success' | 'error';
        text: string;
    } | null>(null);

    const handleQuickPlay = useCallback(
        async (pattern: Pattern) => {
            if (!selectedCalibrationProfile) {
                setQuickPlayMessage({
                    tone: 'error',
                    text: 'Select a calibration profile to play.',
                });
                return;
            }

            setQuickPlayMessage({ tone: 'success', text: `Playing "${pattern.name}"...` });
            selectPattern(pattern.id);

            const result = await playSinglePattern(pattern, selectedCalibrationProfile);
            setQuickPlayMessage({
                tone: result.success ? 'success' : 'error',
                text: result.success
                    ? `Played "${pattern.name}" (${result.axisCount} axes)`
                    : result.message,
            });
        },
        [playSinglePattern, selectPattern, selectedCalibrationProfile],
    );

    return (
        <div className="flex h-full flex-wrap gap-6 overflow-y-auto p-6">
            {/* Left Sidebar: Pattern Library */}
            <div className="flex w-80 flex-none flex-col gap-4 rounded-lg bg-gray-900/50 p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-100">Patterns</h2>
                    <button
                        type="button"
                        onClick={handleCreatePattern}
                        className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
                    >
                        New
                    </button>
                </div>

                {quickPlayMessage && (
                    <p
                        className={`text-xs font-semibold ${
                            quickPlayMessage.tone === 'success'
                                ? 'text-emerald-300'
                                : 'text-amber-300'
                        }`}
                    >
                        {quickPlayMessage.text}
                    </p>
                )}

                <PatternLibraryList
                    patterns={patterns}
                    selectedPatternId={selectedPattern?.id ?? null}
                    onSelect={selectPattern}
                    onDelete={deletePattern}
                    onRename={handleOpenRenameModal}
                    onPlay={handleQuickPlay}
                    className="flex-1"
                />
            </div>

            {/* Main Content: Editor */}
            <div className="flex min-h-[500px] min-w-[500px] flex-1 flex-col gap-4 rounded-md bg-gray-900/60 p-4">
                <div className="rounded-md border border-gray-800/60 bg-gray-950/40 p-4">
                    <CalibrationProfileSelector
                        profiles={calibrationProfiles}
                        selectedProfileId={selectedCalibrationProfileId ?? ''}
                        onSelect={selectCalibrationProfile}
                        label="Calibration Profile (optional)"
                        placeholder="No calibration profiles"
                        selectClassName="min-w-[10rem] flex-none max-w-[14rem]"
                        rightAccessory={
                            showSpotSummary ? (
                                <span
                                    className={`whitespace-nowrap ${spotsOverCapacity ? 'text-red-300' : 'text-gray-300'}`}
                                >
                                    Spots: {placedSpotCount} / {availableSpotCount}
                                </span>
                            ) : null
                        }
                    />
                </div>
                <PatternDesignerToolbar
                    editMode={editMode}
                    onEditModeChange={updateEditMode}
                    onShift={handleShift}
                    onScale={handleScale}
                    onRotate={handleRotate}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    showBounds={showBounds}
                    onShowBoundsChange={setShowBounds}
                    canShowBounds={showSpotSummary}
                    blobRadius={calibratedBlobRadius}
                    disabled={!selectedPattern}
                />
                <div className="flex flex-1 items-center justify-center">
                    {selectedPattern ? (
                        <PatternDesignerCanvas
                            pattern={selectedPattern}
                            editMode={editMode}
                            hoveredPointId={hoveredPatternPointId}
                            hoverPoint={hoverPoint}
                            onChange={handlePatternChange}
                            onHoverChange={setHoverPoint}
                            onHoverPointChange={setHoveredPatternPointId}
                            blobRadius={calibratedBlobRadius}
                            showBounds={
                                showBounds && showSpotSummary && calibrationTileBounds.length > 0
                            }
                            tileBounds={calibrationTileBounds}
                            invalidPointIds={invalidPointIds}
                            maxOverlapCount={maxOverlapCount}
                        />
                    ) : (
                        <p className="text-sm text-gray-500">Create a pattern to start editing.</p>
                    )}
                </div>
            </div>

            <div className="w-96 flex-none">
                <PatternDesignerDebugPanel
                    pattern={selectedPattern}
                    hoverPoint={hoverPoint}
                    blobRadius={calibratedBlobRadius}
                    editMode={editMode}
                    calibrationTileBounds={calibrationTileBounds}
                />
            </div>

            <Modal
                open={Boolean(renameState)}
                onClose={handleCloseRenameModal}
                title="Rename Pattern"
                hideCloseButton
                disableOverlayClose
            >
                {renameState ? (
                    <form className="space-y-5" onSubmit={handleRenameSubmit}>
                        <div className="space-y-2">
                            <label
                                htmlFor={renameInputId}
                                className="text-sm font-medium text-gray-200"
                            >
                                Pattern Name
                            </label>
                            <input
                                id={renameInputId}
                                name="patternName"
                                type="text"
                                value={renameState.value}
                                onChange={handleRenameInputChange}
                                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCloseRenameModal}
                                className="rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isRenameDisabled}
                                className={`rounded-md px-4 py-2 text-sm font-semibold ${
                                    isRenameDisabled
                                        ? 'cursor-not-allowed bg-gray-700 text-gray-400'
                                        : 'bg-cyan-600 text-white hover:bg-cyan-500'
                                }`}
                            >
                                Rename
                            </button>
                        </div>
                    </form>
                ) : null}
            </Modal>
        </div>
    );
};

export default PatternDesignerPage;
