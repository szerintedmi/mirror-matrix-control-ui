import React, { useEffect, useMemo, useState } from 'react';

import CollapsibleSection from '@/components/common/CollapsibleSection';
import type { CalibrationCommandLogEntry } from '@/services/calibration/types';

import { buildCommandLogGroups, formatLogTileLabel } from './commandLogUtils';

type CommandLogMode = 'auto' | 'step';

interface CalibrationCommandLogProps {
    entries: CalibrationCommandLogEntry[];
    mode: CommandLogMode;
    onClearLog?: () => void;
}

const DEFAULT_MAX_HEIGHT = 'max-h-64';

const CalibrationCommandLog: React.FC<CalibrationCommandLogProps> = ({
    entries,
    mode,
    onClearLog,
}) => {
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    const logGroups = useMemo(() => buildCommandLogGroups(entries), [entries]);

    // Ensure new groups start collapsed while preserving user toggles
    useEffect(() => {
        if (logGroups.length === 0) {
            return;
        }
        setTimeout(() => {
            setCollapsedGroups((prev) => {
                const next = { ...prev };
                logGroups.forEach((group) => {
                    if (next[group.id] === undefined) {
                        next[group.id] = true;
                    }
                });
                return next;
            });
        }, 0);
    }, [logGroups]);

    return (
        <CollapsibleSection
            title="Command Log"
            collapsedSummary={`${entries.length} entries`}
            defaultExpanded={false}
            icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                </svg>
            }
            headerActions={
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span className="hidden sm:inline">Mode: {mode}</span>
                    {onClearLog && entries.length > 0 && (
                        <button
                            type="button"
                            className="text-xs text-gray-500 hover:text-gray-300"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClearLog();
                            }}
                        >
                            Clear
                        </button>
                    )}
                </div>
            }
            className="mt-4"
        >
            {logGroups.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-500">
                    No commands logged yet.
                </div>
            ) : (
                <div className={`flex flex-col gap-3 ${DEFAULT_MAX_HEIGHT} overflow-y-auto pr-1`}>
                    {logGroups.map((group) => {
                        const isCollapsed = collapsedGroups[group.id] ?? true;
                        return (
                            <div
                                key={`${group.id}-${group.latest?.id ?? 'empty'}`}
                                className="rounded-md border border-gray-800 bg-gray-900/50"
                                data-testid="command-log-group"
                            >
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold tracking-wide text-gray-300 uppercase hover:bg-gray-800"
                                    onClick={() =>
                                        setCollapsedGroups((prev) => ({
                                            ...prev,
                                            [group.id]: !isCollapsed,
                                        }))
                                    }
                                    aria-pressed={!isCollapsed}
                                >
                                    <span>{group.label}</span>
                                    <span className="text-[11px] text-gray-500">
                                        {isCollapsed ? 'Expand' : 'Collapse'}
                                    </span>
                                </button>
                                {!isCollapsed && (
                                    <div className="flex flex-col divide-y divide-gray-800 text-xs">
                                        {group.entries.map((entry) => {
                                            const tileLabel = formatLogTileLabel(entry);
                                            return (
                                                <div
                                                    key={entry.id}
                                                    className="flex flex-wrap items-center gap-3 px-3 py-1"
                                                    data-testid="command-log-entry"
                                                    data-entry-id={entry.id}
                                                >
                                                    <span className="font-mono text-gray-500">
                                                        {new Date(
                                                            entry.timestamp,
                                                        ).toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                            second: '2-digit',
                                                            fractionalSecondDigits: 3,
                                                        })}
                                                    </span>
                                                    <span className="text-gray-200">
                                                        {entry.hint}
                                                    </span>
                                                    {tileLabel && (
                                                        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] tracking-wide text-gray-300 uppercase">
                                                            {tileLabel}
                                                        </span>
                                                    )}
                                                    <span className="ml-auto text-[10px] tracking-wide text-gray-500 uppercase">
                                                        {entry.phase}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </CollapsibleSection>
    );
};

export default CalibrationCommandLog;
