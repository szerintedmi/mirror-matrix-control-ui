import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { TileAddress } from '@/services/calibration/types';
import type { Motor } from '@/types';

export interface TileRecalibrationMenuProps {
    tile: TileAddress;
    xMotor: Motor | null;
    yMotor: Motor | null;
    /** Whether a calibration profile exists (enables recalibrate option) */
    hasProfile: boolean;
    /** Whether calibration is currently active (disables all actions) */
    isCalibrationActive: boolean;
    /** Callback to home the tile (both axes) */
    onHomeTile: (tile: TileAddress, motors: { x: Motor | null; y: Motor | null }) => void;
    /** Callback to start single-tile recalibration */
    onRecalibrateTile: (tile: TileAddress) => void;
}

/**
 * Dropdown menu for tile actions (Home, Recalibrate).
 * Appears on hover over tile cards.
 */
const TileRecalibrationMenu: React.FC<TileRecalibrationMenuProps> = ({
    tile,
    xMotor,
    yMotor,
    hasProfile,
    isCalibrationActive,
    onHomeTile,
    onRecalibrateTile,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent tile card click
        setIsOpen((prev) => !prev);
    }, []);

    const handleHomeTile = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onHomeTile(tile, { x: xMotor, y: yMotor });
            setIsOpen(false);
        },
        [onHomeTile, tile, xMotor, yMotor],
    );

    const handleRecalibrate = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!hasProfile || isCalibrationActive) return;
            onRecalibrateTile(tile);
            setIsOpen(false);
        },
        [hasProfile, isCalibrationActive, onRecalibrateTile, tile],
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
    const canHome = hasMotors && !isCalibrationActive;
    const canRecalibrate = hasProfile && hasMotors && !isCalibrationActive;

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={handleToggle}
                className="flex h-6 w-6 items-center justify-center rounded border border-gray-700 bg-gray-900/80 text-gray-400 transition hover:border-gray-600 hover:text-gray-200"
                aria-haspopup="true"
                aria-expanded={isOpen}
                title="Tile actions"
            >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
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
                            className="h-3.5 w-3.5 flex-shrink-0"
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

                    {/* Recalibrate Tile */}
                    <button
                        type="button"
                        onClick={handleRecalibrate}
                        disabled={!canRecalibrate}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                            canRecalibrate
                                ? 'text-gray-300 hover:bg-gray-800'
                                : 'cursor-not-allowed text-gray-600'
                        }`}
                        title={
                            !hasProfile
                                ? 'Run full calibration first'
                                : isCalibrationActive
                                  ? 'Calibration in progress'
                                  : 'Recalibrate this tile'
                        }
                    >
                        <svg
                            className="h-3.5 w-3.5 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        <span>Recalibrate</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default TileRecalibrationMenu;
