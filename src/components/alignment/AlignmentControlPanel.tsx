import React from 'react';

import type { CalibrationProfile } from '@/types';

interface AlignmentControlPanelProps {
    savedProfiles: CalibrationProfile[];
    selectedProfileId: string | null;
    onSelectProfile: (profileId: string | null) => void;
    roiEnabled: boolean;
    roiViewEnabled: boolean;
    onToggleRoiView: () => void;
    onResetRoi: () => void;
    adaptiveMethod: 'GAUSSIAN' | 'MEAN';
    onAdaptiveMethodChange: (value: 'GAUSSIAN' | 'MEAN') => void;
    thresholdType: 'BINARY' | 'BINARY_INV';
    onThresholdTypeChange: (value: 'BINARY' | 'BINARY_INV') => void;
    blockSize: number;
    onBlockSizeChange: (value: number) => void;
    thresholdConstant: number;
    onThresholdConstantChange: (value: number) => void;
    minContourArea: number;
    onMinContourAreaChange: (value: number) => void;
    enableSmoothing: boolean;
    onEnableSmoothingChange: (value: boolean) => void;
    enableMorphology: boolean;
    onEnableMorphologyChange: (value: boolean) => void;
    rejectBorderContours: boolean;
    onRejectBorderContoursChange: (value: boolean) => void;
    rejectLargeContours: boolean;
    onRejectLargeContoursChange: (value: boolean) => void;
    maxContourAreaRatio: number;
    onMaxContourAreaRatioChange: (value: number) => void;
    enableBackgroundSuppression: boolean;
    onEnableBackgroundSuppressionChange: (value: boolean) => void;
    backgroundBlurKernelSize: number;
    onBackgroundBlurKernelSizeChange: (value: number) => void;
    backgroundGain: number;
    onBackgroundGainChange: (value: number) => void;
    enableContourMerging: boolean;
    onEnableContourMergingChange: (value: boolean) => void;
    contourMergeMaxContours: number;
    onContourMergeMaxContoursChange: (value: number) => void;
    contourMergeDistancePx: number;
    onContourMergeDistancePxChange: (value: number) => void;
    contourMergeMinAreaRatio: number;
    onContourMergeMinAreaRatioChange: (value: number) => void;
    samplesPerMeasurement: number;
    onSamplesPerMeasurementChange: (value: number) => void;
    outlierStrategy: 'mad-filter' | 'none';
    onOutlierStrategyChange: (value: 'mad-filter' | 'none') => void;
    outlierThreshold: number;
    onOutlierThresholdChange: (value: number) => void;
    stepSize: number;
    onStepSizeChange: (value: number) => void;
    maxIterationsPerAxis: number;
    onMaxIterationsPerAxisChange: (value: number) => void;
    areaThresholdPercent: number;
    onAreaThresholdPercentChange: (value: number) => void;
    improvementStrategy: 'any' | 'weighted';
    onImprovementStrategyChange: (value: 'any' | 'weighted') => void;
    weightedArea: number;
    onWeightedAreaChange: (value: number) => void;
    weightedEccentricity: number;
    onWeightedEccentricityChange: (value: number) => void;
    weightedScoreThresholdPercent: number;
    onWeightedScoreThresholdPercentChange: (value: number) => void;
    canStart: boolean;
    canStop: boolean;
    canPauseActions: boolean;
    profileLocked: boolean;
    paramsLocked: boolean;
    onMoveToCenter: () => void;
    onStartConvergence: () => void;
    onStop: () => void;
    onRetry: () => void;
    onSkipTile: () => void;
    onAbort: () => void;
}

const sectionClass = 'rounded-lg border border-gray-800 bg-gray-950 p-4';
const labelClass = 'flex flex-col gap-1 text-xs text-gray-300';
const inputClass = 'rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-100';

