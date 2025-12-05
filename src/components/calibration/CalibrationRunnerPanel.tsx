import React, { useState } from 'react';

import CalibrationCommandLog from '@/components/calibration/CalibrationCommandLog';
import CalibrationSettingsPanel from '@/components/calibration/CalibrationSettingsPanel';
import CalibrationStatusBar from '@/components/calibration/CalibrationStatusBar';
import CalibrationSummaryModal from '@/components/calibration/CalibrationSummaryModal';
import MoveActionsDropdown from '@/components/calibration/MoveActionsDropdown';
import type { CalibrationController } from '@/hooks/useCalibrationController';
import type { CalibrationRunSummary, CalibrationStepState } from '@/services/calibrationRunner';
import type { ArrayRotation, StagingPosition } from '@/types';

interface CalibrationRunnerPanelProps {
    controller: CalibrationController;
    /**
     * Summary from a loaded calibration profile. When present, shows calibration actions
     * even if no calibration has been run in the current session.
     */
    loadedProfileSummary?: CalibrationRunSummary | null;
    gridSize: { rows: number; cols: number };
    arrayRotation: ArrayRotation;
    onArrayRotationChange: (rotation: ArrayRotation) => void;
    stagingPosition: StagingPosition;
    onStagingPositionChange: (position: StagingPosition) => void;
    isCalibrationActive: boolean;
    // Status bar props
    stepState: CalibrationStepState | null;
    isAwaitingAdvance: boolean;
    isPaused: boolean;
    detectionReady: boolean;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onAbort: () => void;
    onAdvance: () => void;
}

const CalibrationRunnerPanel: React.FC<CalibrationRunnerPanelProps> = ({
    controller,
    loadedProfileSummary,
    gridSize,
    arrayRotation,
    onArrayRotationChange,
    stagingPosition,
    onStagingPositionChange,
    isCalibrationActive,
    stepState,
    isAwaitingAdvance,
    isPaused,
    detectionReady,
    onStart,
    onPause,
    onResume,
    onAbort,
    onAdvance,
}) => {
    const { runnerState, runnerSettings, updateSetting, commandLog, tileEntries, mode, setMode } =
        controller;

    const isRunnerBusy =
        runnerState.phase === 'homing' ||
        runnerState.phase === 'staging' ||
        runnerState.phase === 'measuring' ||
        runnerState.phase === 'aligning';

    // Use runner's blueprint if available, otherwise fall back to loaded profile's blueprint
    const runnerBlueprint = runnerState.summary?.gridBlueprint;
    const loadedBlueprint = loadedProfileSummary?.gridBlueprint;
    const blueprint = runnerBlueprint ?? loadedBlueprint;
    const [summaryModalOpen, setSummaryModalOpen] = useState(false);

    return (
        <>
            <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                {/* Section header */}
                <h2 className="text-lg font-semibold text-emerald-300 mb-4">Calibration</h2>

                <div className="space-y-4">
                    {/* Calibration Settings - collapsed by default */}
                    <CalibrationSettingsPanel
                        arrayRotation={arrayRotation}
                        onArrayRotationChange={onArrayRotationChange}
                        stagingPosition={stagingPosition}
                        onStagingPositionChange={onStagingPositionChange}
                        firstTileInterimStepDelta={runnerSettings.firstTileInterimStepDelta}
                        onFirstTileInterimStepDeltaChange={(v) =>
                            updateSetting('firstTileInterimStepDelta', v)
                        }
                        deltaSteps={runnerSettings.deltaSteps}
                        onDeltaStepsChange={(v) => updateSetting('deltaSteps', v)}
                        gridGapNormalized={runnerSettings.gridGapNormalized}
                        onGridGapNormalizedChange={(v) => updateSetting('gridGapNormalized', v)}
                        firstTileTolerance={runnerSettings.firstTileTolerance}
                        onFirstTileToleranceChange={(v) => updateSetting('firstTileTolerance', v)}
                        tileTolerance={runnerSettings.tileTolerance}
                        onTileToleranceChange={(v) => updateSetting('tileTolerance', v)}
                        disabled={isCalibrationActive}
                    />

                    {/* Status bar with progress, mode toggle, and action buttons */}
                    <CalibrationStatusBar
                        runnerState={runnerState}
                        stepState={stepState}
                        mode={mode}
                        onModeChange={setMode}
                        isAwaitingAdvance={isAwaitingAdvance}
                        isActive={isCalibrationActive}
                        isPaused={isPaused}
                        detectionReady={detectionReady}
                        onStart={onStart}
                        onPause={onPause}
                        onResume={onResume}
                        onAbort={onAbort}
                        onAdvance={onAdvance}
                    />

                    {/* Actions row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <MoveActionsDropdown
                            runnerState={runnerState}
                            tileEntries={tileEntries}
                            isRunnerBusy={isRunnerBusy}
                            loadedProfileSummary={loadedProfileSummary}
                            gridSize={gridSize}
                            arrayRotation={arrayRotation}
                            stagingPosition={stagingPosition}
                        />
                        {blueprint && (
                            <button
                                type="button"
                                onClick={() => setSummaryModalOpen(true)}
                                className="text-xs text-gray-500 hover:text-gray-300 hover:underline"
                            >
                                View calibration math
                            </button>
                        )}
                    </div>

                    {/* Command log - collapsed by default */}
                    <CalibrationCommandLog entries={commandLog} mode={mode} />
                </div>
            </section>
            <CalibrationSummaryModal
                open={summaryModalOpen}
                summary={runnerState.summary ?? null}
                onClose={() => setSummaryModalOpen(false)}
            />
        </>
    );
};

export default CalibrationRunnerPanel;
