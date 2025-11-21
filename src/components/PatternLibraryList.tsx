import React from 'react';

import type { Pattern } from '@/types';

interface PatternLibraryListProps {
    patterns: Pattern[];
    selectedPatternId: string | null;
    onSelect: (patternId: string) => void;
    onDelete?: (patternId: string) => void;
    onRename?: (pattern: Pattern) => void;
    onEdit?: (pattern: Pattern) => void;
    getValidationStatus?: (
        pattern: Pattern,
    ) => { isValid: boolean; message?: string; details?: string } | null;
    className?: string;
}

const PatternLibraryList: React.FC<PatternLibraryListProps> = ({
    patterns,
    selectedPatternId,
    onSelect,
    onDelete,
    onRename,
    onEdit,
    getValidationStatus,
    className = '',
}) => {
    if (patterns.length === 0) {
        return (
            <div
                className={`flex flex-col items-center justify-center rounded-md border border-dashed border-gray-700 bg-gray-800/20 p-8 text-center ${className}`}
            >
                <p className="text-sm text-gray-500">No patterns created yet.</p>
            </div>
        );
    }

    return (
        <ul className={`space-y-2 overflow-y-auto pr-2 ${className}`}>
            {patterns.map((pattern) => {
                const isSelected = selectedPatternId === pattern.id;
                const validation = getValidationStatus ? getValidationStatus(pattern) : null;
                const isInvalid = validation && !validation.isValid;

                return (
                    <li key={pattern.id}>
                        <div
                            role="button"
                            tabIndex={0}
                            className={`group relative flex w-full cursor-pointer flex-col rounded-md border p-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${
                                isSelected
                                    ? 'border-cyan-500/50 bg-cyan-900/10 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                    : 'border-transparent bg-gray-800/40 hover:bg-gray-800/80'
                            }`}
                            onClick={() => onSelect(pattern.id)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onSelect(pattern.id);
                                }
                            }}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span
                                        className={`truncate text-sm font-medium ${
                                            isSelected ? 'text-cyan-100' : 'text-gray-300'
                                        }`}
                                        title={pattern.name}
                                    >
                                        {pattern.name}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {pattern.points.length} spots
                                    </span>
                                    {isInvalid && (
                                        <span
                                            className="mt-1 flex items-center gap-1 text-xs text-red-400"
                                            title={validation?.details ?? validation?.message}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                                className="w-3 h-3"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                            {validation.message}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    {onEdit && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit(pattern);
                                            }}
                                            className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
                                            title="Edit in Designer"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                                className="w-4 h-4"
                                            >
                                                <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                            </svg>
                                        </button>
                                    )}
                                    {onRename && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRename(pattern);
                                            }}
                                            className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
                                            title="Rename pattern"
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
                                    )}
                                    {onDelete && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (
                                                    window.confirm(
                                                        `Delete pattern "${pattern.name}"?`,
                                                    )
                                                ) {
                                                    onDelete(pattern.id);
                                                }
                                            }}
                                            className="rounded p-1.5 text-gray-400 hover:bg-red-900/40 hover:text-red-200"
                                            title="Delete pattern"
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
                                                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                                />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};

export default PatternLibraryList;
