import type { CommandFailure } from '../services/pendingCommandTracker';
import type { Axis } from '../types';
import type { CommandErrorDetail } from '../types/commandError';

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

/**
 * Extract detailed error information from a command failure for display in toast.
 * Context provides additional info that may not be available in the error itself.
 */
export function extractCommandErrorDetail(
    error: unknown,
    context?: {
        controller?: string;
        motorId?: number;
        row?: number;
        col?: number;
        axis?: Axis;
    },
): CommandErrorDetail {
    const detail: CommandErrorDetail = {
        cmdId: 'unknown',
        controller: context?.controller ?? 'unknown',
        reason: 'unknown',
        motorId: context?.motorId,
        row: context?.row,
        col: context?.col,
        axis: context?.axis,
    };

    if (error && typeof error === 'object') {
        const failure = error as CommandFailure;
        if (typeof failure.kind === 'string' && typeof failure.command === 'object') {
            detail.cmdId = failure.command.cmdId ?? 'unknown';
            // Prefer firmware-provided reason (e.g., "BUSY") over generic failure kind
            detail.reason = failure.errorReason ?? failure.kind;
            detail.errorCode = failure.errorCode;
            detail.errorMessage = failure.message;
            // Use MAC from failure if available and not overridden by context
            if (failure.mac && detail.controller === 'unknown') {
                detail.controller = failure.mac;
            }
        }
    }

    if (error instanceof Error && detail.reason === 'unknown') {
        detail.errorMessage = error.message;
        detail.reason = 'error';
    }

    return detail;
}
