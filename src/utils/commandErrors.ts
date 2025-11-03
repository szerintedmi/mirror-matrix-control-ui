import type { CommandFailure } from '../services/pendingCommandTracker';

export interface NormalizedCommandError {
    message: string;
    code?: string;
}

export const normalizeCommandError = (error: unknown): NormalizedCommandError => {
    if (error && typeof error === 'object') {
        const failure = error as CommandFailure;
        if (typeof failure.kind === 'string' && typeof failure.command === 'object') {
            return {
                message: failure.message ?? `Command failed (${failure.kind})`,
                code: failure.errorCode,
            };
        }
    }

    if (error instanceof Error) {
        return {
            message: error.message,
        };
    }

    return {
        message: 'Command failed',
    };
};
