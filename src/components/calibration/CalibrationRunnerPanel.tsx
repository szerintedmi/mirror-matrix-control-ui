import React from 'react';

import CalibrationSettingsPanel from '@/components/calibration/CalibrationSettingsPanel';
import CalibrationStatusBar from '@/components/calibration/CalibrationStatusBar';
import MoveActionsDropdown from '@/components/calibration/MoveActionsDropdown';
import type { CalibrationController } from '@/hooks/useCalibrationController';
import type { CalibrationRunSummary, CalibrationStepState } from '@/services/calibration/types';
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
    const { runnerState, runnerSettings, updateSetting, tileEntries, mode, setMode } = controller;

    const isRunnerBusy =
        runnerState.phase === 'homing' ||
        runnerState.phase === 'staging' ||
        runnerState.phase === 'measuring' ||
        runnerState.phase === 'aligning';

    return (
        <>
            <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                {/* Section header */}
                <h2 className="mb-4 text-lg font-semibold text-emerald-300">Calibration</h2>

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
                        pendingDecision={controller.pendingDecision}
                        onStart={onStart}
                        onPause={onPause}
                        onResume={onResume}
                        onAbort={onAbort}
                        onAdvance={onAdvance}
                        onSubmitDecision={controller.submitDecision}
                    />

                    {/* Actions row */}
                    <MoveActionsDropdown
                        runnerState={runnerState}
                        tileEntries={tileEntries}
                        isRunnerBusy={isRunnerBusy}
                        loadedProfileSummary={loadedProfileSummary}
                        gridSize={gridSize}
                        arrayRotation={arrayRotation}
                        stagingPosition={stagingPosition}
                    />
                </div>
            </section>
        </>
    );
};

export default CalibrationRunnerPanel;
