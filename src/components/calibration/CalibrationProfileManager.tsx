import React, { useMemo, useState } from 'react';

import type { CalibrationProfile } from '@/types';

import { formatPercent } from './calibrationMetricsFormatters';

interface CalibrationProfileManagerProps {
    profiles: CalibrationProfile[];
    selectedProfileId: string;
    activeProfileId: string;
    onSelectProfile: (profileId: string) => void;
    onDeleteProfile: (profileId: string) => void;
    onLoadProfile: (profileId: string) => void;
    profileName: string;
    onProfileNameChange: (value: string) => void;
    onSaveProfile: () => void;
    onNewProfile: () => void;
    canSave: boolean;
    saveFeedback: { type: 'success' | 'error'; message: string } | null;
    onDismissFeedback: () => void;
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

const CalibrationProfileManager: React.FC<CalibrationProfileManagerProps> = ({
    profiles,
    selectedProfileId,
    activeProfileId,
    onSelectProfile,
    onDeleteProfile,
    onLoadProfile,
    profileName,
    onProfileNameChange,
    onSaveProfile,
    onNewProfile,
    canSave,
    saveFeedback,
    onDismissFeedback,
    lastRunSummary,
    currentGridFingerprint,
}) => {
    const sortedProfiles = useMemo(
        () => [...profiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        [profiles],
    );
    const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);

    const handleToggleDetails = (profileId: string) => {
        setExpandedProfileId((prev) => (prev === profileId ? null : profileId));
    };

    const handleLoadSelected = () => {
        if (selectedProfileId) {
            onLoadProfile(selectedProfileId);
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
                <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <label className="flex flex-col gap-1">
                        <span>Saved profiles</span>
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={selectedProfileId}
                                onChange={(event) => onSelectProfile(event.target.value)}
                                className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                            >
                                <option value="">Select saved profile</option>
                                {sortedProfiles.map((profile) => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={handleLoadSelected}
                                disabled={!selectedProfileId}
                                className="rounded-md border border-sky-500/60 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 disabled:opacity-40"
                            >
                                Load
                            </button>
                        </div>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span>Profile name</span>
                        <input
                            type="text"
                            value={profileName}
                            onChange={(event) => onProfileNameChange(event.target.value)}
                            placeholder="e.g. Lab wall baseline"
                            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onSaveProfile}
                        disabled={!canSave}
                        className={`rounded-md px-3 py-1 text-sm font-semibold transition ${
                            canSave
                                ? 'border border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400'
                                : 'border border-gray-700 bg-gray-800 text-gray-500'
                        }`}
                    >
                        Save profile
                    </button>
                    <button
                        type="button"
                        onClick={onNewProfile}
                        className="rounded-md border border-gray-700 px-3 py-1 text-sm text-gray-200 hover:border-gray-500"
                    >
                        New entry
                    </button>
                    {!canSave && (
                        <p className="text-xs text-amber-300">Run calibration to enable saving.</p>
                    )}
                </div>
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
                            className="ml-3 text-[10px] uppercase tracking-wide text-gray-400 hover:text-gray-200"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
            </div>
            <div className="mt-6 border-t border-gray-900/60 pt-4">
                {sortedProfiles.length === 0 ? (
                    <p className="text-sm text-gray-400">
                        No calibration profiles saved yet. Capture a run and click “Save profile” to
                        store the normalized data.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {sortedProfiles.map((profile) => (
                            <ProfileCard
                                key={profile.id}
                                profile={profile}
                                selected={profile.id === selectedProfileId}
                                active={profile.id === activeProfileId}
                                expanded={expandedProfileId === profile.id}
                                onToggle={() => handleToggleDetails(profile.id)}
                                onDelete={onDeleteProfile}
                                onLoad={onLoadProfile}
                                gridMatch={profile.gridStateFingerprint === currentGridFingerprint}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

interface ProfileCardProps {
    profile: CalibrationProfile;
    selected: boolean;
    active: boolean;
    expanded: boolean;
    onToggle: () => void;
    onDelete: (profileId: string) => void;
    onLoad: (profileId: string) => void;
    gridMatch: boolean;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
    profile,
    selected,
    active,
    expanded,
    onToggle,
    onDelete,
    onLoad,
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

    const handleDelete = () => {
        if (
            typeof window === 'undefined' ||
            window.confirm(`Delete calibration profile "${profile.name}"?`)
        ) {
            onDelete(profile.id);
        }
    };

    const handleLoad = () => onLoad(profile.id);

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
                selected
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
                <div className="flex flex-col gap-2 text-xs">
                    <button
                        type="button"
                        onClick={handleLoad}
                        className="rounded-md border border-emerald-500/70 bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-200"
                    >
                        Load
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="rounded-md border border-rose-600/60 px-2 py-1 font-semibold text-rose-200"
                    >
                        Delete
                    </button>
                    <button
                        type="button"
                        onClick={onToggle}
                        className="rounded-md border border-gray-700 px-2 py-1 font-semibold text-gray-200"
                    >
                        {expanded ? 'Hide details' : 'Show details'}
                    </button>
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
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
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
