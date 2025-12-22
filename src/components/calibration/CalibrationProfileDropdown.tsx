import React, { useCallback, useId, useMemo } from 'react';

import { useCalibrationContext } from '@/context/CalibrationContext';
import { DRAFT_PROFILE_ID } from '@/services/draftProfileService';

const MANAGE_ACTION_VALUE = '__manage__';
const SAVE_DRAFT_ACTION_VALUE = '__save_draft__';

interface CalibrationProfileDropdownProps {
    onOpenManagement: () => void;
    className?: string;
}

const CalibrationProfileDropdown: React.FC<CalibrationProfileDropdownProps> = ({
    onOpenManagement,
    className = '',
}) => {
    const selectId = useId();
    const { savedProfiles, draftProfile, selectedProfileId, selectProfile } =
        useCalibrationContext();

    const hasProfiles = savedProfiles.length > 0 || draftProfile !== null;
    const isDraftSelected = selectedProfileId === DRAFT_PROFILE_ID;

    const selectedName = useMemo(() => {
        if (draftProfile && selectedProfileId === draftProfile.id) {
            return `${draftProfile.name}*`;
        }
        const saved = savedProfiles.find((p) => p.id === selectedProfileId);
        return saved?.name ?? 'No profile';
    }, [draftProfile, savedProfiles, selectedProfileId]);

    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value;
            if (value === MANAGE_ACTION_VALUE || value === SAVE_DRAFT_ACTION_VALUE) {
                // Reset dropdown to previous value
                event.target.value = selectedProfileId ?? '';
                onOpenManagement();
            } else {
                selectProfile(value);
            }
        },
        [onOpenManagement, selectProfile, selectedProfileId],
    );

    const resolvedValue = useMemo(() => {
        if (!hasProfiles) {
            return '';
        }
        // Check if selectedProfileId matches a profile
        if (draftProfile && selectedProfileId === draftProfile.id) {
            return draftProfile.id;
        }
        if (savedProfiles.some((p) => p.id === selectedProfileId)) {
            return selectedProfileId ?? '';
        }
        return '';
    }, [draftProfile, hasProfiles, savedProfiles, selectedProfileId]);

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <label htmlFor={selectId} className="hidden text-xs text-gray-400 sm:block">
                Profile:
            </label>
            <div className="relative">
                <select
                    id={selectId}
                    className={`appearance-none rounded-md border px-3 py-1.5 pr-8 text-xs font-medium transition ${
                        isDraftSelected
                            ? 'border-amber-500/40 bg-amber-900/30 text-amber-200'
                            : 'border-gray-700 bg-gray-900/60 text-gray-200'
                    } ${hasProfiles ? 'hover:border-gray-500' : 'cursor-not-allowed opacity-50'}`}
                    value={resolvedValue}
                    onChange={handleChange}
                    disabled={!hasProfiles}
                    title={selectedName}
                >
                    {!hasProfiles && <option value="">No profiles</option>}
                    {draftProfile && (
                        <optgroup label="Drafts">
                            <option value={draftProfile.id}>{draftProfile.name}*</option>
                            <option value={SAVE_DRAFT_ACTION_VALUE}>Save Draft...</option>
                        </optgroup>
                    )}
                    {savedProfiles.length > 0 && (
                        <optgroup label="Saved">
                            {savedProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.name}
                                </option>
                            ))}
                        </optgroup>
                    )}
                    <option value={MANAGE_ACTION_VALUE}>Manage...</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg
                        className="size-4 text-gray-400"
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
            </div>
        </div>
    );
};

export default CalibrationProfileDropdown;
