import { useCallback, useMemo, useState } from 'react';

import {
    deleteCalibrationProfile,
    importCalibrationProfileFromJson,
    loadCalibrationProfiles,
    loadLastCalibrationProfileId,
    persistLastCalibrationProfileId,
    profileToRunSummary,
    saveCalibrationProfile,
} from '@/services/calibrationProfileStorage';
import type { CalibrationRunSummary, CalibrationRunnerState } from '@/services/calibrationRunner';
import { getGridStateFingerprint, type GridStateSnapshot } from '@/services/gridStorage';
import type { CalibrationProfile, MirrorConfig } from '@/types';

const getLocalStorage = (): Storage | undefined =>
    typeof window !== 'undefined' ? window.localStorage : undefined;

const sortProfiles = (entries: CalibrationProfile[]): CalibrationProfile[] =>
    [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

interface InitialProfilesState {
    entries: CalibrationProfile[];
    selected: string;
    initialName: string;
}

const loadInitialProfilesState = (): InitialProfilesState => {
    const storage = getLocalStorage();
    const entries = sortProfiles(loadCalibrationProfiles(storage));
    const lastId = loadLastCalibrationProfileId(storage);
    const selected =
        lastId && entries.some((entry) => entry.id === lastId) ? lastId : (entries[0]?.id ?? '');
    const initialName = entries.find((entry) => entry.id === selected)?.name ?? '';
    return { entries, selected, initialName };
};

export interface CalibrationProfilesController {
    profiles: CalibrationProfile[];
    selectedProfileId: string;
    selectedProfile: CalibrationProfile | null;
    activeProfileId: string;
    activeProfile: CalibrationProfile | null;
    activeProfileSummary: CalibrationRunSummary | null;
    profileNameInput: string;
    setProfileNameInput: (value: string) => void;
    selectProfileId: (profileId: string) => void;
    resetProfileSelection: () => void;
    saveProfile: () => CalibrationProfile | null;
    deleteProfile: (profileId: string) => void;
    loadProfile: (profileId: string) => CalibrationProfile | null;
    importProfileFromJson: (payload: string) => CalibrationProfile | null;
    canSaveProfile: boolean;
    saveFeedback: { type: 'success' | 'error'; message: string } | null;
    dismissFeedback: () => void;
    reportFeedback: (type: 'success' | 'error', message: string) => void;
    currentGridFingerprint: string;
}

interface UseCalibrationProfilesControllerParams {
    runnerState: CalibrationRunnerState;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

export const useCalibrationProfilesController = ({
    runnerState,
    gridSize,
    mirrorConfig,
}: UseCalibrationProfilesControllerParams): CalibrationProfilesController => {
    const initialState = useMemo(() => loadInitialProfilesState(), []);
    const [profiles, setProfiles] = useState<CalibrationProfile[]>(initialState.entries);
    const [selectedProfileId, setSelectedProfileId] = useState(initialState.selected);
    const [activeProfileId, setActiveProfileId] = useState(initialState.selected);
    const [profileNameInput, setProfileNameInput] = useState(initialState.initialName);
    const [saveFeedback, setSaveFeedback] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const currentGridFingerprint = useMemo(() => {
        const snapshot: GridStateSnapshot = {
            gridSize,
            mirrorConfig,
        };
        return getGridStateFingerprint(snapshot).hash;
    }, [gridSize, mirrorConfig]);

    const selectedProfile = useMemo(
        () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
        [profiles, selectedProfileId],
    );

    const activeProfile = useMemo(
        () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
        [profiles, activeProfileId],
    );

    const activeProfileSummary = useMemo(
        () => (activeProfile ? profileToRunSummary(activeProfile) : null),
        [activeProfile],
    );

    const persistLastSelection = useCallback((profileId: string | null) => {
        persistLastCalibrationProfileId(getLocalStorage(), profileId);
    }, []);

    const refreshProfiles = useCallback((): CalibrationProfile[] => {
        const next = sortProfiles(loadCalibrationProfiles(getLocalStorage()));
        setProfiles(next);
        return next;
    }, []);

    const selectProfileId = useCallback(
        (profileId: string) => {
            setSelectedProfileId(profileId);
            if (!profileId) {
                setProfileNameInput('');
                return;
            }
            const profile = profiles.find((entry) => entry.id === profileId);
            if (profile) {
                setProfileNameInput(profile.name);
            }
        },
        [profiles],
    );

    const resetProfileSelection = useCallback(() => {
        setSelectedProfileId('');
        setProfileNameInput('');
    }, []);

    const canSaveProfile = Boolean(runnerState.summary);

    const saveProfile = useCallback((): CalibrationProfile | null => {
        if (!runnerState.summary) {
            setSaveFeedback({ type: 'error', message: 'Run calibration before saving a profile.' });
            return null;
        }
        const storage = getLocalStorage();
        if (!storage) {
            setSaveFeedback({
                type: 'error',
                message: 'Local storage is unavailable in this environment.',
            });
            return null;
        }
        const snapshot: GridStateSnapshot = {
            gridSize,
            mirrorConfig,
        };
        const saved = saveCalibrationProfile(storage, {
            id: selectedProfileId || undefined,
            name: profileNameInput,
            runnerState,
            gridSnapshot: snapshot,
        });
        if (!saved) {
            setSaveFeedback({ type: 'error', message: 'Unable to save calibration profile.' });
            return null;
        }
        setSaveFeedback({ type: 'success', message: 'Calibration profile saved.' });
        setProfileNameInput(saved.name);
        setSelectedProfileId(saved.id);
        setActiveProfileId(saved.id);
        persistLastSelection(saved.id);
        refreshProfiles();
        return saved;
    }, [
        gridSize,
        mirrorConfig,
        persistLastSelection,
        profileNameInput,
        refreshProfiles,
        runnerState,
        selectedProfileId,
    ]);

    const loadProfile = useCallback(
        (profileId: string) => {
            const profile = profiles.find((entry) => entry.id === profileId) ?? null;
            if (!profile) {
                setSaveFeedback({ type: 'error', message: 'Profile not found.' });
                return null;
            }
            setSelectedProfileId(profile.id);
            setProfileNameInput(profile.name);
            setActiveProfileId(profile.id);
            persistLastSelection(profile.id);
            setSaveFeedback({ type: 'success', message: `Loaded profile "${profile.name}".` });
            return profile;
        },
        [persistLastSelection, profiles],
    );

    const deleteProfile = useCallback(
        (profileId: string) => {
            const storage = getLocalStorage();
            if (!storage) {
                setSaveFeedback({
                    type: 'error',
                    message: 'Local storage is unavailable; cannot delete profile.',
                });
                return;
            }
            deleteCalibrationProfile(storage, profileId);
            const nextProfiles = refreshProfiles();
            if (profileId === selectedProfileId) {
                const fallbackId = nextProfiles[0]?.id ?? '';
                setSelectedProfileId(fallbackId);
                setProfileNameInput(fallbackId ? nextProfiles[0]!.name : '');
                if (profileId === activeProfileId) {
                    setActiveProfileId(fallbackId);
                    persistLastSelection(fallbackId || null);
                }
            } else if (profileId === activeProfileId) {
                const fallbackId = nextProfiles[0]?.id ?? '';
                setActiveProfileId(fallbackId);
                persistLastSelection(fallbackId || null);
            }
            setSaveFeedback({ type: 'success', message: 'Calibration profile deleted.' });
        },
        [activeProfileId, persistLastSelection, refreshProfiles, selectedProfileId],
    );

    const dismissFeedback = useCallback(() => {
        setSaveFeedback(null);
    }, []);

    const reportFeedback = useCallback((type: 'success' | 'error', message: string) => {
        setSaveFeedback({ type, message });
    }, []);

    const importProfileFromJson = useCallback(
        (payload: string): CalibrationProfile | null => {
            const storage = getLocalStorage();
            if (!storage) {
                setSaveFeedback({
                    type: 'error',
                    message: 'Local storage is unavailable; cannot import profile.',
                });
                return null;
            }
            const result = importCalibrationProfileFromJson(storage, payload);
            if (!result.profile) {
                setSaveFeedback({
                    type: 'error',
                    message: result.error ?? 'Unable to import calibration profile.',
                });
                return null;
            }
            refreshProfiles();
            setSelectedProfileId(result.profile.id);
            setProfileNameInput(result.profile.name);
            setActiveProfileId(result.profile.id);
            persistLastSelection(result.profile.id);
            const duplicateSuffix = result.replacedProfileId ? ' (duplicate id replaced)' : '';
            setSaveFeedback({
                type: 'success',
                message: `Imported profile "${result.profile.name}"${duplicateSuffix}.`,
            });
            return result.profile;
        },
        [persistLastSelection, refreshProfiles],
    );

    return {
        profiles,
        selectedProfileId,
        selectedProfile,
        activeProfileId,
        activeProfile,
        activeProfileSummary,
        profileNameInput,
        setProfileNameInput,
        selectProfileId,
        resetProfileSelection,
        saveProfile,
        deleteProfile,
        loadProfile,
        importProfileFromJson,
        canSaveProfile,
        saveFeedback,
        dismissFeedback,
        reportFeedback,
        currentGridFingerprint,
    };
};
