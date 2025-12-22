import React, { useCallback, useMemo } from 'react';

import type {
    CameraPipelineOverlayHandlers,
    CameraPreviewRefs,
    PreviewMode,
    RoiEditingMode,
} from '@/hooks/useCameraPipeline';
import { transformRoi } from '@/overlays';
import type { OpenCvWorkerStatus } from '@/services/opencvWorkerClient';
import type { NormalizedRoi } from '@/types';

interface CalibrationPreviewProps {
    previewMode: PreviewMode;
    onPreviewModeChange: (mode: PreviewMode) => void;
    roi: NormalizedRoi;
    roiViewEnabled: boolean;
    onToggleRoiView: () => void;
    onResetRoi: () => void;
    previewRefs: CameraPreviewRefs;
    overlayHandlers: CameraPipelineOverlayHandlers;
    rotationDegrees: number;
    rotationOverlayVisible: boolean;
    roiEditingMode: RoiEditingMode;
    opencvStatus: OpenCvWorkerStatus;
    opencvError: string | null;
    videoDimensions: { width: number; height: number };
    blobsOverlayEnabled: boolean;
    onToggleBlobsOverlay: () => void;
    alignmentOverlayEnabled: boolean;
    alignmentOverlayAvailable: boolean;
    onToggleAlignmentOverlay: () => void;
    tileBoundsOverlayEnabled: boolean;
    tileBoundsOverlayAvailable: boolean;
    onToggleTileBoundsOverlay: () => void;
}

