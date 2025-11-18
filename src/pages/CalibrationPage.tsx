import React, { useEffect, useMemo, useState } from 'react';

import CalibrationPreview from '@/components/calibration/CalibrationPreview';
import CalibrationProfileManager from '@/components/calibration/CalibrationProfileManager';
import CalibrationRunnerPanel from '@/components/calibration/CalibrationRunnerPanel';
import DetectionProfileManager from '@/components/calibration/DetectionProfileManager';
import DetectionSettingsPanel from '@/components/calibration/DetectionSettingsPanel';
import { useStatusStore } from '@/context/StatusContext';
import { useCalibrationProfilesController } from '@/hooks/useCalibrationProfilesController';
import { useCalibrationRunnerController } from '@/hooks/useCalibrationRunnerController';
import { useCameraPipeline, type TileBoundsOverlayEntry } from '@/hooks/useCameraPipeline';
import { useDetectionSettingsController } from '@/hooks/useDetectionSettingsController';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import type { MirrorConfig } from '@/types';

interface CalibrationPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const CalibrationPage: React.FC<CalibrationPageProps> = ({ gridSize, mirrorConfig }) => {
    const { drivers } = useStatusStore();
    const {
        detectionSettingsLoaded,
        selectedDeviceId,
        setSelectedDeviceId,
        selectedResolutionId,
        setSelectedResolutionId,
        brightness,
        setBrightness,
        contrast,
        setContrast,
        rotationDegrees,
        setRotationDegrees,
        claheClipLimit,
        setClaheClipLimit,
        claheTileGridSize,
        setClaheTileGridSize,
        roi,
        setRoi,
        blobParams,
        updateBlobParam,
        useWasmDetector,
        setUseWasmDetector,
        savedProfiles,
        selectedProfileId,
        selectProfileId,
        profileNameInput,
        setProfileNameInput,
        applyProfileById,
        saveProfile,
        resetProfileSelection,
        resolvedResolution,
        handleNativeDetectorAvailability,
        setLastCaptureDimensions,
    } = useDetectionSettingsController();

    const [isRotationAdjusting, setIsRotationAdjusting] = useState(false);
    const [alignmentOverlayVisible, setAlignmentOverlayVisible] = useState(false);
    const [tileBoundsOverlayVisible, setTileBoundsOverlayVisible] = useState(false);

    const cameraPipeline = useCameraPipeline({
        detectionSettingsLoaded,
        selectedDeviceId,
        resolvedResolution,
        brightness,
        contrast,
        rotationDegrees,
        claheClipLimit,
        claheTileGridSize,
        roi,
        setRoi,
        blobParams,
        useWasmDetector,
        onNativeDetectorAvailability: handleNativeDetectorAvailability,
        onVideoDimensionsChange: setLastCaptureDimensions,
        alignmentOverlayVisible,
    });

    const {
        previewMode,
        setPreviewMode,
        roiViewEnabled,
        toggleRoiView,
        roiEditingMode,
        processedFps,
        cameraStatus,
        cameraError,
        videoDimensions,
        devices,
        detectedBlobCount,
        opencvStatus,
        opencvError,
        opencvInfo,
        detectionReady,
        captureBlobMeasurement,
        previewRefs,
        overlayHandlers,
        resetRoi,
        nativeBlobDetectorAvailable,
        setAlignmentOverlaySummary,
        setGlobalBoundsOverlayBounds,
        setTileBoundsOverlayEntries,
        blobsOverlayEnabled,
        setBlobsOverlayEnabled,
    } = cameraPipeline;

    const motorCommands = useMotorCommands();

    const {
        runnerState,
        runnerSettings,
        updateSetting: updateRunnerSetting,
        tileEntries,
        startRunner,
        pauseRunner,
        resumeRunner,
        abortRunner,
    } = useCalibrationRunnerController({
        gridSize,
        mirrorConfig,
        motorApi: motorCommands,
        captureMeasurement: captureBlobMeasurement,
        detectionReady,
    });

