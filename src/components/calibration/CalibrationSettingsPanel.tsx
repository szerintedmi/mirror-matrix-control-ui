import React, { useState } from 'react';

import { STAGING_POSITIONS, STAGING_POSITION_LABELS } from '@/constants/calibration';
import { useEditableInput } from '@/hooks/useEditableInput';
import type { ArrayRotation, StagingPosition } from '@/types';
import { ARRAY_ROTATIONS, getRotationLabel } from '@/utils/arrayRotation';

interface CalibrationSettingsPanelProps {
    arrayRotation: ArrayRotation;
    onArrayRotationChange: (rotation: ArrayRotation) => void;
    stagingPosition: StagingPosition;
    onStagingPositionChange: (position: StagingPosition) => void;
    deltaSteps: number;
    onDeltaStepsChange: (value: number) => void;
    gridGapNormalized: number;
    onGridGapNormalizedChange: (value: number) => void;
    maxBlobDistanceThreshold: number;
    onMaxBlobDistanceThresholdChange: (value: number) => void;
    firstTileTolerance: number;
    onFirstTileToleranceChange: (value: number) => void;
    disabled?: boolean;
}

const INTEGER_PATTERN = /^\d*$/;
const DECIMAL_PATTERN = /^\d*(?:\.\d*)?$/;

