import React from 'react';

import type { CalibrationMode } from '@/hooks/useCalibrationController';
import type {
    CalibrationRunnerState,
    CalibrationStepKind,
    CalibrationStepState,
} from '@/services/calibrationRunner';

interface CalibrationStatusBarProps {
    runnerState: CalibrationRunnerState;
    stepState: CalibrationStepState | null;
    mode: CalibrationMode;
    onModeChange: (mode: CalibrationMode) => void;
    isAwaitingAdvance: boolean;
    isActive: boolean;
    isPaused: boolean;
    detectionReady: boolean;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onAbort: () => void;
    onAdvance: () => void;
}

/**
 * Get a hint about what the next step will be based on current step.
 */
const getNextStepHint = (
    currentKind: CalibrationStepKind | null,
    progress: { completed: number; total: number },
): string | null => {
    if (!currentKind) return null;

    switch (currentKind) {
        case 'home-all':
            return 'Stage all tiles';
        case 'stage-all':
            return progress.total > 0 ? 'Measure first tile' : 'Align grid';
        case 'measure-home':
            return 'X axis step test';
        case 'step-test-x':
            return 'Y axis step test';
        case 'step-test-y':
            return progress.completed + 1 < progress.total ? 'Next tile' : 'Align grid';
        case 'align-grid':
            return 'Complete';
        default:
            return null;
    }
};

/**
 * Unified status bar for calibration runner, positioned above the camera.
 * Works in both auto and step modes, includes action buttons.
 */
