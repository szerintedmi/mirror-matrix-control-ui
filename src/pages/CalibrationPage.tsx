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
import { useStepwiseCalibrationController } from '@/hooks/useStepwiseCalibrationController';
import type { CalibrationCameraResolution, MirrorConfig } from '@/types';

interface CalibrationPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const CAMERA_ASPECT_RATIO_EPSILON = 0.01;

const gcd = (a: number, b: number): number => {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    if (x === 0) {
        return y;
    }
    if (y === 0) {
        return x;
    }
    while (y) {
        const temp = y;
        y = x % y;
        x = temp;
    }
    return x;
};

const reduceResolutionToSimpleRatio = (width: number, height: number) => {
    const roundedWidth = Math.round(width);
    const roundedHeight = Math.round(height);
    const divisor = gcd(roundedWidth, roundedHeight);
    if (divisor <= 0) {
        return { width: roundedWidth, height: roundedHeight };
    }
    return {
        width: roundedWidth / divisor,
        height: roundedHeight / divisor,
    };
};

const formatAspectRatioLabel = (
    aspect: number | null,
    resolution: CalibrationCameraResolution | null,
): string => {
    if (resolution && resolution.width > 0 && resolution.height > 0) {
        const simplified = reduceResolutionToSimpleRatio(resolution.width, resolution.height);
        return `${simplified.width}:${simplified.height}`;
    }
    if (aspect && Number.isFinite(aspect) && aspect > 0) {
        return `${aspect.toFixed(2)}:1`;
    }
    return 'unknown ratio';
};

const formatResolutionLabel = (resolution: CalibrationCameraResolution | null): string | null => {
    if (resolution && resolution.width > 0 && resolution.height > 0) {
        return `${Math.round(resolution.width)}x${Math.round(resolution.height)}`;
    }
    return null;
};

const describeCameraAspect = (
    aspect: number | null,
    resolution: CalibrationCameraResolution | null,
): string => {
    const label = formatAspectRatioLabel(aspect, resolution);
    const resolutionLabel = formatResolutionLabel(resolution);
    return resolutionLabel ? `${resolutionLabel} (${label})` : label;
};

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
        commandLog,
        updateSetting: updateRunnerSetting,
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

    const stepRunnerController = useStepwiseCalibrationController({
        gridSize,
        mirrorConfig,
        motorApi: motorCommands,
        captureMeasurement: captureBlobMeasurement,
        detectionReady,
        settings: runnerSettings,
    });

    const [runnerMode, setRunnerMode] = useState<'auto' | 'step'>('auto');

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

    const activeCameraOriginOffset = activeProfile?.gridBlueprint?.cameraOriginOffset ?? null;

    const currentCameraResolution: CalibrationCameraResolution | null = useMemo(() => {
        if (videoDimensions.width > 0 && videoDimensions.height > 0) {
            return {
                width: videoDimensions.width,
                height: videoDimensions.height,
            };
        }
        if (resolvedResolution.width && resolvedResolution.height) {
            return {
                width: resolvedResolution.width,
                height: resolvedResolution.height,
            };
        }
        return null;
    }, [
        resolvedResolution.height,
        resolvedResolution.width,
        videoDimensions.height,
        videoDimensions.width,
    ]);

    const cameraAspectRatio =
        currentCameraResolution && currentCameraResolution.height > 0
            ? currentCameraResolution.width / currentCameraResolution.height
            : null;

    const profileCameraAspect = activeProfile?.calibrationCameraAspect ?? null;
    const profileCameraResolution = activeProfile?.calibrationCameraResolution ?? null;

    const showCameraAspectWarning =
        profileCameraAspect !== null &&
        cameraAspectRatio !== null &&
        currentCameraResolution !== null &&
        Math.abs(profileCameraAspect - cameraAspectRatio) > CAMERA_ASPECT_RATIO_EPSILON;

    const profileAspectDescriptor = describeCameraAspect(
        profileCameraAspect,
        profileCameraResolution,
    );
    const currentAspectDescriptor = describeCameraAspect(
        cameraAspectRatio,
        currentCameraResolution,
    );

    useEffect(() => {
        setAlignmentOverlaySummary(alignmentSourceSummary ?? null);
    }, [alignmentSourceSummary, setAlignmentOverlaySummary]);

    const alignmentOverlayAvailable = Boolean(alignmentSourceSummary?.gridBlueprint);
    const displayedAlignmentOverlayEnabled = alignmentOverlayVisible && alignmentOverlayAvailable;

    const activeGlobalBounds = activeProfile?.calibrationSpace.globalBounds ?? null;

    useEffect(() => {
        const shouldShowBounds =
            displayedAlignmentOverlayEnabled &&
            !isCalibrationActive &&
            Boolean(activeGlobalBounds) &&
            Boolean(activeCameraOriginOffset);
        setGlobalBoundsOverlayBounds(
            shouldShowBounds && activeGlobalBounds && activeCameraOriginOffset
                ? {
                      bounds: activeGlobalBounds,
                      cameraOriginOffset: activeCameraOriginOffset,
                  }
                : null,
        );
    }, [
        activeGlobalBounds,
        displayedAlignmentOverlayEnabled,
        isCalibrationActive,
        activeCameraOriginOffset,
        setGlobalBoundsOverlayBounds,
    ]);

    const tileBoundsOverlayAvailable =
        !isCalibrationActive && activeTileBounds.length > 0 && Boolean(activeCameraOriginOffset);
    const displayedTileBoundsOverlayEnabled =
        tileBoundsOverlayVisible && tileBoundsOverlayAvailable;

    useEffect(() => {
        setTileBoundsOverlayEntries(
            displayedTileBoundsOverlayEnabled && activeCameraOriginOffset
                ? {
                      entries: activeTileBounds,
                      cameraOriginOffset: activeCameraOriginOffset,
                  }
                : null,
        );
    }, [
        activeCameraOriginOffset,
        activeTileBounds,
        displayedTileBoundsOverlayEnabled,
        setTileBoundsOverlayEntries,
    ]);

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
            {showCameraAspectWarning && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 shadow-lg">
                    <p className="font-semibold text-amber-100">Aspect mismatch detected</p>
                    <p>
                        This calibration was captured at {profileAspectDescriptor}; current camera
                        is {currentAspectDescriptor}. Re-run calibration or switch resolution.
                    </p>
                </div>
            )}
            <CalibrationRunnerPanel
                runMode={runnerMode}
                onRunModeChange={setRunnerMode}
                runnerSettings={runnerSettings}
                detectionReady={detectionReady}
                drivers={drivers}
                onUpdateSetting={updateRunnerSetting}
                autoControls={{
                    runnerState,
                    start: startRunner,
                    pause: pauseRunner,
                    resume: resumeRunner,
                    abort: abortRunner,
                    commandLog,
                }}
                stepControls={{
                    runnerState: stepRunnerController.runnerState,
                    stepState: stepRunnerController.stepState,
                    commandLog: stepRunnerController.commandLog,
                    isAwaitingAdvance: stepRunnerController.isAwaitingAdvance,
                    isActive: stepRunnerController.isActive,
                    start: stepRunnerController.start,
                    advance: stepRunnerController.advance,
                    abort: stepRunnerController.abort,
                    reset: stepRunnerController.reset,
                }}
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
