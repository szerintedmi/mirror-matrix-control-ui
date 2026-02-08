import React from 'react';

import type {
    AlignmentPhase,
    AlignmentSettings,
    ImprovementStrategy,
} from '@/hooks/useAlignmentController';
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
                        label="Step Size"
                        value={settings.stepSize}
                        min={1}
                        max={200}
                        step={1}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ stepSize: v })}
                    />
                    <SliderRow
                        label="Step Reduction %"
                        value={settings.stepReductionPercent}
                        min={0}
                        max={80}
                        step={5}
                        disabled={settingsLocked}
                        onChange={(v) => onSettingsChange({ stepReductionPercent: v })}
                        format={(v) => `${v}%`}
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
                    <label className="flex items-center justify-between text-xs text-gray-300">
                        <span>Strategy</span>
                        <select
                            className="rounded border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-xs"
                            value={settings.improvementStrategy}
                            onChange={(e) =>
                                onSettingsChange({
                                    improvementStrategy: e.target.value as ImprovementStrategy,
                                })
                            }
                            disabled={settingsLocked}
                        >
                            <option value="any">Any improvement</option>
                            <option value="weighted">Weighted score</option>
                        </select>
                    </label>
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

            {/* Action buttons */}
            <section className="flex flex-col gap-2">
                {isRunning ? (
                    <button
                        onClick={onStop}
                        className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                    >
                        Stop
                    </button>
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
