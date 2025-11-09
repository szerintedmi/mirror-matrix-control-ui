import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type PropsWithChildren,
} from 'react';

export type LogSeverity = 'info' | 'warning' | 'error';

export interface LogEntry {
    id: string;
    scope: string;
    severity: LogSeverity;
    message: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

interface AppendLogParams {
    scope: string;
    severity: LogSeverity;
    message: string;
    metadata?: Record<string, unknown>;
    timestamp?: number;
}

interface LogContextValue {
    entries: LogEntry[];
    append: (entry: AppendLogParams) => void;
    clear: () => void;
}

const MAX_LOG_ENTRIES = 200;

const LogContext = createContext<LogContextValue | undefined>(undefined);

const createLogId = (() => {
    let counter = 0;
    return () => {
        counter += 1;
        return `log-${Date.now()}-${counter}`;
    };
})();

export const LogProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const [entries, setEntries] = useState<LogEntry[]>([]);

    const append = useCallback((entry: AppendLogParams) => {
        setEntries((prev) => {
            const nextEntry: LogEntry = {
                id: createLogId(),
                scope: entry.scope,
                severity: entry.severity,
                message: entry.message,
                metadata: entry.metadata,
                timestamp: entry.timestamp ?? Date.now(),
            };
            return [nextEntry, ...prev].slice(0, MAX_LOG_ENTRIES);
        });
    }, []);

    const clear = useCallback(() => setEntries([]), []);

    const value = useMemo<LogContextValue>(
        () => ({
            entries,
            append,
            clear,
        }),
        [append, clear, entries],
    );

    return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
};

const useLogContext = (): LogContextValue => {
    const context = useContext(LogContext);
    if (!context) {
        throw new Error('useLogStore must be used within a LogProvider');
    }
    return context;
};

export const useLogStore = () => {
    const { entries, append, clear } = useLogContext();

    const log = useCallback(
        (
            severity: LogSeverity,
            scope: string,
            message: string,
            metadata?: Record<string, unknown>,
        ) => {
            append({ severity, scope, message, metadata });
        },
        [append],
    );

    const logInfo = useCallback(
        (scope: string, message: string, metadata?: Record<string, unknown>) =>
            log('info', scope, message, metadata),
        [log],
    );

    const logWarning = useCallback(
        (scope: string, message: string, metadata?: Record<string, unknown>) =>
            log('warning', scope, message, metadata),
        [log],
    );

    const logError = useCallback(
        (scope: string, message: string, metadata?: Record<string, unknown>) =>
            log('error', scope, message, metadata),
        [log],
    );

    return {
        entries,
        logInfo,
        logWarning,
        logError,
        clear,
    };
};
