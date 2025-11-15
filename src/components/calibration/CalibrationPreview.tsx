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
}) => {
    const roiAspectRatio = useMemo(() => {
        if (!roiViewEnabled || !roi.enabled) {
            return null;
        }
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

    const overlayButtonActive = alignmentOverlayEnabled && alignmentOverlayAvailable;

    const previewAspectRatio = useMemo(() => {
        if (roiAspectRatio) {
            return roiAspectRatio;
        }
        if (videoDimensions.width > 0 && videoDimensions.height > 0) {
            return videoDimensions.width / videoDimensions.height;
        }
        return 16 / 9;
    }, [roiAspectRatio, videoDimensions.height, videoDimensions.width]);

    const showFullFrame = !roiViewEnabled || !roi.enabled;
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
                    disabled={!alignmentOverlayAvailable}
                    className={`rounded-md border px-3 py-1 text-sm transition ${
                        overlayButtonActive
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                            : 'border-gray-700 bg-gray-900 text-gray-400'
                    } ${!alignmentOverlayAvailable ? 'cursor-not-allowed opacity-50' : ''}`}
                    title={
                        alignmentOverlayAvailable
                            ? 'Overlay calibration grid on the processed feed'
                            : 'Complete a calibration run to unlock the calibration view'
                    }
                    aria-pressed={overlayButtonActive}
                >
                    Calibration View
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
                        className="absolute inset-0 origin-center transition-transform duration-150 ease-out"
                        style={{ transform: `rotate(${rotationDegrees}deg)` }}
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
                                processedFeedReady ? 'opacity-100' : 'opacity-0'
                            }`}
                        />
                    </div>
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
                    {showFullFrame && roi.enabled && (
                        <div
                            className={`absolute border-2 border-emerald-400 bg-emerald-500/5 transition ${
                                roiEditingMode !== 'idle' ? 'animate-pulse' : ''
                            }`}
                            style={{
                                left: `${roi.x * 100}%`,
                                top: `${roi.y * 100}%`,
                                width: `${roi.width * 100}%`,
                                height: `${roi.height * 100}%`,
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
                                            handle === 'nw' || handle === 'w' || handle === 'sw'
                                                ? '0%'
                                                : handle === 'ne' ||
                                                    handle === 'e' ||
                                                    handle === 'se'
                                                  ? '100%'
                                                  : '50%',
                                        top:
                                            handle === 'nw' || handle === 'n' || handle === 'ne'
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
                    )}
                    {rotationOverlayVisible && (
                        <div
                            data-testid="rotation-grid-overlay"
                            className="pointer-events-none absolute inset-0"
                            style={{
                                backgroundImage:
                                    'linear-gradient(#1c9cbf66 1px, transparent 1px), linear-gradient(90deg, #1c9cbf66 1px, transparent 1px)',
                                backgroundSize: '50px 50px',
                                opacity: 0.7,
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
        </section>
    );
};

export default CalibrationPreview;
