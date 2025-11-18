import React, { useId, type ReactNode } from 'react';

import type { CalibrationProfile } from '@/types';

export interface CalibrationProfileSelectorProps {
    profiles: CalibrationProfile[];
    selectedProfileId: string;
    onSelect: (profileId: string) => void;
    onRefresh: () => void;
    label?: string;
    placeholder?: string;
    selectClassName?: string;
    rightAccessory?: ReactNode;
}

export const sortCalibrationProfiles = (entries: CalibrationProfile[]): CalibrationProfile[] =>
    [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const CalibrationProfileSelector: React.FC<CalibrationProfileSelectorProps> = ({
    profiles,
    selectedProfileId,
    onSelect,
    onRefresh,
    label = 'Calibration Profile',
    placeholder = 'No profiles available',
    selectClassName,
    rightAccessory,
}) => {
    const selectId = useId();
    const hasOptions = profiles.length > 0;
    const resolvedValue =
        hasOptions && profiles.some((entry) => entry.id === selectedProfileId)
            ? selectedProfileId
            : '';

    return (
        <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-200" htmlFor={selectId}>
                {label}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex flex-1 items-center gap-2">
                    <select
                        id={selectId}
                        className={`rounded-md border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100 ${selectClassName ?? 'flex-1 min-w-0'}`}
                        value={hasOptions ? resolvedValue : ''}
                        onChange={(event) => onSelect(event.target.value)}
                        disabled={!hasOptions}
                    >
                        {hasOptions ? (
                            profiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.name}
                                </option>
                            ))
                        ) : (
                            <option value="">{placeholder}</option>
                        )}
                    </select>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-100 hover:border-cyan-400 hover:text-cyan-200"
                    >
                        Refresh
                    </button>
                </div>
                {rightAccessory ? (
                    <div className="text-xs font-semibold sm:text-right">{rightAccessory}</div>
                ) : null}
            </div>
        </div>
    );
};

export default CalibrationProfileSelector;
