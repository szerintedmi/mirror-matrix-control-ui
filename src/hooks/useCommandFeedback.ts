import { useCallback, useEffect, useRef, useState } from 'react';

export type CommandFeedbackState = 'idle' | 'pending' | 'success' | 'error';

export interface CommandFeedback {
    state: CommandFeedbackState;
    message?: string;
    timestamp?: number;
    code?: string;
}

export interface CommandFeedbackOptions {
    /** Auto-reset success state after this many milliseconds. Default: 3000. Set to 0 to disable. */
    successAutoResetMs?: number;
}

export interface CommandFeedbackApi {
    feedback: CommandFeedback;
    begin: (message?: string) => void;
    succeed: (message: string) => void;
    fail: (message: string, code?: string) => void;
    reset: () => void;
}

const createInitialFeedback = (): CommandFeedback => ({
    state: 'idle',
});

const DEFAULT_SUCCESS_AUTO_RESET_MS = 3000;

export const useCommandFeedback = (options?: CommandFeedbackOptions): CommandFeedbackApi => {
    const [feedback, setFeedback] = useState<CommandFeedback>(createInitialFeedback);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const successAutoResetMs = options?.successAutoResetMs ?? DEFAULT_SUCCESS_AUTO_RESET_MS;

    const clearAutoReset = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const begin = useCallback(
        (message?: string) => {
            clearAutoReset();
            setFeedback({
                state: 'pending',
                message,
                timestamp: Date.now(),
            });
        },
        [clearAutoReset],
    );

    const succeed = useCallback(
        (message: string) => {
            clearAutoReset();
            setFeedback({
                state: 'success',
                message,
                timestamp: Date.now(),
            });
            if (successAutoResetMs > 0) {
                timeoutRef.current = setTimeout(() => {
                    setFeedback(createInitialFeedback());
                }, successAutoResetMs);
            }
        },
        [clearAutoReset, successAutoResetMs],
    );

    const fail = useCallback(
        (message: string, code?: string) => {
            clearAutoReset();
            setFeedback({
                state: 'error',
                message,
                code,
                timestamp: Date.now(),
            });
        },
        [clearAutoReset],
    );

    const reset = useCallback(() => {
        clearAutoReset();
        setFeedback(createInitialFeedback());
    }, [clearAutoReset]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return {
        feedback,
        begin,
        succeed,
        fail,
        reset,
    };
};
