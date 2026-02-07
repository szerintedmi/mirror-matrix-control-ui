import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AlignmentControlPanel from '@/components/alignment/AlignmentControlPanel';
import AlignmentProgressPanel from '@/components/alignment/AlignmentProgressPanel';
import AlignmentShapeOverlay from '@/components/alignment/AlignmentShapeOverlay';
import CalibrationPreview from '@/components/calibration/CalibrationPreview';
import { useCalibrationContext } from '@/context/CalibrationContext';
import { useAlignmentController } from '@/hooks/useAlignmentController';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';
import { useDetectionSettingsController } from '@/hooks/useDetectionSettingsController';
import type { ShapeAnalysisResult } from '@/services/opencvWorkerClient';
import { getOpenCvWorkerClient } from '@/services/openCvWorkerSingleton';
import type { MirrorConfig } from '@/types';

interface AlignmentPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const AlignmentPage: React.FC<AlignmentPageProps> = ({ gridSize, mirrorConfig }) => {
    const { savedProfiles, selectedProfileId, selectProfile } = useCalibrationContext();

    const {
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
        handleNativeDetectorAvailability,
        setLastCaptureDimensions,
    } = useDetectionSettingsController();

    const [adaptiveMethod, setAdaptiveMethod] = useState<'GAUSSIAN' | 'MEAN'>('GAUSSIAN');
    const [thresholdType, setThresholdType] = useState<'BINARY' | 'BINARY_INV'>('BINARY');
    const [blockSize, setBlockSize] = useState(51);
    const [thresholdConstant, setThresholdConstant] = useState(10);
    const [minContourArea, setMinContourArea] = useState(100);
    const [enableSmoothing, setEnableSmoothing] = useState(true);
    const [enableMorphology, setEnableMorphology] = useState(true);
    const [rejectBorderContours, setRejectBorderContours] = useState(true);
    const [rejectLargeContours, setRejectLargeContours] = useState(true);
    const [maxContourAreaRatio, setMaxContourAreaRatio] = useState(0.65);
    const [enableBackgroundSuppression, setEnableBackgroundSuppression] = useState(false);
    const [backgroundBlurKernelSize, setBackgroundBlurKernelSize] = useState(31);
    const [backgroundGain, setBackgroundGain] = useState(1.5);
    const [enableContourMerging, setEnableContourMerging] = useState(false);
    const [contourMergeMaxContours, setContourMergeMaxContours] = useState(4);
    const [contourMergeDistancePx, setContourMergeDistancePx] = useState(120);
    const [contourMergeMinAreaRatio, setContourMergeMinAreaRatio] = useState(0.08);
    const [samplesPerMeasurement, setSamplesPerMeasurement] = useState(3);
    const [outlierStrategy, setOutlierStrategy] = useState<'mad-filter' | 'none'>('mad-filter');
    const [outlierThreshold, setOutlierThreshold] = useState(3);
    const [stepSize, setStepSize] = useState(2);
    const [maxIterationsPerAxis, setMaxIterationsPerAxis] = useState(20);
    const [areaThresholdPercent, setAreaThresholdPercent] = useState(1);
    const [improvementStrategy, setImprovementStrategy] = useState<'any' | 'weighted'>('any');
    const [weightedArea, setWeightedArea] = useState(1);
    const [weightedEccentricity, setWeightedEccentricity] = useState(1);
    const [weightedScoreThresholdPercent, setWeightedScoreThresholdPercent] = useState(1);
    const alignmentSettings = useMemo(
        () => ({
            stepSize,
            maxIterationsPerAxis,
            areaThresholdPercent,
            improvementStrategy,
            weightedArea,
            weightedEccentricity,
            weightedScoreThresholdPercent,
            samplesPerMeasurement,
            outlierStrategy,
            outlierThreshold,
            minContourArea,
            adaptiveMethod,
            thresholdType,
            blockSize,
            thresholdConstant,
            enableSmoothing,
            enableMorphology,
            rejectBorderContours,
            rejectLargeContours,
            maxContourAreaRatio,
            enableBackgroundSuppression,
            backgroundBlurKernelSize,
            backgroundGain,
            enableContourMerging,
            contourMergeMaxContours,
            contourMergeDistancePx,
            contourMergeMinAreaRatio,
        }),
        [
            adaptiveMethod,
            areaThresholdPercent,
            backgroundBlurKernelSize,
            backgroundGain,
            blockSize,
            contourMergeDistancePx,
            contourMergeMaxContours,
            contourMergeMinAreaRatio,
            enableBackgroundSuppression,
            enableContourMerging,
            enableMorphology,
            enableSmoothing,
            improvementStrategy,
            maxContourAreaRatio,
            maxIterationsPerAxis,
            minContourArea,
            outlierStrategy,
            outlierThreshold,
            rejectBorderContours,
            rejectLargeContours,
            samplesPerMeasurement,
            stepSize,
            thresholdConstant,
            thresholdType,
            weightedArea,
            weightedEccentricity,
            weightedScoreThresholdPercent,
        ],
    );

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
        alignmentOverlayVisible: false,
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
        detectedBlobCount,
        opencvStatus,
        opencvError,
        detectionReady,
        previewRefs,
        overlayHandlers,
        resetRoi,
        blobsOverlayEnabled,
        setBlobsOverlayEnabled,
    } = cameraPipeline;

    const alignmentController = useAlignmentController({
        gridSize,
        mirrorConfig,
        processedCanvasRef: previewRefs.processedCanvasRef,
        roi,
        detectionReady,
        opencvReady: opencvStatus === 'ready',
        settings: alignmentSettings,
    });

    const shapeOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [previewShapeResult, setPreviewShapeResult] = useState<ShapeAnalysisResult | null>(null);
    const [shapePreviewError, setShapePreviewError] = useState<string | null>(null);
    const isRunning =
        alignmentController.state.phase === 'positioning' ||
        alignmentController.state.phase === 'measuring-baseline' ||
        alignmentController.state.phase === 'converging';
    const displayedShapeResult = previewShapeResult ?? alignmentController.latestShapeResult;

    useEffect(() => {
        if (previewMode !== 'processed' || !detectionReady || opencvStatus !== 'ready') {
            return;
        }

        let cancelled = false;
        let inFlight = false;
        let timeoutId: number | null = null;

        const pollShapePreview = async () => {
            if (cancelled || inFlight) {
                return;
            }
            const canvas = previewRefs.processedCanvasRef.current;
            if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
                timeoutId = window.setTimeout(pollShapePreview, 300);
                return;
            }

            inFlight = true;
            try {
                const client = getOpenCvWorkerClient();
                await client.init();
                const bitmap = await window.createImageBitmap(canvas);
                const result = await client.analyzeShape({
                    frame: bitmap,
                    width: canvas.width,
                    height: canvas.height,
                    roi,
                    adaptiveThreshold: {
                        method: adaptiveMethod,
                        thresholdType,
                        blockSize,
                        C: thresholdConstant,
                    },
                    minContourArea,
                    filtering: {
                        enableSmoothing,
                        enableMorphology,
                        rejectBorderContours,
                        rejectLargeContours,
                        maxContourAreaRatio,
                        enableBackgroundSuppression,
                        backgroundBlurKernelSize,
                        backgroundGain,
                        enableContourMerging,
                        contourMergeMaxContours,
                        contourMergeDistancePx,
                        contourMergeMinAreaRatio,
                    },
                });
                if (!cancelled) {
                    setPreviewShapeResult(result);
                    setShapePreviewError(null);
                }
            } catch (error) {
                if (!cancelled) {
                    setShapePreviewError(error instanceof Error ? error.message : String(error));
                }
            } finally {
                inFlight = false;
                if (!cancelled) {
                    timeoutId = window.setTimeout(pollShapePreview, 300);
                }
            }
        };

        void pollShapePreview();

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [
        adaptiveMethod,
        blockSize,
        backgroundBlurKernelSize,
        backgroundGain,
        contourMergeDistancePx,
        contourMergeMaxContours,
        contourMergeMinAreaRatio,
        detectionReady,
        enableBackgroundSuppression,
        enableContourMerging,
        minContourArea,
        opencvStatus,
        enableMorphology,
        enableSmoothing,
        maxContourAreaRatio,
        previewMode,
        previewRefs.processedCanvasRef,
        rejectBorderContours,
        rejectLargeContours,
        roi,
        thresholdConstant,
        thresholdType,
    ]);

    const handleExportJson = useCallback(() => {
        const payload = alignmentController.exportLastRunJson();
        if (!payload) {
            return;
        }
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `alignment-run-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [alignmentController]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 lg:flex-row">
                <AlignmentControlPanel
                    savedProfiles={savedProfiles}
                    selectedProfileId={selectedProfileId}
                    onSelectProfile={selectProfile}
                    roiEnabled={roi.enabled}
                    roiViewEnabled={roiViewEnabled}
                    onToggleRoiView={toggleRoiView}
                    onResetRoi={resetRoi}
                    adaptiveMethod={adaptiveMethod}
                    onAdaptiveMethodChange={setAdaptiveMethod}
                    thresholdType={thresholdType}
                    onThresholdTypeChange={setThresholdType}
                    blockSize={blockSize}
                    onBlockSizeChange={setBlockSize}
                    thresholdConstant={thresholdConstant}
                    onThresholdConstantChange={setThresholdConstant}
                    minContourArea={minContourArea}
                    onMinContourAreaChange={setMinContourArea}
                    enableSmoothing={enableSmoothing}
                    onEnableSmoothingChange={setEnableSmoothing}
                    enableMorphology={enableMorphology}
                    onEnableMorphologyChange={setEnableMorphology}
                    rejectBorderContours={rejectBorderContours}
                    onRejectBorderContoursChange={setRejectBorderContours}
                    rejectLargeContours={rejectLargeContours}
                    onRejectLargeContoursChange={setRejectLargeContours}
                    maxContourAreaRatio={maxContourAreaRatio}
                    onMaxContourAreaRatioChange={setMaxContourAreaRatio}
                    enableBackgroundSuppression={enableBackgroundSuppression}
                    onEnableBackgroundSuppressionChange={setEnableBackgroundSuppression}
                    backgroundBlurKernelSize={backgroundBlurKernelSize}
                    onBackgroundBlurKernelSizeChange={setBackgroundBlurKernelSize}
                    backgroundGain={backgroundGain}
                    onBackgroundGainChange={setBackgroundGain}
                    enableContourMerging={enableContourMerging}
                    onEnableContourMergingChange={setEnableContourMerging}
                    contourMergeMaxContours={contourMergeMaxContours}
                    onContourMergeMaxContoursChange={setContourMergeMaxContours}
                    contourMergeDistancePx={contourMergeDistancePx}
                    onContourMergeDistancePxChange={setContourMergeDistancePx}
                    contourMergeMinAreaRatio={contourMergeMinAreaRatio}
                    onContourMergeMinAreaRatioChange={setContourMergeMinAreaRatio}
                    samplesPerMeasurement={samplesPerMeasurement}
                    onSamplesPerMeasurementChange={setSamplesPerMeasurement}
                    outlierStrategy={outlierStrategy}
                    onOutlierStrategyChange={setOutlierStrategy}
                    outlierThreshold={outlierThreshold}
                    onOutlierThresholdChange={setOutlierThreshold}
                    stepSize={stepSize}
                    onStepSizeChange={setStepSize}
                    maxIterationsPerAxis={maxIterationsPerAxis}
                    onMaxIterationsPerAxisChange={setMaxIterationsPerAxis}
                    areaThresholdPercent={areaThresholdPercent}
                    onAreaThresholdPercentChange={setAreaThresholdPercent}
                    improvementStrategy={improvementStrategy}
                    onImprovementStrategyChange={setImprovementStrategy}
                    weightedArea={weightedArea}
                    onWeightedAreaChange={setWeightedArea}
                    weightedEccentricity={weightedEccentricity}
                    onWeightedEccentricityChange={setWeightedEccentricity}
                    weightedScoreThresholdPercent={weightedScoreThresholdPercent}
                    onWeightedScoreThresholdPercentChange={setWeightedScoreThresholdPercent}
                    canStart={
                        Boolean(selectedProfileId) &&
                        (alignmentController.state.phase === 'idle' ||
                            alignmentController.state.phase === 'complete')
                    }
                    canStop={isRunning}
                    canPauseActions={alignmentController.state.phase === 'paused'}
                    profileLocked={isRunning}
                    paramsLocked={false}
                    onMoveToCenter={() => {
                        void alignmentController.moveToCenter();
                    }}
                    onStartConvergence={() => {
                        void alignmentController.startConvergence();
                    }}
                    onStop={alignmentController.stop}
                    onRetry={() => {
                        void alignmentController.retryPaused();
                    }}
                    onSkipTile={() => {
                        void alignmentController.skipPausedTile();
                    }}
                    onAbort={alignmentController.abortRun}
                />

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
                        rotationOverlayVisible={false}
                        roiEditingMode={roiEditingMode}
                        opencvStatus={opencvStatus}
                        opencvError={opencvError}
                        videoDimensions={videoDimensions}
                        blobsOverlayEnabled={blobsOverlayEnabled}
                        onToggleBlobsOverlay={() => setBlobsOverlayEnabled(!blobsOverlayEnabled)}
                        alignmentOverlayEnabled={false}
                        alignmentOverlayAvailable={false}
                        onToggleAlignmentOverlay={() => {}}
                        tileBoundsOverlayEnabled={false}
                        tileBoundsOverlayAvailable={false}
                        onToggleTileBoundsOverlay={() => {}}
                        customProcessedOverlayCanvasRef={shapeOverlayCanvasRef}
                        customProcessedOverlayVisible
                    />
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300 md:grid-cols-4">
                        <div>Camera: {cameraStatus}</div>
                        <div>OpenCV: {opencvStatus}</div>
                        <div>FPS: {processedFps}</div>
                        <div>Blobs: {detectedBlobCount}</div>
                        <div>
                            Shape: {displayedShapeResult?.detected ? 'detected' : 'not found'}
                        </div>
                        <div>
                            Area:{' '}
                            {displayedShapeResult?.contour
                                ? Math.round(displayedShapeResult.contour.area)
                                : '—'}
                        </div>
                        <div>
                            Ecc:{' '}
                            {displayedShapeResult?.contour
                                ? displayedShapeResult.contour.eccentricity.toFixed(2)
                                : '—'}
                        </div>
                        {cameraError && (
                            <div className="col-span-2 text-red-300">{cameraError}</div>
                        )}
                        {shapePreviewError && (
                            <div className="col-span-2 text-red-300">{shapePreviewError}</div>
                        )}
                    </div>
                </div>
            </div>

            <AlignmentProgressPanel
                phase={alignmentController.state.phase}
                tileStates={alignmentController.state.tileStates}
                baselineMetrics={alignmentController.state.baselineMetrics}
                currentMetrics={alignmentController.state.currentMetrics}
                pauseState={alignmentController.pauseState}
                lastRun={alignmentController.lastRun}
                onExportJson={handleExportJson}
            />

            <AlignmentShapeOverlay
                canvasRef={shapeOverlayCanvasRef}
                shapeResult={displayedShapeResult}
                visible={previewMode === 'processed'}
                renderCanvas={false}
            />
        </div>
    );
};

export default AlignmentPage;
