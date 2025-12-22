import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { GridPosition, Motor } from '@/types';

export interface TileConfigMenuProps {
    position: GridPosition;
    xMotor: Motor | null;
    yMotor: Motor | null;
    /** Callback to home a single motor axis */
    onHomeMotor?: (motor: Motor) => void;
    /** Callback to home the tile (both axes) */
    onHomeTile?: (position: GridPosition, motors: { x: Motor | null; y: Motor | null }) => void;
}

/**
 * Dropdown menu for tile actions on the configurator page.
 * Appears on hover over tile cards.
 */
const TileConfigMenu: React.FC<TileConfigMenuProps> = ({
    position,
    xMotor,
    yMotor,
    onHomeMotor,
    onHomeTile,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen((prev) => !prev);
    }, []);

    const handleHomeTile = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (onHomeTile) {
                onHomeTile(position, { x: xMotor, y: yMotor });
            }
            setIsOpen(false);
        },
        [onHomeTile, position, xMotor, yMotor],
    );

    const handleHomeX = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (xMotor && onHomeMotor) {
                onHomeMotor(xMotor);
            }
            setIsOpen(false);
        },
        [onHomeMotor, xMotor],
    );

    const handleHomeY = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (yMotor && onHomeMotor) {
                onHomeMotor(yMotor);
            }
            setIsOpen(false);
        },
        [onHomeMotor, yMotor],
    );

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    const hasMotors = Boolean(xMotor || yMotor);
    const canHome = hasMotors && Boolean(onHomeTile);
    const canHomeX = Boolean(xMotor) && Boolean(onHomeMotor);
    const canHomeY = Boolean(yMotor) && Boolean(onHomeMotor);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={handleToggle}
                className="flex size-6 items-center justify-center rounded border border-gray-700 bg-gray-900/80 text-gray-400 transition hover:border-gray-600 hover:text-gray-200"
                aria-haspopup="true"
                aria-expanded={isOpen}
                title="Tile actions"
            >
                <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="4" r="1.5" />
                    <circle cx="10" cy="10" r="1.5" />
                    <circle cx="10" cy="16" r="1.5" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 z-50 mt-1 min-w-[130px] rounded-md border border-gray-700 bg-gray-900 py-1 shadow-lg">
                    {/* Home Tile */}
                    <button
                        type="button"
                        onClick={handleHomeTile}
                        disabled={!canHome}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                            canHome
                                ? 'text-gray-300 hover:bg-gray-800'
                                : 'cursor-not-allowed text-gray-600'
                        }`}
                    >
                        <svg
                            className="size-3.5 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                            />
                        </svg>
                        <span>Home Tile</span>
                    </button>

                    {/* Home X */}
                    <button
                        type="button"
                        onClick={handleHomeX}
                        disabled={!canHomeX}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                            canHomeX
                                ? 'text-gray-300 hover:bg-gray-800'
                                : 'cursor-not-allowed text-gray-600'
                        }`}
                    >
                        <svg
                            className="size-3.5 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                            />
                        </svg>
                        <span>Home X</span>
                    </button>

                    {/* Home Y */}
                    <button
                        type="button"
                        onClick={handleHomeY}
                        disabled={!canHomeY}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                            canHomeY
                                ? 'text-gray-300 hover:bg-gray-800'
                                : 'cursor-not-allowed text-gray-600'
                        }`}
                    >
                        <svg
                            className="size-3.5 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                            />
                        </svg>
                        <span>Home Y</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default TileConfigMenu;
