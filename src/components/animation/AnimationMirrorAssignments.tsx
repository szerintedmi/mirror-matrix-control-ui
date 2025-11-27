import React from 'react';

import type { AnimationPath, IndependentModeConfig, MirrorPathAssignment } from '@/types/animation';

interface AnimationMirrorAssignmentsProps {
    config: IndependentModeConfig | undefined;
    paths: AnimationPath[];
    gridSize: { rows: number; cols: number };
    onChange: (config: IndependentModeConfig) => void;
    disabled?: boolean;
}

const AnimationMirrorAssignments: React.FC<AnimationMirrorAssignmentsProps> = ({
    config,
    paths,
    gridSize,
    onChange,
    disabled = false,
}) => {
    const assignments = config?.assignments ?? [];

    const getMirrorAssignment = (row: number, col: number): MirrorPathAssignment | undefined => {
        const mirrorId = `${row}-${col}`;
        return assignments.find((a) => a.mirrorId === mirrorId);
    };

    const handleAssignmentChange = (row: number, col: number, pathId: string) => {
        const mirrorId = `${row}-${col}`;
        const existingIndex = assignments.findIndex((a) => a.mirrorId === mirrorId);

        let newAssignments: MirrorPathAssignment[];

        if (pathId === '') {
            // Remove assignment
            newAssignments = assignments.filter((a) => a.mirrorId !== mirrorId);
        } else if (existingIndex >= 0) {
            // Update existing
            newAssignments = assignments.map((a, i) =>
                i === existingIndex ? { ...a, pathId } : a,
            );
        } else {
            // Add new
            newAssignments = [...assignments, { mirrorId, row, col, pathId }];
        }

        onChange({ assignments: newAssignments });
    };

    const handleClearAll = () => {
        onChange({ assignments: [] });
    };

    const handleAutoAssign = () => {
        // Auto-assign paths to mirrors in order
        const newAssignments: MirrorPathAssignment[] = [];
        let pathIndex = 0;

        for (let row = 0; row < gridSize.rows; row++) {
            for (let col = 0; col < gridSize.cols; col++) {
                if (paths.length > 0) {
                    const path = paths[pathIndex % paths.length];
                    newAssignments.push({
                        mirrorId: `${row}-${col}`,
                        row,
                        col,
                        pathId: path.id,
                    });
                    pathIndex++;
                }
            }
        }

        onChange({ assignments: newAssignments });
    };

    const getPathColor = (pathId: string): string => {
        const colors = ['#22d3ee', '#f472b6', '#a78bfa', '#4ade80', '#fbbf24', '#f87171'];
        const index = paths.findIndex((p) => p.id === pathId);
        return colors[index % colors.length];
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-200">Mirror Assignments</h3>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleAutoAssign}
                        disabled={disabled || paths.length === 0}
                        className="rounded px-2 py-1 text-xs font-medium text-cyan-400 hover:bg-cyan-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Auto-assign
                    </button>
                    <button
                        type="button"
                        onClick={handleClearAll}
                        disabled={disabled || assignments.length === 0}
                        className="rounded px-2 py-1 text-xs font-medium text-gray-400 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Clear all
                    </button>
                </div>
            </div>

            {paths.length === 0 ? (
                <p className="text-sm text-amber-400">
                    Create paths first to assign them to mirrors.
                </p>
            ) : (
                <>
                    {/* Grid View */}
                    <div
                        className="grid gap-1"
                        style={{
                            gridTemplateColumns: `repeat(${gridSize.cols}, minmax(0, 1fr))`,
                        }}
                    >
                        {Array.from({ length: gridSize.rows }).map((_, row) =>
                            Array.from({ length: gridSize.cols }).map((_, col) => {
                                const assignment = getMirrorAssignment(row, col);
                                const assignedPath = assignment
                                    ? paths.find((p) => p.id === assignment.pathId)
                                    : null;

                                return (
                                    <div
                                        key={`${row}-${col}`}
                                        className={`relative aspect-square rounded-md border ${
                                            assignedPath
                                                ? 'border-gray-600'
                                                : 'border-gray-700 border-dashed'
                                        } ${disabled ? 'opacity-50' : ''}`}
                                        style={{
                                            backgroundColor: assignedPath
                                                ? `${getPathColor(assignedPath.id)}20`
                                                : 'transparent',
                                        }}
                                    >
                                        <select
                                            value={assignment?.pathId ?? ''}
                                            onChange={(e) =>
                                                handleAssignmentChange(row, col, e.target.value)
                                            }
                                            disabled={disabled}
                                            className="absolute inset-0 h-full w-full cursor-pointer bg-transparent text-center text-xs text-gray-300 opacity-0 hover:opacity-100 focus:opacity-100"
                                            title={`Mirror ${row}-${col}`}
                                        >
                                            <option value="">None</option>
                                            {paths.map((path) => (
                                                <option key={path.id} value={path.id}>
                                                    {path.name}
                                                </option>
                                            ))}
                                        </select>
                                        {assignedPath && (
                                            <div
                                                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                                                style={{ color: getPathColor(assignedPath.id) }}
                                            >
                                                <span className="text-xs font-bold">
                                                    {paths.findIndex(
                                                        (p) => p.id === assignedPath.id,
                                                    ) + 1}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            }),
                        )}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-2">
                        {paths.map((path, index) => (
                            <div
                                key={path.id}
                                className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1"
                            >
                                <span
                                    className="inline-block h-3 w-3 rounded-full"
                                    style={{ backgroundColor: getPathColor(path.id) }}
                                />
                                <span className="text-xs text-gray-300">
                                    {index + 1}: {path.name}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Stats */}
                    <p className="text-xs text-gray-500">
                        {assignments.length} of {gridSize.rows * gridSize.cols} mirrors assigned
                    </p>
                </>
            )}
        </div>
    );
};

export default AnimationMirrorAssignments;
