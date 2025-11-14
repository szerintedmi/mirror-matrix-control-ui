import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CalibrationRunnerPanel from '@/components/calibration/CalibrationRunnerPanel';
import {
    DEFAULT_CLAHE_CLIP_LIMIT,
    DEFAULT_CLAHE_TILE_GRID_SIZE,
    DEFAULT_ROI,
    RESOLUTION_OPTIONS,
    clamp01,
} from '@/constants/calibration';
import { useCalibrationRunnerController } from '@/hooks/useCalibrationRunnerController';
import { useDetectionSettingsController } from '@/hooks/useDetectionSettingsController';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import type { BlobMeasurement } from '@/services/calibrationRunner';
import { persistDetectionSettings } from '@/services/detectionSettingsStorage';
import type {
    DetectedBlob,
    OpenCvReadyMessage,
    OpenCvWorkerClient,
    OpenCvWorkerStatus,
} from '@/services/opencvWorkerClient';
import { getOpenCvWorkerClient } from '@/services/openCvWorkerSingleton';
import type { MirrorConfig, NormalizedRoi } from '@/types';

interface CalibrationPageProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const getLocalStorage = (): Storage | undefined =>
    typeof window !== 'undefined' ? window.localStorage : undefined;

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

const CalibrationPage: React.FC<CalibrationPageProps> = ({ gridSize, mirrorConfig }) => {
    const detection = useDetectionSettingsController();
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
        currentSettings,
        handleNativeDetectorAvailability,
    } = detection;
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [previewMode, setPreviewMode] = useState<'raw' | 'processed'>('processed');
    const [isRotationAdjusting, setIsRotationAdjusting] = useState(false);
    const [processedFps, setProcessedFps] = useState(0);
    const [cameraStatus, setCameraStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
        'idle',
    );
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [roiViewEnabled, setRoiViewEnabled] = useState(false);
    const [roiEditingMode, setRoiEditingMode] = useState<'idle' | 'drag' | 'resize' | 'draw'>(
        'idle',
    );
    const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>(
        () => ({ width: 0, height: 0 }),
    );

    const handleSaveProfile = useCallback(() => {
        saveProfile({
            width: videoDimensions.width > 0 ? videoDimensions.width : null,
            height: videoDimensions.height > 0 ? videoDimensions.height : null,
        });
    }, [saveProfile, videoDimensions.height, videoDimensions.width]);

    const handleLoadProfile = useCallback(() => {
        if (!selectedProfileId) {
            return;
        }
        applyProfileById(selectedProfileId);
    }, [applyProfileById, selectedProfileId]);

    const handleNewProfile = useCallback(() => {
        resetProfileSelection();
    }, [resetProfileSelection]);
    const [detectedBlobCount, setDetectedBlobCount] = useState(0);
    const [showAdvancedDetection, setShowAdvancedDetection] = useState(false);
    const motorCommands = useMotorCommands();
    const [opencvStatus, setOpenCvStatus] = useState<OpenCvWorkerStatus>('idle');
    const [opencvError, setOpenCvError] = useState<string | null>(null);
    const [opencvInfo, setOpenCvInfo] = useState<OpenCvReadyMessage | null>(null);

    const workerClientRef = useRef<OpenCvWorkerClient | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const processedCanvasRef = useRef<HTMLCanvasElement>(null);
    const roiCanvasRef = useRef<HTMLCanvasElement>(null);
    const detectionOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const pointerStateRef = useRef<{
        pointerId: number;
        mode: 'move' | 'resize' | 'draw';
        origin: { x: number; y: number };
        initialRoi: NormalizedRoi;
        handle?: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    } | null>(null);
    const roiRef = useRef<NormalizedRoi>(roi);
    const detectionResultsRef = useRef<DetectedBlob[]>([]);
    const processedFrameMetaRef = useRef<{
        sourceWidth: number;
        sourceHeight: number;
        appliedRoi: { x: number; y: number; width: number; height: number } | null;
    } | null>(null);
    const detectionSequenceRef = useRef(0);
    const detectionUpdatedAtRef = useRef(0);

    const workerSupported = useMemo(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return typeof Worker !== 'undefined' && typeof window.createImageBitmap === 'function';
    }, []);

    const readBestBlobMeasurement = useCallback((): BlobMeasurement | null => {
        const meta = processedFrameMetaRef.current;
        const blobs = detectionResultsRef.current;
        if (!meta || !meta.sourceWidth || !meta.sourceHeight || blobs.length === 0) {
            return null;
        }
        const best = blobs.reduce((top, blob) => (blob.response > top.response ? blob : top));
        const normalizedX = best.x / meta.sourceWidth;
        const normalizedY = best.y / meta.sourceHeight;
        const normalizedSize = best.size / Math.max(meta.sourceWidth, meta.sourceHeight);
        return {
            x: clamp01(normalizedX),
            y: clamp01(normalizedY),
            size: Math.max(0, normalizedSize),
            response: best.response,
            capturedAt: detectionUpdatedAtRef.current || performance.now(),
        };
    }, []);

    const captureBlobMeasurement = useCallback(
        async ({ timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal }) => {
            const start = performance.now();
            let baselineSequence = detectionSequenceRef.current;
            while (performance.now() - start < timeoutMs) {
                if (signal?.aborted) {
                    throw new Error('Calibration measurement aborted');
                }
                const sequenceChanged = detectionSequenceRef.current !== baselineSequence;
                if (sequenceChanged) {
                    const measurement = readBestBlobMeasurement();
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

    const detectionReady = cameraStatus === 'ready' && opencvStatus === 'ready';

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

    const nativeBlobDetectorStatus = opencvInfo?.capabilities?.hasNativeBlobDetector;
    const nativeBlobDetectorAvailable = nativeBlobDetectorStatus === true;

    useEffect(() => {
        roiRef.current = roi;
    }, [roi]);

    useEffect(() => {
        if (roi.enabled || !roiViewEnabled) {
            return;
        }
        let cancelled = false;
        const disable = () => {
            if (!cancelled) {
                setRoiViewEnabled(false);
            }
        };
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(disable);
        } else {
            disable();
        }
        return () => {
            cancelled = true;
        };
    }, [roi.enabled, roiViewEnabled]);

    useEffect(() => {
        if (nativeBlobDetectorStatus === undefined) {
            return;
        }
        handleNativeDetectorAvailability(nativeBlobDetectorStatus);
    }, [handleNativeDetectorAvailability, nativeBlobDetectorStatus]);

    useEffect(() => {
        if (!detectionSettingsLoaded) {
            return;
        }
        const storage = getLocalStorage();
        const lastCaptureWidth = videoDimensions.width > 0 ? videoDimensions.width : null;
        const lastCaptureHeight = videoDimensions.height > 0 ? videoDimensions.height : null;
        persistDetectionSettings(storage, {
            ...currentSettings,
            roi: {
                ...currentSettings.roi,
                lastCaptureWidth,
                lastCaptureHeight,
            },
        });
    }, [currentSettings, detectionSettingsLoaded, videoDimensions.height, videoDimensions.width]);

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

    const handleRotationPointerDown = () => {
        setIsRotationAdjusting(true);
    };

    const handleRotationPointerUp = () => {
        setIsRotationAdjusting(false);
    };

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
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                try {
                    await videoRef.current.play();
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
    }, [selectedDeviceId, resolvedResolution.height, resolvedResolution.width, stopCurrentStream]);

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
                setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
            }
        };
        video.addEventListener('loadedmetadata', handleMetadata);
        return () => {
            video.removeEventListener('loadedmetadata', handleMetadata);
        };
    }, []);

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
        opencvStatus,
        previewMode,
        shouldUseWorkerRoi,
        useWasmDetector,
        nativeBlobDetectorAvailable,
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
                            const sw = Math.max(1, currentRoi.width * baseWidth);
                            const sh = Math.max(1, currentRoi.height * baseHeight);
                            zoomCtx.drawImage(
                                roiSource,
                                sx,
                                sy,
                                sw,
                                sh,
                                0,
                                0,
                                targetWidth,
                                targetHeight,
                            );
                        }
                    }
                    if (!showFullFrame && previewMode === 'processed') {
                        const meta = processedFrameMetaRef.current;
                        const sourceWidth = meta?.sourceWidth ?? baseWidth;
                        const sourceHeight = meta?.sourceHeight ?? baseHeight;
                        const roiRect = meta?.appliedRoi ?? {
                            x: currentRoi.x * sourceWidth,
                            y: currentRoi.y * sourceHeight,
                            width: Math.max(1, currentRoi.width * sourceWidth),
                            height: Math.max(1, currentRoi.height * sourceHeight),
                        };
                        drawBlobOverlay(zoomCtx, zoomCanvas.width, zoomCanvas.height, roiRect);
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

    const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }
        if (roiViewEnabled && roi.enabled) {
            return;
        }
        const container = overlayRef.current;
        if (!container) {
            return;
        }
        const rect = container.getBoundingClientRect();
        const relativeX = clamp01((event.clientX - rect.left) / rect.width);
        const relativeY = clamp01((event.clientY - rect.top) / rect.height);
        const target = event.target as HTMLElement;
        const handle = target.dataset.roiHandle as
            | 'n'
            | 's'
            | 'e'
            | 'w'
            | 'ne'
            | 'nw'
            | 'se'
            | 'sw'
            | undefined;
        let mode: 'move' | 'resize' | 'draw' = 'draw';
        if (target.dataset.roiHandle === 'move') {
            mode = 'move';
        } else if (handle) {
            mode = 'resize';
        }
        pointerStateRef.current = {
            pointerId: event.pointerId,
            mode,
            origin: { x: relativeX, y: relativeY },
            initialRoi: roiRef.current,
            handle,
        };
        setRoiEditingMode(mode === 'draw' ? 'draw' : mode === 'move' ? 'drag' : 'resize');
        container.setPointerCapture(event.pointerId);
    };

    const handleOverlayPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const state = pointerStateRef.current;
        const container = overlayRef.current;
        if (!state || !container || state.pointerId !== event.pointerId) {
            return;
        }
        const rect = container.getBoundingClientRect();
        const relativeX = clamp01((event.clientX - rect.left) / rect.width);
        const relativeY = clamp01((event.clientY - rect.top) / rect.height);
        if (state.mode === 'draw') {
            const startX = state.origin.x;
            const startY = state.origin.y;
            const x = Math.min(startX, relativeX);
            const y = Math.min(startY, relativeY);
            const width = Math.abs(relativeX - startX);
            const height = Math.abs(relativeY - startY);
            setRoi((prev) => ({ ...prev, x, y, width, height }));
            return;
        }
        if (state.mode === 'move') {
            const deltaX = relativeX - state.origin.x;
            const deltaY = relativeY - state.origin.y;
            const next = {
                ...state.initialRoi,
                x: state.initialRoi.x + deltaX,
                y: state.initialRoi.y + deltaY,
            };
            setRoi(next);
            return;
        }
        if (state.mode === 'resize' && state.handle) {
            const { handle } = state;
            const initial = state.initialRoi;
            let next = { ...initial };
            if (handle.includes('n')) {
                const bottom = initial.y + initial.height;
                next.y = Math.min(relativeY, bottom - 0.02);
                next.height = bottom - next.y;
            }
            if (handle.includes('s')) {
                const top = initial.y;
                next.height = clamp01(relativeY - top);
            }
            if (handle.includes('w')) {
                const right = initial.x + initial.width;
                next.x = Math.min(relativeX, right - 0.02);
                next.width = right - next.x;
            }
            if (handle.includes('e')) {
                const left = initial.x;
                next.width = clamp01(relativeX - left);
            }
            setRoi(next);
        }
    };

    const handleOverlayPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const container = overlayRef.current;
        const state = pointerStateRef.current;
        if (state && container && state.pointerId === event.pointerId) {
            container.releasePointerCapture(event.pointerId);
        }
        pointerStateRef.current = null;
        setRoiEditingMode('idle');
    };

    const toggleRoiEnabled = () => {
        setRoi((prev) => ({ ...prev, enabled: !prev.enabled }));
    };

    const resetRoi = () => {
        setRoi(DEFAULT_ROI);
    };

    const previewContainerClass =
        'relative w-full overflow-hidden rounded-lg border border-gray-700 bg-black shadow-inner';

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

    const previewAspectRatio = useMemo(() => {
        if (roiAspectRatio) {
            return roiAspectRatio;
        }
        if (videoDimensions.width > 0 && videoDimensions.height > 0) {
            return videoDimensions.width / videoDimensions.height;
        }
        return 16 / 9;
    }, [roiAspectRatio, videoDimensions.height, videoDimensions.width]);

    const rotationOverlayVisible = isRotationAdjusting;

    const renderPreview = () => {
        const showFullFrame = !roiViewEnabled || !roi.enabled;
        const processedVisible =
            showFullFrame && previewMode === 'processed' && opencvStatus === 'ready';
        const rawVisible =
            showFullFrame &&
            (previewMode === 'raw' || (previewMode === 'processed' && opencvStatus !== 'ready'));
        const workerOverlayActive = previewMode === 'processed' && opencvStatus !== 'ready';
        const workerOverlayMessage =
            opencvStatus === 'error'
                ? opencvError ?? 'OpenCV initialization failed.'
                : 'Launching OpenCV…';
        return (
            <div
                className={previewContainerClass}
                style={{
                    aspectRatio: previewAspectRatio,
                    minHeight: '260px',
                    maxHeight: '80vh',
                }}
            >
                <div
                    ref={overlayRef}
                    className="absolute inset-0"
                    style={{ pointerEvents: showFullFrame ? 'auto' : 'none' }}
                    onPointerDown={handleOverlayPointerDown}
                    onPointerMove={handleOverlayPointerMove}
                    onPointerUp={handleOverlayPointerUp}
                    onPointerLeave={(event) => {
                        if (
                            pointerStateRef.current &&
                            pointerStateRef.current.pointerId === event.pointerId
                        ) {
                            handleOverlayPointerUp(event);
                        }
                    }}
                >
                    <div
                        className="absolute inset-0 origin-center transition-transform duration-150 ease-out"
                        style={{ transform: `rotate(${rotationDegrees}deg)` }}
                    >
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
                                rawVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                        />
                        <canvas
                            ref={processedCanvasRef}
                            className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
                                processedVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                        />
                        <canvas
                            ref={detectionOverlayCanvasRef}
                            className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity ${
                                showFullFrame && processedVisible ? 'opacity-100' : 'opacity-0'
                            }`}
                        />
                    </div>
                    <canvas
                        ref={roiCanvasRef}
                        className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
                            showFullFrame ? 'opacity-0 pointer-events-none' : 'opacity-100'
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
        );
    };

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
                    <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                        <h2 className="text-lg font-semibold text-gray-100">Camera Setup</h2>
                        <div className="mt-4 grid gap-4">
                            <label className="flex flex-col gap-2 text-sm text-gray-300">
                                Camera Device
                                <select
                                    value={selectedDeviceId}
                                    onChange={(event) => setSelectedDeviceId(event.target.value)}
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                                >
                                    <option value="default">Default Camera</option>
                                    {devices.map((device) => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Camera ${device.deviceId}`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-2 text-sm text-gray-300">
                                Resolution
                                <select
                                    value={selectedResolutionId}
                                    onChange={(event) =>
                                        setSelectedResolutionId(event.target.value)
                                    }
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                                >
                                    {RESOLUTION_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
                            {videoDimensions.width > 0 && (
                                <span>
                                    Feed: {videoDimensions.width} × {videoDimensions.height}
                                </span>
                            )}
                            {roi.enabled && (
                                <span>
                                    ROI: {Math.round(roi.width * videoDimensions.width)} ×{' '}
                                    {Math.round(roi.height * videoDimensions.height)}
                                </span>
                            )}
                            <span>Processed FPS: {processedFps}</span>
                            {previewMode === 'processed' && (
                                <span>Detected blobs: {detectedBlobCount}</span>
                            )}
                            <span>
                                OpenCV:{' '}
                                {opencvStatus === 'ready'
                                    ? (opencvInfo?.version ?? 'Ready')
                                    : opencvStatus === 'loading'
                                      ? 'Loading…'
                                      : (opencvError ?? 'Unavailable')}
                            </span>
                            {cameraStatus !== 'ready' && <span>Status: {cameraStatus}</span>}
                        </div>
                        {cameraError && (
                            <p className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {cameraError}
                            </p>
                        )}
                    </section>

                    <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                        <h2 className="text-lg font-semibold text-gray-100">Processing Controls</h2>
                        <div className="mt-4 flex flex-col gap-3 text-sm text-gray-300">
                            <div className="flex flex-col gap-1">
                                <label
                                    htmlFor="calibration-brightness"
                                    className="flex items-center justify-between text-sm"
                                >
                                    <span>Brightness ({brightness.toFixed(2)})</span>
                                    <button
                                        type="button"
                                        onClick={() => setBrightness(0)}
                                        className="text-xs text-emerald-300 hover:text-emerald-200"
                                        title="Reset brightness"
                                    >
                                        Reset
                                    </button>
                                </label>
                                <input
                                    id="calibration-brightness"
                                    type="range"
                                    min={-1}
                                    max={1}
                                    step={0.05}
                                    value={brightness}
                                    onChange={(event) => setBrightness(Number(event.target.value))}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label
                                    htmlFor="calibration-contrast"
                                    className="flex items-center justify-between text-sm"
                                >
                                    <span>Contrast ({contrast.toFixed(2)})</span>
                                    <button
                                        type="button"
                                        onClick={() => setContrast(1)}
                                        className="text-xs text-emerald-300 hover:text-emerald-200"
                                        title="Reset contrast"
                                    >
                                        Reset
                                    </button>
                                </label>
                                <input
                                    id="calibration-contrast"
                                    type="range"
                                    min={0.2}
                                    max={3}
                                    step={0.05}
                                    value={contrast}
                                    onChange={(event) => setContrast(Number(event.target.value))}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label
                                    htmlFor="calibration-clahe-clip"
                                    className="flex items-center justify-between text-sm"
                                >
                                    <span>CLAHE clip limit ({claheClipLimit.toFixed(2)})</span>
                                    <button
                                        type="button"
                                        onClick={() => setClaheClipLimit(DEFAULT_CLAHE_CLIP_LIMIT)}
                                        className="text-xs text-emerald-300 hover:text-emerald-200"
                                    >
                                        Reset
                                    </button>
                                </label>
                                <input
                                    id="calibration-clahe-clip"
                                    type="range"
                                    min={0.5}
                                    max={8}
                                    step={0.1}
                                    value={claheClipLimit}
                                    onChange={(event) =>
                                        setClaheClipLimit(Number(event.target.value))
                                    }
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label
                                    htmlFor="calibration-clahe-grid"
                                    className="flex items-center justify-between text-sm"
                                >
                                    <span>CLAHE tile grid ({claheTileGridSize})</span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setClaheTileGridSize(DEFAULT_CLAHE_TILE_GRID_SIZE)
                                        }
                                        className="text-xs text-emerald-300 hover:text-emerald-200"
                                    >
                                        Reset
                                    </button>
                                </label>
                                <input
                                    id="calibration-clahe-grid"
                                    type="range"
                                    min={2}
                                    max={32}
                                    step={2}
                                    value={claheTileGridSize}
                                    onChange={(event) =>
                                        setClaheTileGridSize(Number(event.target.value))
                                    }
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label
                                    htmlFor="calibration-rotation"
                                    className="flex items-center justify-between text-sm"
                                >
                                    <span>Horizontal rotation ({rotationDegrees.toFixed(2)}°)</span>
                                    <button
                                        type="button"
                                        onClick={() => setRotationDegrees(0)}
                                        className="text-xs text-emerald-300 hover:text-emerald-200"
                                        title="Reset rotation"
                                    >
                                        Reset
                                    </button>
                                </label>
                                <input
                                    id="calibration-rotation"
                                    type="range"
                                    min={-10}
                                    max={10}
                                    step={0.1}
                                    value={rotationDegrees}
                                    onChange={(event) =>
                                        setRotationDegrees(Number(event.target.value))
                                    }
                                    onPointerDown={handleRotationPointerDown}
                                    onPointerUp={handleRotationPointerUp}
                                    onPointerLeave={handleRotationPointerUp}
                                    onTouchEnd={handleRotationPointerUp}
                                    onBlur={handleRotationPointerUp}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-100">
                                Detection Profiles
                            </h2>
                            <span className="text-xs text-gray-400">
                                {savedProfiles.length} saved
                            </span>
                        </div>
                        <div className="mt-4 flex flex-col gap-3 text-sm text-gray-300">
                            <label className="flex flex-col gap-2">
                                <span>Profile name</span>
                                <input
                                    type="text"
                                    value={profileNameInput}
                                    onChange={(event) => setProfileNameInput(event.target.value)}
                                    placeholder="e.g. Lab baseline"
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                                />
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSaveProfile}
                                    className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300 hover:border-emerald-400"
                                >
                                    Save profile
                                </button>
                                <button
                                    type="button"
                                    onClick={handleNewProfile}
                                    className="rounded-md border border-gray-700 px-3 py-1 text-sm text-gray-200 hover:border-gray-500"
                                >
                                    New profile
                                </button>
                            </div>
                            <label className="flex flex-col gap-2">
                                <span>Saved settings</span>
                                <div className="flex gap-2">
                                    <select
                                        value={selectedProfileId}
                                        onChange={(event) => selectProfileId(event.target.value)}
                                        className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                                    >
                                        <option value="">Select saved profile</option>
                                        {savedProfiles.map((profile) => (
                                            <option key={profile.id} value={profile.id}>
                                                {profile.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleLoadProfile}
                                        disabled={!selectedProfileId}
                                        className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300 disabled:opacity-40"
                                    >
                                        Load
                                    </button>
                                </div>
                            </label>
                        </div>
                    </section>

                    <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-100">Blob Detection</h2>
                            <span className="text-xs text-gray-400">
                                Detected: {detectedBlobCount}
                            </span>
                        </div>
                        <div className="mt-4 flex flex-col gap-3 text-sm text-gray-300">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="flex flex-col gap-2">
                                    <span>Min threshold ({blobParams.minThreshold})</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={255}
                                        step={5}
                                        value={blobParams.minThreshold}
                                        onChange={(event) =>
                                            updateBlobParam(
                                                'minThreshold',
                                                Number(event.target.value),
                                            )
                                        }
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span>Max threshold ({blobParams.maxThreshold})</span>
                                    <input
                                        type="range"
                                        min={50}
                                        max={255}
                                        step={5}
                                        value={blobParams.maxThreshold}
                                        onChange={(event) =>
                                            updateBlobParam(
                                                'maxThreshold',
                                                Number(event.target.value),
                                            )
                                        }
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span>Min area ({blobParams.minArea} px)</span>
                                    <input
                                        type="range"
                                        min={100}
                                        max={5000}
                                        step={100}
                                        value={blobParams.minArea}
                                        onChange={(event) =>
                                            updateBlobParam('minArea', Number(event.target.value))
                                        }
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span>Max area ({blobParams.maxArea} px)</span>
                                    <input
                                        type="range"
                                        min={5000}
                                        max={40000}
                                        step={500}
                                        value={blobParams.maxArea}
                                        onChange={(event) =>
                                            updateBlobParam('maxArea', Number(event.target.value))
                                        }
                                    />
                                </label>
                            </div>
                            <button
                                type="button"
                                className="text-xs text-emerald-300 hover:text-emerald-200"
                                onClick={() => setShowAdvancedDetection((prev) => !prev)}
                            >
                                {showAdvancedDetection
                                    ? 'Hide advanced parameters'
                                    : 'Show advanced parameters'}
                            </button>
                            {showAdvancedDetection && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="md:col-span-2 flex flex-col gap-2 rounded-md border border-gray-800 bg-gray-900/60 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Use WASM detector</span>
                                            <input
                                                type="checkbox"
                                                checked={
                                                    useWasmDetector && nativeBlobDetectorAvailable
                                                }
                                                onChange={(event) =>
                                                    setUseWasmDetector(event.target.checked)
                                                }
                                                disabled={!nativeBlobDetectorAvailable}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {nativeBlobDetectorAvailable
                                                ? 'WASM path is faster; switch off to try the JS fallback.'
                                                : 'WASM detector unavailable in this build.'}
                                        </span>
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span>Threshold step ({blobParams.thresholdStep})</span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={50}
                                            step={1}
                                            value={blobParams.thresholdStep}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'thresholdStep',
                                                    Number(event.target.value),
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span>
                                            Min distance ({blobParams.minDistBetweenBlobs} px)
                                        </span>
                                        <input
                                            type="range"
                                            min={5}
                                            max={100}
                                            step={5}
                                            value={blobParams.minDistBetweenBlobs}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'minDistBetweenBlobs',
                                                    Number(event.target.value),
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="flex items-center justify-between gap-2">
                                        <span>Filter by convexity</span>
                                        <input
                                            type="checkbox"
                                            checked={blobParams.filterByConvexity}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'filterByConvexity',
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span>
                                            Min convexity ({blobParams.minConvexity.toFixed(2)})
                                        </span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={blobParams.minConvexity}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'minConvexity',
                                                    Number(event.target.value),
                                                )
                                            }
                                            disabled={!blobParams.filterByConvexity}
                                        />
                                    </label>
                                    <label className="flex items-center justify-between gap-2">
                                        <span>Filter by inertia</span>
                                        <input
                                            type="checkbox"
                                            checked={blobParams.filterByInertia}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'filterByInertia',
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span>
                                            Min inertia ({blobParams.minInertiaRatio.toFixed(2)})
                                        </span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={blobParams.minInertiaRatio}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'minInertiaRatio',
                                                    Number(event.target.value),
                                                )
                                            }
                                            disabled={!blobParams.filterByInertia}
                                        />
                                    </label>
                                    <label className="flex items-center justify-between gap-2">
                                        <span>Filter by circularity</span>
                                        <input
                                            type="checkbox"
                                            checked={blobParams.filterByCircularity}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'filterByCircularity',
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span>
                                            Min circularity ({blobParams.minCircularity.toFixed(2)})
                                        </span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={blobParams.minCircularity}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'minCircularity',
                                                    Number(event.target.value),
                                                )
                                            }
                                            disabled={!blobParams.filterByCircularity}
                                        />
                                    </label>
                                    <label className="flex items-center justify-between gap-2">
                                        <span>Filter by color</span>
                                        <input
                                            type="checkbox"
                                            checked={blobParams.filterByColor}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'filterByColor',
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span>Blob color ({blobParams.blobColor})</span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={255}
                                            step={5}
                                            value={blobParams.blobColor}
                                            onChange={(event) =>
                                                updateBlobParam(
                                                    'blobColor',
                                                    Number(event.target.value),
                                                )
                                            }
                                            disabled={!blobParams.filterByColor}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

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
                                    onClick={() => setPreviewMode(mode)}
                                >
                                    {mode === 'raw' ? 'Raw view' : 'Processed view'}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={toggleRoiEnabled}
                            className={`rounded-md border px-3 py-1 text-sm ${
                                roi.enabled
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                    : 'border-gray-700 bg-gray-900 text-gray-400'
                            }`}
                        >
                            ROI {roi.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setRoiViewEnabled((prev) => !prev)}
                            disabled={!roi.enabled}
                            className={`rounded-md border px-3 py-1 text-sm ${
                                roiViewEnabled
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                    : 'border-gray-700 bg-gray-900 text-gray-400'
                            } ${!roi.enabled ? 'opacity-50' : ''}`}
                            title={
                                roi.enabled
                                    ? 'Toggle cropped ROI preview'
                                    : 'Enable ROI to use this view'
                            }
                        >
                            ROI view {roiViewEnabled ? 'On' : 'Off'}
                        </button>
                        <button
                            type="button"
                            onClick={resetRoi}
                            className="rounded-md border border-gray-700 px-3 py-1 text-sm text-gray-300 hover:border-gray-500"
                        >
                            Reset ROI
                        </button>
                    </div>
                    {renderPreview()}
                </section>
            </div>
        </div>
    );
};

export default CalibrationPage;