    const calibrationProfilesController = useCalibrationProfilesController({
        runnerState,
        gridSize,
        mirrorConfig,
    });

    const runSummary = {
        total: runnerState.progress.total,
        completed: runnerState.progress.completed,
        failed: runnerState.progress.failed,
        skipped: runnerState.progress.skipped,
    };

    const isCalibrationActive = !['idle', 'completed', 'error', 'aborted'].includes(
        runnerState.phase,
    );

    const alignmentSourceSummary =
        runnerState.summary ??
        (isCalibrationActive ? null : calibrationProfilesController.activeProfileSummary);

    const activeProfile = calibrationProfilesController.activeProfile;

    const activeTileBounds = useMemo<TileBoundsOverlayEntry[]>(() => {
        if (!activeProfile) {
            return [];
        }
        return Object.values(activeProfile.tiles)
            .filter((tile) => Boolean(tile.inferredBounds))
            .map((tile) => ({
                key: tile.key,
                row: tile.row,
                col: tile.col,
                bounds: tile.inferredBounds!,
            }));
    }, [activeProfile]);

    useEffect(() => {
        setAlignmentOverlaySummary(alignmentSourceSummary ?? null);
    }, [alignmentSourceSummary, setAlignmentOverlaySummary]);

    const alignmentOverlayAvailable = Boolean(alignmentSourceSummary?.gridBlueprint);
    const displayedAlignmentOverlayEnabled = alignmentOverlayVisible && alignmentOverlayAvailable;

    const activeGlobalBounds = activeProfile?.calibrationSpace.globalBounds ?? null;

    useEffect(() => {
        const shouldShowBounds =
            displayedAlignmentOverlayEnabled && !isCalibrationActive && Boolean(activeGlobalBounds);
        setGlobalBoundsOverlayBounds(shouldShowBounds ? activeGlobalBounds : null);
    }, [
        activeGlobalBounds,
        displayedAlignmentOverlayEnabled,
        isCalibrationActive,
        setGlobalBoundsOverlayBounds,
    ]);

    const tileBoundsOverlayAvailable = !isCalibrationActive && activeTileBounds.length > 0;
    const displayedTileBoundsOverlayEnabled =
        tileBoundsOverlayVisible && tileBoundsOverlayAvailable;

    useEffect(() => {
        setTileBoundsOverlayEntries(displayedTileBoundsOverlayEnabled ? activeTileBounds : null);
    }, [activeTileBounds, displayedTileBoundsOverlayEnabled, setTileBoundsOverlayEntries]);

    const rotationOverlayVisible = isRotationAdjusting;

