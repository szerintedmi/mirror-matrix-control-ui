import React from 'react';

import type { AnimationMode } from '@/types/animation';

interface AnimationModeSelectorProps {
    mode: AnimationMode;
    onChange: (mode: AnimationMode) => void;
    disabled?: boolean;
}

const AnimationModeSelector: React.FC<AnimationModeSelectorProps> = ({
    mode,
    onChange,
    disabled = false,
}) => {
    return (
        <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-300">Animation Mode</span>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => onChange('independent')}
                    disabled={disabled}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        mode === 'independent'
                            ? 'bg-cyan-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                    Independent Paths
                </button>
                <button
                    type="button"
                    onClick={() => onChange('sequential')}
                    disabled={disabled}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        mode === 'sequential'
                            ? 'bg-cyan-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                    Sequential
                </button>
            </div>
            <p className="text-xs text-gray-500">
                {mode === 'independent'
                    ? 'Each mirror follows its own unique path.'
                    : 'All mirrors follow the same path with time offsets.'}
            </p>
        </div>
    );
};

export default AnimationModeSelector;
