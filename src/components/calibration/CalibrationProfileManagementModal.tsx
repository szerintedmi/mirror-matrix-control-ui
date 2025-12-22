import React, { useCallback, useMemo, useRef, useState } from 'react';

import Modal from '@/components/Modal';
import { useCalibrationContext } from '@/context/CalibrationContext';
import {
    buildCalibrationProfileExportPayload,
    deleteCalibrationProfile,
    importCalibrationProfileFromJson,
} from '@/services/calibrationProfileStorage';
import { deleteDraftProfile, DRAFT_PROFILE_ID } from '@/services/draftProfileService';
import { getGridStateFingerprint, type GridStateSnapshot } from '@/services/gridStorage';
import type { CalibrationProfile, MirrorConfig } from '@/types';

import DropdownMenu from '../common/DropdownMenu';

interface CalibrationProfileManagementModalProps {
    open: boolean;
    onClose: () => void;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const formatTimestamp = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
};

const buildExportFileName = (profile: CalibrationProfile): string => {
    const slug = profile.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const fallback = slug || 'calibration-profile';
    const date = new Date(profile.updatedAt);
    const timestamp = Number.isNaN(date.getTime())
        ? 'export'
        : date.toISOString().replace(/[:]/g, '').replace('T', '-').split('.')[0];
    return `${fallback}-${timestamp}.json`;
};