    return (
        <div className="flex flex-col gap-6">
            <CalibrationProfileManager
                profiles={calibrationProfilesController.profiles}
                selectedProfileId={calibrationProfilesController.selectedProfileId}
                activeProfileId={calibrationProfilesController.activeProfileId}
                onSelectProfile={calibrationProfilesController.selectProfileId}
                onDeleteProfile={calibrationProfilesController.deleteProfile}
                onLoadProfile={calibrationProfilesController.loadProfile}
                profileName={calibrationProfilesController.profileNameInput}
                onProfileNameChange={calibrationProfilesController.setProfileNameInput}
                onSaveProfile={calibrationProfilesController.saveProfile}
                onNewProfile={calibrationProfilesController.resetProfileSelection}
                onImportProfile={calibrationProfilesController.importProfileFromJson}
                canSave={calibrationProfilesController.canSaveProfile}
                saveFeedback={calibrationProfilesController.saveFeedback}
                onDismissFeedback={calibrationProfilesController.dismissFeedback}
                onReportFeedback={calibrationProfilesController.reportFeedback}
                lastRunSummary={runSummary}
                currentGridFingerprint={calibrationProfilesController.currentGridFingerprint}
            />
            <CalibrationRunnerPanel
                runnerState={runnerState}
                runnerSettings={runnerSettings}
                tileEntries={tileEntries}
                detectionReady={detectionReady}
                drivers={drivers}
                onUpdateSetting={updateRunnerSetting}
                onStart={startRunner}
                onPause={pauseRunner}
                onResume={resumeRunner}
                onAbort={abortRunner}
            />
            <div className="flex flex-col gap-6 lg:flex-row">
                <div className="flex flex-col gap-4 lg:w-[300px] lg:flex-shrink-0">
                    <DetectionSettingsPanel
                        devices={devices}
                        selectedDeviceId={selectedDeviceId}
                        onSelectDevice={setSelectedDeviceId}
                        selectedResolutionId={selectedResolutionId}
                        onSelectResolution={setSelectedResolutionId}
                        videoDimensions={videoDimensions}
                        roi={roi}
                        processedFps={processedFps}
                        previewMode={previewMode}
                        detectedBlobCount={detectedBlobCount}
                        opencvStatus={opencvStatus}
                        opencvInfo={opencvInfo}
                        opencvError={opencvError}
                        cameraStatus={cameraStatus}
                        cameraError={cameraError}
                        brightness={brightness}
                        onChangeBrightness={setBrightness}
                        contrast={contrast}
                        onChangeContrast={setContrast}
                        rotationDegrees={rotationDegrees}
                        onChangeRotation={setRotationDegrees}
                        onRotationAdjustStart={() => setIsRotationAdjusting(true)}
                        onRotationAdjustEnd={() => setIsRotationAdjusting(false)}
                        claheClipLimit={claheClipLimit}
                        onChangeClaheClipLimit={setClaheClipLimit}
                        claheTileGridSize={claheTileGridSize}
                        onChangeClaheTileGridSize={setClaheTileGridSize}
                        blobParams={blobParams}
                        onUpdateBlobParam={updateBlobParam}
                        useWasmDetector={useWasmDetector}
                        onToggleUseWasmDetector={setUseWasmDetector}
                        nativeBlobDetectorAvailable={nativeBlobDetectorAvailable}
                    />
                    <DetectionProfileManager
                        savedProfiles={savedProfiles}
                        profileName={profileNameInput}
                        onProfileNameChange={setProfileNameInput}
                        selectedProfileId={selectedProfileId}
                        onSelectProfile={selectProfileId}
                        onSaveProfile={saveProfile}
                        onNewProfile={resetProfileSelection}
                        onLoadProfile={applyProfileById}
                    />
                </div>
                <CalibrationPreview
                    previewMode={previewMode}
                    onPreviewModeChange={setPreviewMode}
                    roi={roi}
                    roiViewEnabled={roiViewEnabled}
                    onToggleRoiView={toggleRoiView}
                    onResetRoi={resetRoi}
                    previewRefs={previewRefs}
                    overlayHandlers={overlayHandlers}
                    rotationDegrees={rotationDegrees}
                    rotationOverlayVisible={rotationOverlayVisible}
                    roiEditingMode={roiEditingMode}
                    opencvStatus={opencvStatus}
                    opencvError={opencvError}
                    videoDimensions={videoDimensions}
                    blobsOverlayEnabled={blobsOverlayEnabled}
                    onToggleBlobsOverlay={() => setBlobsOverlayEnabled(!blobsOverlayEnabled)}
                    alignmentOverlayEnabled={displayedAlignmentOverlayEnabled}
                    alignmentOverlayAvailable={alignmentOverlayAvailable}
                    onToggleAlignmentOverlay={() => setAlignmentOverlayVisible((prev) => !prev)}
                    tileBoundsOverlayEnabled={displayedTileBoundsOverlayEnabled}
                    tileBoundsOverlayAvailable={tileBoundsOverlayAvailable}
                    onToggleTileBoundsOverlay={() => setTileBoundsOverlayVisible((prev) => !prev)}
                />
            </div>
        </div>
    );
};

export default CalibrationPage;
