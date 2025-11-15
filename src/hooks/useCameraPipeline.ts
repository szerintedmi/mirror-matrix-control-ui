import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_ROI, clamp01, type ResolutionOption } from '@/constants/calibration';
import {
    type CameraPipelineOverlayHandlers,
    useRoiOverlayInteractions,
    type RoiEditingMode,
} from '@/hooks/useRoiOverlayInteractions';
import type { CaptureBlobMeasurement } from '@/services/calibrationRunner';
import type {
    BlobDetectorParams,
    DetectedBlob,
    OpenCvReadyMessage,
    OpenCvWorkerClient,
    OpenCvWorkerStatus,
} from '@/services/opencvWorkerClient';
import { getOpenCvWorkerClient } from '@/services/openCvWorkerSingleton';
import type { NormalizedRoi } from '@/types';

import type React from 'react';

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
}

// CameraPipelineOverlayHandlers type re-exported above

export interface CameraPreviewRefs {
    overlayRef: React.MutableRefObject<HTMLDivElement | null>;
    videoRef: React.MutableRefObject<HTMLVideoElement | null>;
    processedCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    detectionOverlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    roiCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
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
    toggleRoiEnabled: () => void;
    resetRoi: () => void;
    nativeBlobDetectorAvailable: boolean;
}

