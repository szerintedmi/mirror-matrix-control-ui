import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CalibrationCommandLog from '@/components/calibration/CalibrationCommandLog';
import CalibrationPreview from '@/components/calibration/CalibrationPreview';
import CalibrationRunnerPanel from '@/components/calibration/CalibrationRunnerPanel';
import DetectionProfileManager from '@/components/calibration/DetectionProfileManager';
import DetectionSettingsPanel from '@/components/calibration/DetectionSettingsPanel';
import TileStatusesPanel from '@/components/calibration/TileStatusesPanel';
import { DEFAULT_STAGING_POSITION } from '@/constants/calibration';
import { useCalibrationContext } from '@/context/CalibrationContext';
import { useStatusStore } from '@/context/StatusContext';
import { useCalibrationController } from '@/hooks/useCalibrationController';
import { useCalibrationProfilesController } from '@/hooks/useCalibrationProfilesController';
import { useCalibrationStateSession } from '@/hooks/useCalibrationStateSession';
import { useCameraPipeline, type TileBoundsOverlayEntry } from '@/hooks/useCameraPipeline';
import { useDetectionSettingsController } from '@/hooks/useDetectionSettingsController';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import type { CalibrationRunSummary, TileAddress } from '@/services/calibration/types';
import {
    loadCalibrationProfiles,
    loadLastCalibrationProfileId,
    profileToRunSummary,
} from '@/services/calibrationProfileStorage';
import { DRAFT_PROFILE_ID, saveDraftProfile } from '@/services/draftProfileService';
import { getGridStateFingerprint, type GridStateSnapshot } from '@/services/gridStorage';
import type { Motor } from '@/types';
import type {
    ArrayRotation,
    CalibrationCameraResolution,
    MirrorConfig,
    StagingPosition,
} from '@/types';

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

    // Array rotation setting for calibration (physical orientation of mirror array)
    const [arrayRotation, setArrayRotation] = useState<ArrayRotation>(0);

    // Staging position setting for where tiles move during staging phase
    const [stagingPosition, setStagingPosition] =
        useState<StagingPosition>(DEFAULT_STAGING_POSITION);

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
        detectionReady,
        captureBlobMeasurement,
        previewRefs,
        overlayHandlers,
        resetRoi,
        nativeBlobDetectorAvailable,
        setAlignmentOverlaySummary,
        setTileBoundsOverlayEntries,
        blobsOverlayEnabled,
        setBlobsOverlayEnabled,
        setExpectedBlobPosition,
    } = cameraPipeline;

    const motorCommands = useMotorCommands();

    // Grid fingerprint for session state validation
    const gridFingerprint = useMemo(() => {
        const snapshot: GridStateSnapshot = { gridSize, mirrorConfig };
        return getGridStateFingerprint(snapshot).hash;
    }, [gridSize, mirrorConfig]);

    // Load initial session state for restoration
    const initialSessionState = useMemo(() => {
        const SESSION_KEY = 'mirror:calibration:session-state';
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed.fingerprint !== gridFingerprint) {
                sessionStorage.removeItem(SESSION_KEY);
                return null;
            }
            return parsed.data;
        } catch {
            return null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only load once on mount

    // Callback for CalibrationExecutor to update expected position overlay before motor moves
    const handleExpectedPositionChange = useCallback(
        (position: { x: number; y: number } | null, tolerance: number) => {
            if (position) {
                setExpectedBlobPosition({ position, maxDistance: tolerance });
            } else {
                setExpectedBlobPosition(null);
            }
        },
        [setExpectedBlobPosition],
    );

    // Compute initial active profile summary on mount (before hooks)
    // This enables single-tile recalibration for loaded profiles
    const [loadedProfileSummary] = useState<CalibrationRunSummary | null>(() => {
        const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
        const profiles = loadCalibrationProfiles(storage);
        const lastId = loadLastCalibrationProfileId(storage);
        const activeProfile =
            (lastId && profiles.find((p) => p.id === lastId)) || profiles[0] || null;
        return activeProfile ? profileToRunSummary(activeProfile) : null;
    });

    const calibrationController = useCalibrationController({
        gridSize,
        mirrorConfig,
        motorApi: motorCommands,
        captureMeasurement: captureBlobMeasurement,
        detectionReady,
        arrayRotation,
        stagingPosition,
        roi,
        initialSessionState,
        loadedProfileSummary,
        onExpectedPositionChange: handleExpectedPositionChange,
    });

    const {
        runnerState,
        runnerSettings,
        tileEntries,
        stepState,
        isAwaitingAdvance,
        detectionReady: calibrationDetectionReady,
        start: startCalibration,
        pause: pauseCalibration,
        resume: resumeCalibration,
        advance: advanceCalibration,
        abort: abortCalibration,
        startSingleTileRecalibration,
        commandLog,
        mode: calibrationMode,
    } = calibrationController;

    const isCalibrationPaused = runnerState.phase === 'paused';

    // Persist calibration state to sessionStorage
    useCalibrationStateSession(runnerState, gridFingerprint);

    // Clear expected position overlay when calibration starts
    useEffect(() => {
        if (runnerState.phase === 'staging') {
            setExpectedBlobPosition(null);
        }
    }, [runnerState.phase, setExpectedBlobPosition]);

    const calibrationProfilesController = useCalibrationProfilesController({
        runnerState,
        gridSize,
        mirrorConfig,
        arrayRotation,
    });

    const { refreshProfiles, selectProfile } = useCalibrationContext();

    // Track previous phase to detect transitions (not just current state)
    const prevPhaseRef = useRef<string | null>(null);

    // Auto-save draft when calibration transitions to 'completed' (not on mount/restore)
    useEffect(() => {
        const prevPhase = prevPhaseRef.current;
        prevPhaseRef.current = runnerState.phase;

        // Only save draft when transitioning TO completed from an active phase
        // This prevents re-creating drafts on page reload or after user saves/discards
        const isTransitionToCompleted =
            runnerState.phase === 'completed' &&
            prevPhase !== null &&
            prevPhase !== 'completed' &&
            prevPhase !== 'idle';

        if (isTransitionToCompleted && runnerState.summary) {
            const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
            const gridSnapshot: GridStateSnapshot = { gridSize, mirrorConfig };
            saveDraftProfile(storage, {
                runnerState,
                gridSnapshot,
                arrayRotation,
            });
            refreshProfiles();
            selectProfile(DRAFT_PROFILE_ID);
        }
    }, [
        runnerState.phase,
        runnerState.summary,
        runnerState,
        gridSize,
        mirrorConfig,
        arrayRotation,
        refreshProfiles,
        selectProfile,
    ]);

    const isCalibrationActive = !['idle', 'completed', 'error', 'aborted'].includes(
        runnerState.phase,
    );

    // Handler to home both axes of a tile
    const handleHomeTile = useCallback(
        (_tile: TileAddress, motors: { x: Motor | null; y: Motor | null }) => {
            const homePromises: Promise<unknown>[] = [];
            if (motors.x) {
                homePromises.push(
                    motorCommands.homeMotor({
                        mac: motors.x.nodeMac,
                        motorId: motors.x.motorIndex,
                    }),
                );
            }
            if (motors.y) {
                homePromises.push(
                    motorCommands.homeMotor({
                        mac: motors.y.nodeMac,
                        motorId: motors.y.motorIndex,
                    }),
                );
            }
            // Fire and forget - errors are handled by the command system
            Promise.all(homePromises).catch(console.error);
        },
        [motorCommands],
    );

    const alignmentSourceSummary =
        runnerState.summary ??
        (isCalibrationActive ? null : calibrationProfilesController.activeProfileSummary);

    const activeProfile = calibrationProfilesController.activeProfile;

    const activeTileBounds = useMemo<TileBoundsOverlayEntry[]>(() => {
        // During calibration: source from runner summary
        if (isCalibrationActive && runnerState.summary) {
            return Object.values(runnerState.summary.tiles)
                .filter((tile) => tile.status === 'completed' && Boolean(tile.combinedBounds))
                .map((tile) => ({
                    key: tile.tile.key,
                    row: tile.tile.row,
                    col: tile.tile.col,
                    bounds: tile.combinedBounds!,
                }));
        }
        // When not calibrating: source from active profile
        if (!activeProfile) {
            return [];
        }
        return Object.values(activeProfile.tiles)
            .filter((tile) => Boolean(tile.combinedBounds))
            .map((tile) => ({
                key: tile.key,
                row: tile.row,
                col: tile.col,
                bounds: tile.combinedBounds!,
            }));
    }, [activeProfile, isCalibrationActive, runnerState.summary]);

    const activeCameraOriginOffset = useMemo(() => {
        // During calibration: source from runner summary if available
        if (isCalibrationActive && runnerState.summary?.gridBlueprint) {
            return runnerState.summary.gridBlueprint.cameraOriginOffset;
        }
        return activeProfile?.gridBlueprint?.cameraOriginOffset ?? null;
    }, [isCalibrationActive, runnerState.summary, activeProfile]);

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

    // Auto-enable calibration overlay when starting calibration
    useEffect(() => {
        if (isCalibrationActive && alignmentOverlayAvailable) {
            setAlignmentOverlayVisible(true);
        }
    }, [isCalibrationActive, alignmentOverlayAvailable]);

    const tileBoundsOverlayAvailable =
        activeTileBounds.length > 0 && Boolean(activeCameraOriginOffset);
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
            {showCameraAspectWarning && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 shadow-lg">
                    <p className="font-semibold text-amber-100">Aspect mismatch detected</p>
                    <p>
                        This calibration was captured at {profileAspectDescriptor}; current camera
                        is {currentAspectDescriptor}. Re-run calibration or switch resolution.
                    </p>
                </div>
            )}
            <TileStatusesPanel
                tileEntries={tileEntries}
                drivers={drivers}
                runnerSummary={runnerState.summary ?? null}
                deltaSteps={runnerSettings.deltaSteps}
                outlierTileKeys={
                    runnerState.summary?.outlierAnalysis?.outlierTileKeys
                        ? new Set(runnerState.summary.outlierAnalysis.outlierTileKeys)
                        : undefined
                }
                isCalibrationActive={isCalibrationActive}
                onHomeTile={handleHomeTile}
                onRecalibrateTile={startSingleTileRecalibration}
            />
            <CalibrationRunnerPanel
                controller={calibrationController}
                loadedProfileSummary={calibrationProfilesController.activeProfileSummary}
                gridSize={gridSize}
                arrayRotation={arrayRotation}
                onArrayRotationChange={setArrayRotation}
                stagingPosition={stagingPosition}
                onStagingPositionChange={setStagingPosition}
                isCalibrationActive={isCalibrationActive}
                stepState={stepState}
                isAwaitingAdvance={isAwaitingAdvance}
                isPaused={isCalibrationPaused}
                detectionReady={calibrationDetectionReady}
                onStart={startCalibration}
                onPause={pauseCalibration}
                onResume={resumeCalibration}
                onAbort={abortCalibration}
                onAdvance={advanceCalibration}
            />
            <div className="flex flex-col gap-6 lg:flex-row">
                <div className="flex flex-col gap-4 lg:w-[300px] lg:flex-shrink-0">
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
                        cameraStatus={cameraStatus}
                        cameraError={cameraError}
                        detectionReady={detectionReady}
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
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-4">
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
                        onToggleTileBoundsOverlay={() =>
                            setTileBoundsOverlayVisible((prev) => !prev)
                        }
                    />
                    <CalibrationCommandLog entries={commandLog} mode={calibrationMode} />
                </div>
            </div>
        </div>
    );
};

export default CalibrationPage;
