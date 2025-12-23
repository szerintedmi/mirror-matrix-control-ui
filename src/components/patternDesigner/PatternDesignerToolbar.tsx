import React from 'react';

import TransformToolbar from '@/components/common/TransformToolbar';

import type { PatternEditMode } from './types';

const EDIT_MODE_LABEL: Record<PatternEditMode, string> = {
    placement: 'Placement',
    erase: 'Erase',
};

export interface PatternDesignerToolbarProps {
    // Edit mode
    editMode: PatternEditMode;
    onEditModeChange: (mode: PatternEditMode) => void;

    // Transform controls
    onShift: (dx: number, dy: number) => void;
    onScale: (scaleX: number, scaleY: number) => void;
    onRotate: (angleDeg: number) => void;

    // Undo/Redo
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;

    // Bounds toggle
    showBounds: boolean;
    onShowBoundsChange: (show: boolean) => void;
    canShowBounds: boolean;

    // Step size reference
    blobRadius: number;

    // Spots capacity (optional - shown when calibration profile is selected)
    placedSpots?: number;
    availableSpots?: number;

    // Disabled state
    disabled?: boolean;
}

const PatternDesignerToolbar: React.FC<PatternDesignerToolbarProps> = ({
    editMode,
    onEditModeChange,
    onShift,
    onScale,
    onRotate,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    showBounds,
    onShowBoundsChange,
    canShowBounds,
    blobRadius,
    placedSpots,
    availableSpots,
    disabled = false,
}) => {
    // Suppress unused variable warning - blobRadius is kept in props for future use
    void blobRadius;

    const showSpots = typeof placedSpots === 'number' && typeof availableSpots === 'number';
    const spotsOverCapacity = showSpots && placedSpots > availableSpots;

    const buttonBase =
        'rounded px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
    const buttonInactive = 'text-gray-300 hover:text-white hover:bg-gray-700/50';
    const buttonActive = 'bg-cyan-600 text-white';

    return (
        <div className="flex flex-col gap-3 text-xs">
            {/* Row 1: Edit Mode + Show Bounds */}
            <div className="flex flex-wrap items-center gap-3 font-semibold text-gray-200">
                <span className="tracking-wide text-gray-400 uppercase">Mode</span>
                <div className="inline-flex rounded-md bg-gray-800/70 p-1">
                    {(['placement', 'erase'] as PatternEditMode[]).map((mode) => {
                        const isActive = editMode === mode;
                        const hotkey = mode === 'placement' ? 'P' : 'E';
                        return (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onEditModeChange(mode)}
                                disabled={disabled}
                                className={`${buttonBase} ${isActive ? buttonActive : buttonInactive}`}
                                aria-pressed={isActive}
                            >
                                {EDIT_MODE_LABEL[mode]} ({hotkey})
                            </button>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={() => onShowBoundsChange(!showBounds)}
                    disabled={!canShowBounds || disabled}
                    aria-pressed={showBounds}
                    className={`${buttonBase} ${showBounds ? buttonActive : buttonInactive} ${!canShowBounds ? 'cursor-not-allowed opacity-50 hover:text-gray-300' : ''}`}
                    title={
                        canShowBounds
                            ? 'Toggle calibration tile bounds overlay'
                            : 'Select a calibration profile to view bounds'
                    }
                >
                    Show Bounds
                </button>

                {/* Spots count */}
                {showSpots && (
                    <span
                        className={`ml-auto text-xs tabular-nums ${spotsOverCapacity ? 'font-semibold text-red-300' : 'text-gray-400'}`}
                    >
                        {placedSpots} / {availableSpots} spots
                    </span>
                )}
            </div>

            {/* Row 2: Transform Controls (shared component) */}
            <TransformToolbar
                onShift={onShift}
                onScale={onScale}
                onRotate={onRotate}
                disabled={disabled}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
            />
        </div>
    );
};

export default PatternDesignerToolbar;
