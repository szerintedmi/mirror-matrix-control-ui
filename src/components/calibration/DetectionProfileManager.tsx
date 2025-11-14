import React from 'react';

import type { DetectionSettingsProfile } from '@/services/detectionSettingsStorage';

interface DetectionProfileManagerProps {
    savedProfiles: DetectionSettingsProfile[];
    profileName: string;
    onProfileNameChange: (value: string) => void;
    selectedProfileId: string;
    onSelectProfile: (profileId: string) => void;
    onSaveProfile: () => void;
    onNewProfile: () => void;
    onLoadProfile: (profileId: string) => void;
}

const DetectionProfileManager: React.FC<DetectionProfileManagerProps> = ({
    savedProfiles,
    profileName,
    onProfileNameChange,
    selectedProfileId,
    onSelectProfile,
    onSaveProfile,
    onNewProfile,
    onLoadProfile,
}) => {
    return (
        <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">Detection Profiles</h2>
                <span className="text-xs text-gray-400">{savedProfiles.length} saved</span>
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm text-gray-300">
                <label className="flex flex-col gap-2">
                    <span>Profile name</span>
                    <input
                        type="text"
                        value={profileName}
                        onChange={(event) => onProfileNameChange(event.target.value)}
                        placeholder="e.g. Lab baseline"
                        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                    />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onSaveProfile}
                        className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300 hover:border-emerald-400"
                    >
                        Save profile
                    </button>
                    <button
                        type="button"
                        onClick={onNewProfile}
                        className="rounded-md border border-gray-700 px-3 py-1 text-sm text-gray-200 hover:border-gray-500"
                    >
                        New profile
                    </button>
                </div>
                <label className="flex flex-col gap-2">
                    <span>Saved settings</span>
                    <div className="flex gap-2">
                        <select
                            value={selectedProfileId}
                            onChange={(event) => onSelectProfile(event.target.value)}
                            className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                        >
                            <option value="">Select saved profile</option>
                            {savedProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => onLoadProfile(selectedProfileId)}
                            disabled={!selectedProfileId}
                            className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300 disabled:opacity-40"
                        >
                            Load
                        </button>
                    </div>
                </label>
            </div>
        </section>
    );
};

export default DetectionProfileManager;
