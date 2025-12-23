import React from 'react';

import CollapsibleSection from '@/components/common/CollapsibleSection';
import {
    STAGING_POSITIONS,
    STAGING_POSITION_LABELS,
    GRID_GAP_MIN_PERCENT,
    GRID_GAP_MAX_PERCENT,
} from '@/constants/calibration';
import { useEditableInput } from '@/hooks/useEditableInput';
import type { ArrayRotation, StagingPosition } from '@/types';
import { ARRAY_ROTATIONS, getRotationLabel } from '@/utils/arrayRotation';

interface CalibrationSettingsPanelProps {
    arrayRotation: ArrayRotation;
    onArrayRotationChange: (rotation: ArrayRotation) => void;
    stagingPosition: StagingPosition;
    onStagingPositionChange: (position: StagingPosition) => void;
    firstTileInterimStepDelta: number;
    onFirstTileInterimStepDeltaChange: (value: number) => void;
    deltaSteps: number;
    onDeltaStepsChange: (value: number) => void;
    gridGapNormalized: number;
    onGridGapNormalizedChange: (value: number) => void;
    firstTileTolerance: number;
    onFirstTileToleranceChange: (value: number) => void;
    tileTolerance: number;
    onTileToleranceChange: (value: number) => void;
    disabled?: boolean;
    isDefaultSettings?: boolean;
    onResetToDefaults?: () => void;
}

const INTEGER_PATTERN = /^\d*$/;
const DECIMAL_PATTERN = /^\d*(?:\.\d*)?$/;
/** Allow negative sign, digits, and decimal point for signed decimal input */
const SIGNED_DECIMAL_PATTERN = /^-?\d*(?:\.\d*)?$/;

const CalibrationSettingsPanel: React.FC<CalibrationSettingsPanelProps> = ({
    arrayRotation,
    onArrayRotationChange,
    stagingPosition,
    onStagingPositionChange,
    firstTileInterimStepDelta,
    onFirstTileInterimStepDeltaChange,
    deltaSteps,
    onDeltaStepsChange,
    gridGapNormalized,
    onGridGapNormalizedChange,
    firstTileTolerance,
    onFirstTileToleranceChange,
    tileTolerance,
    onTileToleranceChange,
    disabled = false,
    isDefaultSettings = true,
    onResetToDefaults,
}) => {
    const firstTileInterimStepDeltaInput = useEditableInput({
        value: firstTileInterimStepDelta,
        onChange: onFirstTileInterimStepDeltaChange,
        format: (v) => v.toString(),
        parse: (s) => {
            const n = Number(s);
            return Number.isNaN(n) ? null : Math.round(n);
        },
        validateInput: (s) => INTEGER_PATTERN.test(s),
    });

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
        // Allow negative values and decimal point - don't restrict typing
        validateInput: (s) => SIGNED_DECIMAL_PATTERN.test(s),
        // Defer clamping to blur so user can type freely (e.g., type "-25" without issues)
        transformOnBlur: true,
        transform: (percent) => {
            // Clamp to allowed range [-50%, +5%]
            const clamped = Math.min(Math.max(percent, GRID_GAP_MIN_PERCENT), GRID_GAP_MAX_PERCENT);
            const normalized = Number((clamped / 100).toFixed(4));
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

    const tileToleranceInput = useEditableInput({
        value: tileTolerance,
        onChange: onTileToleranceChange,
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

    const rotationLabel = arrayRotation === 0 ? 'Normal' : `${arrayRotation}°`;
    const stagingLabel = STAGING_POSITION_LABELS[stagingPosition];
    const gapPercent = (gridGapNormalized * 100).toFixed(1);

    return (
        <CollapsibleSection
            title="Calibration Settings"
            collapsedSummary={`${rotationLabel} · ${stagingLabel} · ${deltaSteps} steps · ${gapPercent}% gap`}
            defaultExpanded={false}
            icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            }
            headerActions={
                !isDefaultSettings &&
                onResetToDefaults && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onResetToDefaults();
                        }}
                        className="rounded px-2 py-0.5 text-xs text-amber-400 transition hover:bg-amber-500/20 hover:text-amber-300"
                        title="Reset to default settings"
                    >
                        Reset
                    </button>
                )
            }
        >
            <div className="space-y-4">
                {/* Array Rotation */}
                <fieldset className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <legend className="text-xs font-medium tracking-wide text-gray-500 uppercase">
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
                        <legend className="text-xs font-medium tracking-wide text-gray-500 uppercase">
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

                {/* Step Delta Settings */}
                <div className="grid gap-4 sm:grid-cols-3">
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs tracking-wide text-gray-500 uppercase">
                            1st Tile Interim Step
                        </span>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={firstTileInterimStepDeltaInput.displayValue}
                            onFocus={firstTileInterimStepDeltaInput.onFocus}
                            onBlur={firstTileInterimStepDeltaInput.onBlur}
                            onChange={firstTileInterimStepDeltaInput.onChange}
                            disabled={disabled}
                            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            title="Interim step delta for first tile (uses home as expected center, followed by full step)"
                        />
                    </label>
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs tracking-wide text-gray-500 uppercase">
                            Step Delta
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
                            title="Motor steps for full X/Y step tests"
                        />
                    </label>
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs tracking-wide text-gray-500 uppercase">
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
                </div>

                {/* Tolerance Settings */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs tracking-wide text-gray-500 uppercase">
                            1st Tile Tolerance (%)
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
                            title="Tolerance for first tile detection (home and interim step tests)"
                        />
                    </label>
                    <label className="text-sm text-gray-300">
                        <span className="mb-1 block text-xs tracking-wide text-gray-500 uppercase">
                            Tile Tolerance (%)
                        </span>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={tileToleranceInput.displayValue}
                            onFocus={tileToleranceInput.onFocus}
                            onBlur={tileToleranceInput.onBlur}
                            onChange={tileToleranceInput.onChange}
                            disabled={disabled}
                            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            title="Tolerance for full step tests and subsequent tiles"
                        />
                    </label>
                </div>
            </div>
        </CollapsibleSection>
    );
};

export default CalibrationSettingsPanel;
