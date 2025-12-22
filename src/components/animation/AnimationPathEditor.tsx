/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
import React, { useCallback, useRef, useState } from 'react';

import TransformToolbar from '@/components/common/TransformToolbar';
import { createWaypointId } from '@/services/animationStorage';
import type { AnimationPath, AnimationWaypoint } from '@/types/animation';
import { centeredToView, viewToCentered, centeredDeltaToView } from '@/utils/coordinates';

export interface TileBound {
    id: string;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

interface AnimationPathEditorProps {
    path: AnimationPath | null;
    allPaths: AnimationPath[];
    selectedPathId: string | null;
    onUpdatePath: (path: AnimationPath) => void;
    blobRadius?: number;
    disabled?: boolean;
    /** Calibration tile bounds to display */
    tileBounds?: TileBound[];
    /** Whether to show the tile bounds overlay */
    showBounds?: boolean;
    /** Callback when bounds toggle is clicked */
    onShowBoundsChange?: (show: boolean) => void;
    /** Whether bounds can be shown (calibration profile selected) */
    canShowBounds?: boolean;
    /** Set of waypoint IDs that are invalid (out of bounds) */
    invalidWaypointIds?: Set<string>;
    /** Transform callback: shift path waypoints */
    onShift?: (dx: number, dy: number) => void;
    /** Transform callback: scale path waypoints */
    onScale?: (scaleX: number, scaleY: number) => void;
    /** Transform callback: rotate path waypoints */
    onRotate?: (angleDeg: number) => void;
    /** Whether undo is available */
    canUndo?: boolean;
    /** Whether redo is available */
    canRedo?: boolean;
    /** Undo callback */
    onUndo?: () => void;
    /** Redo callback */
    onRedo?: () => void;
}

type EditMode = 'add' | 'move' | 'delete';

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const AnimationPathEditor: React.FC<AnimationPathEditorProps> = ({
    path,
    allPaths,
    selectedPathId,
    onUpdatePath,
    blobRadius = 0.04,
    disabled = false,
    tileBounds = [],
    showBounds = false,
    onShowBoundsChange,
    canShowBounds = false,
    invalidWaypointIds,
    onShift,
    onScale,
    onRotate,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [editMode, setEditMode] = useState<EditMode>('add');
    const [draggingWaypointId, setDraggingWaypointId] = useState<string | null>(null);
    const [hoveredWaypointId, setHoveredWaypointId] = useState<string | null>(null);

    const getMousePosition = useCallback(
        (event: React.MouseEvent): { x: number; y: number } | null => {
            if (!containerRef.current) return null;
            const bounds = containerRef.current.getBoundingClientRect();
            const size = Math.min(bounds.width, bounds.height);
            const originX = bounds.left + (bounds.width - size) / 2;
            const originY = bounds.top + (bounds.height - size) / 2;
            const viewX = clampUnit((event.clientX - originX) / size);
            const viewY = clampUnit((event.clientY - originY) / size);
            return {
                x: viewToCentered(viewX),
                y: viewToCentered(viewY),
            };
        },
        [],
    );

    const handleCanvasClick = useCallback(
        (event: React.MouseEvent) => {
            if (disabled || !path || editMode !== 'add') return;

            const pos = getMousePosition(event);
            if (!pos) return;

            const newWaypoint: AnimationWaypoint = {
                id: createWaypointId(),
                x: pos.x,
                y: pos.y,
            };

            onUpdatePath({
                ...path,
                waypoints: [...path.waypoints, newWaypoint],
            });
        },
        [disabled, path, editMode, getMousePosition, onUpdatePath],
    );

    const handleWaypointClick = useCallback(
        (event: React.MouseEvent, waypointId: string) => {
            event.stopPropagation();
            if (disabled || !path) return;

            if (editMode === 'delete') {
                onUpdatePath({
                    ...path,
                    waypoints: path.waypoints.filter((w) => w.id !== waypointId),
                });
            }
        },
        [disabled, path, editMode, onUpdatePath],
    );

    const handleWaypointMouseDown = useCallback(
        (event: React.MouseEvent, waypointId: string) => {
            event.stopPropagation();
            if (disabled || editMode !== 'move') return;
            setDraggingWaypointId(waypointId);
        },
        [disabled, editMode],
    );

    const handleMouseMove = useCallback(
        (event: React.MouseEvent) => {
            if (!draggingWaypointId || !path) return;

            const pos = getMousePosition(event);
            if (!pos) return;

            onUpdatePath({
                ...path,
                waypoints: path.waypoints.map((w) =>
                    w.id === draggingWaypointId ? { ...w, x: pos.x, y: pos.y } : w,
                ),
            });
        },
        [draggingWaypointId, path, getMousePosition, onUpdatePath],
    );

    const handleMouseUp = useCallback(() => {
        setDraggingWaypointId(null);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setDraggingWaypointId(null);
        setHoveredWaypointId(null);
    }, []);

    // Get path colors for visualization
    const getPathColor = (pathId: string, isSelected: boolean): string => {
        if (isSelected) return '#22d3ee'; // cyan-400
        const colors = ['#f472b6', '#a78bfa', '#4ade80', '#fbbf24', '#f87171'];
        const index = allPaths.findIndex((p) => p.id === pathId);
        return colors[index % colors.length];
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Edit Mode Toolbar */}
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">Mode:</span>
                <div className="flex gap-1">
                    {(['add', 'move', 'delete'] as EditMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setEditMode(mode)}
                            disabled={disabled || !path}
                            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                                editMode === mode
                                    ? 'bg-cyan-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            {mode === 'add' && 'Add (A)'}
                            {mode === 'move' && 'Move (M)'}
                            {mode === 'delete' && 'Delete (D)'}
                        </button>
                    ))}
                </div>
                {/* Show Bounds toggle */}
                {onShowBoundsChange && (
                    <button
                        type="button"
                        onClick={() => onShowBoundsChange(!showBounds)}
                        disabled={!canShowBounds || disabled}
                        aria-pressed={showBounds}
                        className={`ml-2 rounded px-3 py-1 text-xs font-medium transition-colors ${
                            showBounds
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        } ${!canShowBounds ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={
                            canShowBounds
                                ? 'Toggle calibration tile bounds overlay'
                                : 'Select a calibration profile to view bounds'
                        }
                    >
                        Show Bounds
                    </button>
                )}
                {/* Undo/Redo */}
                {(onUndo || onRedo) && (
                    <div className="ml-auto flex items-center gap-1">
                        <button
                            type="button"
                            onClick={onUndo}
                            disabled={!canUndo || disabled}
                            className="rounded px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            title="Undo (Cmd+Z)"
                        >
                            Undo
                        </button>
                        <button
                            type="button"
                            onClick={onRedo}
                            disabled={!canRedo || disabled}
                            className="rounded px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            title="Redo (Cmd+Shift+Z)"
                        >
                            Redo
                        </button>
                    </div>
                )}
                {path && !(onUndo || onRedo) && (
                    <span className="ml-auto text-xs text-gray-500">
                        {path.waypoints.length} waypoint(s)
                    </span>
                )}
                {path && (onUndo || onRedo) && (
                    <span className="text-xs text-gray-500">
                        {path.waypoints.length} waypoint(s)
                    </span>
                )}
            </div>

            {/* Transform Toolbar */}
            {onShift && onScale && onRotate && (
                <TransformToolbar
                    onShift={onShift}
                    onScale={onScale}
                    onRotate={onRotate}
                    disabled={disabled || !path}
                />
            )}

            {/*
              Canvas for interactive path editing. Uses role="application" to indicate
              this is a custom interactive widget which needs mouse/keyboard handlers
              and tabIndex for accessibility.
            */}
            <div
                ref={containerRef}
                role="application"
                tabIndex={0}
                aria-label="Path editor canvas - press A to add, M to move, D to delete waypoints"
                className={`relative aspect-square w-full max-w-lg bg-gray-900 ${
                    disabled
                        ? 'cursor-not-allowed'
                        : editMode === 'add'
                          ? 'cursor-crosshair'
                          : 'cursor-default'
                }`}
                onClick={handleCanvasClick}
                onKeyDown={(e) => {
                    if (e.key === 'a') setEditMode('add');
                    if (e.key === 'm') setEditMode('move');
                    if (e.key === 'd') setEditMode('delete');
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            >
                <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" className="size-full">
                    {/* Background */}
                    <rect x={0} y={0} width={1} height={1} fill="rgb(15,23,42)" />

                    {/* Grid lines */}
                    <line
                        x1={0}
                        y1={centeredToView(0)}
                        x2={1}
                        y2={centeredToView(0)}
                        stroke="rgba(148, 163, 184, 0.2)"
                        strokeWidth={0.002}
                    />
                    <line
                        x1={centeredToView(0)}
                        y1={0}
                        x2={centeredToView(0)}
                        y2={1}
                        stroke="rgba(148, 163, 184, 0.2)"
                        strokeWidth={0.002}
                    />

                    {/* Calibration tile bounds */}
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

                    {/* Render all paths (non-selected as faded) */}
                    {allPaths.map((p) => {
                        const isSelected = p.id === selectedPathId;
                        const color = getPathColor(p.id, isSelected);
                        const opacity = isSelected ? 1 : 0.3;

                        return (
                            <g key={p.id} opacity={opacity}>
                                {/* Path lines */}
                                {p.waypoints.length > 1 &&
                                    p.waypoints.slice(0, -1).map((wp, i) => {
                                        const next = p.waypoints[i + 1];
                                        return (
                                            <line
                                                key={`line-${wp.id}-${next.id}`}
                                                x1={centeredToView(wp.x)}
                                                y1={centeredToView(wp.y)}
                                                x2={centeredToView(next.x)}
                                                y2={centeredToView(next.y)}
                                                stroke={color}
                                                strokeWidth={0.004}
                                                strokeLinecap="round"
                                                pointerEvents="none"
                                            />
                                        );
                                    })}

                                {/* Direction arrows on lines */}
                                {isSelected &&
                                    p.waypoints.length > 1 &&
                                    p.waypoints.slice(0, -1).map((wp, i) => {
                                        const next = p.waypoints[i + 1];
                                        const midX =
                                            (centeredToView(wp.x) + centeredToView(next.x)) / 2;
                                        const midY =
                                            (centeredToView(wp.y) + centeredToView(next.y)) / 2;
                                        const dx = centeredToView(next.x) - centeredToView(wp.x);
                                        const dy = centeredToView(next.y) - centeredToView(wp.y);
                                        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                                        return (
                                            <g
                                                key={`arrow-${wp.id}`}
                                                transform={`translate(${midX},${midY}) rotate(${angle})`}
                                            >
                                                <polygon
                                                    points="0.015,0 0.005,0.006 0.005,-0.006"
                                                    fill={color}
                                                />
                                            </g>
                                        );
                                    })}

                                {/* Waypoints */}
                                {p.waypoints.map((wp, index) => {
                                    const viewX = centeredToView(wp.x);
                                    const viewY = centeredToView(wp.y);
                                    const radius = centeredDeltaToView(blobRadius) * 0.6;
                                    const isHovered = hoveredWaypointId === wp.id;
                                    const isDragging = draggingWaypointId === wp.id;
                                    const isFirst = index === 0;
                                    const isLast = index === p.waypoints.length - 1;
                                    const isInvalid = invalidWaypointIds?.has(wp.id) ?? false;

                                    return (
                                        <g key={wp.id}>
                                            {/* Waypoint circle */}
                                            <circle
                                                cx={viewX}
                                                cy={viewY}
                                                r={radius}
                                                fill={
                                                    isDragging
                                                        ? '#fff'
                                                        : isFirst
                                                          ? '#4ade80'
                                                          : isLast
                                                            ? '#f87171'
                                                            : color
                                                }
                                                stroke={
                                                    isInvalid
                                                        ? '#ef4444'
                                                        : isHovered && editMode === 'delete'
                                                          ? '#f87171'
                                                          : '#fff'
                                                }
                                                strokeWidth={isInvalid ? 0.006 : 0.003}
                                                style={{
                                                    cursor: isSelected
                                                        ? editMode === 'move'
                                                            ? 'grab'
                                                            : editMode === 'delete'
                                                              ? 'pointer'
                                                              : 'default'
                                                        : 'default',
                                                }}
                                                onMouseDown={(e) =>
                                                    isSelected && handleWaypointMouseDown(e, wp.id)
                                                }
                                                onClick={(e) =>
                                                    isSelected && handleWaypointClick(e, wp.id)
                                                }
                                                onMouseEnter={() =>
                                                    isSelected && setHoveredWaypointId(wp.id)
                                                }
                                                onMouseLeave={() => setHoveredWaypointId(null)}
                                            />
                                            {/* Index label */}
                                            {isSelected && (
                                                <text
                                                    x={viewX}
                                                    y={viewY + 0.004}
                                                    textAnchor="middle"
                                                    fontSize={0.025}
                                                    fill="#000"
                                                    fontWeight="bold"
                                                    pointerEvents="none"
                                                >
                                                    {index + 1}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>

                {/* Empty state */}
                {!path && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-sm text-gray-500">
                            Select or create a path to start editing
                        </p>
                    </div>
                )}

                {path && path.waypoints.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <p className="text-sm text-gray-500">Click to add waypoints</p>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <span className="inline-block size-2 rounded-full bg-green-400" />
                    Start
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block size-2 rounded-full bg-red-400" />
                    End
                </span>
            </div>
        </div>
    );
};

export default AnimationPathEditor;
