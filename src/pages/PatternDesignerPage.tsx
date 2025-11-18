import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CalibrationProfileSelector, {
    sortCalibrationProfiles,
} from '@/components/calibration/CalibrationProfileSelector';
import Modal from '@/components/Modal';
import PatternDesignerDebugPanel from '@/components/patternDesigner/PatternDesignerDebugPanel';
import type { DesignerCoordinate, PatternEditMode } from '@/components/patternDesigner/types';
import {
    loadCalibrationProfiles,
    loadLastCalibrationProfileId,
    persistLastCalibrationProfileId,
} from '@/services/calibrationProfileStorage';
import { loadPatterns, persistPatterns } from '@/services/patternStorage';
import type { CalibrationProfile, Pattern, PatternPoint } from '@/types';
import { centeredDeltaToView, centeredToView, viewToCentered } from '@/utils/centeredCoordinates';

interface PatternDesignerCanvasProps {
    pattern: Pattern;
    editMode: PatternEditMode;
    hoveredPointId: string | null;
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
}

interface RenameDialogState {
    patternId: string;
    value: string;
}

const DEFAULT_BLOB_RADIUS = 0.04;
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
    blobRadius,
    showBounds,
    tileBounds,
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
    const [renameState, setRenameState] = useState<RenameDialogState | null>(null);
    const [showBounds, setShowBounds] = useState(false);
    const renameInputId = 'pattern-rename-input';
    const isRenameDisabled = !renameState || renameState.value.trim().length === 0;
    const initialCalibrationState = useMemo(() => {
        const entries = sortCalibrationProfiles(loadCalibrationProfiles(resolvedStorage));
        const lastSelected = loadLastCalibrationProfileId(resolvedStorage);
        const selected =
            lastSelected && entries.some((entry) => entry.id === lastSelected)
                ? lastSelected
                : (entries[0]?.id ?? '');
        return { entries, selected };
    }, [resolvedStorage]);
    const [calibrationProfiles, setCalibrationProfiles] = useState<CalibrationProfile[]>(
        initialCalibrationState.entries,
    );
    const [selectedCalibrationProfileId, setSelectedCalibrationProfileId] = useState(
        initialCalibrationState.selected,
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
    const refreshCalibrationProfiles = useCallback(() => {
        const nextEntries = sortCalibrationProfiles(loadCalibrationProfiles(resolvedStorage));
        setCalibrationProfiles(nextEntries);
        if (nextEntries.length === 0) {
            setSelectedCalibrationProfileId('');
            persistLastCalibrationProfileId(resolvedStorage, null);
            return;
        }
        if (!nextEntries.some((entry) => entry.id === selectedCalibrationProfileId)) {
            const fallback = nextEntries[0].id;
            setSelectedCalibrationProfileId(fallback);
            persistLastCalibrationProfileId(resolvedStorage, fallback);
        }
    }, [resolvedStorage, selectedCalibrationProfileId]);
    const handleSelectCalibrationProfile = useCallback(
        (profileId: string) => {
            setSelectedCalibrationProfileId(profileId);
            persistLastCalibrationProfileId(resolvedStorage, profileId || null);
        },
        [resolvedStorage],
    );
    const selectedCalibrationProfile = useMemo(
        () =>
            calibrationProfiles.find((profile) => profile.id === selectedCalibrationProfileId) ??
            null,
        [calibrationProfiles, selectedCalibrationProfileId],
    );
    const calibratedBlobRadius = useMemo(() => {
        const radius = selectedCalibrationProfile?.calibrationSpace.blobStats?.maxDiameter;
        if (typeof radius === 'number' && Number.isFinite(radius) && radius > 0) {
            return radius;
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

    const handleSelectPattern = useCallback(
        (patternId: string | null) => {
            setSelectedPatternId(patternId);
            setHoverPoint(null);
            setHoveredPatternPointId(null);
        },
        [setHoverPoint, setHoveredPatternPointId, setSelectedPatternId],
    );

    const handlePersist = useCallback(
        (nextPatterns: Pattern[]) => {
            setPatterns(nextPatterns);
            persistPatterns(resolvedStorage, nextPatterns);
        },
        [resolvedStorage],
    );

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
        if (renameState?.patternId === patternId) {
            setRenameState(null);
        }
        const next = patterns.filter((pattern) => pattern.id !== patternId);
        handlePersist(next);
        if (selectedPatternId === patternId) {
            handleSelectPattern(next[0]?.id ?? null);
        }
    };

    const handleOpenRenameModal = useCallback((pattern: Pattern) => {
        setRenameState({ patternId: pattern.id, value: pattern.name });
    }, []);

    const handleRenameInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setRenameState((previous) => (previous ? { ...previous, value } : previous));
    }, []);

    const handleCloseRenameModal = useCallback(() => {
        setRenameState(null);
    }, []);

    const handleRenameSubmit = useCallback(
        (event?: React.FormEvent<HTMLFormElement>) => {
            event?.preventDefault();
            if (!renameState) {
                return;
            }
            const nextName = renameState.value.trim();
            if (!nextName) {
                return;
            }
            const now = new Date().toISOString();
            const nextPatterns = patterns.map((pattern) =>
                pattern.id === renameState.patternId
                    ? {
                          ...pattern,
                          name: nextName,
                          updatedAt: now,
                      }
                    : pattern,
            );
            handlePersist(nextPatterns);
            setRenameState(null);
        },
        [handlePersist, patterns, renameState],
    );

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
                                        <div
                                            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors ${
                                                isSelected
                                                    ? 'bg-cyan-900/60 text-cyan-100'
                                                    : 'bg-gray-900/40 text-gray-200 hover:bg-gray-800'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => handleSelectPattern(pattern.id)}
                                                className="flex-1 truncate text-left text-sm font-medium text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                                            >
                                                {pattern.name}
                                            </button>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleOpenRenameModal(pattern);
                                                    }}
                                                    className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                                                    aria-label={`Rename pattern ${pattern.name}`}
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth={1.5}
                                                        className="h-4 w-4"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M16.862 4.487l2.651 2.651a1.5 1.5 0 010 2.122l-8.19 8.19a2.25 2.25 0 01-.948.57l-3.356 1.007 1.007-3.356a2.25 2.25 0 01.57-.948l8.19-8.19a1.5 1.5 0 012.121 0z"
                                                        />
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M19.5 13.5V19.5A1.5 1.5 0 0118 21H5.25A1.5 1.5 0 013.75 19.5V6A1.5 1.5 0 015.25 4.5H11.25"
                                                        />
                                                    </svg>
                                                </button>
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
                                                    className="rounded p-1 text-gray-400 hover:bg-red-900/40 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                                                    aria-label={`Delete pattern ${pattern.name}`}
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth={1.5}
                                                        className="h-4 w-4"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M9.75 4.5l-.447 1.341a1.5 1.5 0 01-1.422 1.034H5.25m0 0h13.5m-13.5 0v12A1.5 1.5 0 006.75 20.25h10.5a1.5 1.5 0 001.5-1.5v-12m-9 3.75v6m4.5-6v6M9.75 4.5h4.5a1.5 1.5 0 011.422 1.034L16.5 6.875"
                                                        />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="flex min-h-[320px] flex-1 flex-col gap-4 rounded-md bg-gray-900/60 p-4">
                    <div className="rounded-md border border-gray-800/60 bg-gray-950/40 p-4">
                        <CalibrationProfileSelector
                            profiles={calibrationProfiles}
                            selectedProfileId={selectedCalibrationProfileId}
                            onSelect={handleSelectCalibrationProfile}
                            onRefresh={refreshCalibrationProfiles}
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
                    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-gray-200">
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
                        <button
                            type="button"
                            onClick={() => setShowBounds((previous) => !previous)}
                            disabled={!showSpotSummary}
                            aria-pressed={showBounds}
                            className={`rounded px-3 py-1 text-xs font-semibold transition ${
                                showBounds
                                    ? 'bg-cyan-600 text-white'
                                    : 'text-gray-300 hover:text-white'
                            } ${!showSpotSummary ? 'cursor-not-allowed opacity-50 hover:text-gray-300' : ''}`}
                            title={
                                showSpotSummary
                                    ? 'Toggle calibration tile bounds overlay'
                                    : 'Select a calibration profile to view bounds'
                            }
                        >
                            Show Bounds
                        </button>
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
                                blobRadius={calibratedBlobRadius}
                                showBounds={
                                    showBounds &&
                                    showSpotSummary &&
                                    calibrationTileBounds.length > 0
                                }
                                tileBounds={calibrationTileBounds}
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
                blobRadius={calibratedBlobRadius}
                editMode={editMode}
                calibrationTileBounds={calibrationTileBounds}
            />

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
