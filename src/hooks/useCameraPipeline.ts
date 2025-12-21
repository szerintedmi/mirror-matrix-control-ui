import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_ROI, type ResolutionOption } from '@/constants/calibration';
import {
    type CameraPipelineOverlayHandlers,
    useRoiOverlayInteractions,
    type RoiEditingMode,
} from '@/hooks/useRoiOverlayInteractions';
import {
    useStableBlobMeasurement,
    type BlobSample,
    type BlobSelectionParams,
    type ExpectedBlobPositionInfo,
} from '@/hooks/useStableBlobMeasurement';
import {
    buildAllOverlays,
    createPointRotator,
    renderOverlays,
    type OverlayProjection,
} from '@/overlays';
import type { CalibrationRunSummary, CaptureBlobMeasurement } from '@/services/calibration/types';
import type {
    BlobDetectorParams,
    DetectedBlob,
    OpenCvReadyMessage,
    OpenCvWorkerClient,
    OpenCvWorkerStatus,
} from '@/services/opencvWorkerClient';
import { getOpenCvWorkerClient } from '@/services/openCvWorkerSingleton';
import type { CalibrationProfileBounds, NormalizedRoi } from '@/types';
import { buildLetterboxTransform } from '@/utils/letterbox';

import type React from 'react';

export interface TileBoundsOverlayEntry {
    key: string;
    row: number;
    col: number;
    bounds: CalibrationProfileBounds;
}

export interface OverlayCameraOriginOffset {
    x: number;
    y: number;
}

export interface TileBoundsOverlayPayload {
    entries: TileBoundsOverlayEntry[];
    cameraOriginOffset: OverlayCameraOriginOffset;
}

export type {
    CameraPipelineOverlayHandlers,
    RoiEditingMode,
} from '@/hooks/useRoiOverlayInteractions';

export type CameraStatus = 'idle' | 'loading' | 'ready' | 'error';
export type PreviewMode = 'raw' | 'processed';

interface UseCameraPipelineParams {
    detectionSettingsLoaded: boolean;
    selectedDeviceId: string;
    resolvedResolution: ResolutionOption;
    brightness: number;
    contrast: number;
    rotationDegrees: number;
    claheClipLimit: number;
    claheTileGridSize: number;
    roi: NormalizedRoi;
    setRoi: (next: NormalizedRoi | ((prev: NormalizedRoi) => NormalizedRoi)) => void;
    blobParams: BlobDetectorParams;
    useWasmDetector: boolean;
    onNativeDetectorAvailability: (hasNativeDetector: boolean) => void;
    onVideoDimensionsChange?: (dimensions: { width: number | null; height: number | null }) => void;
    alignmentOverlayVisible?: boolean;
}

// CameraPipelineOverlayHandlers type re-exported above

