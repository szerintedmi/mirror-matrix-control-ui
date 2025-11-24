import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
    CALIBRATION_PROFILES_CHANGED_EVENT,
    CALIBRATION_PROFILES_STORAGE_KEY,
    loadCalibrationProfiles,
    loadLastCalibrationProfileId,
    persistLastCalibrationProfileId,
} from '@/services/calibrationProfileStorage';
import type { CalibrationProfile } from '@/types';

// Helper to sort profiles (duplicated from CalibrationProfileSelector for now, or should be shared)
const sortCalibrationProfiles = (profiles: CalibrationProfile[]): CalibrationProfile[] => {
    return [...profiles].sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();
        return dateB - dateA;
    });
};

interface CalibrationContextType {
    profiles: CalibrationProfile[];
    selectedProfileId: string | null;
    selectedProfile: CalibrationProfile | null;
    selectProfile: (profileId: string | null) => void;
    refreshProfiles: () => void;
}

const CalibrationContext = createContext<CalibrationContextType | null>(null);

export const useCalibrationContext = () => {
    const context = useContext(CalibrationContext);
    if (!context) {
        throw new Error('useCalibrationContext must be used within a CalibrationProvider');
    }
    return context;
};

export const CalibrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );

    const [profiles, setProfiles] = useState<CalibrationProfile[]>(() =>
        sortCalibrationProfiles(loadCalibrationProfiles(resolvedStorage)),
    );

    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(() => {
        const lastId = loadLastCalibrationProfileId(resolvedStorage);
        const all = loadCalibrationProfiles(resolvedStorage);
        if (lastId && all.some((p) => p.id === lastId)) {
            return lastId;
        }
        return all.length > 0 ? all[0].id : null;
    });

    const selectedProfile = useMemo(
        () => profiles.find((p) => p.id === selectedProfileId) ?? null,
        [profiles, selectedProfileId],
    );

    const refreshProfiles = useCallback(() => {
        const next = sortCalibrationProfiles(loadCalibrationProfiles(resolvedStorage));
        setProfiles(next);

        // Ensure selected ID is still valid
        if (selectedProfileId && !next.some((p) => p.id === selectedProfileId)) {
            const fallback = next.length > 0 ? next[0].id : null;
            setSelectedProfileId(fallback);
            persistLastCalibrationProfileId(resolvedStorage, fallback);
        } else if (!selectedProfileId && next.length > 0) {
            const fallback = next[0].id;
            setSelectedProfileId(fallback);
            persistLastCalibrationProfileId(resolvedStorage, fallback);
        }
    }, [resolvedStorage, selectedProfileId]);

    const selectProfile = useCallback(
        (profileId: string | null) => {
            setSelectedProfileId(profileId);
            persistLastCalibrationProfileId(resolvedStorage, profileId);
        },
        [resolvedStorage],
    );

    // Sync with external changes
    useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key === CALIBRATION_PROFILES_STORAGE_KEY) {
                refreshProfiles();
            }
        };
        const handleProfilesChanged = () => refreshProfiles();

        window.addEventListener('storage', handleStorage);
        window.addEventListener(CALIBRATION_PROFILES_CHANGED_EVENT, handleProfilesChanged);
        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(CALIBRATION_PROFILES_CHANGED_EVENT, handleProfilesChanged);
        };
    }, [refreshProfiles]);

    const value = useMemo(
        () => ({
            profiles,
            selectedProfileId,
            selectedProfile,
            selectProfile,
            refreshProfiles,
        }),
        [profiles, selectedProfileId, selectedProfile, selectProfile, refreshProfiles],
    );

    return <CalibrationContext.Provider value={value}>{children}</CalibrationContext.Provider>;
};
