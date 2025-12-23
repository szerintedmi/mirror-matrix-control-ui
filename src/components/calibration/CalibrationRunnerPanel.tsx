import React from 'react';

import CalibrationSettingsPanel from '@/components/calibration/CalibrationSettingsPanel';
import CalibrationStatusBar from '@/components/calibration/CalibrationStatusBar';
import type { CalibrationController } from '@/hooks/useCalibrationController';
import type { CalibrationSettingsController } from '@/hooks/useCalibrationSettingsController';
import type { CalibrationStepState } from '@/services/calibration/types';

interface CalibrationRunnerPanelProps {
    controller: CalibrationController;
    settingsController: CalibrationSettingsController;
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
    settingsController,
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
    const { runnerState, mode, setMode } = controller;

    return (
        <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
            {/* Section header */}
            <h2 className="mb-4 text-lg font-semibold text-emerald-300">Calibration</h2>

            <div className="space-y-4">
                {/* Calibration Settings - collapsed by default */}
                <CalibrationSettingsPanel
                    arrayRotation={settingsController.arrayRotation}
                    onArrayRotationChange={settingsController.setArrayRotation}
                    stagingPosition={settingsController.stagingPosition}
                    onStagingPositionChange={settingsController.setStagingPosition}
                    firstTileInterimStepDelta={settingsController.firstTileInterimStepDelta}
                    onFirstTileInterimStepDeltaChange={
                        settingsController.setFirstTileInterimStepDelta
                    }
                    deltaSteps={settingsController.deltaSteps}
                    onDeltaStepsChange={settingsController.setDeltaSteps}
                    gridGapNormalized={settingsController.gridGapNormalized}
                    onGridGapNormalizedChange={settingsController.setGridGapNormalized}
                    firstTileTolerance={settingsController.firstTileTolerance}
                    onFirstTileToleranceChange={settingsController.setFirstTileTolerance}
                    tileTolerance={settingsController.tileTolerance}
                    onTileToleranceChange={settingsController.setTileTolerance}
                    disabled={isCalibrationActive}
                    isDefaultSettings={settingsController.isDefaultSettings}
                    onResetToDefaults={settingsController.resetToDefaults}
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
            </div>
        </section>
    );
};

export default CalibrationRunnerPanel;
