import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import {
    PendingCommandTracker,
    type CommandCompletionResult,
    type CommandFailureReason,
    type CommandResponsePayload,
} from '../services/pendingCommandTracker';

import { useMqtt } from './MqttContext';

const decoder = new TextDecoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeResponse = (payload: unknown): CommandResponsePayload | null => {
    if (!isRecord(payload)) {
        return null;
    }
    const rawStatus = payload['status'];
    const rawCmdId = payload['cmd_id'];
    if (typeof rawCmdId !== 'string') {
        return null;
    }
    if (typeof rawStatus !== 'string') {
        return null;
    }
    const status = rawStatus.toLowerCase();
    if (status !== 'ack' && status !== 'done' && status !== 'error') {
        return null;
    }

    const action = typeof payload['action'] === 'string' ? payload['action'] : 'UNKNOWN';
    const result = isRecord(payload['result'])
        ? (payload['result'] as Record<string, unknown>)
        : undefined;
    const errors = Array.isArray(payload['errors'])
        ? payload['errors'].filter(isRecord).map((entry) => ({
              code: typeof entry['code'] === 'string' ? entry['code'] : undefined,
              reason: typeof entry['reason'] === 'string' ? entry['reason'] : undefined,
              message: typeof entry['message'] === 'string' ? entry['message'] : undefined,
          }))
        : undefined;
    const warnings = Array.isArray(payload['warnings'])
        ? payload['warnings'].filter(isRecord).map((entry) => ({
              code: typeof entry['code'] === 'string' ? entry['code'] : undefined,
              reason: typeof entry['reason'] === 'string' ? entry['reason'] : undefined,
              message: typeof entry['message'] === 'string' ? entry['message'] : undefined,
          }))
        : undefined;

    return {
        cmdId: rawCmdId,
        action,
        status,
        result,
        errors,
        warnings,
    };
};

const parseResponsePayload = (payload: Uint8Array): CommandResponsePayload | null => {
    try {
        const text = decoder.decode(payload);
        const parsed = JSON.parse(text);
        return normalizeResponse(parsed);
    } catch (error) {
        console.warn('Failed to decode command response payload', error);
        return null;
    }
};

export interface CommandTrackerContextValue {
    register: (
        cmdId: string,
        options?: { expectAck?: boolean; mac?: string },
    ) => Promise<CommandCompletionResult>;
    cancel: (cmdId: string, reason?: CommandFailureReason) => void;
}

const CommandTrackerContext = createContext<CommandTrackerContextValue | undefined>(undefined);

interface ProviderProps {
    children: React.ReactNode;
}

export const CommandTrackerProvider: React.FC<ProviderProps> = ({ children }) => {
    const { subscribe } = useMqtt();

    // Use ref to hold the tracker - this survives StrictMode double-mounting
    // and allows us to properly handle cleanup without disposal issues
    const trackerRef = React.useRef<PendingCommandTracker | null>(null);

    // Create tracker lazily but synchronously on first access
    // This pattern works correctly with StrictMode
    const getTracker = useCallback((): PendingCommandTracker => {
        if (trackerRef.current === null) {
            trackerRef.current = new PendingCommandTracker();
        }
        return trackerRef.current;
    }, []);

    // Subscribe to command responses
    useEffect(() => {
        const tracker = getTracker();
        const unsubscribe = subscribe(
            'devices/+/cmd/resp',
            (_topic, payload) => {
                const parsed = parseResponsePayload(payload);
                if (parsed) {
                    tracker.handleResponse(parsed);
                }
            },
            { qos: 1 },
        );
        return () => {
            unsubscribe();
            // Note: We intentionally do NOT dispose the tracker here.
            // In StrictMode, React will remount and reuse the same component instance,
            // so disposing would break command tracking. The tracker will be garbage
            // collected when the provider is truly unmounted.
        };
    }, [getTracker, subscribe]);

    const register = useCallback(
        (cmdId: string, options?: { expectAck?: boolean; mac?: string }) => {
            return getTracker().register(cmdId, options);
        },
        [getTracker],
    );

    const cancel = useCallback(
        (cmdId: string, reason?: CommandFailureReason) => {
            getTracker().cancel(cmdId, reason);
        },
        [getTracker],
    );

    const value: CommandTrackerContextValue = useMemo(
        () => ({
            register,
            cancel,
        }),
        [register, cancel],
    );

    return (
        <CommandTrackerContext.Provider value={value}>{children}</CommandTrackerContext.Provider>
    );
};

export const useCommandTracker = (): CommandTrackerContextValue => {
    const context = useContext(CommandTrackerContext);
    if (!context) {
        throw new Error('useCommandTracker must be used within a CommandTrackerProvider');
    }
    return context;
};
