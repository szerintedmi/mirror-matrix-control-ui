import React, { useCallback, useState } from 'react';

import { useEditableInput } from '@/hooks/useEditableInput';

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
    disabled = false,
}) => {
    // Step sizes state - use 0.01 as default for fine control over normalized coordinates
    const [shiftStep, setShiftStep] = useState<number>(0.01);
    const [scaleStep, setScaleStep] = useState<number>(0.01);
    const [rotateStep, setRotateStep] = useState<number>(15);
    const [showIndependentScale, setShowIndependentScale] = useState(false);

    // Editable input hooks for better UX (select-all + type works properly)
    const shiftInput = useEditableInput({
        value: shiftStep,
        onChange: setShiftStep,
        format: (v) => v.toString(),
        parse: (s) => {
            const n = parseFloat(s);
            return Number.isFinite(n) && n > 0 ? n : null;
        },
        validateInput: (s) => /^-?\d*\.?\d*$/.test(s),
    });

    const scaleInput = useEditableInput({
        value: scaleStep,
        onChange: setScaleStep,
        format: (v) => v.toString(),
        parse: (s) => {
            const n = parseFloat(s);
            return Number.isFinite(n) && n > 0 && n <= 1 ? n : null;
        },
        validateInput: (s) => /^-?\d*\.?\d*$/.test(s),
    });

    const rotateInput = useEditableInput({
        value: rotateStep,
        onChange: setRotateStep,
        format: (v) => v.toString(),
        parse: (s) => {
            const n = parseFloat(s);
            return Number.isFinite(n) && n > 0 && n <= 180 ? n : null;
        },
        validateInput: (s) => /^\d*\.?\d*$/.test(s),
    });

    // Suppress unused variable warning - blobRadius is kept in props for future use
    void blobRadius;

    // Shift handlers
    const handleShiftUp = useCallback(() => onShift(0, -shiftStep), [onShift, shiftStep]);
    const handleShiftDown = useCallback(() => onShift(0, shiftStep), [onShift, shiftStep]);
    const handleShiftLeft = useCallback(() => onShift(-shiftStep, 0), [onShift, shiftStep]);
    const handleShiftRight = useCallback(() => onShift(shiftStep, 0), [onShift, shiftStep]);

    // Scale handlers - prevent scale factors from going below 0.01 (1%)
    const MIN_SCALE = 0.01;
    const handleScaleUp = useCallback(
        () => onScale(1 + scaleStep, 1 + scaleStep),
        [onScale, scaleStep],
    );
    const handleScaleDown = useCallback(() => {
        const factor = Math.max(MIN_SCALE, 1 - scaleStep);
        onScale(factor, factor);
    }, [onScale, scaleStep]);
    const handleScaleXUp = useCallback(() => onScale(1 + scaleStep, 1), [onScale, scaleStep]);
    const handleScaleXDown = useCallback(
        () => onScale(Math.max(MIN_SCALE, 1 - scaleStep), 1),
        [onScale, scaleStep],
    );
    const handleScaleYUp = useCallback(() => onScale(1, 1 + scaleStep), [onScale, scaleStep]);
    const handleScaleYDown = useCallback(
        () => onScale(1, Math.max(MIN_SCALE, 1 - scaleStep)),
        [onScale, scaleStep],
    );

    // Rotate handlers
    const handleRotateCCW = useCallback(() => onRotate(rotateStep), [onRotate, rotateStep]);
    const handleRotateCW = useCallback(() => onRotate(-rotateStep), [onRotate, rotateStep]);

    const buttonBase =
        'rounded px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
    const buttonInactive = 'text-gray-300 hover:text-white hover:bg-gray-700/50';
    const buttonActive = 'bg-cyan-600 text-white';

    return (
        <div className="flex flex-col gap-3 text-xs">
            {/* Row 1: Edit Mode + Show Bounds */}
            <div className="flex flex-wrap items-center gap-3 font-semibold text-gray-200">
                <span className="uppercase tracking-wide text-gray-400">Mode</span>
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

                {/* Undo/Redo */}
                <div className="ml-auto flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo || disabled}
                        className={`${buttonBase} ${buttonInactive}`}
                        title="Undo (Cmd+Z)"
                    >
                        Undo
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!canRedo || disabled}
                        className={`${buttonBase} ${buttonInactive}`}
                        title="Redo (Cmd+Shift+Z)"
                    >
                        Redo
                    </button>
                </div>
            </div>

            {/* Row 2: Transform Controls */}
            <div className="flex flex-wrap items-center gap-4 rounded-md border border-gray-700/50 bg-gray-800/30 p-2">
                {/* Shift Controls */}
                <div className="flex items-center gap-2">
                    <span className="text-gray-400">Shift</span>
                    <div className="flex gap-0.5">
                        <button
                            type="button"
                            onClick={handleShiftUp}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Shift up"
                            title="Shift up"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleShiftDown}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Shift down"
                            title="Shift down"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleShiftLeft}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Shift left"
                            title="Shift left"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleShiftRight}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Shift right"
                            title="Shift right"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>
                    </div>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={shiftInput.displayValue}
                        onFocus={shiftInput.onFocus}
                        onBlur={shiftInput.onBlur}
                        onChange={shiftInput.onChange}
                        disabled={disabled}
                        className="w-16 rounded border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-center text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                        title="Shift step size"
                    />
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-gray-600" />

                {/* Scale Controls */}
                <div className="flex items-center gap-2">
                    <span className="text-gray-400">Scale</span>
                    <div className="flex gap-0.5">
                        <button
                            type="button"
                            onClick={handleScaleDown}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Scale down"
                            title="Scale down (uniform)"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleScaleUp}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Scale up"
                            title="Scale up (uniform)"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                            </svg>
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowIndependentScale(!showIndependentScale)}
                        disabled={disabled}
                        className={`${buttonBase} ${showIndependentScale ? buttonActive : buttonInactive}`}
                        title="Toggle independent X/Y scaling"
                    >
                        X/Y
                    </button>
                    {showIndependentScale && (
                        <div className="flex items-center gap-1">
                            <span className="text-gray-500">X:</span>
                            <button
                                type="button"
                                onClick={handleScaleXDown}
                                disabled={disabled}
                                className={`${buttonBase} ${buttonInactive} px-1.5`}
                            >
                                -
                            </button>
                            <button
                                type="button"
                                onClick={handleScaleXUp}
                                disabled={disabled}
                                className={`${buttonBase} ${buttonInactive} px-1.5`}
                            >
                                +
                            </button>
                            <span className="ml-1 text-gray-500">Y:</span>
                            <button
                                type="button"
                                onClick={handleScaleYDown}
                                disabled={disabled}
                                className={`${buttonBase} ${buttonInactive} px-1.5`}
                            >
                                -
                            </button>
                            <button
                                type="button"
                                onClick={handleScaleYUp}
                                disabled={disabled}
                                className={`${buttonBase} ${buttonInactive} px-1.5`}
                            >
                                +
                            </button>
                        </div>
                    )}
                    <input
                        type="text"
                        inputMode="decimal"
                        value={scaleInput.displayValue}
                        onFocus={scaleInput.onFocus}
                        onBlur={scaleInput.onBlur}
                        onChange={scaleInput.onChange}
                        disabled={disabled}
                        className="w-14 rounded border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-center text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                        title="Scale step (e.g., 0.1 = 10%)"
                    />
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-gray-600" />

                {/* Rotate Controls */}
                <div className="flex items-center gap-2">
                    <span className="text-gray-400">Rotate</span>
                    <div className="flex gap-0.5">
                        <button
                            type="button"
                            onClick={handleRotateCCW}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Rotate counter-clockwise"
                            title="Rotate counter-clockwise"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-9.172-6.313a.75.75 0 01.75-.75h4.243a.75.75 0 010 1.5H8.703l.311.31a5.5 5.5 0 019.201 2.467.75.75 0 001.449-.39A7 7 0 007.952 5.11l-.31-.31v2.432a.75.75 0 01-1.5 0V3.361z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleRotateCW}
                            disabled={disabled}
                            className={`${buttonBase} ${buttonInactive}`}
                            aria-label="Rotate clockwise"
                            title="Rotate clockwise"
                        >
                            <svg
                                className="h-3.5 w-3.5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                style={{ transform: 'scaleX(-1)' }}
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-9.172-6.313a.75.75 0 01.75-.75h4.243a.75.75 0 010 1.5H8.703l.311.31a5.5 5.5 0 019.201 2.467.75.75 0 001.449-.39A7 7 0 007.952 5.11l-.31-.31v2.432a.75.75 0 01-1.5 0V3.361z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>
                    </div>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={rotateInput.displayValue}
                        onFocus={rotateInput.onFocus}
                        onBlur={rotateInput.onBlur}
                        onChange={rotateInput.onChange}
                        disabled={disabled}
                        className="w-14 rounded border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-center text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                        title="Rotation angle in degrees"
                    />
                    <span className="text-gray-500">deg</span>
                </div>
            </div>
        </div>
    );
};

export default PatternDesignerToolbar;
