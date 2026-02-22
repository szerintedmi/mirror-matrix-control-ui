import React from 'react';

import type { AlignmentPhase, AlignmentSettings } from '@/hooks/useAlignmentController';
import type {
    AlignmentMode,
    AlignmentGranularity,
    AlignmentStepState,
    AlignmentPendingDecision,
    AlignmentDecisionOption,
} from '@/services/alignment';
import type { CalibrationProfile } from '@/types';

interface AlignmentControlPanelProps {
    phase: AlignmentPhase;
    positioningComplete: boolean;
    settingsLocked: boolean;
    error: string | null;
    settings: AlignmentSettings;
    onSettingsChange: (patch: Partial<AlignmentSettings>) => void;
    profiles: CalibrationProfile[];
    selectedProfileId: string | null;
    onSelectProfile: (profileId: string | null) => void;
    onMoveToCenter: () => void;
    onStartConvergence: () => void;
    onStop: () => void;
    // Step-by-step debugging
    mode: AlignmentMode;
    onModeChange: (mode: AlignmentMode) => void;
    granularity: AlignmentGranularity;
    onGranularityChange: (granularity: AlignmentGranularity) => void;
    stepState: AlignmentStepState | null;
    isAwaitingAdvance: boolean;
    pendingDecision: AlignmentPendingDecision | null;
    onAdvance: () => void;
    onRunToEnd: () => void;
    onRetryTile: () => void;
    onSubmitDecision: (decision: AlignmentDecisionOption) => void;
}