const AlignmentControlPanel: React.FC<AlignmentControlPanelProps> = ({
    savedProfiles,
    selectedProfileId,
    onSelectProfile,
    roiEnabled,
    roiViewEnabled,
    onToggleRoiView,
    onResetRoi,
    adaptiveMethod,
    onAdaptiveMethodChange,
    thresholdType,
    onThresholdTypeChange,
    blockSize,
    onBlockSizeChange,
    thresholdConstant,
    onThresholdConstantChange,
    minContourArea,
    onMinContourAreaChange,
    enableSmoothing,
    onEnableSmoothingChange,
    enableMorphology,
    onEnableMorphologyChange,
    rejectBorderContours,
    onRejectBorderContoursChange,
    rejectLargeContours,
    onRejectLargeContoursChange,
    maxContourAreaRatio,
    onMaxContourAreaRatioChange,
    enableBackgroundSuppression,
    onEnableBackgroundSuppressionChange,
    backgroundBlurKernelSize,
    onBackgroundBlurKernelSizeChange,
    backgroundGain,
    onBackgroundGainChange,
    enableContourMerging,
    onEnableContourMergingChange,
    contourMergeMaxContours,
    onContourMergeMaxContoursChange,
    contourMergeDistancePx,
    onContourMergeDistancePxChange,
    contourMergeMinAreaRatio,
    onContourMergeMinAreaRatioChange,
    samplesPerMeasurement,
    onSamplesPerMeasurementChange,
    outlierStrategy,
    onOutlierStrategyChange,
    outlierThreshold,
    onOutlierThresholdChange,
    stepSize,
    onStepSizeChange,
    maxIterationsPerAxis,
    onMaxIterationsPerAxisChange,
    areaThresholdPercent,
    onAreaThresholdPercentChange,
    improvementStrategy,
    onImprovementStrategyChange,
    weightedArea,
    onWeightedAreaChange,
    weightedEccentricity,
    onWeightedEccentricityChange,
    weightedScoreThresholdPercent,
    onWeightedScoreThresholdPercentChange,
    canStart,
    canStop,
    canPauseActions,
    profileLocked,
    paramsLocked,
    onMoveToCenter,
    onStartConvergence,
    onStop,
    onRetry,
    onSkipTile,
    onAbort,
}) => {
    return (
        <div className="flex flex-col gap-4 lg:w-[360px] lg:flex-shrink-0">
            <section className={sectionClass}>
                <h2 className="text-sm font-semibold text-gray-100">Profile</h2>
                <label className={`${labelClass} mt-3`}>
                    Calibration profile
                    <select
                        value={selectedProfileId ?? ''}
                        onChange={(event) => onSelectProfile(event.target.value || null)}
                        className={inputClass}
                        disabled={profileLocked}
                    >
                        <option value="">Select profile</option>
                        {savedProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.name}
                            </option>
                        ))}
                    </select>
                </label>
            </section>

            <section className={sectionClass}>
                <h2 className="text-sm font-semibold text-gray-100">ROI</h2>
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={onToggleRoiView}
                        disabled={!roiEnabled}
                        className={`rounded border px-2 py-1 text-xs ${
                            roiViewEnabled
                                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                                : 'border-gray-700 text-gray-300'
                        }`}
                    >
                        ROI View
                    </button>
                    <button
                        type="button"
                        onClick={onResetRoi}
                        disabled={paramsLocked}
                        className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300"
                    >
                        Reset ROI
                    </button>
                </div>
            </section>

            <section className={sectionClass}>
                <h2 className="text-sm font-semibold text-gray-100">Detection</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className={labelClass}>
                        Method
                        <select
                            value={adaptiveMethod}
                            onChange={(event) =>
                                onAdaptiveMethodChange(event.target.value as 'GAUSSIAN' | 'MEAN')
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        >
                            <option value="GAUSSIAN">GAUSSIAN</option>
                            <option value="MEAN">MEAN</option>
                        </select>
                    </label>
                    <label className={labelClass}>
                        Polarity
                        <select
                            value={thresholdType}
                            onChange={(event) =>
                                onThresholdTypeChange(event.target.value as 'BINARY' | 'BINARY_INV')
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        >
                            <option value="BINARY">BINARY</option>
                            <option value="BINARY_INV">BINARY_INV</option>
                        </select>
                    </label>
                    <label className={labelClass}>
                        Block size
                        <input
                            type="number"
                            min={3}
                            step={2}
                            value={blockSize}
                            onChange={(event) => onBlockSizeChange(Number(event.target.value))}
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                    <label className={labelClass}>
                        C
                        <input
                            type="number"
                            value={thresholdConstant}
                            onChange={(event) =>
                                onThresholdConstantChange(Number(event.target.value))
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                    <label className={`${labelClass} col-span-2`}>
                        Minimum contour area
                        <input
                            type="number"
                            min={0}
                            value={minContourArea}
                            onChange={(event) => onMinContourAreaChange(Number(event.target.value))}
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                    <div className={`${labelClass} col-span-2`}>
                        <span className="text-[11px] tracking-wide text-gray-400 uppercase">
                            Filtering
                        </span>
                        <div className="mt-1 grid grid-cols-1 gap-2 rounded border border-gray-800 bg-gray-900/60 p-2">
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={enableSmoothing}
                                    onChange={(event) =>
                                        onEnableSmoothingChange(event.target.checked)
                                    }
                                    disabled={paramsLocked}
                                />
                                Smooth image before threshold
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={enableMorphology}
                                    onChange={(event) =>
                                        onEnableMorphologyChange(event.target.checked)
                                    }
                                    disabled={paramsLocked}
                                />
                                Morphology clean-up
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={rejectBorderContours}
                                    onChange={(event) =>
                                        onRejectBorderContoursChange(event.target.checked)
                                    }
                                    disabled={paramsLocked}
                                />
                                Reject border-touching contour
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={rejectLargeContours}
                                    onChange={(event) =>
                                        onRejectLargeContoursChange(event.target.checked)
                                    }
                                    disabled={paramsLocked}
                                />
                                Reject oversized contour
                            </label>
                            <label className={labelClass}>
                                Max contour ratio (0-1)
                                <input
                                    type="number"
                                    min={0.05}
                                    max={1}
                                    step={0.05}
                                    value={maxContourAreaRatio}
                                    onChange={(event) =>
                                        onMaxContourAreaRatioChange(Number(event.target.value))
                                    }
                                    className={inputClass}
                                    disabled={paramsLocked || !rejectLargeContours}
                                />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={enableBackgroundSuppression}
                                    onChange={(event) =>
                                        onEnableBackgroundSuppressionChange(event.target.checked)
                                    }
                                    disabled={paramsLocked}
                                />
                                Background suppression
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className={labelClass}>
                                    BG blur kernel
                                    <input
                                        type="number"
                                        min={3}
                                        step={2}
                                        value={backgroundBlurKernelSize}
                                        onChange={(event) =>
                                            onBackgroundBlurKernelSizeChange(
                                                Number(event.target.value),
                                            )
                                        }
                                        className={inputClass}
                                        disabled={paramsLocked || !enableBackgroundSuppression}
                                    />
                                </label>
                                <label className={labelClass}>
                                    BG gain
                                    <input
                                        type="number"
                                        min={0.1}
                                        step={0.1}
                                        value={backgroundGain}
                                        onChange={(event) =>
                                            onBackgroundGainChange(Number(event.target.value))
                                        }
                                        className={inputClass}
                                        disabled={paramsLocked || !enableBackgroundSuppression}
                                    />
                                </label>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={enableContourMerging}
                                    onChange={(event) =>
                                        onEnableContourMergingChange(event.target.checked)
                                    }
                                    disabled={paramsLocked}
                                />
                                Merge nearby contours
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className={labelClass}>
                                    Merge max count
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={contourMergeMaxContours}
                                        onChange={(event) =>
                                            onContourMergeMaxContoursChange(
                                                Number(event.target.value),
                                            )
                                        }
                                        className={inputClass}
                                        disabled={paramsLocked || !enableContourMerging}
                                    />
                                </label>
                                <label className={labelClass}>
                                    Merge dist (px)
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={contourMergeDistancePx}
                                        onChange={(event) =>
                                            onContourMergeDistancePxChange(
                                                Number(event.target.value),
                                            )
                                        }
                                        className={inputClass}
                                        disabled={paramsLocked || !enableContourMerging}
                                    />
                                </label>
                                <label className={`${labelClass} col-span-2`}>
                                    Merge min area ratio (0-1)
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={contourMergeMinAreaRatio}
                                        onChange={(event) =>
                                            onContourMergeMinAreaRatioChange(
                                                Number(event.target.value),
                                            )
                                        }
                                        className={inputClass}
                                        disabled={paramsLocked || !enableContourMerging}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className={sectionClass}>
                <h2 className="text-sm font-semibold text-gray-100">Stability</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className={labelClass}>
                        Samples
                        <input
                            type="number"
                            min={1}
                            value={samplesPerMeasurement}
                            onChange={(event) =>
                                onSamplesPerMeasurementChange(Number(event.target.value))
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                    <label className={labelClass}>
                        Outlier strategy
                        <select
                            value={outlierStrategy}
                            onChange={(event) =>
                                onOutlierStrategyChange(event.target.value as 'mad-filter' | 'none')
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        >
                            <option value="mad-filter">MAD-filter</option>
                            <option value="none">none</option>
                        </select>
                    </label>
                    <label className={`${labelClass} col-span-2`}>
                        Outlier threshold
                        <input
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={outlierThreshold}
                            onChange={(event) =>
                                onOutlierThresholdChange(Number(event.target.value))
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                </div>
            </section>

            <section className={sectionClass}>
                <h2 className="text-sm font-semibold text-gray-100">Convergence</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className={labelClass}>
                        Step size
                        <input
                            type="number"
                            min={1}
                            value={stepSize}
                            onChange={(event) => onStepSizeChange(Number(event.target.value))}
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                    <label className={labelClass}>
                        Max iters/axis
                        <input
                            type="number"
                            min={1}
                            value={maxIterationsPerAxis}
                            onChange={(event) =>
                                onMaxIterationsPerAxisChange(Number(event.target.value))
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                    <label className={labelClass}>
                        Area threshold (%)
                        <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={areaThresholdPercent}
                            onChange={(event) =>
                                onAreaThresholdPercentChange(Number(event.target.value))
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        />
                    </label>
                    <label className={labelClass}>
                        Strategy
                        <select
                            value={improvementStrategy}
                            onChange={(event) =>
                                onImprovementStrategyChange(
                                    event.target.value as 'any' | 'weighted',
                                )
                            }
                            className={inputClass}
                            disabled={paramsLocked}
                        >
                            <option value="any">any</option>
                            <option value="weighted">weighted</option>
                        </select>
                    </label>
                    {improvementStrategy === 'weighted' && (
                        <>
                            <label className={labelClass}>
                                Area weight
                                <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={weightedArea}
                                    onChange={(event) =>
                                        onWeightedAreaChange(Number(event.target.value))
                                    }
                                    className={inputClass}
                                    disabled={paramsLocked}
                                />
                            </label>
                            <label className={labelClass}>
                                Ecc weight
                                <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={weightedEccentricity}
                                    onChange={(event) =>
                                        onWeightedEccentricityChange(Number(event.target.value))
                                    }
                                    className={inputClass}
                                    disabled={paramsLocked}
                                />
                            </label>
                            <label className={`${labelClass} col-span-2`}>
                                Score threshold (%)
                                <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={weightedScoreThresholdPercent}
                                    onChange={(event) =>
                                        onWeightedScoreThresholdPercentChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    className={inputClass}
                                    disabled={paramsLocked}
                                />
                            </label>
                        </>
                    )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onMoveToCenter}
                        disabled={!canStart}
                        className="rounded border border-sky-500/50 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Move to Center
                    </button>
                    <button
                        type="button"
                        onClick={onStartConvergence}
                        disabled={!canStart}
                        className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Start Convergence
                    </button>
                    <button
                        type="button"
                        onClick={onStop}
                        disabled={!canStop}
                        className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Stop
                    </button>
                </div>
                {canPauseActions && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onRetry}
                            className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                        >
                            Retry
                        </button>
                        <button
                            type="button"
                            onClick={onSkipTile}
                            className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs text-amber-200"
                        >
                            Skip tile
                        </button>
                        <button
                            type="button"
                            onClick={onAbort}
                            className="rounded border border-red-500/50 bg-red-500/10 px-3 py-1 text-xs text-red-200"
                        >
                            Abort
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
};

export default AlignmentControlPanel;
