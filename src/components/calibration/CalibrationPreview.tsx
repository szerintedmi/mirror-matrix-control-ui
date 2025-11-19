import React, { useCallback, useMemo } from 'react';

import type {
    CameraPipelineOverlayHandlers,
    CameraPreviewRefs,
    PreviewMode,
    RoiEditingMode,
} from '@/hooks/useCameraPipeline';
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

    // Helper to transform ROI between Source Space (0-1 relative to Source W,H) and Screen Space (0-1 relative to Rotated W,H)
    const transformRoi = useCallback(
        (
            inputRoi: { x: number; y: number; width: number; height: number },
            degrees: number,
            direction: 'toScreen' | 'toSource',
        ) => {
            // Normalize degrees to 0, 90, 180, 270
            const normDeg = ((degrees % 360) + 360) % 360;

            if (normDeg === 0) return { ...inputRoi };

            // For 90 degree steps, we can map coordinates.
            // Source (u, v) -> Screen (x, y)
            // 90 CW: x = 1-v-h, y = u. (Wait, let's re-verify)
            // Source TL(0,0) -> Screen TR(1,0).
            // Source BL(0,1) -> Screen TL(0,0).
            // Source TR(1,0) -> Screen BR(1,1).
            // Source BR(1,1) -> Screen BL(0,1).

            // Let's use a geometric approach:
            // Center is 0.5, 0.5.
            // Rotate point around center.
            // If direction is 'toScreen', we rotate by `degrees` CW.
            // If direction is 'toSource', we rotate by `-degrees` (or `360-degrees`) CW.

            const rot = direction === 'toScreen' ? normDeg : (360 - normDeg) % 360;
            const rad = (rot * Math.PI) / 180;
            const c = Math.round(Math.cos(rad)); // 0, 1, -1
            const s = Math.round(Math.sin(rad)); // 0, 1, -1

            // Rotate center of ROI
            const cx = inputRoi.x + inputRoi.width / 2;
            const cy = inputRoi.y + inputRoi.height / 2;

            // Translate to origin (0.5, 0.5)
            const tx = cx - 0.5;
            const ty = cy - 0.5;

            // Rotate
            // x' = x*c - y*s
            // y' = x*s + y*c
            const rx = tx * c - ty * s;
            const ry = tx * s + ty * c;

            // Translate back
            const newCx = rx + 0.5;
            const newCy = ry + 0.5;

            // Rotate dimensions
            // If 90 or 270, swap width/height
            const swap = Math.abs(s) === 1;
            const newW = swap ? inputRoi.height : inputRoi.width;
            const newH = swap ? inputRoi.width : inputRoi.height;

            return {
                x: newCx - newW / 2,
                y: newCy - newH / 2,
                width: newW,
                height: newH,
            };
        },
        [],
    );

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
        <section className="flex-1 min-w-0 rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-md border border-gray-700 bg-gray-900 text-sm">
                    {(['raw', 'processed'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            className={`px-3 py-1 ${
                                previewMode === mode
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'text-gray-400'
                            }`}
                            onClick={() => onPreviewModeChange(mode)}
                        >
                            {mode === 'raw' ? 'Raw view' : 'Processed view'}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={onToggleRoiView}
                    disabled={!roi.enabled}
                    className={`rounded-md border px-3 py-1 text-sm ${
                        roiViewEnabled
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-gray-700 bg-gray-900 text-gray-400'
                    } ${!roi.enabled ? 'opacity-50' : ''}`}
                    title="Toggle cropped ROI preview"
                    aria-pressed={roiViewEnabled}
                >
                    ROI View
                </button>
                <button
                    type="button"
                    onClick={onToggleBlobsOverlay}
                    className={`rounded-md border px-3 py-1 text-sm transition ${
                        blobsOverlayEnabled
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                            : 'border-gray-700 bg-gray-900 text-gray-400'
                    }`}
                    aria-pressed={blobsOverlayEnabled}
                    title="Toggle detected blob overlay"
                >
                    Blobs
                </button>
                <button
                    type="button"
                    onClick={onToggleAlignmentOverlay}
                    className={`rounded-md border px-3 py-1 text-sm transition ${
                        overlayButtonActive
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                            : 'border-gray-700 bg-gray-900 text-gray-400'
                    } ${!alignmentOverlayAvailable ? 'opacity-50' : ''}`}
                    title={
                        alignmentOverlayAvailable
                            ? 'Overlay calibration grid on the processed feed'
                            : 'Toggle on to watch calibration points appear as soon as measurements are captured'
                    }
                    aria-pressed={overlayButtonActive}
                    disabled={!alignmentOverlayAvailable}
                >
                    Calibration View
                </button>
                <button
                    type="button"
                    onClick={onToggleTileBoundsOverlay}
                    className={`rounded-md border px-3 py-1 text-sm transition ${
                        tileBoundsOverlayEnabled
                            ? 'border-amber-400/70 bg-amber-400/15 text-amber-200'
                            : 'border-gray-700 bg-gray-900 text-gray-400'
                    }`}
                    title="Visualize each tile's inferred reach bounds"
                    aria-pressed={tileBoundsOverlayEnabled}
                    disabled={!tileBoundsOverlayAvailable}
                >
                    Per Tile Bounds
                </button>
                <button
                    type="button"
                    onClick={onResetRoi}
                    className="rounded-md border border-gray-700 px-3 py-1 text-sm text-gray-300 hover:border-gray-500"
                >
                    Reset ROI
                </button>
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
                            className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
                                rawVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                        />
                        <canvas
                            ref={bindProcessedCanvasRef}
                            className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
                                processedVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                        />
                        <canvas
                            ref={bindDetectionOverlayRef}
                            className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity ${
                                processedFeedReady && showFullFrame ? 'opacity-100' : 'opacity-0'
                            }`}
                        />
                    </div>

                    {/* ROI Canvas and Overlay are OUTSIDE the rotated wrapper, so they are Screen Aligned */}
                    <canvas
                        ref={bindRoiCanvasRef}
                        className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
                            showFullFrame ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        }`}
                    />
                    <canvas
                        ref={bindRoiOverlayRef}
                        className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity ${
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
                                            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400 bg-gray-900"
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
                            <div className="rounded-xl border border-emerald-400/60 bg-black/60 px-6 py-4 text-2xl font-bold uppercase tracking-wide text-white drop-shadow-[0_0_12px_rgba(16,185,129,0.65)]">
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