const CalibrationStatusBar: React.FC<CalibrationStatusBarProps> = ({
    runnerState,
    stepState,
    mode,
    onModeChange,
    isAwaitingAdvance,
    isActive,
    isPaused,
    detectionReady,
    onStart,
    onPause,
    onResume,
    onAbort,
    onAdvance,
}) => {
    const { progress, activeTile, phase } = runnerState;

    // Current step info
    const currentStepKind = stepState?.step?.kind ?? null;
    const currentStepLabel = stepState?.step?.label ?? null;
    const stepStatus = stepState?.status ?? null;

    // Next step hint (only in step mode when waiting)
    const nextStepHint =
        mode === 'step' && isAwaitingAdvance ? getNextStepHint(currentStepKind, progress) : null;

    // Phase display for non-active states
    const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);
    const tileLabel = activeTile ? `[${activeTile.row},${activeTile.col}]` : null;

    // Button state logic
    const isRunnerBusy =
        phase === 'homing' || phase === 'staging' || phase === 'measuring' || phase === 'aligning';
    const canStart = mode === 'step' ? !isActive : !isRunnerBusy && !isPaused;
    const canPause = mode === 'auto' && isRunnerBusy;
    const canResume = mode === 'auto' && isPaused;
    const canAbort = mode === 'step' ? isActive : isRunnerBusy || isPaused;

    // Determine overall status for display
    const getOverallStatus = () => {
        if (isPaused) return { label: 'Paused', color: 'text-amber-400' };
        if (phase === 'completed') return { label: 'Completed', color: 'text-emerald-400' };
        if (phase === 'error') return { label: 'Error', color: 'text-rose-400' };
        if (phase === 'aborted') return { label: 'Aborted', color: 'text-rose-400' };
        if (phase === 'idle') return { label: 'Ready', color: 'text-gray-400' };
        return null;
    };

    const overallStatus = getOverallStatus();

    return (
        <div className="rounded-lg border border-sky-500/30 bg-gray-900/95 p-3 shadow-lg backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-4">
                {/* Progress indicator */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">
                            Progress
                        </span>
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-sm font-semibold text-gray-200">
                                {progress.completed}/{progress.total}
                            </span>
                            {progress.failed > 0 && (
                                <span className="text-[10px] text-rose-400">
                                    ({progress.failed} failed)
                                </span>
                            )}
                        </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-800">
                        <div className="flex h-full">
                            <div
                                className="bg-emerald-500 transition-all duration-300"
                                style={{
                                    width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                                }}
                            />
                            <div
                                className="bg-rose-500 transition-all duration-300"
                                style={{
                                    width: `${progress.total > 0 ? (progress.failed / progress.total) * 100 : 0}%`,
                                }}
                            />
                            <div
                                className="bg-gray-600 transition-all duration-300"
                                style={{
                                    width: `${progress.total > 0 ? (progress.skipped / progress.total) * 100 : 0}%`,
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-gray-700" />

                {/* Current tile */}
                {tileLabel && isActive && (
                    <>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wide text-gray-500">
                                Tile
                            </span>
                            <span className="font-mono text-sm font-semibold text-sky-300">
                                {tileLabel}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-gray-700" />
                    </>
                )}

                {/* Current step with status */}
                {isActive && currentStepLabel && !overallStatus ? (
                    <div className="flex min-w-0 flex-col">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-wide text-gray-500">
                                Current
                            </span>
                            <span
                                className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${
                                    stepStatus === 'running'
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : stepStatus === 'waiting'
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : stepStatus === 'error'
                                            ? 'bg-rose-500/20 text-rose-300'
                                            : 'bg-gray-500/20 text-gray-400'
                                }`}
                            >
                                {stepStatus === 'running'
                                    ? 'Running'
                                    : stepStatus === 'waiting'
                                      ? 'Done'
                                      : stepStatus === 'error'
                                        ? 'Error'
                                        : stepStatus}
                            </span>
                        </div>
                        <span className="truncate text-sm font-medium text-gray-200">
                            {currentStepLabel}
                        </span>
                    </div>
                ) : isActive && !overallStatus ? (
                    <div className="flex min-w-0 flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">
                            Phase
                        </span>
                        <span className="truncate text-sm font-medium text-gray-200">
                            {phaseLabel}
                        </span>
                    </div>
                ) : (
                    <div className="flex min-w-0 flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">
                            Status
                        </span>
                        <span
                            className={`truncate text-sm font-medium ${overallStatus?.color ?? 'text-gray-200'}`}
                        >
                            {overallStatus?.label ?? phaseLabel}
                        </span>
                    </div>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Mode toggle */}
                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Mode</span>
                    <div className="flex rounded-md border border-gray-700 bg-gray-800 text-xs font-semibold">
                        {(['auto', 'step'] as CalibrationMode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                className={`px-2.5 py-1 transition-colors ${
                                    mode === m
                                        ? 'bg-emerald-700 text-white'
                                        : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                                } first:rounded-l-md last:rounded-r-md ${isActive ? 'cursor-not-allowed opacity-60' : ''}`}
                                onClick={() => !isActive && onModeChange(m)}
                                disabled={isActive}
                                aria-pressed={mode === m}
                            >
                                {m === 'auto' ? 'Auto' : 'Step'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-gray-700" />

                {/* Action buttons */}
                <div className="flex shrink-0 items-center gap-2">
                    {!isActive && (
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                                canStart && detectionReady
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canStart || !detectionReady}
                            onClick={onStart}
                        >
                            Start
                        </button>
                    )}
                    {isActive && mode === 'step' && (
                        <button
                            type="button"
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition-all ${
                                isAwaitingAdvance
                                    ? 'animate-pulse bg-sky-500 text-white shadow-lg shadow-sky-500/30 hover:bg-sky-400'
                                    : 'bg-gray-700 text-gray-400'
                            }`}
                            disabled={!isAwaitingAdvance}
                            onClick={onAdvance}
                        >
                            {nextStepHint ? `Next: ${nextStepHint}` : 'Next'}
                        </button>
                    )}
                    {isActive && mode === 'auto' && (
                        <>
                            <button
                                type="button"
                                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                                    canPause
                                        ? 'bg-amber-600 text-white hover:bg-amber-500'
                                        : 'bg-gray-800 text-gray-500'
                                }`}
                                disabled={!canPause}
                                onClick={onPause}
                            >
                                Pause
                            </button>
                            <button
                                type="button"
                                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                                    canResume
                                        ? 'bg-sky-600 text-white hover:bg-sky-500'
                                        : 'bg-gray-800 text-gray-500'
                                }`}
                                disabled={!canResume}
                                onClick={onResume}
                            >
                                Resume
                            </button>
                        </>
                    )}
                    {isActive && (
                        <button
                            type="button"
                            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                                canAbort
                                    ? 'bg-rose-600/80 text-white hover:bg-rose-500'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                            disabled={!canAbort}
                            onClick={onAbort}
                        >
                            Abort
                        </button>
                    )}
                </div>
            </div>

            {/* Status indicator line */}
            {isActive && stepStatus === 'running' && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                    <span>Step in progress...</span>
                </div>
            )}
            {isPaused && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span>Calibration paused — press Resume to continue</span>
                </div>
            )}

            {/* Error display */}
            {runnerState.error && (
                <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
                    {runnerState.error}
                </div>
            )}
        </div>
    );
};

export default CalibrationStatusBar;