const AlignmentControlPanel: React.FC<AlignmentControlPanelProps> = ({
    phase,
    positioningComplete,
    settingsLocked,
    error,
    settings,
    onSettingsChange,
    profiles,
    selectedProfileId,
    onSelectProfile,
    onMoveToCenter,
    onStartConvergence,
    onStop,
    mode,
    onModeChange,
    granularity,
    onGranularityChange,
    stepState,
    isAwaitingAdvance,
    pendingDecision,
    onAdvance,
    onRunToEnd,
    onRetryTile,
    onSubmitDecision,
}) => {
    const isRunning = phase !== 'idle' && phase !== 'complete';
    const profileSelected = selectedProfileId !== null;

    return (
        <div className="flex flex-col gap-4">
            {/* Profile selector */}
            <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                    Calibration Profile
                </h3>
                <select
                    className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-200"
                    value={selectedProfileId ?? ''}
                    onChange={(e) => onSelectProfile(e.target.value || null)}
                    disabled={settingsLocked}
                >
                    <option value="">Select a profile...</option>
                    {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name} ({p.metrics.completedTiles}/{p.metrics.totalTiles} tiles)
                        </option>
                    ))}
                </select>
                {!profileSelected && (
                    <p className="mt-1 text-xs text-amber-400">
                        Select a calibration profile to begin alignment.
                    </p>
                )}
            </section>

            {/* Detection settings */}
            <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                    Shape Detection
                </h3>
                <div className="space-y-2">
                    <label className="flex items-center justify-between text-xs text-gray-300">
                        <span>Adaptive Method</span>
                        <select
                            className="rounded border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-xs"
                            value={settings.adaptiveThreshold.method}
                            onChange={(e) =>
                                onSettingsChange({
                                    adaptiveThreshold: {
                                        ...settings.adaptiveThreshold,
                                        method: e.target.value as 'GAUSSIAN' | 'MEAN',
                                    },
                                })
                            }
                            disabled={settingsLocked}
                        >
                            <option value="GAUSSIAN">Gaussian</option>
                            <option value="MEAN">Mean</option>
                        </select>
                    </label>
                    <label className="flex items-center justify-between text-xs text-gray-300">
                        <span>Threshold Type</span>
                        <select
                            className="rounded border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-xs"
                            value={settings.adaptiveThreshold.thresholdType}
                            onChange={(e) =>
                                onSettingsChange({
                                    adaptiveThreshold: {
                                        ...settings.adaptiveThreshold,
                                        thresholdType: e.target.value as 'BINARY' | 'BINARY_INV',
                                    },
                                })
                            }
                            disabled={settingsLocked}
                        >
                            <option value="BINARY">Binary</option>
                            <option value="BINARY_INV">Binary Inv</option>
                        </select>
                    </label>
                    <SliderRow
                        label="Block Size"
                        value={settings.adaptiveThreshold.blockSize}
                        min={3}
                        max={101}
                        step={2}
                        disabled={settingsLocked}
                        onChange={(v) =>
                            onSettingsChange({
                                adaptiveThreshold: {
                                    ...settings.adaptiveThreshold,
                                    blockSize: v,
                                },
                            })
                        }
                    />
                    <SliderRow
                        label="C Constant"
                        value={settings.adaptiveThreshold.C}
                        min={-20}
                        max={40}
                        step={1}
                        disabled={settingsLocked}
                        onChange={(v) =>
                            onSettingsChange({
                                adaptiveThreshold: {
                                    ...settings.adaptiveThreshold,
                                    C: v,
                                },
                            })
                        }
                    />
                    <SliderRow
                        label="Min Contour Area"
                        value={settings.minContourArea}
                        min={10}
                        max={5000}
                        step={10}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ minContourArea: v })}
                    />
                </div>
            </section>

            {/* Convergence settings */}
            <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                    Convergence
                </h3>
                <div className="space-y-2">
                    <SliderRow
                        label="Max Step Size"
                        value={settings.stepSize}
                        min={1}
                        max={200}
                        step={1}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ stepSize: v })}
                    />
                    <SliderRow
                        label="Min Step Size"
                        value={settings.minStepSize}
                        min={1}
                        max={Math.max(1, settings.stepSize)}
                        step={1}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ minStepSize: v })}
                    />
                    <SliderRow
                        label="Max Iterations"
                        value={settings.maxIterations}
                        min={1}
                        max={100}
                        step={1}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ maxIterations: v })}
                    />
                    <SliderRow
                        label="Area Threshold %"
                        value={settings.areaThreshold * 100}
                        min={0.1}
                        max={10}
                        step={0.1}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ areaThreshold: v / 100 })}
                        format={(v) => `${v.toFixed(1)}%`}
                    />
                    <SliderRow
                        label="Area Convergence %"
                        value={settings.areaConvergenceThreshold * 100}
                        min={0.1}
                        max={20}
                        step={0.1}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ areaConvergenceThreshold: v / 100 })}
                        format={(v) => `${v.toFixed(1)}%`}
                    />
                    <SliderRow
                        label="Samples/Measurement"
                        value={settings.samplesPerMeasurement}
                        min={1}
                        max={10}
                        step={1}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ samplesPerMeasurement: v })}
                    />
                    <label className="flex items-center justify-between text-xs text-gray-300">
                        <span>Isolate tiles (1-on-1)</span>
                        <input
                            type="checkbox"
                            checked={settings.isolateTiles}
                            onChange={(e) => onSettingsChange({ isolateTiles: e.target.checked })}
                            disabled={settingsLocked}
                            className="accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                    </label>
                </div>
            </section>

            {/* Debug Mode */}
            <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                    Debug Mode
                </h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-300">
                        <span>Mode</span>
                        <div className="flex rounded border border-gray-600">
                            <button
                                className={`px-2 py-0.5 text-xs ${mode === 'auto' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                                onClick={() => onModeChange('auto')}
                                disabled={isRunning}
                            >
                                Auto
                            </button>
                            <button
                                className={`px-2 py-0.5 text-xs ${mode === 'step' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                                onClick={() => onModeChange('step')}
                                disabled={isRunning}
                            >
                                Step
                            </button>
                        </div>
                    </div>
                    {mode === 'step' && (
                        <div className="flex items-center justify-between text-xs text-gray-300">
                            <span>Granularity</span>
                            <div className="flex rounded border border-gray-600">
                                <button
                                    className={`px-2 py-0.5 text-xs ${granularity === 'per-axis' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                                    onClick={() => onGranularityChange('per-axis')}
                                    disabled={isRunning}
                                >
                                    Per-Axis
                                </button>
                                <button
                                    className={`px-2 py-0.5 text-xs ${granularity === 'per-step' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                                    onClick={() => onGranularityChange('per-step')}
                                    disabled={isRunning}
                                >
                                    Per-Step
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Step state indicator */}
            {stepState && isRunning && (
                <div className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
                    <div className="font-medium">{stepState.step.label}</div>
                    {stepState.step.tile && (
                        <div className="text-blue-400/70">Tile: {stepState.step.tile}</div>
                    )}
                    {stepState.status === 'waiting' && (
                        <div className="mt-1 text-amber-300">Waiting for advance...</div>
                    )}
                </div>
            )}

            {/* Decision banner */}
            {pendingDecision && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                    <div className="mb-1 font-medium text-amber-300">Decision Required</div>
                    <div className="mb-2 text-amber-200/80">{pendingDecision.error}</div>
                    <div className="flex gap-1.5">
                        {pendingDecision.options.map((opt) => (
                            <button
                                key={opt}
                                onClick={() => onSubmitDecision(opt)}
                                className={`rounded px-2 py-1 text-xs font-medium ${
                                    opt === 'abort'
                                        ? 'bg-red-600 text-white hover:bg-red-500'
                                        : opt === 'retry'
                                          ? 'bg-blue-600 text-white hover:bg-blue-500'
                                          : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                                }`}
                            >
                                {opt.charAt(0).toUpperCase() + opt.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <section className="flex flex-col gap-2">
                {isRunning ? (
                    <>
                        {mode === 'step' && (
                            <div className="flex gap-2">
                                <button
                                    onClick={onAdvance}
                                    disabled={!isAwaitingAdvance}
                                    className={`flex-1 rounded px-3 py-2 text-sm font-medium text-white ${
                                        isAwaitingAdvance
                                            ? 'animate-pulse bg-blue-600 hover:bg-blue-500'
                                            : 'cursor-not-allowed bg-blue-600/50'
                                    }`}
                                >
                                    Next Step
                                </button>
                                <button
                                    onClick={onRunToEnd}
                                    className="flex-1 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                                >
                                    Run to End
                                </button>
                            </div>
                        )}
                        {mode === 'step' && isAwaitingAdvance && (
                            <button
                                onClick={onRetryTile}
                                className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500"
                            >
                                Retry Tile
                            </button>
                        )}
                        <button
                            onClick={onStop}
                            className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                        >
                            Abort
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={onMoveToCenter}
                            disabled={!profileSelected || isRunning}
                            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Stage & Set Reference
                        </button>
                        <button
                            onClick={onStartConvergence}
                            disabled={!profileSelected || isRunning}
                            className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {positioningComplete ? 'Start Convergence' : 'Position & Converge'}
                        </button>
                    </>
                )}
            </section>

            {error && (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                </div>
            )}
        </div>
    );
};

// Reusable slider row
const SliderRow: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    disabled: boolean;
    onChange: (value: number) => void;
    format?: (value: number) => string;
}> = ({ label, value, min, max, step, disabled, onChange, format }) => (
    <label className="flex items-center justify-between gap-2 text-xs text-gray-300">
        <span className="shrink-0">{label}</span>
        <div className="flex items-center gap-1.5">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                disabled={disabled}
                className="h-1 w-20 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="w-10 text-right font-mono text-[10px] text-gray-400">
                {format ? format(value) : value}
            </span>
        </div>
    </label>
);

export default AlignmentControlPanel;
