import { useState } from 'react';
import { toast } from 'sonner';

import type { PlaybackFailureDetail } from '@/hooks/usePlaybackDispatch';

interface Props {
    patternName: string;
    totalCount: number;
    failures: PlaybackFailureDetail[];
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

export function PlaybackErrorToast({ patternName, totalCount, failures }: Props) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="text-sm">
            <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-rose-100">
                    {failures.length}/{totalCount} motor commands failed for &ldquo;{patternName}
                    &rdquo;
                </span>
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="whitespace-nowrap text-xs text-rose-300 underline hover:text-rose-200"
                >
                    {expanded ? 'Hide details' : 'Show details'}
                </button>
            </div>

            {expanded && (
                <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs text-gray-300">
                    {failures.map((f, i) => (
                        <li key={i} className="border-l-2 border-rose-500/40 pl-2">
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                <span className="text-gray-400">
                                    [{f.row},{f.col}]
                                </span>
                                <span className="text-gray-400">{f.controller}</span>
                                <span>
                                    motor {f.motorId} ({f.axis})
                                </span>
                            </div>
                            <div className="flex gap-2 text-rose-300">
                                <span>{reasonLabel(f.reason)}</span>
                                {f.errorCode && (
                                    <span className="text-rose-400">({f.errorCode})</span>
                                )}
                            </div>
                            <div className="font-mono text-[10px] text-gray-500">
                                cmd: {f.cmdId}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function showPlaybackErrorToast(
    patternName: string,
    totalCount: number,
    failures: PlaybackFailureDetail[],
): void {
    toast.custom(
        (toastId) => (
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    <PlaybackErrorToast
                        patternName={patternName}
                        totalCount={totalCount}
                        failures={failures}
                    />
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
        ),
        {
            duration: Infinity,
            className: 'bg-rose-950 border border-rose-500/50 rounded-lg p-4',
        },
    );
}