export interface CameraPreviewRefs {
    overlayRef: React.MutableRefObject<HTMLDivElement | null>;
    videoRef: React.MutableRefObject<HTMLVideoElement | null>;
    processedCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    detectionOverlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    roiCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    roiOverlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

export interface CameraPipelineController {
    previewMode: PreviewMode;
    setPreviewMode: (mode: PreviewMode) => void;
    roiViewEnabled: boolean;
    toggleRoiView: () => void;
    roiEditingMode: RoiEditingMode;
    processedFps: number;
    cameraStatus: CameraStatus;
    cameraError: string | null;
    videoDimensions: { width: number; height: number };
    devices: MediaDeviceInfo[];
    detectedBlobCount: number;
    opencvStatus: OpenCvWorkerStatus;
    opencvError: string | null;
    opencvInfo: OpenCvReadyMessage | null;
    detectionReady: boolean;
    captureBlobMeasurement: CaptureBlobMeasurement;
    previewRefs: CameraPreviewRefs;
    overlayHandlers: CameraPipelineOverlayHandlers;
    resetRoi: () => void;
    nativeBlobDetectorAvailable: boolean;
    setAlignmentOverlaySummary: (summary: CalibrationRunSummary | null) => void;
    setTileBoundsOverlayEntries: (payload: TileBoundsOverlayPayload | null) => void;
    blobsOverlayEnabled: boolean;
    setBlobsOverlayEnabled: (enabled: boolean) => void;
    /** Set the expected blob position and tolerance for debug overlay (centered coords -1 to 1, or null to hide) */
    setExpectedBlobPosition: (info: ExpectedBlobPositionInfo | null) => void;
}

export const useCameraPipeline = ({
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
    onNativeDetectorAvailability,
    onVideoDimensionsChange,
    alignmentOverlayVisible = false,
}: UseCameraPipelineParams): CameraPipelineController => {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [previewMode, setPreviewMode] = useState<PreviewMode>('processed');
    const [roiViewEnabled, setRoiViewEnabled] = useState(false);
    const [processedFps, setProcessedFps] = useState(0);
    const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

    const [detectedBlobCount, setDetectedBlobCount] = useState(0);
    const [opencvStatus, setOpenCvStatus] = useState<OpenCvWorkerStatus>('idle');
    const [opencvError, setOpenCvError] = useState<string | null>(null);
    const [opencvInfo, setOpenCvInfo] = useState<OpenCvReadyMessage | null>(null);
    const [blobsOverlayEnabled, setBlobsOverlayEnabled] = useState(true);

    const nativeBlobDetectorStatus = opencvInfo?.capabilities?.hasNativeBlobDetector;
    const nativeBlobDetectorAvailable = nativeBlobDetectorStatus === true;

    const workerClientRef = useRef<OpenCvWorkerClient | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const processedCanvasRef = useRef<HTMLCanvasElement>(null);
    const roiCanvasRef = useRef<HTMLCanvasElement>(null);
    const roiOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const detectionOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayBitmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const rotatedOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const roiRef = useRef<NormalizedRoi>(roi);
    const lastReportedVideoDimensionsRef = useRef({ width: 0, height: 0 });
    const detectionResultsRef = useRef<DetectedBlob[]>([]);
    const processedFrameMetaRef = useRef<{
        sourceWidth: number;
        sourceHeight: number;
        roi: NormalizedRoi | null;
    } | null>(null);
    const detectionSequenceRef = useRef(0);
    const detectionUpdatedAtRef = useRef(0);
    const alignmentOverlaySummaryRef = useRef<CalibrationRunSummary | null>(null);
    const alignmentOverlayVisibleRef = useRef<boolean>(Boolean(alignmentOverlayVisible));
    const blobsOverlayVisibleRef = useRef<boolean>(true);
    const tileBoundsOverlayRef = useRef<TileBoundsOverlayPayload | null>(null);
    /** Expected blob position info for debug overlay (centered coords -1 to 1), or null if not set */
    const expectedBlobPositionRef = useRef<ExpectedBlobPositionInfo | null>(null);

    const reportVideoDimensions = useCallback(
        (width: number, height: number) => {
            setVideoDimensions({ width, height });
            if (onVideoDimensionsChange) {
                onVideoDimensionsChange({
                    width: width > 0 ? width : null,
                    height: height > 0 ? height : null,
                });
            }
        },
        [onVideoDimensionsChange],
    );

    const workerSupported = useMemo(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return typeof Worker !== 'undefined' && typeof window.createImageBitmap === 'function';
    }, []);

    const toggleRoiView = useCallback(() => {
        setRoiViewEnabled((prev) => !prev);
    }, []);

    const resetRoi = useCallback(() => {
        setRoi(DEFAULT_ROI);
    }, [setRoi]);

    useEffect(() => {
        alignmentOverlayVisibleRef.current = Boolean(alignmentOverlayVisible);
    }, [alignmentOverlayVisible]);

    const setAlignmentOverlaySummary = useCallback((summary: CalibrationRunSummary | null) => {
        alignmentOverlaySummaryRef.current = summary;
    }, []);

    const setTileBoundsOverlayEntries = useCallback((payload: TileBoundsOverlayPayload | null) => {
        tileBoundsOverlayRef.current = payload;
    }, []);

    const setExpectedBlobPosition = useCallback((info: ExpectedBlobPositionInfo | null) => {
        console.log('[CameraPipeline] setExpectedBlobPosition:', info);
        expectedBlobPositionRef.current = info;
    }, []);

    useEffect(() => {
        blobsOverlayVisibleRef.current = blobsOverlayEnabled;
    }, [blobsOverlayEnabled]);

