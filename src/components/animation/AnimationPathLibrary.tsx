import React, { useState } from 'react';

import type { AnimationPath } from '@/types/animation';

interface AnimationPathLibraryProps {
    paths: AnimationPath[];
    selectedPathId: string | null;
    onSelectPath: (pathId: string | null) => void;
    onCreatePath: (name: string) => void;
    onDeletePath: (pathId: string) => void;
    onRenamePath: (pathId: string, name: string) => void;
    disabled?: boolean;
}

const AnimationPathLibrary: React.FC<AnimationPathLibraryProps> = ({
    paths,
    selectedPathId,
    onSelectPath,
    onCreatePath,
    onDeletePath,
    onRenamePath,
    disabled = false,
}) => {
    const [newPathName, setNewPathName] = useState('');
    const [editingPathId, setEditingPathId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    const handleCreatePath = () => {
        const name = newPathName.trim() || `Path ${paths.length + 1}`;
        onCreatePath(name);
        setNewPathName('');
    };

    const handleStartRename = (path: AnimationPath) => {
        setEditingPathId(path.id);
        setEditingName(path.name);
    };

    const handleConfirmRename = () => {
        if (editingPathId && editingName.trim()) {
            onRenamePath(editingPathId, editingName.trim());
        }
        setEditingPathId(null);
        setEditingName('');
    };

    const handleCancelRename = () => {
        setEditingPathId(null);
        setEditingName('');
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-200">Paths</h3>
                <span className="text-xs text-gray-500">{paths.length} path(s)</span>
            </div>

            {/* Path List */}
            <div className="max-h-64 space-y-1 overflow-y-auto">
                {paths.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                        No paths yet. Create one to start.
                    </p>
                ) : (
                    paths.map((path) => (
                        <button
                            type="button"
                            key={path.id}
                            className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-left ${
                                selectedPathId === path.id
                                    ? 'bg-cyan-600/20 ring-1 ring-cyan-500'
                                    : 'hover:bg-gray-750 bg-gray-800'
                            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            onClick={() => !disabled && onSelectPath(path.id)}
                            disabled={disabled}
                        >
                            {editingPathId === path.id ? (
                                <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onBlur={handleConfirmRename}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleConfirmRename();
                                        if (e.key === 'Escape') handleCancelRename();
                                    }}
                                    /* eslint-disable-next-line jsx-a11y/no-autofocus */
                                    autoFocus
                                    className="flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-0.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <div className="flex-1">
                                    <span className="text-sm text-gray-200">{path.name}</span>
                                    <span className="ml-2 text-xs text-gray-500">
                                        {path.waypoints.length} pts
                                    </span>
                                </div>
                            )}

                            {!disabled && editingPathId !== path.id && (
                                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleStartRename(path);
                                        }}
                                        className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                        title="Rename"
                                    >
                                        <svg
                                            className="size-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeletePath(path.id);
                                        }}
                                        className="rounded p-1 text-gray-400 hover:bg-red-900/50 hover:text-red-400"
                                        title="Delete"
                                    >
                                        <svg
                                            className="size-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </button>
                    ))
                )}
            </div>

            {/* Create New Path */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newPathName}
                    onChange={(e) => setNewPathName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreatePath();
                    }}
                    placeholder="New path name..."
                    disabled={disabled}
                    className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-cyan-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                    type="button"
                    onClick={handleCreatePath}
                    disabled={disabled}
                    className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Add
                </button>
            </div>
        </div>
    );
};

export default AnimationPathLibrary;
