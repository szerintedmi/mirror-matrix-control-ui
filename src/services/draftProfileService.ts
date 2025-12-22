/**
 * Draft profile management service.
 *
 * Draft profiles are auto-saved calibration results that haven't been
 * explicitly saved by the user. They use a reserved ID and are replaced
 * on each new calibration run.
 */

import type { CalibrationProfile } from '@/types';

import {
    deleteCalibrationProfile,
    loadCalibrationProfiles,
    saveCalibrationProfile,
    type SaveCalibrationProfileOptions,
} from './calibrationProfileStorage';

/** Reserved profile ID for draft profiles */
export const DRAFT_PROFILE_ID = '__draft__';

/** Default name for draft profiles */
export const DRAFT_PROFILE_NAME = 'Draft (unsaved)';

/**
 * Checks if a profile is a draft profile.
 */
export const isDraftProfile = (profile: CalibrationProfile): boolean =>
    profile.id === DRAFT_PROFILE_ID;

/**
 * Saves or replaces the draft profile.
 * Only one draft can exist at a time.
 */
export const saveDraftProfile = (
    storage: Storage | undefined,
    options: Omit<SaveCalibrationProfileOptions, 'id' | 'name'>,
): CalibrationProfile | null => {
    return saveCalibrationProfile(storage, {
        ...options,
        id: DRAFT_PROFILE_ID,
        name: DRAFT_PROFILE_NAME,
    });
};

/**
 * Retrieves the current draft profile if one exists.
 */
export const getDraftProfile = (storage?: Storage): CalibrationProfile | null => {
    const profiles = loadCalibrationProfiles(storage);
    return profiles.find(isDraftProfile) ?? null;
};

/**
 * Deletes the draft profile if it exists.
 */
export const deleteDraftProfile = (storage?: Storage): void => {
    deleteCalibrationProfile(storage, DRAFT_PROFILE_ID);
};