    const readBestBlobMeasurement = useCallback(
        (params?: BlobSelectionParams): BlobSample | null => {
            const meta = processedFrameMetaRef.current;
            const blobs = detectionResultsRef.current;
            if (!meta || !meta.sourceWidth || !meta.sourceHeight || blobs.length === 0) {
                return null;
            }
            const normalized = blobs.map((blob) => {
                // Use viewport-normalized coordinates (0-1) to avoid isotropic→centered
                // aspect squeeze that distorted tile height.
                const normalizedX = blob.x / meta.sourceWidth;
                const normalizedY = blob.y / meta.sourceHeight;

                // Normalize blob size against the full-frame max dimension so sizes stay
                // consistent with the centered coordinate space used for pitch/blueprint math.
                const sizeNormalizationDim = Math.max(meta.sourceWidth, meta.sourceHeight);
                const normalizedSize = blob.size / sizeNormalizationDim;

                console.log(
                    '[BlobNorm]',
                    meta.roi ? 'ROI' : 'Full-frame',
                    'normalization:',
                    meta.sourceWidth,
                    'x',
                    meta.sourceHeight,
                    meta.roi
                        ? `(ROI: ${Math.round(meta.roi.width * meta.sourceWidth)}x${Math.round(meta.roi.height * meta.sourceHeight)})`
                        : '',
                    'blob.size=',
                    blob.size,
                    '→',
                    normalizedSize.toFixed(3),
                );

                return {
                    blob,
                    normalizedX,
                    normalizedY,
                    normalizedSize: Math.max(0, normalizedSize),
                };
            });

            let bestEntry: (typeof normalized)[number] | null = null;

            if (params?.expectedPosition) {
                // Distance-based selection: find blob closest to expected position
                const { expectedPosition, maxDistance } = params;

                let bestDistance = Infinity;

                for (const candidate of normalized) {
                    const dx = candidate.normalizedX - expectedPosition.x;
                    const dy = candidate.normalizedY - expectedPosition.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestEntry = candidate;
                    }
                }

                // Reject if closest blob exceeds max distance threshold
                if (maxDistance !== undefined && bestDistance > maxDistance) {
                    return null;
                }
            } else {
                // Legacy behavior: select rightmost blob by X coordinate
                const EPS = 1e-4;
                bestEntry = normalized.reduce<(typeof normalized)[number] | null>(
                    (top, candidate) => {
                        if (!top) {
                            return candidate;
                        }
                        if (candidate.normalizedX > top.normalizedX + EPS) {
                            return candidate;
                        }
                        if (Math.abs(candidate.normalizedX - top.normalizedX) <= EPS) {
                            return candidate.blob.response > top.blob.response ? candidate : top;
                        }
                        return top;
                    },
                    null,
                );
            }

            if (!bestEntry) {
                return null;
            }

            // Include ROI dimensions for debug logging
            const roiWidth = meta.roi ? meta.roi.width * meta.sourceWidth : undefined;
            const roiHeight = meta.roi ? meta.roi.height * meta.sourceHeight : undefined;

            return {
                x: bestEntry.normalizedX,
                y: bestEntry.normalizedY,
                size: bestEntry.normalizedSize,
                response: bestEntry.blob.response,
                capturedAt: detectionUpdatedAtRef.current || performance.now(),
                sourceWidth: meta.sourceWidth,
                sourceHeight: meta.sourceHeight,
                roiWidth,
                roiHeight,
            };
        },
        [],
    );

    const captureBlobMeasurement = useStableBlobMeasurement({
        readSample: readBestBlobMeasurement,
        detectionSequenceRef,
        onExpectedPositionChange: setExpectedBlobPosition,
    });

    useEffect(() => {
        roiRef.current = roi;
    }, [roi]);

    const { roiEditingMode, overlayHandlers, overlayRef } = useRoiOverlayInteractions({
        roi,
        setRoi,
        roiViewEnabled,
        setRoiViewEnabled: toggleRoiView,
        roiRef,
        rotationDegrees,
    });
    const stopCurrentStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    const startStream = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
            setCameraStatus('error');
            setCameraError('Browser does not support camera access.');
            return;
        }
        setCameraStatus('loading');
        setCameraError(null);
        try {
            const constraints = {
                audio: false,
                video: {
                    deviceId:
                        selectedDeviceId !== 'default' ? { exact: selectedDeviceId } : undefined,
                    width: resolvedResolution.width,
                    height: resolvedResolution.height,
                },
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            stopCurrentStream();
            streamRef.current = stream;
            const video = videoRef.current;
            if (video) {
                video.srcObject = stream;
                try {
                    await video.play();
                } catch (playError) {
                    console.warn('Video playback was blocked until user interaction', playError);
                }
            }
            setCameraStatus('ready');
        } catch (error) {
            console.error('Failed to start camera', error);
            setCameraStatus('error');
            setCameraError('Unable to access the selected camera. Please check permissions.');
            stopCurrentStream();
        }
    }, [resolvedResolution.height, resolvedResolution.width, selectedDeviceId, stopCurrentStream]);

    useEffect(() => {
        const syncDevices = async () => {
            if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
                setCameraStatus('error');
                setCameraError('Media devices API is unavailable in this environment.');
                return;
            }
            try {
                const mediaDevices = await navigator.mediaDevices.enumerateDevices();
                setDevices(mediaDevices.filter((device) => device.kind === 'videoinput'));
            } catch (error) {
                console.error('Failed to enumerate devices', error);
            }
        };

        syncDevices();
        if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', syncDevices);
            return () => {
                navigator.mediaDevices.removeEventListener('devicechange', syncDevices);
            };
        }
        return () => {};
    }, []);

    useEffect(() => {
        if (!detectionSettingsLoaded) {
            return undefined;
        }
        let cancelled = false;
        const trigger = () => {
            if (!cancelled) {
                void startStream();
            }
        };
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(trigger);
        } else {
            trigger();
        }
        return () => {
            cancelled = true;
            stopCurrentStream();
        };
    }, [detectionSettingsLoaded, startStream, stopCurrentStream]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }
        const handleMetadata = () => {
            if (video.videoWidth && video.videoHeight) {
                reportVideoDimensions(video.videoWidth, video.videoHeight);
            }
        };
        video.addEventListener('loadedmetadata', handleMetadata);
        return () => {
            video.removeEventListener('loadedmetadata', handleMetadata);
        };
    }, [reportVideoDimensions]);

    useEffect(() => {
        if (!workerSupported) {
            setOpenCvStatus('error');
            setOpenCvError('OpenCV worker is not supported in this browser.');
            return;
        }
        let cancelled = false;
        try {
            const client = getOpenCvWorkerClient();
            workerClientRef.current = client;
            const initialStatus = client.getStatus();
            setOpenCvStatus(initialStatus);
            if (initialStatus === 'ready') {
                const payload = client.getReadyPayload();
                if (payload) {
                    setOpenCvInfo(payload);
                }
                setOpenCvError(null);
            }
            const unsubscribe = client.onStatus((status, payload) => {
                if (cancelled) {
                    return;
                }
                setOpenCvStatus(status);
                if (status === 'ready' && payload && typeof payload === 'object') {
                    setOpenCvInfo(payload as OpenCvReadyMessage);
                    setOpenCvError(null);
                }
                if (status === 'error') {
                    const message = typeof payload === 'string' ? payload : 'OpenCV worker failed';
                    setOpenCvError(message);
                }
            });
            client
                .init()
                .then((payload) => {
                    if (!cancelled) {
                        setOpenCvStatus('ready');
                        setOpenCvInfo(payload);
                        setOpenCvError(null);
                    }
                })
                .catch((error) => {
                    if (!cancelled) {
                        setOpenCvStatus('error');
                        setOpenCvError(error instanceof Error ? error.message : String(error));
                    }
                });
            return () => {
                cancelled = true;
                unsubscribe();
            };
        } catch (error) {
            setOpenCvStatus('error');
            setOpenCvError(
                error instanceof Error ? error.message : 'Unable to start OpenCV worker',
            );
        }
    }, [workerSupported]);

    const renderDetectionOverlay = useCallback(
        (
            canvas: HTMLCanvasElement,
            width: number,
            height: number,
            options?: {
                displayRectOverride?: { x: number; y: number; width: number; height: number };
                rotation?: { radians: number; originX: number; originY: number } | null;
                calibrationOverlayCounterRotationRadians?: number;
            },
        ) => {
            const meta = processedFrameMetaRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!meta) {
                return;
            }
            const captureWidth = meta.sourceWidth || width;
            const captureHeight = meta.sourceHeight || height;

            // Determine content region (full frame or ROI crop)
            const baseRect = options?.displayRectOverride ?? {
                x: 0,
                y: 0,
                width: captureWidth,
                height: captureHeight,
            };
            if (!baseRect.width || !baseRect.height || !width || !height) {
                return;
            }

            // Check if any overlays are active
            const summary = alignmentOverlaySummaryRef.current;
            const blobEntries = detectionResultsRef.current;
            const tileBoundsPayload = tileBoundsOverlayRef.current;
            const expectedInfo = expectedBlobPositionRef.current;
            const counterRotationRadians = options?.calibrationOverlayCounterRotationRadians ?? 0;

            const hasBlobsOverlay = blobsOverlayVisibleRef.current && blobEntries.length > 0;
            const hasAlignmentOverlay =
                alignmentOverlayVisibleRef.current && summary?.gridBlueprint;
            const hasTileBoundsOverlay = Boolean(tileBoundsPayload?.entries.length);
            const hasExpectedPosition = Boolean(expectedInfo);

            if (
                !hasBlobsOverlay &&
                !hasAlignmentOverlay &&
                !hasTileBoundsOverlay &&
                !hasExpectedPosition
            ) {
                return;
            }

            // Build letterbox transform based on content aspect ratio
            const viewportAspect = width / height;
            const contentAspect = baseRect.width / baseRect.height;
            const letterbox = buildLetterboxTransform(contentAspect || 1, viewportAspect || 1);

            // Build crop rect in normalized coords if displaying ROI
            const isFullFrame =
                baseRect.x === 0 &&
                baseRect.y === 0 &&
                baseRect.width === captureWidth &&
                baseRect.height === captureHeight;
            const cropRect = isFullFrame
                ? undefined
                : {
                      x: baseRect.x / captureWidth,
                      y: baseRect.y / captureHeight,
                      width: baseRect.width / captureWidth,
                      height: baseRect.height / captureHeight,
                  };

            // Build projection for overlay renderer
            // Note: Rotation is handled separately via counter-rotation for labels
            // and rotatePoint functions for coordinates
            const projection: OverlayProjection = {
                canvasSize: { width, height },
                captureSize: { width: captureWidth, height: captureHeight },
                letterbox: {
                    scaleX: letterbox.scaleX,
                    scaleY: letterbox.scaleY,
                    offsetX: letterbox.offsetX * width,
                    offsetY: letterbox.offsetY * height,
                },
                cropRect,
            };

            // Create point rotator for blobs if rotation option is provided
            // Note: This is for blob pixel coordinates, not centered coords
            const blobRotatePoint = options?.rotation
                ? (point: { x: number; y: number }) => {
                      const { radians, originX, originY } = options.rotation!;
                      if (Math.abs(radians) < 1e-6) return point;
                      const tx = point.x - originX;
                      const ty = point.y - originY;
                      const cos = Math.cos(radians);
                      const sin = Math.sin(radians);
                      return {
                          x: tx * cos - ty * sin + originX,
                          y: tx * sin + ty * cos + originY,
                      };
                  }
                : undefined;

            // Create point rotator for alignment grid measurements (centered coords)
            const centeredRotatePoint = createPointRotator(
                options?.rotation ? (options.rotation.radians * 180) / Math.PI : 0,
            );

            // Build all overlays
            const overlays = buildAllOverlays({
                blobs: hasBlobsOverlay
                    ? {
                          blobs: blobEntries,
                          sourceWidth: captureWidth,
                          sourceHeight: captureHeight,
                          rotatePoint: blobRotatePoint,
                      }
                    : undefined,
                expectedPosition: hasExpectedPosition ? { info: expectedInfo! } : undefined,
                alignmentGrid: hasAlignmentOverlay
                    ? {
                          summary: summary!,
                          rotatePoint: centeredRotatePoint,
                      }
                    : undefined,
                tileBounds: hasTileBoundsOverlay
                    ? {
                          entries: tileBoundsPayload!.entries,
                          cameraOriginOffset: tileBoundsPayload!.cameraOriginOffset,
                      }
                    : undefined,
            });

            // Render all overlays
            renderOverlays(ctx, overlays, projection, {
                counterRotationRadians,
            });
        },
        [],
    );

    const drawOverlayBitmap = useCallback(
        (width: number, height: number): HTMLCanvasElement | null => {
            if (!width || !height) {
                return null;
            }
            if (typeof document === 'undefined') {
                return null;
            }
            let canvas = overlayBitmapCanvasRef.current;
            if (!canvas) {
                canvas = document.createElement('canvas');
                overlayBitmapCanvasRef.current = canvas;
            }
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            renderDetectionOverlay(canvas, width, height);
            return canvas;
        },
        [renderDetectionOverlay],
    );

    useEffect(() => {
        if (!workerSupported || opencvStatus !== 'ready') {
            if (previewMode === 'processed') {
                setProcessedFps(0);
            }
            return;
        }
        const client = workerClientRef.current;
        if (!client) {
            return;
        }
        let cancelled = false;
        let animationFrameId = 0;
        let pending = false;
        let frames = 0;
        let windowStart = performance.now();

        const loop = () => {
            if (cancelled) {
                return;
            }
            const video = videoRef.current;
            const processedCanvas = processedCanvasRef.current;
            if (!video || !processedCanvas) {
                animationFrameId = requestAnimationFrame(loop);
                return;
            }
            if (video.readyState < 2 || previewMode !== 'processed') {
                animationFrameId = requestAnimationFrame(loop);
                return;
            }
            if (!video.videoWidth || !video.videoHeight) {
                animationFrameId = requestAnimationFrame(loop);
                return;
            }
            if (pending) {
                animationFrameId = requestAnimationFrame(loop);
                return;
            }
            pending = true;
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (
                width > 0 &&
                height > 0 &&
                (width !== lastReportedVideoDimensionsRef.current.width ||
                    height !== lastReportedVideoDimensionsRef.current.height)
            ) {
                lastReportedVideoDimensionsRef.current = { width, height };
                reportVideoDimensions(width, height);
            }
            const roiSnapshot = roiRef.current;

            void (async () => {
                try {
                    const bitmap = await window.createImageBitmap(video);
                    const result = await client.processFrame({
                        frame: bitmap,
                        width,
                        height,
                        brightness,
                        contrast,
                        roi: roiSnapshot,
                        claheClipLimit,
                        claheTileGridSize,
                        blobParams,
                        runDetection: true,
                        preferFallbackDetector: !useWasmDetector || !nativeBlobDetectorAvailable,
                        rotation: rotationDegrees,
                    });
                    if (cancelled) {
                        result.frame.close();
                        return;
                    }
                    const canvas = processedCanvasRef.current;
                    const ctx = canvas?.getContext('2d');
                    if (canvas && ctx) {
                        if (canvas.width !== result.width || canvas.height !== result.height) {
                            canvas.width = result.width;
                            canvas.height = result.height;
                        }
                        ctx.clearRect(0, 0, result.width, result.height);
                        ctx.drawImage(result.frame, 0, 0, result.width, result.height);
                    }
                    detectionResultsRef.current = result.keypoints ?? [];
                    processedFrameMetaRef.current = {
                        sourceWidth: result.sourceWidth ?? width,
                        sourceHeight: result.sourceHeight ?? height,
                        roi: roiSnapshot.enabled ? roiSnapshot : null,
                    };
                    detectionSequenceRef.current += 1;
                    detectionUpdatedAtRef.current = performance.now();
                    setDetectedBlobCount(detectionResultsRef.current.length);
                    result.frame.close();
                    frames += 1;
                    const now = performance.now();
                    if (now - windowStart >= 1000) {
                        setProcessedFps(Math.round((frames / (now - windowStart)) * 1000));
                        frames = 0;
                        windowStart = now;
                    }
                } catch (error) {
                    if (!cancelled) {
                        console.error('OpenCV worker frame failed', error);
                        setOpenCvStatus('error');
                        setOpenCvError(
                            error instanceof Error ? error.message : 'Worker frame failed',
                        );
                    }
                } finally {
                    pending = false;
                }
            })();

            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);
        return () => {
            cancelled = true;
            cancelAnimationFrame(animationFrameId);
            setProcessedFps(0);
        };
    }, [
        blobParams,
        brightness,
        claheClipLimit,
        claheTileGridSize,
        contrast,
        nativeBlobDetectorAvailable,
        opencvStatus,
        previewMode,
        reportVideoDimensions,
        rotationDegrees,
        useWasmDetector,
        workerSupported,
    ]);

    useEffect(() => {
        let animationFrameId: number;

        const render = () => {
            const video = videoRef.current;
            const processedCanvas = processedCanvasRef.current;
            if (!video) {
                animationFrameId = requestAnimationFrame(render);
                return;
            }
            const processedSourceAvailable =
                previewMode === 'processed' &&
                processedCanvas &&
                processedCanvas.width > 0 &&
                processedCanvas.height > 0;
            if (video.readyState < 2 && !processedSourceAvailable) {
                animationFrameId = requestAnimationFrame(render);
                return;
            }
            const baseWidth = processedSourceAvailable
                ? processedCanvas!.width
                : video.videoWidth || processedCanvas?.width || 0;
            const baseHeight = processedSourceAvailable
                ? processedCanvas!.height
                : video.videoHeight || processedCanvas?.height || 0;
            if (!baseWidth || !baseHeight) {
                animationFrameId = requestAnimationFrame(render);
                return;
            }

            const zoomCanvas = roiCanvasRef.current;
            const currentRoi = roiRef.current;
            const showFullFrame = !roiViewEnabled || !currentRoi.enabled;
            const overlayCanvas = detectionOverlayCanvasRef.current;
            const roiOverlayCanvas = roiOverlayCanvasRef.current;
            const rotatedOverlayCanvas = rotatedOverlayCanvasRef.current;

            const calibrationOverlayCounterRotationRadians =
                rotationDegrees === 0 ? 0 : (rotationDegrees * Math.PI) / 180;

            // Optimization: If we are in ROI view (not showing full frame) and there is no rotation,
            // we can render the detection overlay directly to the ROI canvas.
            // This avoids rendering the full frame overlay (which is hidden) and then copying/cropping it.
            const canOptimizeRoiRender =
                !showFullFrame &&
                rotationDegrees === 0 &&
                previewMode === 'processed' &&
                opencvStatus === 'ready';

            let rotatedCanvas = rotatedCanvasRef.current;
            if (!rotatedCanvas && typeof document !== 'undefined') {
                rotatedCanvas = document.createElement('canvas');
                rotatedCanvasRef.current = rotatedCanvas;
            }
            let rotatedCtx: CanvasRenderingContext2D | null = null;
            if (rotatedCanvas) {
                if (rotatedCanvas.width !== baseWidth || rotatedCanvas.height !== baseHeight) {
                    rotatedCanvas.width = baseWidth;
                    rotatedCanvas.height = baseHeight;
                }
                rotatedCtx = rotatedCanvas.getContext('2d');
                if (rotatedCtx) {
                    rotatedCtx.save();
                    rotatedCtx.clearRect(0, 0, baseWidth, baseHeight);
                    rotatedCtx.translate(baseWidth / 2, baseHeight / 2);
                    // Rotate (match CSS rotation direction)
                    // CSS rotate(Ndeg) rotates CW. Canvas rotate(rad) rotates CW.
                    // We want to rotate the crop so it appears "upright" as per the user's view rotation.
                    // Since the image is rotated CW by 'rotationDegrees', we need to rotate CCW by the same amount to rectify it.
                    const rad = (rotationDegrees * Math.PI) / 180;
                    rotatedCtx.rotate(-rad);
                    rotatedCtx.translate(-baseWidth / 2, -baseHeight / 2);
                    const sourceForRotation =
                        processedSourceAvailable && processedCanvas ? processedCanvas : video;
                    if (sourceForRotation) {
                        rotatedCtx.drawImage(sourceForRotation, 0, 0, baseWidth, baseHeight);
                    }
                    rotatedCtx.restore();
                }
            }

            let roiPixels: { width: number; height: number } | null = null;
            if (!showFullFrame && currentRoi.enabled) {
                roiPixels = {
                    width: Math.max(1, Math.round(currentRoi.width * baseWidth)),
                    height: Math.max(1, Math.round(currentRoi.height * baseHeight)),
                };
            }

            if (overlayCanvas) {
                const overlayCtx = overlayCanvas.getContext('2d');
                // Only render full frame overlay if:
                // 1. We are in processed mode AND ready
                // 2. AND we are NOT in the optimized path (where we skip full frame render)
                //    The optimized path implies !showFullFrame, so if showFullFrame is true, we render here.
                //    If rotation is non-zero, we also render here (to support rotation copy).
                if (
                    previewMode === 'processed' &&
                    opencvStatus === 'ready' &&
                    !canOptimizeRoiRender
                ) {
                    if (overlayCanvas.width !== baseWidth || overlayCanvas.height !== baseHeight) {
                        overlayCanvas.width = baseWidth;
                        overlayCanvas.height = baseHeight;
                    }
                    renderDetectionOverlay(overlayCanvas, baseWidth, baseHeight, {
                        calibrationOverlayCounterRotationRadians,
                    });
                } else {
                    overlayCtx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                }
            }

            if (rotationDegrees !== 0) {
                let rotatedOverlay = rotatedOverlayCanvas;
                if (!rotatedOverlay && typeof document !== 'undefined') {
                    rotatedOverlay = document.createElement('canvas');
                    rotatedOverlayCanvasRef.current = rotatedOverlay;
                }
                if (rotatedOverlay && overlayCanvas) {
                    if (
                        rotatedOverlay.width !== baseWidth ||
                        rotatedOverlay.height !== baseHeight
                    ) {
                        rotatedOverlay.width = baseWidth;
                        rotatedOverlay.height = baseHeight;
                    }
                    const rotatedOverlayCtx = rotatedOverlay.getContext('2d');
                    if (rotatedOverlayCtx) {
                        rotatedOverlayCtx.save();
                        rotatedOverlayCtx.clearRect(0, 0, baseWidth, baseHeight);
                        rotatedOverlayCtx.translate(baseWidth / 2, baseHeight / 2);
                        rotatedOverlayCtx.rotate((rotationDegrees * Math.PI) / 180);
                        rotatedOverlayCtx.translate(-baseWidth / 2, -baseHeight / 2);
                        rotatedOverlayCtx.drawImage(overlayCanvas, 0, 0, baseWidth, baseHeight);
                        rotatedOverlayCtx.restore();
                    }
                }
            } else if (rotatedOverlayCanvasRef.current) {
                const rotatedOverlayCtx = rotatedOverlayCanvasRef.current.getContext('2d');
                rotatedOverlayCtx?.clearRect(
                    0,
                    0,
                    rotatedOverlayCanvasRef.current.width,
                    rotatedOverlayCanvasRef.current.height,
                );
            }

            if (zoomCanvas && currentRoi.enabled) {
                const roiSize = roiPixels ?? {
                    width: baseWidth,
                    height: baseHeight,
                };
                const targetWidth = showFullFrame ? baseWidth : roiSize.width;
                const targetHeight = showFullFrame ? baseHeight : roiSize.height;
                if (zoomCanvas.width !== targetWidth || zoomCanvas.height !== targetHeight) {
                    zoomCanvas.width = targetWidth;
                    zoomCanvas.height = targetHeight;
                }
                const zoomCtx = zoomCanvas.getContext('2d');
                if (zoomCtx) {
                    zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
                    const roiSource =
                        rotatedCtx && rotatedCanvas
                            ? rotatedCanvas
                            : processedSourceAvailable && processedCanvas
                              ? processedCanvas
                              : video;
                    if (roiSource) {
                        const sx = currentRoi.x * baseWidth;
                        const sy = currentRoi.y * baseHeight;
                        const sWidth = Math.max(1, currentRoi.width * baseWidth);
                        const sHeight = Math.max(1, currentRoi.height * baseHeight);
                        zoomCtx.drawImage(
                            roiSource,
                            sx,
                            sy,
                            sWidth,
                            sHeight,
                            showFullFrame ? sx : 0,
                            showFullFrame ? sy : 0,
                            targetWidth,
                            targetHeight,
                        );
                    }
                }
            } else if (zoomCanvas) {
                zoomCanvas.getContext('2d')?.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
            }

            if (roiOverlayCanvas) {
                const roiOverlayCtx = roiOverlayCanvas.getContext('2d');
                const roiSize = roiPixels ?? {
                    width: baseWidth,
                    height: baseHeight,
                };
                const targetWidth = roiSize.width;
                const targetHeight = roiSize.height;

                if (
                    roiOverlayCanvas.width !== targetWidth ||
                    roiOverlayCanvas.height !== targetHeight
                ) {
                    roiOverlayCanvas.width = targetWidth;
                    roiOverlayCanvas.height = targetHeight;
                }

                if (roiOverlayCtx) {
                    roiOverlayCtx.clearRect(0, 0, targetWidth, targetHeight);
                }

                if (canOptimizeRoiRender && blobsOverlayEnabled) {
                    // Optimized path: Render directly to ROI canvas
                    const displayRectOverride = {
                        x: currentRoi.x * baseWidth,
                        y: currentRoi.y * baseHeight,
                        width: currentRoi.width * baseWidth,
                        height: currentRoi.height * baseHeight,
                    };
                    renderDetectionOverlay(roiOverlayCanvas, targetWidth, targetHeight, {
                        displayRectOverride,
                        // Rotation is handled by the worker/image transformation, so the overlay should not apply additional rotation.
                        rotation: null,
                        calibrationOverlayCounterRotationRadians: 0,
                    });
                } else {
                    // Standard path: Copy from full frame (or rotated) overlay
                    const overlaySourceForRoi =
                        rotationDegrees !== 0 && rotatedOverlayCanvasRef.current
                            ? rotatedOverlayCanvasRef.current
                            : overlayCanvas;
                    const shouldRenderOverlay =
                        overlaySourceForRoi &&
                        !showFullFrame &&
                        currentRoi.enabled &&
                        previewMode === 'processed' &&
                        opencvStatus === 'ready' &&
                        blobsOverlayEnabled;

                    if (shouldRenderOverlay && overlaySourceForRoi && roiOverlayCtx) {
                        const sx = currentRoi.x * baseWidth;
                        const sy = currentRoi.y * baseHeight;
                        const sWidth = Math.max(1, currentRoi.width * baseWidth);
                        const sHeight = Math.max(1, currentRoi.height * baseHeight);
                        roiOverlayCtx.drawImage(
                            overlaySourceForRoi,
                            sx,
                            sy,
                            sWidth,
                            sHeight,
                            0,
                            0,
                            targetWidth,
                            targetHeight,
                        );
                    }
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);
        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [
        drawOverlayBitmap,
        renderDetectionOverlay,
        previewMode,
        roiViewEnabled,
        rotationDegrees,
        blobsOverlayEnabled,
        opencvStatus,
    ]);

    const detectionReady = cameraStatus === 'ready' && opencvStatus === 'ready';

    useEffect(() => {
        if (nativeBlobDetectorStatus === undefined) {
            return;
        }
        onNativeDetectorAvailability(nativeBlobDetectorStatus);
    }, [nativeBlobDetectorStatus, onNativeDetectorAvailability]);

    return {
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
        previewRefs: {
            overlayRef,
            videoRef,
            processedCanvasRef,
            detectionOverlayCanvasRef,
            roiCanvasRef,
            roiOverlayCanvasRef,
        },
        overlayHandlers,
        resetRoi,
        nativeBlobDetectorAvailable,
        setAlignmentOverlaySummary,
        setTileBoundsOverlayEntries,
        blobsOverlayEnabled,
        setBlobsOverlayEnabled,
        setExpectedBlobPosition,
    };
};
