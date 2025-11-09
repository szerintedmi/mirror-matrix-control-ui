import React from 'react';

import { useLogStore, type LogEntry } from '../context/LogContext';

interface LogConsoleProps {
    scope?: string;
    maxEntries?: number;
    title?: string;
}

const severityClass = (severity: LogEntry['severity']): string => {
    switch (severity) {
        case 'error':
            return 'text-red-300';
        case 'warning':
            return 'text-amber-200';
        default:
            return 'text-sky-200';
    }
};

const formatTimestamp = (timestamp: number): string =>
    new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

const LogConsole: React.FC<LogConsoleProps> = ({ scope, maxEntries = 50, title = 'Log' }) => {
    const { entries, clear } = useLogStore();
    const scopedEntries = React.useMemo(() => {
        const filtered = scope ? entries.filter((entry) => entry.scope === scope) : entries;
        return filtered.slice(0, maxEntries);
    }, [entries, maxEntries, scope]);

    return (
        <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 shadow-inner">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
                <button
                    type="button"
                    onClick={clear}
                    disabled={entries.length === 0}
                    className={`text-xs uppercase tracking-wide ${
                        entries.length === 0
                            ? 'cursor-not-allowed text-gray-600'
                            : 'text-gray-400 transition hover:text-gray-200'
                    }`}
                >
                    Clear
                </button>
            </div>
            {scopedEntries.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-700 bg-gray-900/50 p-4 text-center text-sm text-gray-500">
                    No log entries yet.
                </div>
            ) : (
                <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                    {scopedEntries.map((entry) => (
                        <article
                            key={entry.id}
                            className="rounded-md border border-gray-800/60 bg-gray-900/40 p-3 text-sm"
                        >
                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{formatTimestamp(entry.timestamp)}</span>
                                <span className="uppercase tracking-wide">{entry.scope}</span>
                            </div>
                            <p className={`mt-1 font-medium ${severityClass(entry.severity)}`}>
                                {entry.message}
                            </p>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
};

export default LogConsole;