const CalibrationSettingsPanel: React.FC<CalibrationSettingsPanelProps> = ({
    arrayRotation,
    onArrayRotationChange,
    stagingPosition,
    onStagingPositionChange,
    deltaSteps,
    onDeltaStepsChange,
    gridGapNormalized,
    onGridGapNormalizedChange,
    maxBlobDistanceThreshold,
    onMaxBlobDistanceThresholdChange,
    firstTileTolerance,
    onFirstTileToleranceChange,
    disabled = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const stepDeltaInput = useEditableInput({
        value: deltaSteps,
        onChange: onDeltaStepsChange,
        format: (v) => v.toString(),
        parse: (s) => {
            const n = Number(s);
            return Number.isNaN(n) ? null : Math.round(n);
        },
        validateInput: (s) => INTEGER_PATTERN.test(s),
    });

    const gridGapInput = useEditableInput({
        value: gridGapNormalized,
        onChange: onGridGapNormalizedChange,
        format: (v) => {
            const percent = Number((v * 100).toFixed(1));
            return percent.toString();
        },
        parse: (s) => {
            const percent = Number(s);
            return Number.isNaN(percent) ? null : percent;
        },
        validateInput: (s) => DECIMAL_PATTERN.test(s),
        transform: (percent) => {
            const clamped = Math.min(Math.max(percent, 0), 5);
            const normalized = Number((clamped / 100).toFixed(4));
            return [normalized, clamped.toString()];
        },
    });

    const maxBlobDistanceInput = useEditableInput({
        value: maxBlobDistanceThreshold,
        onChange: onMaxBlobDistanceThresholdChange,
        format: (v) => {
            const percent = Number((v * 100).toFixed(0));
            return percent.toString();
        },
        parse: (s) => {
            const percent = Number(s);
            return Number.isNaN(percent) ? null : percent;
        },
        validateInput: (s) => DECIMAL_PATTERN.test(s),
        // Defer clamping to blur to allow typing multi-digit values like "25" without immediate clamp when "2" is typed
        transformOnBlur: true,
        transform: (percent) => {
            const clamped = Math.min(Math.max(percent, 1), 100);
            const normalized = Number((clamped / 100).toFixed(2));
            return [normalized, clamped.toString()];
        },
    });

    const firstTileToleranceInput = useEditableInput({
        value: firstTileTolerance,
        onChange: onFirstTileToleranceChange,
        format: (v) => {
            const percent = Number((v * 100).toFixed(0));
            return percent.toString();
        },
        parse: (s) => {
            const percent = Number(s);
            return Number.isNaN(percent) ? null : percent;
        },
        validateInput: (s) => DECIMAL_PATTERN.test(s),
        // Defer clamping to blur to allow typing multi-digit values like "10" without immediate clamp when "1" is typed
        transformOnBlur: true,
        transform: (percent) => {
            const clamped = Math.min(Math.max(percent, 5), 50);
            const normalized = Number((clamped / 100).toFixed(2));
            return [normalized, clamped.toString()];
        },
    });

    const rotationLabel = arrayRotation === 0 ? 'Normal' : `${arrayRotation}°`;
    const stagingLabel = STAGING_POSITION_LABELS[stagingPosition];
    const gapPercent = (gridGapNormalized * 100).toFixed(1);

    return (
        <section className="rounded-lg border border-gray-800 bg-gray-950 shadow-lg">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-gray-900/50"
            >
                <div className="flex items-center gap-2">
                    <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                    </svg>
                    <span className="text-sm font-medium text-gray-200">Calibration Settings</span>
                </div>
                <div className="flex items-center gap-3">
                    {!isExpanded && (
                        <span className="text-xs text-gray-500">
                            {rotationLabel} · {stagingLabel} · {deltaSteps} steps · {gapPercent}%
                            gap
                        </span>
                    )}
                    <svg
                        className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>
            </button>

            {isExpanded && (
                <div className="space-y-4 border-t border-gray-800 p-4">
                    {/* Array Rotation */}
                    <fieldset className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                Array Rotation
                            </legend>
                            <span className="text-xs text-gray-500">
                                {arrayRotation === 0 ? 'Normal' : `Rotated ${arrayRotation}° CW`}
                            </span>
                        </div>
                        <div
                            className="flex gap-1.5"
                            role="radiogroup"
                            aria-label="Array rotation selection"
                        >
                            {ARRAY_ROTATIONS.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                                        arrayRotation === r
                                            ? 'border-blue-500 bg-blue-500/30 text-blue-100'
                                            : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                    onClick={() => !disabled && onArrayRotationChange(r)}
                                    disabled={disabled}
                                    aria-pressed={arrayRotation === r}
                                    title={getRotationLabel(r)}
                                >
                                    {r}°
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-500">
                            Physical rotation of mirror array (clockwise from camera view)
                        </p>
                    </fieldset>

                    {/* Staging Position */}
                    <fieldset className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                Staging Position
                            </legend>
                            <span className="text-xs text-gray-500">{stagingLabel}</span>
                        </div>
                        <div
                            className="flex gap-1.5"
                            role="radiogroup"
                            aria-label="Staging position selection"
                        >
                            {STAGING_POSITIONS.map((pos) => (
                                <button
                                    key={pos}
                                    type="button"
                                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                                        stagingPosition === pos
                                            ? 'border-blue-500 bg-blue-500/30 text-blue-100'
                                            : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                    onClick={() => !disabled && onStagingPositionChange(pos)}
                                    disabled={disabled}
                                    aria-pressed={stagingPosition === pos}
                                >
                                    {STAGING_POSITION_LABELS[pos]}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-500">
                            Where tiles move during calibration staging
                        </p>
                    </fieldset>

                    {/* Step Delta, Grid Gap, 1st Tile Tolerance & Tile Tolerance */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-sm text-gray-300">
                            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
                                Step delta (steps)
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={stepDeltaInput.displayValue}
                                onFocus={stepDeltaInput.onFocus}
                                onBlur={stepDeltaInput.onBlur}
                                onChange={stepDeltaInput.onChange}
                                disabled={disabled}
                                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </label>
                        <label className="text-sm text-gray-300">
                            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
                                Grid gap (%)
                            </span>
                            <input
                                type="text"
                                inputMode="decimal"
                                pattern="\\d*(\\.\\d*)?"
                                value={gridGapInput.displayValue}
                                onFocus={gridGapInput.onFocus}
                                onBlur={gridGapInput.onBlur}
                                onChange={gridGapInput.onChange}
                                disabled={disabled}
                                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </label>
                        <label className="text-sm text-gray-300">
                            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
                                1st Tile tolerance (%)
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={firstTileToleranceInput.displayValue}
                                onFocus={firstTileToleranceInput.onFocus}
                                onBlur={firstTileToleranceInput.onBlur}
                                onChange={firstTileToleranceInput.onChange}
                                disabled={disabled}
                                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                title="Larger tolerance for first tile detection when no prior measurements exist"
                            />
                        </label>
                        <label className="text-sm text-gray-300">
                            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
                                Tile tolerance (%)
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={maxBlobDistanceInput.displayValue}
                                onFocus={maxBlobDistanceInput.onFocus}
                                onBlur={maxBlobDistanceInput.onBlur}
                                onChange={maxBlobDistanceInput.onChange}
                                disabled={disabled}
                                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                title="Maximum distance from expected position to accept a detected blob (shown as green circle)"
                            />
                        </label>
                    </div>
                </div>
            )}
        </section>
    );
};

export default CalibrationSettingsPanel;
