import React, { useEffect, useMemo, useState } from 'react';

import type { CalibrationCommandLogEntry } from '@/services/calibrationRunner';

import { buildCommandLogGroups, formatLogTileLabel } from './commandLogUtils';

type CommandLogMode = 'auto' | 'step';

interface CalibrationCommandLogProps {
    entries: CalibrationCommandLogEntry[];
    mode: CommandLogMode;
}

const DEFAULT_MAX_HEIGHT = 'max-h-64';

const CalibrationCommandLog: React.FC<CalibrationCommandLogProps> = ({ entries, mode }) => {
    const [collapsed, setCollapsed] = useState(true);
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
        <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500">Command log</p>
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span className="hidden sm:inline">Mode: {mode}</span>
                    <button
                        type="button"
                        className="rounded border border-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-200 hover:bg-gray-800"
                        onClick={() => setCollapsed((prev) => !prev)}
                        aria-pressed={!collapsed}
                    >
                        {collapsed ? 'Expand' : 'Collapse'} log
                    </button>
                </div>
            </div>
            {!collapsed && logGroups.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-500">
                    No commands logged yet.
                </div>
            )}
            {!collapsed && logGroups.length > 0 && (
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
                                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-300 hover:bg-gray-800"
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
                                                        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                                                            {tileLabel}
                                                        </span>
                                                    )}
                                                    <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-500">
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
        </div>
    );
};

export default CalibrationCommandLog;
