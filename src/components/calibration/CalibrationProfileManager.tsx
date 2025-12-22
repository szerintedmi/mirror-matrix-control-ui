import React, { useCallback, useMemo, useRef, useState } from 'react';

import DropdownMenu from '@/components/common/DropdownMenu';
import Modal from '@/components/Modal';
import { buildCalibrationProfileExportPayload } from '@/services/calibrationProfileStorage';
import type { CalibrationProfile } from '@/types';

import { formatPercent } from './calibrationMetricsFormatters';

interface CalibrationProfileManagerProps {
    profiles: CalibrationProfile[];
    activeProfileId: string;
    selectedProfileId: string;
    onDeleteProfile: (profileId: string) => void;
    onLoadProfile: (profileId: string) => void;
    profileName: string;
    onProfileNameChange: (value: string) => void;
    onSaveProfile: () => void;
    onSaveAsNewProfile: () => void;
    onImportProfile: (payload: string) => void;
    canSave: boolean;
    saveFeedback: { type: 'success' | 'error'; message: string } | null;
    onDismissFeedback: () => void;
    onReportFeedback: (type: 'success' | 'error', message: string) => void;
    lastRunSummary: {
        total: number;
        completed: number;
        failed: number;
        skipped: number;
    };
    currentGridFingerprint: string;
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

const CalibrationProfileManager: React.FC<CalibrationProfileManagerProps> = ({
    profiles,
    activeProfileId,
    selectedProfileId,
    onDeleteProfile,
    onLoadProfile,
    profileName,
    onProfileNameChange,
    onSaveProfile,
    onSaveAsNewProfile,
    onImportProfile,
    canSave,
    saveFeedback,
    onDismissFeedback,
    onReportFeedback,
    lastRunSummary,
    currentGridFingerprint,
}) => {
    const isUpdatingExisting = Boolean(selectedProfileId);
    const sortedProfiles = useMemo(
        () => [...profiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        [profiles],
    );
    const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        profileId: string;
        profileName: string;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleToggleDetails = (profileId: string) => {
        setExpandedProfileId((prev) => (prev === profileId ? null : profileId));
    };

    const handleRequestDelete = useCallback((profileId: string, profileName: string) => {
        setDeleteConfirmation({ profileId, profileName });
    }, []);

    const handleConfirmDelete = useCallback(() => {
        if (deleteConfirmation) {
            onDeleteProfile(deleteConfirmation.profileId);
            setDeleteConfirmation(null);
        }
    }, [deleteConfirmation, onDeleteProfile]);

    const handleCancelDelete = useCallback(() => {
        setDeleteConfirmation(null);
    }, []);

    const handleExportProfile = (profile: CalibrationProfile) => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            onReportFeedback('error', 'Export is unavailable in this environment.');
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
        } catch (error) {
            console.error('Failed to export calibration profile', error);
            onReportFeedback('error', 'Unable to export calibration profile.');
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleImportFileChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        const file = event.target.files?.[0] ?? null;
        event.target.value = '';
        if (!file) {
            return;
        }
        try {
            const contents = await file.text();
            onImportProfile(contents);
        } catch (error) {
            console.error('Failed to read calibration import file', error);
            onReportFeedback('error', 'Unable to read the selected file.');
        }
    };

    return (
        <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-100">Calibration Profiles</h2>
                    <p className="text-sm text-gray-400">
                        Saved entries:{' '}
                        <span className="font-semibold">{sortedProfiles.length}</span>
                    </p>
                </div>
                <div className="text-right text-xs text-gray-400">
                    <p>
                        Active run — Completed {lastRunSummary.completed} / {lastRunSummary.total}
                    </p>
                    <p>
                        Failed {lastRunSummary.failed} · Skipped {lastRunSummary.skipped}
                    </p>
                </div>
            </div>
            <div className="mt-4 space-y-4 text-sm text-gray-300">
                <div className="flex flex-wrap items-end gap-4">
                    <label className="flex flex-1 flex-col gap-1">
                        <span className="text-xs tracking-wide text-gray-500 uppercase">
                            Profile name
                        </span>
                        <input
                            type="text"
                            value={profileName}
                            onChange={(event) => onProfileNameChange(event.target.value)}
                            placeholder="e.g. Lab wall baseline"
                            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                        />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center">
                            <button
                                type="button"
                                onClick={onSaveProfile}
                                disabled={!canSave}
                                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                                    canSave
                                        ? 'border border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400'
                                        : 'border border-gray-700 bg-gray-800 text-gray-500'
                                } ${isUpdatingExisting ? 'rounded-r-none border-r-0' : ''}`}
                            >
                                {isUpdatingExisting ? 'Update' : 'Save as new'}
                            </button>
                            {isUpdatingExisting && (
                                <DropdownMenu
                                    items={[
                                        {
                                            label: 'Save as new profile',
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
                                                        d="M12 4v16m8-8H4"
                                                    />
                                                </svg>
                                            ),
                                            onClick: onSaveAsNewProfile,
                                            disabled: !canSave,
                                        },
                                    ]}
                                    triggerClassName={`rounded-l-none border-l-0 h-[38px] ${
                                        canSave
                                            ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400'
                                            : 'border-gray-700 bg-gray-800 text-gray-500'
                                    }`}
                                />
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleImportClick}
                            className="rounded-md border border-sky-500/60 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:border-sky-400"
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
                </div>
                {!canSave && (
                    <p className="text-xs text-amber-300">Run calibration to enable saving.</p>
                )}
                {saveFeedback && (
                    <div
                        className={`flex items-start justify-between rounded-md border px-3 py-2 text-xs ${
                            saveFeedback.type === 'success'
                                ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-200'
                                : 'border-rose-500/50 bg-rose-500/5 text-rose-200'
                        }`}
                    >
                        <span>{saveFeedback.message}</span>
                        <button
                            type="button"
                            onClick={onDismissFeedback}
                            className="ml-3 text-[10px] tracking-wide text-gray-400 uppercase hover:text-gray-200"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
            </div>
            <div className="mt-6 border-t border-gray-900/60 pt-4">
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
                        <p className="text-xs text-gray-500">
                            Run calibration and click &ldquo;Save profile&rdquo; to store the
                            results
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {sortedProfiles.map((profile) => (
                            <ProfileCard
                                key={profile.id}
                                profile={profile}
                                active={profile.id === activeProfileId}
                                expanded={expandedProfileId === profile.id}
                                onToggle={() => handleToggleDetails(profile.id)}
                                onRequestDelete={handleRequestDelete}
                                onLoad={onLoadProfile}
                                onExport={handleExportProfile}
                                gridMatch={
                                    profile.gridStateFingerprint.hash === currentGridFingerprint
                                }
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <Modal
                open={deleteConfirmation !== null}
                onClose={handleCancelDelete}
                title="Delete Calibration Profile"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-300">
                        Are you sure you want to delete the profile{' '}
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
        </section>
    );
};

interface ProfileCardProps {
    profile: CalibrationProfile;
    active: boolean;
    expanded: boolean;
    onToggle: () => void;
    onRequestDelete: (profileId: string, profileName: string) => void;
    onLoad: (profileId: string) => void;
    onExport: (profile: CalibrationProfile) => void;
    gridMatch: boolean;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
    profile,
    active,
    expanded,
    onToggle,
    onRequestDelete,
    onLoad,
    onExport,
    gridMatch,
}) => {
    const calibratable = profile.metrics.totalTiles - profile.metrics.skippedTiles;
    const hasMissing = calibratable > profile.metrics.completedTiles;
    const hasFailures = profile.metrics.failedTiles > 0;
    const blueprintMissing = !profile.gridBlueprint;
    const gapX = profile.gridBlueprint?.tileGap.x ?? null;
    const gapY = profile.gridBlueprint?.tileGap.y ?? null;
    const footprintWidth = profile.gridBlueprint?.adjustedTileFootprint.width ?? null;
    const footprintHeight = profile.gridBlueprint?.adjustedTileFootprint.height ?? null;

    const handleDelete = () => onRequestDelete(profile.id, profile.name);
    const handleLoad = () => onLoad(profile.id);
    const handleExport = () => onExport(profile);

    const quickTags = [
        active ? { tone: 'success' as const, label: 'Active' } : null,
        gridMatch ? { tone: 'success' as const, label: 'Matches grid' } : null,
        hasMissing ? { tone: 'warning' as const, label: 'Partial' } : null,
        hasFailures ? { tone: 'error' as const, label: 'Failures' } : null,
        blueprintMissing ? { tone: 'error' as const, label: 'Missing blueprint' } : null,
    ].filter(Boolean) as { tone: 'success' | 'warning' | 'error'; label: string }[];

    return (
        <div
            className={`flex flex-col gap-3 rounded-lg border p-3 transition ${
                active
                    ? 'border-emerald-500/70 bg-emerald-500/5 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
                    : 'border-gray-800 bg-gray-900/40'
            }`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-base font-semibold text-gray-100">{profile.name}</p>
                    <p className="text-xs text-gray-400">
                        Updated {formatTimestamp(profile.updatedAt)} · Δsteps ±
                        {profile.stepTestSettings.deltaSteps}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                        {quickTags.length === 0 ? (
                            <Tag tone="success">Ready</Tag>
                        ) : (
                            quickTags.map((tag) => (
                                <Tag key={tag.label} tone={tag.tone}>
                                    {tag.label}
                                </Tag>
                            ))
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleLoad}
                        className="rounded-md border border-emerald-500/70 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                    >
                        Load
                    </button>
                    <DropdownMenu
                        items={[
                            {
                                label: 'Export',
                                icon: (
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                        />
                                    </svg>
                                ),
                                onClick: handleExport,
                            },
                            {
                                label: expanded ? 'Hide details' : 'Show details',
                                icon: (
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                ),
                                onClick: onToggle,
                            },
                            {
                                label: 'Delete',
                                icon: (
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                    </svg>
                                ),
                                onClick: handleDelete,
                                variant: 'danger',
                            },
                        ]}
                    />
                </div>
            </div>
            {expanded && (
                <div className="space-y-3 text-xs text-gray-200">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <ProfileStat
                            label="Calibrated"
                            value={`${profile.metrics.completedTiles}/${calibratable}`}
                            hint="Completed tiles vs calibratable"
                            status={hasMissing ? 'warning' : undefined}
                        />
                        <ProfileStat
                            label="Failed"
                            value={`${profile.metrics.failedTiles}`}
                            hint="Tiles with detection/command errors"
                            status={hasFailures ? 'error' : undefined}
                        />
                        <ProfileStat
                            label="Skipped"
                            value={`${profile.metrics.skippedTiles}`}
                            hint="Tiles without motor assignments"
                        />
                        <ProfileStat
                            label="Grid alignment"
                            value={gridMatch ? 'Matches current' : 'Different grid'}
                            hint="Comparison vs current assignment"
                            status={gridMatch ? 'success' : 'warning'}
                        />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                        <ProfileStat
                            label="Tile width"
                            value={footprintWidth !== null ? formatPercent(footprintWidth) : '—'}
                            hint="Normalized footprint width"
                            status={blueprintMissing ? 'error' : undefined}
                        />
                        <ProfileStat
                            label="Tile height"
                            value={footprintHeight !== null ? formatPercent(footprintHeight) : '—'}
                            hint="Normalized footprint height"
                            status={blueprintMissing ? 'error' : undefined}
                        />
                        <ProfileStat
                            label="Gap (x / y)"
                            value={
                                gapX !== null && gapY !== null
                                    ? `${formatPercent(gapX)} · ${formatPercent(gapY)}`
                                    : '—'
                            }
                            hint="Captured installer gap"
                            status={blueprintMissing ? 'error' : undefined}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

interface ProfileStatProps {
    label: string;
    value: string;
    hint: string;
    status?: 'success' | 'warning' | 'error';
}

const ProfileStat: React.FC<ProfileStatProps> = ({ label, value, hint, status }) => {
    const toneClass =
        status === 'success'
            ? 'text-emerald-200'
            : status === 'warning'
              ? 'text-amber-200'
              : status === 'error'
                ? 'text-rose-200'
                : 'text-gray-100';
    return (
        <div className="rounded-md border border-gray-800/70 bg-gray-950/40 p-2">
            <p className="text-[10px] tracking-wide text-gray-500 uppercase">{label}</p>
            <p className={`font-mono text-sm ${toneClass}`}>{value}</p>
            <p className="text-[10px] text-gray-500">{hint}</p>
        </div>
    );
};

interface TagProps {
    children: React.ReactNode;
    tone: 'success' | 'warning' | 'error';
}

const Tag: React.FC<TagProps> = ({ children, tone }) => {
    const toneClass =
        tone === 'success'
            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
            : tone === 'warning'
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
              : 'border-rose-500/60 bg-rose-500/10 text-rose-200';
    return <span className={`rounded-full border px-2 py-0.5 ${toneClass}`}>{children}</span>;
};

export default CalibrationProfileManager;
