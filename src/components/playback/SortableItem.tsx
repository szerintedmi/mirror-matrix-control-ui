import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

import PatternPreview from '@/components/PatternPreview';
import type { Pattern } from '@/types';

export interface QueuedPattern {
    id: string;
    patternId: string;
}

export interface SequenceValidationResult {
    itemId: string;
    status: 'ok' | 'error' | 'missing' | 'blocked';
    message?: string;
}

interface SortableItemProps {
    entry: QueuedPattern;
    index: number;
    sequenceLength: number;
    pattern: Pattern | undefined;
    validation: SequenceValidationResult | undefined;
    onRemove: (id: string) => void;
    isDropTarget: boolean;
}

const SortableItem: React.FC<SortableItemProps> = ({
    entry,
    index,
    sequenceLength,
    pattern,
    validation,
    onRemove,
    isDropTarget,
}) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: entry.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    const validationTone =
        validation?.status === 'ok'
            ? 'text-emerald-300'
            : validation?.status === 'blocked'
              ? 'text-amber-200'
              : 'text-red-200';

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex flex-col gap-2 rounded-md border bg-gray-900/60 p-3 md:flex-row md:items-center md:justify-between ${
                isDropTarget
                    ? 'border-emerald-500/60 ring-2 ring-emerald-500/30'
                    : 'border-gray-800'
            }`}
        >
            <div className="flex flex-1 items-center gap-3">
                <button
                    type="button"
                    className="cursor-grab touch-none p-1 text-gray-500 hover:text-gray-300 active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                    aria-label="Drag to reorder"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-5 w-5"
                    >
                        <path
                            fillRule="evenodd"
                            d="M10 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM11.5 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                            clipRule="evenodd"
                        />
                    </svg>
                </button>
                <PatternPreview
                    pattern={
                        pattern ?? {
                            id: 'missing',
                            name: 'Pattern removed',
                            points: [],
                            createdAt: '',
                            updatedAt: '',
                        }
                    }
                    className="h-12 w-12 flex-none rounded border border-gray-800/70 shadow-inner"
                />
                <div className="flex flex-1 flex-col gap-1 text-sm text-gray-200">
                    <span className="font-semibold text-gray-100">
                        {pattern?.name ?? 'Pattern removed'}
                    </span>
                    <span className="text-xs text-gray-400">
                        Step {index + 1} of {sequenceLength}
                    </span>
                    {validation && (
                        <div className={`flex items-start gap-2 text-xs ${validationTone}`}>
                            <span aria-hidden>{validation.status === 'ok' ? '✓' : '⚠'}</span>
                            {validation.status === 'ok' ? (
                                <span className="sr-only">Validation passed</span>
                            ) : (
                                <span>{validation.message ?? 'Needs validation attention.'}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-900/40 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                    aria-label="Remove from sequence"
                    title="Remove from sequence"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        className="h-5 w-5"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
        </li>
    );
};

export default SortableItem;