const CalibrationPreview: React.FC<CalibrationPreviewProps> = ({
    previewMode,
    onPreviewModeChange,
    roi,
    roiViewEnabled,
    onToggleRoiView,
    onResetRoi,
    previewRefs,
    overlayHandlers,
    rotationDegrees,
    rotationOverlayVisible,
    roiEditingMode,
    opencvStatus,
    opencvError,
    videoDimensions,
    blobsOverlayEnabled,
    onToggleBlobsOverlay,
    alignmentOverlayEnabled,
    alignmentOverlayAvailable,
    onToggleAlignmentOverlay,
    tileBoundsOverlayEnabled,
    tileBoundsOverlayAvailable,
    onToggleTileBoundsOverlay,
}) => {
    const { width: videoWidth, height: videoHeight } = videoDimensions;
    const rotationRad = (rotationDegrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rotationRad));
    const sin = Math.abs(Math.sin(rotationRad));
    const rotatedWidth = videoWidth * cos + videoHeight * sin;
    const rotatedHeight = videoWidth * sin + videoHeight * cos;

    const videoAspectRatio = useMemo(() => {
        if (videoDimensions.width > 0 && videoDimensions.height > 0) {
            return videoDimensions.width / videoDimensions.height;
        }
        return 1;
    }, [videoDimensions.height, videoDimensions.width]);

    const roiAspectRatio = useMemo(() => {
        if (!roiViewEnabled || !roi.enabled) {
            return null;
        }
        // ROI is relative to the source video dimensions
        if (videoDimensions.width <= 0 || videoDimensions.height <= 0) {
            return null;
        }
        const roiWidthPx = Math.max(1, roi.width * videoDimensions.width);
        const roiHeightPx = Math.max(1, roi.height * videoDimensions.height);
        if (!roiWidthPx || !roiHeightPx) {
            return null;
        }
        return roiWidthPx / roiHeightPx;
    }, [
        roi.enabled,
        roi.height,
        roi.width,
        roiViewEnabled,
        videoDimensions.height,
        videoDimensions.width,
    ]);

    const overlayButtonActive = alignmentOverlayEnabled;

    const showFullFrame = !roiViewEnabled || !roi.enabled;

    const previewAspectRatio = useMemo(() => {
        if (showFullFrame) {
            // When showing full frame, we want to fit the ROTATED video
            if (rotatedWidth > 0 && rotatedHeight > 0) {
                return rotatedWidth / rotatedHeight;
            }
            return 16 / 9;
        }
        return roiAspectRatio ?? videoAspectRatio ?? 16 / 9;
    }, [roiAspectRatio, rotatedHeight, rotatedWidth, showFullFrame, videoAspectRatio]);

    // For the ROI overlay (Screen Space), we need a transform that maps 0-1 (Screen) to Viewport.
    // Since the container has `previewAspectRatio` (Rotated), and we want to draw on it.
    // If `showFullFrame` is true, `previewAspectRatio` matches `rotatedWidth/rotatedHeight`.
    // So Screen Space 0-1 maps directly to Container 0-1.
    // So we don't need `letterboxTransform` for the ROI overlay if it's screen aligned!
    // Wait, `letterboxTransform` handles "fitting" the content.
    // If `previewAspectRatio` matches the content aspect ratio, then transform is Identity.
    // Here `previewAspectRatio` is calculated from `rotatedWidth/rotatedHeight`.
    // So the content (Rotated Video) fits perfectly.
    // So Screen Space 0-1 is exactly the video area.

    const processedVisible =
        showFullFrame && previewMode === 'processed' && opencvStatus === 'ready';
    const rawVisible =
        showFullFrame &&
        (previewMode === 'raw' || (previewMode === 'processed' && opencvStatus !== 'ready'));
    const processedFeedReady = previewMode === 'processed' && opencvStatus === 'ready';
    const workerOverlayActive = previewMode === 'processed' && opencvStatus !== 'ready';
    const workerOverlayMessage =
        opencvStatus === 'error'
            ? (opencvError ?? 'OpenCV initialization failed.')
            : 'Launching OpenCV…';

    const {
        overlayRef,
        videoRef,
        processedCanvasRef,
        detectionOverlayCanvasRef,
        roiCanvasRef,
        roiOverlayCanvasRef,
    } = previewRefs;

    const bindOverlayRef = useCallback(
        (node: HTMLDivElement | null) => {
            overlayRef.current = node;
        },
        [overlayRef],
    );

    const bindVideoRef = useCallback(
        (node: HTMLVideoElement | null) => {
            videoRef.current = node;
        },
        [videoRef],
    );
    const bindProcessedCanvasRef = useCallback(
        (node: HTMLCanvasElement | null) => {
            processedCanvasRef.current = node;
        },
        [processedCanvasRef],
    );
    const bindDetectionOverlayRef = useCallback(
        (node: HTMLCanvasElement | null) => {
            detectionOverlayCanvasRef.current = node;
        },
        [detectionOverlayCanvasRef],
    );
    const bindRoiCanvasRef = useCallback(
        (node: HTMLCanvasElement | null) => {
            roiCanvasRef.current = node;
        },
        [roiCanvasRef],
    );
    const bindRoiOverlayRef = useCallback(
        (node: HTMLCanvasElement | null) => {
            roiOverlayCanvasRef.current = node;
        },
        [roiOverlayCanvasRef],
    );

    return (
        <section className="min-w-0 flex-1 rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* View Mode */}
                <div className="inline-flex rounded-md border border-gray-700 bg-gray-900 text-sm">
                    {(['raw', 'processed'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            className={`px-3 py-1 first:rounded-l-md last:rounded-r-md ${
                                previewMode === mode
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'text-gray-400 hover:bg-gray-800'
                            }`}
                            onClick={() => onPreviewModeChange(mode)}
                        >
                            {mode === 'raw' ? 'Raw' : 'Processed'}
                        </button>
                    ))}
                </div>

                {/* Divider */}
                <div className="hidden h-6 w-px bg-gray-700 sm:block" />

                {/* Overlays */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-wide text-gray-500 uppercase">
                        Overlays
                    </span>
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={onToggleBlobsOverlay}
                            className={`rounded-md border px-2.5 py-1 text-xs transition ${
                                blobsOverlayEnabled
                                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                            }`}
                            aria-pressed={blobsOverlayEnabled}
                            title="Toggle detected blob overlay"
                        >
                            Blobs
                        </button>
                        <button
                            type="button"
                            onClick={onToggleAlignmentOverlay}
                            className={`rounded-md border px-2.5 py-1 text-xs transition ${
                                overlayButtonActive
                                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                            } ${!alignmentOverlayAvailable ? 'cursor-not-allowed opacity-50' : ''}`}
                            title={
                                alignmentOverlayAvailable
                                    ? 'Overlay calibration grid on the processed feed'
                                    : 'Run calibration first to enable this overlay'
                            }
                            aria-pressed={overlayButtonActive}
                            disabled={!alignmentOverlayAvailable}
                        >
                            Calibration
                        </button>
                        <button
                            type="button"
                            onClick={onToggleTileBoundsOverlay}
                            className={`rounded-md border px-2.5 py-1 text-xs transition ${
                                tileBoundsOverlayEnabled
                                    ? 'border-amber-400/70 bg-amber-400/15 text-amber-200'
                                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                            } ${!tileBoundsOverlayAvailable ? 'cursor-not-allowed opacity-50' : ''}`}
                            title="Visualize each tile's inferred reach bounds"
                            aria-pressed={tileBoundsOverlayEnabled}
                            disabled={!tileBoundsOverlayAvailable}
                        >
                            Tile Bounds
                        </button>
                    </div>
                </div>

                {/* Divider */}
                <div className="hidden h-6 w-px bg-gray-700 sm:block" />

                {/* ROI Controls */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-wide text-gray-500 uppercase">ROI</span>
                    <button
                        type="button"
                        onClick={onToggleRoiView}
                        disabled={!roi.enabled}
                        className={`rounded-md border px-2.5 py-1 text-xs ${
                            roiViewEnabled
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                        } ${!roi.enabled ? 'cursor-not-allowed opacity-50' : ''}`}
                        title="Toggle cropped ROI preview"
                        aria-pressed={roiViewEnabled}
                    >
                        ROI View
                    </button>
                    <button
                        type="button"
                        onClick={onResetRoi}
                        className="rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-300"
                    >
                        Reset
                    </button>
                </div>
            </div>
            <div
                className="relative w-full overflow-hidden rounded-lg border border-gray-700 bg-black shadow-inner"
                style={{ aspectRatio: previewAspectRatio, minHeight: '260px', maxHeight: '80vh' }}
            >
                <div
                    ref={bindOverlayRef}
                    className="absolute inset-0"
                    style={{ pointerEvents: showFullFrame ? 'auto' : 'none' }}
                    onPointerDown={overlayHandlers.onPointerDown}
                    onPointerMove={overlayHandlers.onPointerMove}
                    onPointerUp={overlayHandlers.onPointerUp}
                    onPointerLeave={overlayHandlers.onPointerLeave}
                >
                    <div
                        className="absolute origin-center"
                        style={{
                            width: `${(videoWidth / rotatedWidth) * 100}%`,
                            height: `${(videoHeight / rotatedHeight) * 100}%`,
                            left: '50%',
                            top: '50%',
                            transform: `translate(-50%, -50%) rotate(${rotationDegrees}deg)`,
                        }}
                    >
                        <video
                            ref={bindVideoRef}
                            muted
                            playsInline
                            className={`absolute inset-0 size-full object-contain transition-opacity ${
                                rawVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
                            }`}
                        />
                        <canvas
                            ref={bindProcessedCanvasRef}
                            className={`absolute inset-0 size-full object-contain transition-opacity ${
                                processedVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
                            }`}
                        />
                        <canvas
                            ref={bindDetectionOverlayRef}
                            className={`pointer-events-none absolute inset-0 size-full object-contain transition-opacity ${
                                processedFeedReady && showFullFrame ? 'opacity-100' : 'opacity-0'
                            }`}
                        />
                    </div>

                    {/* ROI Canvas and Overlay are OUTSIDE the rotated wrapper, so they are Screen Aligned */}
                    <canvas
                        ref={bindRoiCanvasRef}
                        className={`absolute inset-0 size-full object-contain transition-opacity ${
                            showFullFrame ? 'pointer-events-none opacity-0' : 'opacity-100'
                        }`}
                    />
                    <canvas
                        ref={bindRoiOverlayRef}
                        className={`pointer-events-none absolute inset-0 size-full object-contain transition-opacity ${
                            showFullFrame ? 'opacity-0' : 'opacity-100'
                        }`}
                    />
                    {showFullFrame &&
                        roi.enabled &&
                        (() => {
                            // Transform Source ROI to Screen ROI
                            const screenRoi = transformRoi(roi, rotationDegrees, 'toScreen');

                            // Since we are outside the rotated wrapper, and the container fits the rotated video,
                            // Screen Space (0-1) maps directly to the container.
                            const roiViewport = {
                                x: screenRoi.x,
                                y: screenRoi.y,
                                width: screenRoi.width,
                                height: screenRoi.height,
                            };
                            return (
                                <div
                                    className={`absolute border-2 border-emerald-400 bg-emerald-500/5 transition ${
                                        roiEditingMode !== 'idle' ? 'animate-pulse' : ''
                                    }`}
                                    style={{
                                        left: `${roiViewport.x * 100}%`,
                                        top: `${roiViewport.y * 100}%`,
                                        width: `${roiViewport.width * 100}%`,
                                        height: `${roiViewport.height * 100}%`,
                                    }}
                                    data-roi-handle="move"
                                >
                                    {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                                        <span
                                            key={handle}
                                            data-roi-handle={handle}
                                            className="absolute size-3 -translate-1/2 rounded-full border border-emerald-400 bg-gray-900"
                                            style={{
                                                left:
                                                    handle === 'nw' ||
                                                    handle === 'w' ||
                                                    handle === 'sw'
                                                        ? '0%'
                                                        : handle === 'ne' ||
                                                            handle === 'e' ||
                                                            handle === 'se'
                                                          ? '100%'
                                                          : '50%',
                                                top:
                                                    handle === 'nw' ||
                                                    handle === 'n' ||
                                                    handle === 'ne'
                                                        ? '0%'
                                                        : handle === 'sw' ||
                                                            handle === 's' ||
                                                            handle === 'se'
                                                          ? '100%'
                                                          : '50%',
                                            }}
                                        />
                                    ))}
                                </div>
                            );
                        })()}
                    {rotationOverlayVisible && (
                        <div
                            data-testid="rotation-grid-overlay"
                            className="pointer-events-none absolute inset-0 z-10"
                            style={{
                                backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                                                  linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)`,
                                backgroundSize: '50px 50px',
                            }}
                        />
                    )}
                    {workerOverlayActive && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/85 px-6 text-center">
                            <div className="rounded-xl border border-emerald-400/60 bg-black/60 px-6 py-4 text-2xl font-bold tracking-wide text-white uppercase drop-shadow-[0_0_12px_rgba(16,185,129,0.65)]">
                                {workerOverlayMessage}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {alignmentOverlayEnabled && (
                <p className="mt-3 text-center text-xs text-gray-500">
                    Calibration overlay: teal squares show target footprints, yellow dots mark
                    measured homes.
                </p>
            )}
            {tileBoundsOverlayEnabled && (
                <p className="mt-1 text-center text-xs text-amber-200">
                    Tile bounds overlay: colored boxes outline each tile&rsquo;s inferred reach.
                </p>
            )}
        </section>
    );
};

export default CalibrationPreview;
