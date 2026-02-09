import React, { useCallback, useEffect, useRef, useState } from 'react';

import AlignmentControlPanel from '@/components/alignment/AlignmentControlPanel';
import AlignmentProgressPanel from '@/components/alignment/AlignmentProgressPanel';
import AlignmentShapeOverlay from '@/components/alignment/AlignmentShapeOverlay';
import CalibrationPreview from '@/components/calibration/CalibrationPreview';
import { useCalibrationContext } from '@/context/CalibrationContext';
import {
    useAlignmentController,
    type AlignmentRunSummaryOutput,
} from '@/hooks/useAlignmentController';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';
import { useDetectionSettingsController } from '@/hooks/useDetectionSettingsController';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import { exportAlignmentRunJson, saveAlignmentRun } from '@/services/alignmentRunStorage';
import type { MirrorConfig } from '@/types';

interface AlignmentPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const AlignmentPage: React.FC<AlignmentPageProps> = ({ gridSize, mirrorConfig }) => {
    const detection = useDetectionSettingsController();
    const motorApi = useMotorCommands();
    const { savedProfiles, selectedProfile, selectProfile, selectedProfileId } =
        useCalibrationContext();

    const [alignmentOverlayVisible] = useState(false);
    const prevProfileIdRef = useRef<string | null>(null);

    const camera = useCameraPipeline({
        detectionSettingsLoaded: detection.detectionSettingsLoaded,
        selectedDeviceId: detection.selectedDeviceId,
        resolvedResolution: detection.resolvedResolution,
        brightness: detection.brightness,
        contrast: detection.contrast,
        rotationDegrees: detection.rotationDegrees,
        claheClipLimit: detection.claheClipLimit,
        claheTileGridSize: detection.claheTileGridSize,
        roi: detection.roi,
        setRoi: detection.setRoi,
        blobParams: detection.blobParams,
        useWasmDetector: detection.useWasmDetector,
        onNativeDetectorAvailability: detection.handleNativeDetectorAvailability,
        onVideoDimensionsChange: detection.setLastCaptureDimensions,
        alignmentOverlayVisible,
    });

    // Set default ROI based on profile blob stats when profile changes
    useEffect(() => {
        if (!selectedProfile?.calibrationSpace?.blobStats) return;
        const { maxDiameter } = selectedProfile.calibrationSpace.blobStats;
        if (!maxDiameter || maxDiameter <= 0) return;

        const { width: vw, height: vh } = camera.videoDimensions;
        if (!vw || !vh) return; // camera not ready, will re-run when dims change

        if (selectedProfileId === prevProfileIdRef.current) return;
        prevProfileIdRef.current = selectedProfileId;

        // maxDiameter is in centered space; convert to pixel blob diameter
        // centered delta → viewport fraction: ÷2, then × max(vw,vh) → pixels
        const maxDim = Math.max(vw, vh);
        const blobPixels = (maxDiameter / 2) * maxDim;
        const roiPixels = blobPixels * 5;
        const roiW = Math.min(1, roiPixels / vw);
        const roiH = Math.min(1, roiPixels / vh);

        // Center ROI at the grid center (blueprint center) in viewport space.
        // The profile's centered space is recentered around the grid center,
        // so (0,0) recentered = cameraOriginOffset in raw camera centered space.
        const offset = selectedProfile.gridBlueprint?.cameraOriginOffset;
        const centerX = offset ? (offset.x + 1) / 2 : 0.5;
        const centerY = offset ? (offset.y + 1) / 2 : 0.5;

        detection.setRoi({
            enabled: true,
            x: Math.max(0, centerX - roiW / 2),
            y: Math.max(0, centerY - roiH / 2),
            width: roiW,
            height: roiH,
        });
    }, [selectedProfileId, selectedProfile, detection, camera.videoDimensions]);

    const alignment = useAlignmentController({
        gridSize,
        mirrorConfig,
        profile: selectedProfile,
        motorApi,
        roi: detection.roi,
        brightness: detection.brightness,
        contrast: detection.contrast,
        claheClipLimit: detection.claheClipLimit,
        claheTileGridSize: detection.claheTileGridSize,
        videoDimensions: camera.videoDimensions,
    });

    const handleExport = useCallback((summary: AlignmentRunSummaryOutput) => {
        const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
        saveAlignmentRun(storage, summary);
        exportAlignmentRunJson(summary);
    }, []);

    return (
        <div className="flex flex-col gap-6 lg:flex-row">
            {/* Left: Camera preview */}
            <div className="min-w-0 flex-1">
                <CalibrationPreview
                    previewMode={camera.previewMode}
                    onPreviewModeChange={camera.setPreviewMode}
                    roi={detection.roi}
                    roiViewEnabled={camera.roiViewEnabled}
                    onToggleRoiView={camera.toggleRoiView}
                    onResetRoi={camera.resetRoi}
                    previewRefs={camera.previewRefs}
                    overlayHandlers={camera.overlayHandlers}
                    rotationDegrees={detection.rotationDegrees}
                    rotationOverlayVisible={false}
                    roiEditingMode={camera.roiEditingMode}
                    opencvStatus={camera.opencvStatus}
                    opencvError={camera.opencvError}
                    videoDimensions={camera.videoDimensions}
                    blobsOverlayEnabled={camera.blobsOverlayEnabled}
                    onToggleBlobsOverlay={() =>
                        camera.setBlobsOverlayEnabled(!camera.blobsOverlayEnabled)
                    }
                    alignmentOverlayEnabled={false}
                    alignmentOverlayAvailable={false}
                    onToggleAlignmentOverlay={() => {}}
                    tileBoundsOverlayEnabled={false}
                    tileBoundsOverlayAvailable={false}
                    onToggleTileBoundsOverlay={() => {}}
                >
                    {alignment.state.lastShapeResult && (
                        <AlignmentShapeOverlay
                            shapeResult={alignment.state.lastShapeResult}
                            roiViewEnabled={camera.roiViewEnabled}
                            roi={detection.roi}
                        />
                    )}
                </CalibrationPreview>
            </div>

            {/* Right: Controls sidebar */}
            <div className="flex w-full flex-col gap-4 lg:w-80">
                <AlignmentControlPanel
                    phase={alignment.state.phase}
                    positioningComplete={alignment.state.positioningComplete}
                    settingsLocked={alignment.state.settingsLocked}
                    error={alignment.state.error}
                    settings={alignment.settings}
                    onSettingsChange={alignment.setSettings}
                    profiles={savedProfiles}
                    selectedProfileId={selectedProfileId}
                    onSelectProfile={selectProfile}
                    onMoveToCenter={alignment.moveToCenter}
                    onStartConvergence={alignment.startConvergence}
                    onStop={alignment.stop}
                />
                <AlignmentProgressPanel
                    state={alignment.state}
                    runSummary={alignment.runSummary}
                    onExport={handleExport}
                />
            </div>
        </div>
    );
};

export default AlignmentPage;
