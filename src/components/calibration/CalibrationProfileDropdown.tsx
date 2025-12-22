import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCalibrationContext } from '@/context/CalibrationContext';
import { DRAFT_PROFILE_ID } from '@/services/draftProfileService';

interface CalibrationProfileDropdownProps {
    onOpenManagement: () => void;
    className?: string;
}

const CalibrationProfileDropdown: React.FC<CalibrationProfileDropdownProps> = ({
    onOpenManagement,
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
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

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectProfile = useCallback(
        (profileId: string) => {
            selectProfile(profileId);
            setIsOpen(false);
        },
        [selectProfile],
    );

    const handleManage = useCallback(() => {
        setIsOpen(false);
        onOpenManagement();
    }, [onOpenManagement]);

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={!hasProfiles}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                    isDraftSelected
                        ? 'border-amber-500/40 bg-amber-900/30 text-amber-200 hover:bg-amber-900/50'
                        : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
                } ${!hasProfiles ? 'cursor-not-allowed opacity-50' : ''}`}
                title={selectedName}
            >
                {/* Calibration icon */}
                <svg
                    className="size-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <circle cx="12" cy="12" r="6" />
                    <path d="M12 3v2" strokeLinecap="round" />
                    <path d="M12 19v2" strokeLinecap="round" />
                    <path d="M3 12h2" strokeLinecap="round" />
                    <path d="M19 12h2" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                </svg>
                <span className="hidden max-w-[8rem] truncate sm:inline">{selectedName}</span>
                <svg
                    className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-md border border-gray-700 bg-gray-900 py-1 shadow-lg">
                    {/* Drafts section */}
                    {draftProfile && (
                        <>
                            <div className="px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
                                Drafts
                            </div>
                            <button
                                type="button"
                                onClick={() => handleSelectProfile(draftProfile.id)}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-gray-800 ${
                                    selectedProfileId === draftProfile.id
                                        ? 'text-amber-200'
                                        : 'text-gray-200'
                                }`}
                            >
                                <span
                                    className={`size-2 rounded-full ${
                                        selectedProfileId === draftProfile.id
                                            ? 'bg-amber-500'
                                            : 'bg-gray-600'
                                    }`}
                                />
                                {draftProfile.name}*
                            </button>
                            <button
                                type="button"
                                onClick={handleManage}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
                            >
                                <span className="size-2" />
                                Save Draft...
                            </button>
                        </>
                    )}

                    {/* Saved profiles section */}
                    {savedProfiles.length > 0 && (
                        <>
                            {draftProfile && <div className="my-1 border-t border-gray-700" />}
                            <div className="px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
                                Saved
                            </div>
                            {savedProfiles.map((profile) => (
                                <button
                                    key={profile.id}
                                    type="button"
                                    onClick={() => handleSelectProfile(profile.id)}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-gray-800 ${
                                        selectedProfileId === profile.id
                                            ? 'text-emerald-200'
                                            : 'text-gray-200'
                                    }`}
                                >
                                    <span
                                        className={`size-2 rounded-full ${
                                            selectedProfileId === profile.id
                                                ? 'bg-emerald-500'
                                                : 'bg-gray-600'
                                        }`}
                                    />
                                    {profile.name}
                                </button>
                            ))}
                        </>
                    )}

                    {/* Manage action */}
                    <div className="my-1 border-t border-gray-700" />
                    <button
                        type="button"
                        onClick={handleManage}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800"
                    >
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
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                        </svg>
                        Manage...
                    </button>
                </div>
            )}
        </div>
    );
};

export default CalibrationProfileDropdown;