const CalibrationProfileManagementModal: React.FC<CalibrationProfileManagementModalProps> = ({
    open,
    onClose,
    gridSize,
    mirrorConfig,
}) => {
    const { savedProfiles, draftProfile, selectedProfileId, selectProfile, refreshProfiles } =
        useCalibrationContext();

    const [draftName, setDraftName] = useState('');
    const [saveTarget, setSaveTarget] = useState<'new' | string>('new');
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        profileId: string;
        profileName: string;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );

    const currentGridFingerprint = useMemo(() => {
        const snapshot: GridStateSnapshot = { gridSize, mirrorConfig };
        return getGridStateFingerprint(snapshot).hash;
    }, [gridSize, mirrorConfig]);

    const sortedProfiles = useMemo(
        () => [...savedProfiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        [savedProfiles],
    );

    const handleLoadProfile = useCallback(
        (profileId: string) => {
            selectProfile(profileId);
            setFeedback({ type: 'success', message: 'Profile loaded' });
        },
        [selectProfile],
    );

    const handleExportProfile = useCallback((profile: CalibrationProfile) => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            setFeedback({ type: 'error', message: 'Export is unavailable' });
            return;
        }
        try {
            const payload = buildCalibrationProfileExportPayload(profile);
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = buildExportFileName(profile);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            setFeedback({ type: 'success', message: 'Profile exported' });
        } catch {
            setFeedback({ type: 'error', message: 'Export failed' });
        }
    }, []);

    const handleRequestDelete = useCallback((profileId: string, profileName: string) => {
        setDeleteConfirmation({ profileId, profileName });
    }, []);

    const handleConfirmDelete = useCallback(() => {
        if (!deleteConfirmation) {
            return;
        }
        const { profileId } = deleteConfirmation;
        const isDraft = profileId === DRAFT_PROFILE_ID;
        if (isDraft) {
            deleteDraftProfile(resolvedStorage);
        } else {
            deleteCalibrationProfile(resolvedStorage, profileId);
        }
        // refreshProfiles will automatically select a fallback if the deleted profile was selected
        refreshProfiles();
        setDeleteConfirmation(null);
        setFeedback({ type: 'success', message: 'Profile deleted' });
    }, [deleteConfirmation, refreshProfiles, resolvedStorage]);

    const handleCancelDelete = useCallback(() => {
        setDeleteConfirmation(null);
    }, []);

    const handleImportClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleImportFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (!file) {
                return;
            }
            try {
                const contents = await file.text();
                const result = importCalibrationProfileFromJson(resolvedStorage, contents);
                if (!result.profile) {
                    setFeedback({ type: 'error', message: result.error ?? 'Import failed' });
                    return;
                }
                refreshProfiles();
                selectProfile(result.profile.id);
                setFeedback({
                    type: 'success',
                    message: `Imported "${result.profile.name}"`,
                });
            } catch {
                setFeedback({ type: 'error', message: 'Failed to read file' });
            }
        },
        [refreshProfiles, resolvedStorage, selectProfile],
    );

    const handleSaveDraft = useCallback(() => {
        if (!draftProfile) {
            return;
        }

        const payload = buildCalibrationProfileExportPayload(draftProfile);

        if (saveTarget === 'new') {
            // Save as new profile
            payload.profile.name = draftName.trim() || 'Saved Calibration';
            payload.profile.id = `cal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        } else {
            // Overwrite existing profile - keep the target's ID and use its name (or new name if provided)
            const targetProfile = savedProfiles.find((p) => p.id === saveTarget);
            if (!targetProfile) {
                setFeedback({ type: 'error', message: 'Target profile not found' });
                return;
            }
            payload.profile.id = saveTarget;
            payload.profile.name = draftName.trim() || targetProfile.name;
            // Delete the existing profile first so import doesn't generate a new ID
            deleteCalibrationProfile(resolvedStorage, saveTarget);
        }

        const json = JSON.stringify(payload, null, 2);
        const result = importCalibrationProfileFromJson(resolvedStorage, json);
        if (!result.profile) {
            setFeedback({ type: 'error', message: 'Failed to save draft' });
            return;
        }

        // Delete the draft
        deleteDraftProfile(resolvedStorage);
        refreshProfiles();
        selectProfile(result.profile.id);
        setDraftName('');
        setSaveTarget('new');
        setFeedback({
            type: 'success',
            message:
                saveTarget === 'new'
                    ? `Saved as "${result.profile.name}"`
                    : `Updated "${result.profile.name}"`,
        });
    }, [draftName, draftProfile, refreshProfiles, resolvedStorage, saveTarget, savedProfiles, selectProfile]);

    const handleDismissFeedback = useCallback(() => {
        setFeedback(null);
    }, []);

    return (
        <Modal open={open} onClose={onClose} title="Calibration Profiles">
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
                {/* Draft Section */}
                {draftProfile && (
                    <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-semibold text-amber-200">
                                    Unsaved Draft
                                </h3>
                                <p className="text-xs text-amber-300/70">
                                    Calibration completed but not saved
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    handleRequestDelete(DRAFT_PROFILE_ID, 'Unsaved Draft')
                                }
                                className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300"
                            >
                                Discard
                            </button>
                        </div>
                        <div className="mt-3 flex flex-col gap-3">
                            <div className="flex items-end gap-3">
                                <div className="w-40">
                                    <label
                                        htmlFor="save-target"
                                        className="mb-1 block text-xs text-amber-300/70"
                                    >
                                        Save to
                                    </label>
                                    <select
                                        id="save-target"
                                        value={saveTarget}
                                        onChange={(e) => {
                                            setSaveTarget(e.target.value);
                                            // Clear name when switching to overwrite mode
                                            if (e.target.value !== 'new') {
                                                setDraftName('');
                                            }
                                        }}
                                        className="w-full rounded-md border border-amber-500/30 bg-gray-900/60 px-3 py-2 text-sm text-gray-100"
                                    >
                                        <option value="new">New profile</option>
                                        {sortedProfiles.length > 0 && (
                                            <optgroup label="Overwrite existing">
                                                {sortedProfiles.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label
                                        htmlFor="draft-name"
                                        className="mb-1 block text-xs text-amber-300/70"
                                    >
                                        {saveTarget === 'new' ? 'Profile name' : 'Rename (optional)'}
                                    </label>
                                    <input
                                        id="draft-name"
                                        type="text"
                                        value={draftName}
                                        onChange={(e) => setDraftName(e.target.value)}
                                        placeholder={
                                            saveTarget === 'new'
                                                ? 'e.g. Production calibration'
                                                : sortedProfiles.find((p) => p.id === saveTarget)
                                                      ?.name ?? ''
                                        }
                                        className="w-full rounded-md border border-amber-500/30 bg-gray-900/60 px-3 py-2 text-sm text-gray-100"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveDraft}
                                    className="rounded-md border border-amber-500/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/30"
                                >
                                    {saveTarget === 'new' ? 'Save' : 'Overwrite'}
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-200">
                        Saved Profiles ({sortedProfiles.length})
                    </h3>
                    <button
                        type="button"
                        onClick={handleImportClick}
                        className="rounded-md border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 hover:border-sky-400"
                    >
                        Import
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={handleImportFileChange}
                    />
                </div>

                {/* Feedback */}
                {feedback && (
                    <div
                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                            feedback.type === 'success'
                                ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-200'
                                : 'border-rose-500/50 bg-rose-500/5 text-rose-200'
                        }`}
                    >
                        <span>{feedback.message}</span>
                        <button
                            type="button"
                            onClick={handleDismissFeedback}
                            className="ml-3 text-[10px] text-gray-400 uppercase hover:text-gray-200"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Profile List */}
                {sortedProfiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                        <svg
                            className="size-10 text-gray-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                        </svg>
                        <p className="text-sm text-gray-400">No calibration profiles saved</p>
                        <p className="text-xs text-gray-500">Run calibration to create a profile</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {sortedProfiles.map((profile) => {
                            const isActive = profile.id === selectedProfileId;
                            const gridMatch =
                                profile.gridStateFingerprint.hash === currentGridFingerprint;
                            return (
                                <div
                                    key={profile.id}
                                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                                        isActive
                                            ? 'border-emerald-500/60 bg-emerald-500/5'
                                            : 'border-gray-800 bg-gray-900/40'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-gray-100">
                                            {profile.name}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {formatTimestamp(profile.updatedAt)}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {isActive && (
                                                <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                                                    Active
                                                </span>
                                            )}
                                            {gridMatch && (
                                                <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                                                    Matches grid
                                                </span>
                                            )}
                                            {profile.metrics.failedTiles > 0 && (
                                                <span className="rounded-full border border-rose-500/60 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">
                                                    {profile.metrics.failedTiles} failed
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleLoadProfile(profile.id)}
                                            disabled={isActive}
                                            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                                                isActive
                                                    ? 'cursor-not-allowed border-gray-700 text-gray-500'
                                                    : 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                                            }`}
                                        >
                                            {isActive ? 'Active' : 'Load'}
                                        </button>
                                        <DropdownMenu
                                            items={[
                                                {
                                                    label: 'Export',
                                                    icon: (
                                                        <svg
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                                            />
                                                        </svg>
                                                    ),
                                                    onClick: () => handleExportProfile(profile),
                                                },
                                                {
                                                    label: 'Delete',
                                                    icon: (
                                                        <svg
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                            />
                                                        </svg>
                                                    ),
                                                    onClick: () =>
                                                        handleRequestDelete(
                                                            profile.id,
                                                            profile.name,
                                                        ),
                                                    variant: 'danger',
                                                },
                                            ]}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <Modal
                open={deleteConfirmation !== null}
                onClose={handleCancelDelete}
                title="Delete Profile"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-300">
                        Are you sure you want to delete{' '}
                        <span className="font-semibold text-gray-100">
                            &ldquo;{deleteConfirmation?.profileName}&rdquo;
                        </span>
                        ? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleCancelDelete}
                            className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmDelete}
                            className="rounded-md border border-rose-600 bg-rose-600/20 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-600/30"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </Modal>
        </Modal>
    );
};

export default CalibrationProfileManagementModal;
