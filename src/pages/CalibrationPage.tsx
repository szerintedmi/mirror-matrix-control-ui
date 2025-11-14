import React, { useState } from 'react';

import CalibrationPreview from '@/components/calibration/CalibrationPreview';
import CalibrationRunnerPanel from '@/components/calibration/CalibrationRunnerPanel';
import DetectionProfileManager from '@/components/calibration/DetectionProfileManager';
import DetectionSettingsPanel from '@/components/calibration/DetectionSettingsPanel';
import { useCalibrationRunnerController } from '@/hooks/useCalibrationRunnerController';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';
import { useDetectionSettingsController } from '@/hooks/useDetectionSettingsController';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import type { MirrorConfig } from '@/types';

interface CalibrationPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const CalibrationPage: React.FC<CalibrationPageProps> = ({ gridSize, mirrorConfig }) => {
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
        toggleRoiEnabled,
        resetRoi,
        nativeBlobDetectorAvailable,
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

    const rotationOverlayVisible = isRotationAdjusting;

    return (
        <div className="flex flex-col gap-6">
            <CalibrationRunnerPanel
                runnerState={runnerState}
                runnerSettings={runnerSettings}
                tileEntries={tileEntries}
                detectionReady={detectionReady}
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
                    onToggleRoiEnabled={toggleRoiEnabled}
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
                />
            </div>
        </div>
    );
};

export default CalibrationPage;
