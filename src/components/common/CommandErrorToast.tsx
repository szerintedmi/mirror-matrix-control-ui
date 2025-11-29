import { toast } from 'sonner';

import type { CommandErrorContext, CommandErrorDetail } from '@/types/commandError';

interface Props {
    context: CommandErrorContext;
}

function reasonLabel(reason: string): string {
    switch (reason) {
        case 'ack-timeout':
            return 'No response';
        case 'completion-timeout':
            return 'Timed out';
        case 'error':
            return 'Error';
        default:
            return reason;
    }
}

export function CommandErrorToast({ context }: Props) {
    const { title, totalCount, errors } = context;

    return (
        <div className="select-text text-sm">
            <div className="font-medium text-rose-100">
                {errors.length}/{totalCount} commands failed: {title}
            </div>

            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs text-gray-300">
                {errors.map((e, i) => (
                    <li key={i} className="border-l-2 border-rose-500/40 pl-2">
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {e.row !== undefined && e.col !== undefined && (
                                <span className="text-gray-400">
                                    [{e.row},{e.col}]
                                </span>
                            )}
                            <span className="text-gray-400">{e.controller}</span>
                            {e.motorId !== undefined && (
                                <span>
                                    motor {e.motorId}
                                    {e.axis ? ` (${e.axis})` : ''}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2 text-rose-300">
                            <span>{reasonLabel(e.reason)}</span>
                            {e.errorCode && <span className="text-rose-400">({e.errorCode})</span>}
                        </div>
                        <div className="font-mono text-[10px] text-gray-500">cmd: {e.cmdId}</div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function showCommandErrorToast(context: CommandErrorContext): void {
    toast.custom(
        (toastId) => (
            <div className="w-[356px] rounded-lg border border-rose-500/50 bg-rose-950 p-4 shadow-lg">
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <CommandErrorToast context={context} />
                    </div>
                    <button
                        onClick={() => toast.dismiss(toastId)}
                        className="flex-none rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                        aria-label="Dismiss"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                        >
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                    </button>
                </div>
            </div>
        ),
        {
            duration: Infinity,
            unstyled: true,
        },
    );
}

/**
 * Convenience for single error (e.g., nudge, single home)
 */
export function showSingleCommandErrorToast(title: string, error: CommandErrorDetail): void {
    showCommandErrorToast({
        title,
        totalCount: 1,
        errors: [error],
    });
}
