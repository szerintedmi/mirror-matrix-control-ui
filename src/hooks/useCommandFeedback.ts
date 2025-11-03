import { useCallback, useState } from 'react';

export type CommandFeedbackState = 'idle' | 'pending' | 'success' | 'error';

export interface CommandFeedback {
    state: CommandFeedbackState;
    message?: string;
    timestamp?: number;
    code?: string;
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

export const useCommandFeedback = (): CommandFeedbackApi => {
    const [feedback, setFeedback] = useState<CommandFeedback>(createInitialFeedback);

    const begin = useCallback((message?: string) => {
        setFeedback({
            state: 'pending',
            message,
            timestamp: Date.now(),
        });
    }, []);

    const succeed = useCallback((message: string) => {
        setFeedback({
            state: 'success',
            message,
            timestamp: Date.now(),
        });
    }, []);

    const fail = useCallback((message: string, code?: string) => {
        setFeedback({
            state: 'error',
            message,
            code,
            timestamp: Date.now(),
        });
    }, []);

    const reset = useCallback(() => {
        setFeedback(createInitialFeedback());
    }, []);

    return {
        feedback,
        begin,
        succeed,
        fail,
        reset,
    };
};