const waitFor = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Aborted'));
            return;
        }
        const timer = setTimeout(() => {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            reject(new Error('Aborted'));
        };
        if (signal) {
            signal.addEventListener('abort', onAbort);
        }
    });

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

    const nativeBlobDetectorStatus = opencvInfo?.capabilities?.hasNativeBlobDetector;
    const nativeBlobDetectorAvailable = nativeBlobDetectorStatus === true;

    const workerClientRef = useRef<OpenCvWorkerClient | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const processedCanvasRef = useRef<HTMLCanvasElement>(null);
    const roiCanvasRef = useRef<HTMLCanvasElement>(null);
    const detectionOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const roiRef = useRef<NormalizedRoi>(roi);
    const detectionResultsRef = useRef<DetectedBlob[]>([]);
    const processedFrameMetaRef = useRef<{
        sourceWidth: number;
        sourceHeight: number;
        appliedRoi: { x: number; y: number; width: number; height: number } | null;
    } | null>(null);
    const detectionSequenceRef = useRef(0);
    const detectionUpdatedAtRef = useRef(0);

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

    const toggleRoiEnabled = useCallback(() => {
        setRoi((prev) => ({ ...prev, enabled: !prev.enabled }));
    }, [setRoi]);

    const resetRoi = useCallback(() => {
        setRoi(DEFAULT_ROI);
    }, [setRoi]);

    const readBestBlobMeasurement = useCallback((expectedPosition?: { x: number; y: number }) => {
        const meta = processedFrameMetaRef.current;
        const blobs = detectionResultsRef.current;
        if (!meta || !meta.sourceWidth || !meta.sourceHeight || blobs.length === 0) {
            return null;
        }
        const normalized = blobs.map((blob) => {
            const normalizedX = clamp01(blob.x / meta.sourceWidth);
            const normalizedY = clamp01(blob.y / meta.sourceHeight);
            const normalizedSize = blob.size / Math.max(meta.sourceWidth, meta.sourceHeight);
            return {
                blob,
                normalizedX,
                normalizedY,
                normalizedSize: Math.max(0, normalizedSize),
            };
        });

        const selectByDistance = (expected: { x: number; y: number }) => {
            const EPS = 1e-6;
            return normalized.reduce(
                (closest, current) => {
                    const currentDistance = Math.hypot(
                        current.normalizedX - expected.x,
                        current.normalizedY - expected.y,
                    );
                    if (!closest) {
                        return { entry: current, distance: currentDistance };
                    }
                    if (currentDistance + EPS < closest.distance) {
                        return { entry: current, distance: currentDistance };
                    }
                    if (Math.abs(currentDistance - closest.distance) <= EPS) {
                        return current.blob.response > closest.entry.blob.response
                            ? { entry: current, distance: currentDistance }
                            : closest;
                    }
                    return closest;
                },
                null as null | { entry: (typeof normalized)[number]; distance: number },
            );
        };

        const bestEntry = expectedPosition
            ? selectByDistance(expectedPosition)?.entry
            : normalized.reduce((top, candidate) =>
                  candidate.blob.response > top.blob.response ? candidate : top,
              );

        if (!bestEntry) {
            return null;
        }
        return {
            x: bestEntry.normalizedX,
            y: bestEntry.normalizedY,
            size: bestEntry.normalizedSize,
            response: bestEntry.blob.response,
            capturedAt: detectionUpdatedAtRef.current || performance.now(),
        };
    }, []);

    const captureBlobMeasurement = useCallback<CaptureBlobMeasurement>(
        async ({ timeoutMs, signal, expectedPosition }) => {
            const start = performance.now();
            let baselineSequence = detectionSequenceRef.current;
            while (performance.now() - start < timeoutMs) {
                if (signal?.aborted) {
                    throw new Error('Calibration measurement aborted');
                }
                const sequenceChanged = detectionSequenceRef.current !== baselineSequence;
                if (sequenceChanged) {
                    const measurement = readBestBlobMeasurement(expectedPosition);
                    baselineSequence = detectionSequenceRef.current;
                    if (measurement) {
                        return measurement;
                    }
                }
                await waitFor(50, signal);
            }
            return null;
        },
        [readBestBlobMeasurement],
    );

    useEffect(() => {
        roiRef.current = roi;
    }, [roi]);

    const { roiEditingMode, overlayHandlers, overlayRef } = useRoiOverlayInteractions({
        roi,
        setRoi,
        roiViewEnabled,
        setRoiViewEnabled,
        roiRef,
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

    const shouldUseWorkerRoi = useMemo(
        () => roi.enabled && roiViewEnabled && previewMode === 'processed' && rotationDegrees === 0,
        [previewMode, roi.enabled, roiViewEnabled, rotationDegrees],
    );

    const drawBlobOverlay = useCallback(
        (
            ctx: CanvasRenderingContext2D | null,
            width: number,
            height: number,
            displayRectOverride?: { x: number; y: number; width: number; height: number },
        ) => {
            if (!ctx) {
                return;
            }
            const meta = processedFrameMetaRef.current;
            const blobs = detectionResultsRef.current;
            if (!meta || blobs.length === 0) {
                return;
            }
            const baseRect = displayRectOverride ??
                meta.appliedRoi ?? {
                    x: 0,
                    y: 0,
                    width: meta.sourceWidth || width,
                    height: meta.sourceHeight || height,
                };
            if (!baseRect.width || !baseRect.height) {
                return;
            }
            const scaleX = width / baseRect.width;
            const scaleY = height / baseRect.height;
            ctx.save();
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
            ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.003);
            blobs.forEach((blob) => {
                const adjustedX = blob.x - baseRect.x;
                const adjustedY = blob.y - baseRect.y;
                if (
                    adjustedX < 0 ||
                    adjustedY < 0 ||
                    adjustedX > baseRect.width ||
                    adjustedY > baseRect.height
                ) {
                    return;
                }
                const drawX = adjustedX * scaleX;
                const drawY = adjustedY * scaleY;
                const radius = Math.max(2, (blob.size / 2) * ((scaleX + scaleY) / 2));
                ctx.beginPath();
                ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
                ctx.stroke();
            });
            ctx.restore();
        },
        [],
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
                        applyRoi: shouldUseWorkerRoi,
                        claheClipLimit,
                        claheTileGridSize,
                        blobParams,
                        runDetection: true,
                        preferFallbackDetector: !useWasmDetector || !nativeBlobDetectorAvailable,
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
                        appliedRoi: result.appliedRoi,
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
        shouldUseWorkerRoi,
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
                    rotatedCtx.rotate((rotationDegrees * Math.PI) / 180);
                    rotatedCtx.translate(-baseWidth / 2, -baseHeight / 2);
                    const sourceForRotation =
                        processedSourceAvailable && processedCanvas ? processedCanvas : video;
                    if (sourceForRotation) {
                        rotatedCtx.drawImage(sourceForRotation, 0, 0, baseWidth, baseHeight);
                    }
                    rotatedCtx.restore();
                }
            }

            const zoomCanvas = roiCanvasRef.current;
            const currentRoi = roiRef.current;
            const showFullFrame = !roiViewEnabled || !currentRoi.enabled;
            const overlayCanvas = detectionOverlayCanvasRef.current;
            if (overlayCanvas) {
                const overlayCtx = overlayCanvas.getContext('2d');
                if (showFullFrame && previewMode === 'processed') {
                    if (overlayCanvas.width !== baseWidth || overlayCanvas.height !== baseHeight) {
                        overlayCanvas.width = baseWidth;
                        overlayCanvas.height = baseHeight;
                    }
                    overlayCtx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                    drawBlobOverlay(overlayCtx, baseWidth, baseHeight);
                } else if (overlayCtx) {
                    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                }
            }
            if (zoomCanvas && currentRoi.enabled) {
                const roiPixels =
                    shouldUseWorkerRoi && processedSourceAvailable
                        ? { width: baseWidth, height: baseHeight }
                        : {
                              width: Math.max(1, Math.round(currentRoi.width * baseWidth)),
                              height: Math.max(1, Math.round(currentRoi.height * baseHeight)),
                          };
                const targetWidth = showFullFrame ? baseWidth : roiPixels.width;
                const targetHeight = showFullFrame ? baseHeight : roiPixels.height;
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
                        if (shouldUseWorkerRoi && processedSourceAvailable) {
                            zoomCtx.drawImage(
                                roiSource,
                                0,
                                0,
                                baseWidth,
                                baseHeight,
                                0,
                                0,
                                targetWidth,
                                targetHeight,
                            );
                        } else {
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
                }
            } else if (zoomCanvas) {
                zoomCanvas.getContext('2d')?.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
            }

            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);
        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [drawBlobOverlay, previewMode, roiViewEnabled, rotationDegrees, shouldUseWorkerRoi]);

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
        },
        overlayHandlers,
        toggleRoiEnabled,
        resetRoi,
        nativeBlobDetectorAvailable,
    };
};
