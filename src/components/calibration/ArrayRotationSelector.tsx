import React from 'react';

import type { ArrayRotation } from '@/types';
import { ARRAY_ROTATIONS, getRotationLabel } from '@/utils/arrayRotation';

interface ArrayRotationSelectorProps {
    rotation: ArrayRotation;
    onChange: (rotation: ArrayRotation) => void;
    disabled?: boolean;
}

const BUTTON_BASE_CLASS =
    'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-slate-900';

const getButtonClasses = (isSelected: boolean, isDisabled: boolean): string => {
    if (isDisabled) {
        return `${BUTTON_BASE_CLASS} cursor-not-allowed opacity-50 ${
            isSelected
                ? 'border-blue-500/50 bg-blue-500/20 text-blue-300'
                : 'border-slate-600 bg-slate-800 text-slate-400'
        }`;
    }
    if (isSelected) {
        return `${BUTTON_BASE_CLASS} border-blue-500 bg-blue-500/30 text-blue-100`;
    }
    return `${BUTTON_BASE_CLASS} border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 hover:bg-slate-700`;
};

/**
 * Selector for array rotation (0°, 90°, 180°, 270°).
 * Used in calibration setup to indicate physical array orientation.
 */
const ArrayRotationSelector: React.FC<ArrayRotationSelectorProps> = ({
    rotation,
    onChange,
    disabled = false,
}) => {
    return (
        <fieldset className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <legend className="text-sm font-medium text-slate-300">Array Rotation</legend>
                <span className="text-xs text-slate-500">
                    {rotation === 0 ? 'Normal' : `Rotated ${rotation}° CW`}
                </span>
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Array rotation selection">
                {ARRAY_ROTATIONS.map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={getButtonClasses(rotation === r, disabled)}
                        onClick={() => !disabled && onChange(r)}
                        disabled={disabled}
                        aria-pressed={rotation === r}
                        title={getRotationLabel(r)}
                    >
                        {r}°
                    </button>
                ))}
            </div>
            <p className="text-xs text-slate-500">
                Set this to match the physical rotation of your mirror array (clockwise from camera
                view). Changing this requires re-running calibration.
            </p>
        </fieldset>
    );
};

export default ArrayRotationSelector;
