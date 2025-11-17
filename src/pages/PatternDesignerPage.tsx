import React, { useCallback, useMemo, useRef, useState } from 'react';

import { loadPatterns, persistPatterns } from '../services/patternStorage';

import type { Pattern, PatternPoint } from '../types';

interface PatternDesignerCanvasProps {
    pattern: Pattern;
    onChange: (nextPattern: Pattern) => void;
}

const clamp01 = (value: number): number => {
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

const PatternDesignerCanvas: React.FC<PatternDesignerCanvasProps> = ({ pattern, onChange }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

    const handleAddPoint = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) {
                return;
            }
            const bounds = containerRef.current.getBoundingClientRect();
            const size = Math.min(bounds.width, bounds.height);
            const originX = bounds.left + (bounds.width - size) / 2;
            const originY = bounds.top + (bounds.height - size) / 2;
            const x = clamp01((event.clientX - originX) / size);
            const y = clamp01((event.clientY - originY) / size);
            const now = new Date().toISOString();
            const nextPoint: PatternPoint = {
                id: createPointId(),
                x,
                y,
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

    const handleMouseDownPoint = useCallback((pointId: string) => {
        setDraggingPointId(pointId);
    }, []);

    const handleMouseUp = useCallback(() => {
        setDraggingPointId(null);
    }, []);

    const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (!draggingPointId || !containerRef.current) {
                return;
            }
            const bounds = containerRef.current.getBoundingClientRect();
            const size = Math.min(bounds.width, bounds.height);
            const originX = bounds.left + (bounds.width - size) / 2;
            const originY = bounds.top + (bounds.height - size) / 2;
            const x = clamp01((event.clientX - originX) / size);
            const y = clamp01((event.clientY - originY) / size);
            const now = new Date().toISOString();
            const nextPattern: Pattern = {
                ...pattern,
                updatedAt: now,
                points: pattern.points.map((point) =>
                    point.id === draggingPointId
                        ? {
                              ...point,
                              x,
                              y,
                          }
                        : point,
                ),
            };
            onChange(nextPattern);
        },
        [draggingPointId, onChange, pattern],
    );

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

    return (
        <div className="relative flex aspect-square w-full max-w-xl items-center justify-center bg-gray-900">
            <div
                ref={containerRef}
                className="h-full w-full cursor-crosshair select-none"
                onClick={handleAddPoint}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                role="presentation"
            >
                <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="xMidYMid meet"
                    className="h-full w-full"
                >
                    <rect x={0} y={0} width={1} height={1} fill="rgb(15,23,42)" />
                    {pattern.points.map((point) => (
                        <g key={point.id}>
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={0.02}
                                fill="#22d3ee"
                                stroke="#0f172a"
                                strokeWidth={0.004}
                                onMouseDown={(event) => {
                                    event.stopPropagation();
                                    handleMouseDownPoint(point.id);
                                }}
                            />
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={0.03}
                                fill="transparent"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemovePoint(point.id);
                                }}
                            />
                        </g>
                    ))}
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

    const selectedPattern = useMemo(
        () => patterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
        [patterns, selectedPatternId],
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
        setSelectedPatternId(pattern.id);
    };

    const handleDeletePattern = (patternId: string) => {
        const next = patterns.filter((pattern) => pattern.id !== patternId);
        handlePersist(next);
        if (selectedPatternId === patternId) {
            setSelectedPatternId(next[0]?.id ?? null);
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
                                            onClick={() => setSelectedPatternId(pattern.id)}
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

                <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-md bg-gray-900/60">
                    {selectedPattern ? (
                        <PatternDesignerCanvas
                            pattern={selectedPattern}
                            onChange={handlePatternChange}
                        />
                    ) : (
                        <p className="text-sm text-gray-500">
                            Create a pattern to start editing.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PatternDesignerPage;
