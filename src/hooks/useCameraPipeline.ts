import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_ROI, type ResolutionOption } from '@/constants/calibration';
import {
    type CameraPipelineOverlayHandlers,
    useRoiOverlayInteractions,
    type RoiEditingMode,
} from '@/hooks/useRoiOverlayInteractions';
import { useStableBlobMeasurement, type BlobSample } from '@/hooks/useStableBlobMeasurement';
import type { CalibrationRunSummary, CaptureBlobMeasurement } from '@/services/calibrationRunner';
import type {
    BlobDetectorParams,
    DetectedBlob,
    OpenCvReadyMessage,
    OpenCvWorkerClient,
    OpenCvWorkerStatus,
} from '@/services/opencvWorkerClient';
import { getOpenCvWorkerClient } from '@/services/openCvWorkerSingleton';
import type { CalibrationProfileBounds, NormalizedRoi } from '@/types';
import { centeredDeltaToView, centeredToView } from '@/utils/centeredCoordinates';
import {
    buildLetterboxTransform,
    cameraDeltaToViewport,
    cameraToViewport,
} from '@/utils/letterbox';
import {
    denormalizeIsotropic,
    denormalizeIsotropicDelta,
    normalizeIsotropic,
} from '@/utils/normalization';

import type React from 'react';

type CvMat = { delete: () => void };
type CvPoint = unknown;
type CvScalar = unknown;

interface CvRuntime {
    Mat: {
        zeros: (rows: number, cols: number, type: number) => CvMat;
    };
    Scalar: new (b: number, g: number, r: number, a?: number) => CvScalar;
    Point: new (x: number, y: number) => CvPoint;
    circle: (
        mat: CvMat,
        center: CvPoint,
        radius: number,
        color: CvScalar,
        thickness: number,
        lineType: number,
    ) => void;
    rectangle: (
        mat: CvMat,
        pt1: CvPoint,
        pt2: CvPoint,
        color: CvScalar,
        thickness?: number,
        lineType?: number,
    ) => void;
    putText: (
        mat: CvMat,
        text: string,
        org: CvPoint,
        fontFace: number,
        fontScale: number,
        color: CvScalar,
        thickness?: number,
        lineType?: number,
    ) => void;
    imshow: (canvas: HTMLCanvasElement, mat: CvMat) => void;
    CV_8UC4: number;
    LINE_AA: number;
    FILLED: number;
    FONT_HERSHEY_SIMPLEX: number;
}

declare global {
    interface Window {
        cv?: CvRuntime;
    }
}

const ALIGNMENT_TEAL = { r: 16, g: 185, b: 129 } as const;
const formatAlignmentRgba = (alpha: number): string =>
    `rgba(${ALIGNMENT_TEAL.r}, ${ALIGNMENT_TEAL.g}, ${ALIGNMENT_TEAL.b}, ${alpha})`;
const GLOBAL_BOUNDS_RGBA = 'rgba(250, 204, 21, 0.9)';
const GLOBAL_BOUNDS_DASH = [6, 6];
const TILE_BOUNDS_COLORS = ['#fb7185', '#38bdf8', '#c084fc', '#facc15', '#4ade80', '#f472b6'];

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const normalized = hex.replace('#', '');
    const numeric = Number.parseInt(normalized, 16);
    return {
        r: (numeric >> 16) & 0xff,
        g: (numeric >> 8) & 0xff,
        b: numeric & 0xff,
    };
};

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

export interface GlobalBoundsOverlayPayload {
    bounds: CalibrationProfileBounds;
    cameraOriginOffset: OverlayCameraOriginOffset;
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
    setGlobalBoundsOverlayBounds: (payload: GlobalBoundsOverlayPayload | null) => void;
    setTileBoundsOverlayEntries: (payload: TileBoundsOverlayPayload | null) => void;
    blobsOverlayEnabled: boolean;
    setBlobsOverlayEnabled: (enabled: boolean) => void;
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
    const cameraAspectRatio = useMemo(() => {
        if (videoDimensions.width > 0 && videoDimensions.height > 0) {
            return videoDimensions.width / videoDimensions.height;
        }
        return 1;
    }, [videoDimensions.height, videoDimensions.width]);
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
    } | null>(null);
    const detectionSequenceRef = useRef(0);
    const detectionUpdatedAtRef = useRef(0);
    const alignmentOverlaySummaryRef = useRef<CalibrationRunSummary | null>(null);
    const alignmentOverlayVisibleRef = useRef<boolean>(Boolean(alignmentOverlayVisible));
    const blobsOverlayVisibleRef = useRef<boolean>(true);
    const overlayCvRef = useRef<CvRuntime | null>(null);
    const globalBoundsRef = useRef<GlobalBoundsOverlayPayload | null>(null);
    const tileBoundsOverlayRef = useRef<TileBoundsOverlayPayload | null>(null);

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

    const setGlobalBoundsOverlayBounds = useCallback(
        (payload: GlobalBoundsOverlayPayload | null) => {
            globalBoundsRef.current = payload;
            if (import.meta.env?.DEV && payload) {
                const { bounds, cameraOriginOffset } = payload;
                const midX = (bounds.x.min + bounds.x.max) / 2;
                const midY = (bounds.y.min + bounds.y.max) / 2;
                console.debug('[Calibration] global bounds updated', {
                    bounds,
                    center: { x: midX, y: midY },
                    cameraOriginOffset,
                });
            }
        },
        [],
    );

    const setTileBoundsOverlayEntries = useCallback((payload: TileBoundsOverlayPayload | null) => {
        tileBoundsOverlayRef.current = payload;
    }, []);

    useEffect(() => {
        blobsOverlayVisibleRef.current = blobsOverlayEnabled;
    }, [blobsOverlayEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const globalCv = window.cv;
        if (globalCv) {
            overlayCvRef.current = globalCv;
            return;
        }
        let cancelled = false;
        const existing = document.querySelector<HTMLScriptElement>('script[data-overlay-cv]');
        if (existing) {
            existing.addEventListener('load', () => {
                if (!cancelled && window.cv) {
                    overlayCvRef.current = window.cv;
                }
            });
            return () => {
                cancelled = true;
            };
        }
        const script = document.createElement('script');
        script.src = '/opencv_js.js';
        script.async = true;
        script.dataset.overlayCv = 'true';
        script.onload = () => {
            if (!cancelled && window.cv) {
                overlayCvRef.current = window.cv;
            }
        };
        script.onerror = (error) => {
            console.error('Failed to load OpenCV overlay bundle', error);
        };
        document.body.appendChild(script);
        return () => {
            cancelled = true;
        };
    }, []);

    const readBestBlobMeasurement = useCallback<() => BlobSample | null>(() => {
        const meta = processedFrameMetaRef.current;
        const blobs = detectionResultsRef.current;
        if (!meta || !meta.sourceWidth || !meta.sourceHeight || blobs.length === 0) {
            return null;
        }
        const normalized = blobs.map((blob) => {
            const { x: normalizedX, y: normalizedY } = normalizeIsotropic(
                blob.x,
                blob.y,
                meta.sourceWidth,
                meta.sourceHeight,
            );
            const normalizedSize = blob.size / Math.max(meta.sourceWidth, meta.sourceHeight);
            return {
                blob,
                normalizedX,
                normalizedY,
                normalizedSize: Math.max(0, normalizedSize),
            };
        });

        const EPS = 1e-4;
        const bestEntry = normalized.reduce<(typeof normalized)[number] | null>(
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

        if (!bestEntry) {
            return null;
        }
        return {
            x: bestEntry.normalizedX,
            y: bestEntry.normalizedY,
            size: bestEntry.normalizedSize,
            response: bestEntry.blob.response,
            capturedAt: detectionUpdatedAtRef.current || performance.now(),
            sourceWidth: meta.sourceWidth,
            sourceHeight: meta.sourceHeight,
        };
    }, []);

    const captureBlobMeasurement = useStableBlobMeasurement({
        readSample: readBestBlobMeasurement,
        detectionSequenceRef,
    });

    useEffect(() => {
        roiRef.current = roi;
    }, [roi]);

    const { roiEditingMode, overlayHandlers, overlayRef } = useRoiOverlayInteractions({
        roi,
        setRoi,
        roiViewEnabled,
        setRoiViewEnabled,
        roiRef,
        cameraAspectRatio,
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
            const baseRect = options?.displayRectOverride ?? {
                x: 0,
                y: 0,
                width: captureWidth,
                height: captureHeight,
            };
            if (!baseRect.width || !baseRect.height || !width || !height) {
                return;
            }
            const viewportAspect = width / height;
            const contentAspect = baseRect.width / baseRect.height;
            const letterbox = buildLetterboxTransform(contentAspect || 1, viewportAspect || 1);
            const projectCameraValue = (value: number, axis: 'x' | 'y'): number | null => {
                const baseStart = axis === 'x' ? baseRect.x : baseRect.y;
                const baseSize = axis === 'x' ? baseRect.width : baseRect.height;
                if (!baseSize) {
                    return null;
                }
                const normalized = (value - baseStart) / baseSize;
                if (normalized < 0 || normalized > 1 || Number.isNaN(normalized)) {
                    return null;
                }
                const viewportNormalized = cameraToViewport(normalized, axis, letterbox);
                const dimension = axis === 'x' ? width : height;
                return viewportNormalized * dimension;
            };
            const projectCameraDelta = (delta: number, axis: 'x' | 'y'): number => {
                const baseSize = axis === 'x' ? baseRect.width : baseRect.height;
                if (!baseSize) {
                    return 0;
                }
                const viewportDelta = cameraDeltaToViewport(delta / baseSize, axis, letterbox);
                const dimension = axis === 'x' ? width : height;
                return viewportDelta * dimension;
            };
            const projectCameraPoint = (point: {
                x: number;
                y: number;
            }): { x: number; y: number } | null => {
                const projectedX = projectCameraValue(point.x, 'x');
                const projectedY = projectCameraValue(point.y, 'y');
                if (projectedX == null || projectedY == null) {
                    return null;
                }
                return { x: projectedX, y: projectedY };
            };
            const summary = alignmentOverlaySummaryRef.current;
            const blobEntries = detectionResultsRef.current;
            const counterRotationRadians = options?.calibrationOverlayCounterRotationRadians ?? 0;
            const shouldCounterRotateNarrative = Math.abs(counterRotationRadians) > 1e-3;
            const rotatePoint = (point: { x: number; y: number }) => {
                const rotation = options?.rotation;
                if (!rotation || Math.abs(rotation.radians) < 1e-6) {
                    return point;
                }
                const { radians, originX, originY } = rotation;
                const translatedX = point.x - originX;
                const translatedY = point.y - originY;
                const cos = Math.cos(radians);
                const sin = Math.sin(radians);
                return {
                    x: translatedX * cos - translatedY * sin + originX,
                    y: translatedX * sin + translatedY * cos + originY,
                };
            };

            const drawBlobsCanvas = () => {
                if (!blobsOverlayVisibleRef.current || !blobEntries.length) {
                    return;
                }
                ctx.save();
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.003);
                blobEntries.forEach((blob) => {
                    const rotatedPoint = rotatePoint(blob);
                    const projected = projectCameraPoint(rotatedPoint);
                    if (!projected) {
                        return;
                    }
                    const radiusX = projectCameraDelta(blob.size, 'x') / 2;
                    const radiusY = projectCameraDelta(blob.size, 'y') / 2;
                    const radius = Math.max(2, (radiusX + radiusY) / 2);
                    ctx.beginPath();
                    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
                    ctx.stroke();
                });
                ctx.restore();
            };

            const drawGlobalBoundsCanvas = () => {
                const payload = globalBoundsRef.current;
                if (!payload) {
                    return;
                }
                const { bounds, cameraOriginOffset } = payload;
                const normalizedWidth = bounds.x.max - bounds.x.min;
                const normalizedHeight = bounds.y.max - bounds.y.min;
                if (normalizedWidth <= 0 || normalizedHeight <= 0) {
                    return;
                }
                const pxLeft = convertCoordToPixelsX(bounds.x.min + cameraOriginOffset.x);
                const pxTop = convertCoordToPixelsY(bounds.y.min + cameraOriginOffset.y);
                const pxWidth = convertDeltaToPixels(normalizedWidth);
                const pxHeight = convertDeltaToPixels(normalizedHeight);
                const localLeft = projectCameraValue(pxLeft, 'x');
                const localTop = projectCameraValue(pxTop, 'y');
                const rectWidth = projectCameraDelta(pxWidth, 'x');
                const rectHeight = projectCameraDelta(pxHeight, 'y');
                if (rectWidth <= 0 || rectHeight <= 0 || localLeft == null || localTop == null) {
                    return;
                }
                ctx.save();
                ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.004);
                ctx.setLineDash(GLOBAL_BOUNDS_DASH);
                ctx.strokeStyle = GLOBAL_BOUNDS_RGBA;
                ctx.strokeRect(localLeft, localTop, rectWidth, rectHeight);
                ctx.restore();
            };

            const convertCoordToPixelsX = (value: number): number => {
                const iso = centeredToView(value);
                return denormalizeIsotropic(iso, 0, captureWidth, captureHeight).x;
            };
            const convertCoordToPixelsY = (value: number): number => {
                const iso = centeredToView(value);
                return denormalizeIsotropic(0, iso, captureWidth, captureHeight).y;
            };
            const convertDeltaToPixels = (delta: number): number =>
                denormalizeIsotropicDelta(centeredDeltaToView(delta), captureWidth, captureHeight);

            const drawTileBoundsCanvas = () => {
                const payload = tileBoundsOverlayRef.current;
                if (!payload || !payload.entries.length) {
                    return;
                }
                const { entries, cameraOriginOffset } = payload;
                ctx.save();
                ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0035);
                entries.forEach((entry, index) => {
                    const normalizedWidth = entry.bounds.x.max - entry.bounds.x.min;
                    const normalizedHeight = entry.bounds.y.max - entry.bounds.y.min;
                    if (normalizedWidth <= 0 || normalizedHeight <= 0) {
                        return;
                    }
                    const pxLeft = convertCoordToPixelsX(entry.bounds.x.min + cameraOriginOffset.x);
                    const pxTop = convertCoordToPixelsY(entry.bounds.y.min + cameraOriginOffset.y);
                    const pxWidth = convertDeltaToPixels(normalizedWidth);
                    const pxHeight = convertDeltaToPixels(normalizedHeight);
                    const localLeft = projectCameraValue(pxLeft, 'x');
                    const localTop = projectCameraValue(pxTop, 'y');
                    const rectWidth = projectCameraDelta(pxWidth, 'x');
                    const rectHeight = projectCameraDelta(pxHeight, 'y');
                    if (
                        rectWidth <= 0 ||
                        rectHeight <= 0 ||
                        localLeft == null ||
                        localTop == null
                    ) {
                        return;
                    }
                    const color = TILE_BOUNDS_COLORS[index % TILE_BOUNDS_COLORS.length];
                    ctx.strokeStyle = color;
                    ctx.strokeRect(localLeft, localTop, rectWidth, rectHeight);
                    ctx.fillStyle = color;
                    ctx.font = '10px monospace';
                    const labelX = localLeft + 4;
                    const labelY = localTop + 12;
                    if (shouldCounterRotateNarrative) {
                        ctx.save();
                        ctx.translate(labelX, labelY);
                        ctx.rotate(-counterRotationRadians);
                        ctx.fillText(entry.key, 0, 0);
                        ctx.restore();
                    } else {
                        ctx.fillText(entry.key, labelX, labelY);
                    }
                });
                ctx.restore();
            };

            const drawAlignmentCanvas = () => {
                if (!alignmentOverlayVisibleRef.current || !summary?.gridBlueprint) {
                    return;
                }
                const blueprint = summary.gridBlueprint;
                const tileEntries = Object.values(summary.tiles);
                if (!tileEntries.length) {
                    return;
                }
                const spacingX =
                    blueprint.adjustedTileFootprint.width + (blueprint.tileGap?.x ?? 0);
                const spacingY =
                    blueprint.adjustedTileFootprint.height + (blueprint.tileGap?.y ?? 0);
                const offsetX = blueprint.cameraOriginOffset.x;
                const offsetY = blueprint.cameraOriginOffset.y;
                ctx.save();
                ctx.lineWidth = 2;
                const alignmentStrokeColor = formatAlignmentRgba(0.7);
                const alignmentFillColor = formatAlignmentRgba(0.15);
                const alignmentLabelColor = formatAlignmentRgba(0.95);
                tileEntries.forEach((entry) => {
                    const adjustedCenterX =
                        blueprint.gridOrigin.x +
                        entry.tile.col * spacingX +
                        blueprint.adjustedTileFootprint.width / 2;
                    const adjustedCenterY =
                        blueprint.gridOrigin.y +
                        entry.tile.row * spacingY +
                        blueprint.adjustedTileFootprint.height / 2;
                    const normalizedLeft =
                        adjustedCenterX - blueprint.adjustedTileFootprint.width / 2;
                    const normalizedTop =
                        adjustedCenterY - blueprint.adjustedTileFootprint.height / 2;
                    const pxLeft = convertCoordToPixelsX(normalizedLeft + offsetX);
                    const pxTop = convertCoordToPixelsY(normalizedTop + offsetY);
                    const pxWidth = convertDeltaToPixels(blueprint.adjustedTileFootprint.width);
                    const pxHeight = convertDeltaToPixels(blueprint.adjustedTileFootprint.height);
                    const localLeft = projectCameraValue(pxLeft, 'x');
                    const localTop = projectCameraValue(pxTop, 'y');
                    const rectWidth = projectCameraDelta(pxWidth, 'x');
                    const rectHeight = projectCameraDelta(pxHeight, 'y');
                    if (localLeft == null || localTop == null) {
                        return;
                    }
                    const rectCenterX = localLeft + rectWidth / 2;
                    const rectCenterY = localTop + rectHeight / 2;
                    ctx.save();
                    ctx.translate(rectCenterX, rectCenterY);
                    ctx.strokeStyle = alignmentStrokeColor;
                    ctx.fillStyle = alignmentFillColor;
                    ctx.beginPath();
                    ctx.rect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                    ctx.save();
                    ctx.translate(rectCenterX, rectCenterY);
                    if (shouldCounterRotateNarrative) {
                        ctx.rotate(-counterRotationRadians);
                    }
                    ctx.fillStyle = alignmentLabelColor;
                    ctx.font = '10px monospace';
                    ctx.fillText(
                        `[${entry.tile.row},${entry.tile.col}]`,
                        -rectWidth / 2 + 4,
                        -rectHeight / 2 + 12,
                    );
                    ctx.restore();
                    const measurement = entry.homeMeasurement
                        ? rotatePoint({
                              x: entry.homeMeasurement.x + offsetX,
                              y: entry.homeMeasurement.y + offsetY,
                          })
                        : undefined;
                    if (measurement) {
                        const measurementX = projectCameraValue(
                            convertCoordToPixelsX(measurement.x),
                            'x',
                        );
                        const measurementY = projectCameraValue(
                            convertCoordToPixelsY(measurement.y),
                            'y',
                        );
                        if (measurementX == null || measurementY == null) {
                            return;
                        }
                        ctx.fillStyle = '#facc15';
                        ctx.beginPath();
                        ctx.arc(measurementX, measurementY, 4, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.save();
                        ctx.translate(measurementX, measurementY);
                        if (shouldCounterRotateNarrative) {
                            ctx.rotate(-counterRotationRadians);
                        }
                        ctx.fillStyle = '#facc15';
                        ctx.font = '10px monospace';
                        ctx.fillText(`[${entry.tile.row},${entry.tile.col}]`, 6, -6);
                        ctx.restore();
                    }
                });
                ctx.restore();
            };

            const hasGlobalBoundsOverlay = Boolean(globalBoundsRef.current);
            const hasTileBoundsOverlay = Boolean(tileBoundsOverlayRef.current?.entries.length);
            if (
                !blobsOverlayVisibleRef.current &&
                !alignmentOverlayVisibleRef.current &&
                !hasGlobalBoundsOverlay &&
                !hasTileBoundsOverlay
            ) {
                return;
            }

            const cvImpl = overlayCvRef.current;
            const cvRuntimeReady =
                Math.abs(counterRotationRadians) < 1e-3 &&
                Boolean(
                    cvImpl &&
                        cvImpl.Mat &&
                        typeof cvImpl.Mat.zeros === 'function' &&
                        typeof cvImpl.Scalar === 'function' &&
                        typeof cvImpl.Point === 'function' &&
                        typeof cvImpl.imshow === 'function',
                );
            if (!cvRuntimeReady || !cvImpl) {
                drawBlobsCanvas();
                drawAlignmentCanvas();
                drawGlobalBoundsCanvas();
                drawTileBoundsCanvas();
                return;
            }

            const runtime = cvImpl;
            const overlayMat = runtime.Mat.zeros(height, width, runtime.CV_8UC4);
            const drawBlobsCv = () => {
                if (!blobsOverlayVisibleRef.current || !blobEntries.length) {
                    return;
                }
                const circleColor = new runtime.Scalar(68, 68, 239, 230);
                const thickness = Math.max(1, Math.round(Math.min(width, height) * 0.003));
                blobEntries.forEach((blob) => {
                    const rotatedPoint = rotatePoint(blob);
                    const projected = projectCameraPoint(rotatedPoint);
                    if (!projected) {
                        return;
                    }
                    const radius = Math.max(
                        2,
                        Math.round(
                            (projectCameraDelta(blob.size, 'x') +
                                projectCameraDelta(blob.size, 'y')) /
                                4,
                        ),
                    );
                    runtime.circle(
                        overlayMat,
                        new runtime.Point(Math.round(projected.x), Math.round(projected.y)),
                        radius,
                        circleColor,
                        thickness,
                        runtime.LINE_AA,
                    );
                });
            };

            const drawAlignmentCv = () => {
                if (!alignmentOverlayVisibleRef.current || !summary?.gridBlueprint) {
                    return;
                }
                const blueprint = summary.gridBlueprint;
                const tileEntries = Object.values(summary.tiles);
                if (!tileEntries.length) {
                    return;
                }
                const spacingX =
                    blueprint.adjustedTileFootprint.width + (blueprint.tileGap?.x ?? 0);
                const spacingY =
                    blueprint.adjustedTileFootprint.height + (blueprint.tileGap?.y ?? 0);
                const offsetX = blueprint.cameraOriginOffset.x;
                const offsetY = blueprint.cameraOriginOffset.y;
                const squareColor = new runtime.Scalar(
                    ALIGNMENT_TEAL.b,
                    ALIGNMENT_TEAL.g,
                    ALIGNMENT_TEAL.r,
                    150,
                );
                const labelColor = new runtime.Scalar(
                    ALIGNMENT_TEAL.b,
                    ALIGNMENT_TEAL.g,
                    ALIGNMENT_TEAL.r,
                    255,
                );
                const measurementColor = new runtime.Scalar(255, 255, 0, 255);
                tileEntries.forEach((entry) => {
                    const adjustedCenterX =
                        blueprint.gridOrigin.x +
                        entry.tile.col * spacingX +
                        blueprint.adjustedTileFootprint.width / 2;
                    const adjustedCenterY =
                        blueprint.gridOrigin.y +
                        entry.tile.row * spacingY +
                        blueprint.adjustedTileFootprint.height / 2;
                    const normalizedLeft =
                        adjustedCenterX - blueprint.adjustedTileFootprint.width / 2;
                    const normalizedTop =
                        adjustedCenterY - blueprint.adjustedTileFootprint.height / 2;
                    const pxLeft = convertCoordToPixelsX(normalizedLeft + offsetX);
                    const pxTop = convertCoordToPixelsY(normalizedTop + offsetY);
                    const pxWidth = convertDeltaToPixels(blueprint.adjustedTileFootprint.width);
                    const pxHeight = convertDeltaToPixels(blueprint.adjustedTileFootprint.height);
                    const localLeft = projectCameraValue(pxLeft, 'x');
                    const localTop = projectCameraValue(pxTop, 'y');
                    const rectWidth = projectCameraDelta(pxWidth, 'x');
                    const rectHeight = projectCameraDelta(pxHeight, 'y');
                    if (localLeft == null || localTop == null) {
                        return;
                    }
                    const localRight = localLeft + rectWidth;
                    const localBottom = localTop + rectHeight;
                    if (
                        localRight < 0 ||
                        localBottom < 0 ||
                        localLeft > width ||
                        localTop > height
                    ) {
                        return;
                    }
                    const topLeft = new runtime.Point(Math.round(localLeft), Math.round(localTop));
                    const bottomRight = new runtime.Point(
                        Math.round(localRight),
                        Math.round(localBottom),
                    );
                    runtime.rectangle(
                        overlayMat,
                        topLeft,
                        bottomRight,
                        squareColor,
                        2,
                        runtime.LINE_AA,
                    );
                    const label = `[${entry.tile.row},${entry.tile.col}]`;
                    const textOrigin = new cvImpl.Point(
                        Math.round(localLeft + 4),
                        Math.round(localTop + 14),
                    );
                    runtime.putText(
                        overlayMat,
                        label,
                        textOrigin,
                        runtime.FONT_HERSHEY_SIMPLEX,
                        0.35,
                        labelColor,
                        1,
                        runtime.LINE_AA,
                    );
                    const measurement = entry.homeMeasurement
                        ? rotatePoint({
                              x: entry.homeMeasurement.x + offsetX,
                              y: entry.homeMeasurement.y + offsetY,
                          })
                        : undefined;
                    if (measurement) {
                        const measurementX = projectCameraValue(
                            convertCoordToPixelsX(measurement.x),
                            'x',
                        );
                        const measurementY = projectCameraValue(
                            convertCoordToPixelsY(measurement.y),
                            'y',
                        );
                        if (measurementX == null || measurementY == null) {
                            return;
                        }
                        runtime.circle(
                            overlayMat,
                            new runtime.Point(Math.round(measurementX), Math.round(measurementY)),
                            4,
                            measurementColor,
                            runtime.FILLED,
                            runtime.LINE_AA,
                        );
                        const measurementLabel = `[${entry.tile.row},${entry.tile.col}]`;
                        runtime.putText(
                            overlayMat,
                            measurementLabel,
                            new runtime.Point(
                                Math.round(measurementX + 6),
                                Math.round(measurementY - 6),
                            ),
                            runtime.FONT_HERSHEY_SIMPLEX,
                            0.35,
                            measurementColor,
                            1,
                            runtime.LINE_AA,
                        );
                    }
                });
            };

            const drawGlobalBoundsCv = () => {
                const payload = globalBoundsRef.current;
                if (!payload) {
                    return;
                }
                const { bounds, cameraOriginOffset } = payload;
                const normalizedWidth = bounds.x.max - bounds.x.min;
                const normalizedHeight = bounds.y.max - bounds.y.min;
                if (normalizedWidth <= 0 || normalizedHeight <= 0) {
                    return;
                }
                const pxLeft = convertCoordToPixelsX(bounds.x.min + cameraOriginOffset.x);
                const pxTop = convertCoordToPixelsY(bounds.y.min + cameraOriginOffset.y);
                const pxWidth = convertDeltaToPixels(normalizedWidth);
                const pxHeight = convertDeltaToPixels(normalizedHeight);
                const localLeft = projectCameraValue(pxLeft, 'x');
                const localTop = projectCameraValue(pxTop, 'y');
                const rectWidth = projectCameraDelta(pxWidth, 'x');
                const rectHeight = projectCameraDelta(pxHeight, 'y');
                if (rectWidth <= 0 || rectHeight <= 0 || localLeft == null || localTop == null) {
                    return;
                }
                const topLeft = new runtime.Point(Math.round(localLeft), Math.round(localTop));
                const bottomRight = new runtime.Point(
                    Math.round(localLeft + rectWidth),
                    Math.round(localTop + rectHeight),
                );
                const color = new runtime.Scalar(21, 204, 250, 230);
                runtime.rectangle(overlayMat, topLeft, bottomRight, color, 2, runtime.LINE_AA);
            };

            const drawTileBoundsCv = () => {
                const payload = tileBoundsOverlayRef.current;
                if (!payload || !payload.entries.length) {
                    return;
                }
                const { entries, cameraOriginOffset } = payload;
                entries.forEach((entry, index) => {
                    const normalizedWidth = entry.bounds.x.max - entry.bounds.x.min;
                    const normalizedHeight = entry.bounds.y.max - entry.bounds.y.min;
                    if (normalizedWidth <= 0 || normalizedHeight <= 0) {
                        return;
                    }
                    const pxLeft = convertCoordToPixelsX(entry.bounds.x.min + cameraOriginOffset.x);
                    const pxTop = convertCoordToPixelsY(entry.bounds.y.min + cameraOriginOffset.y);
                    const pxWidth = convertDeltaToPixels(normalizedWidth);
                    const pxHeight = convertDeltaToPixels(normalizedHeight);
                    const localLeft = projectCameraValue(pxLeft, 'x');
                    const localTop = projectCameraValue(pxTop, 'y');
                    const rectWidth = projectCameraDelta(pxWidth, 'x');
                    const rectHeight = projectCameraDelta(pxHeight, 'y');
                    if (localLeft == null || localTop == null) {
                        return;
                    }
                    const localRight = localLeft + rectWidth;
                    const localBottom = localTop + rectHeight;
                    if (
                        localRight < 0 ||
                        localBottom < 0 ||
                        localLeft > width ||
                        localTop > height
                    ) {
                        return;
                    }
                    const colorRgb = hexToRgb(
                        TILE_BOUNDS_COLORS[index % TILE_BOUNDS_COLORS.length],
                    );
                    const color = new runtime.Scalar(colorRgb.b, colorRgb.g, colorRgb.r, 230);
                    runtime.rectangle(
                        overlayMat,
                        new runtime.Point(Math.round(localLeft), Math.round(localTop)),
                        new runtime.Point(Math.round(localRight), Math.round(localBottom)),
                        color,
                        2,
                        runtime.LINE_AA,
                    );
                    runtime.putText(
                        overlayMat,
                        entry.key,
                        new runtime.Point(Math.round(localLeft + 4), Math.round(localTop + 14)),
                        runtime.FONT_HERSHEY_SIMPLEX,
                        0.35,
                        color,
                        1,
                        runtime.LINE_AA,
                    );
                });
            };

            try {
                drawBlobsCv();
                drawAlignmentCv();
                drawGlobalBoundsCv();
                drawTileBoundsCv();
                runtime.imshow(canvas, overlayMat);
            } finally {
                overlayMat.delete();
            }
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
        setGlobalBoundsOverlayBounds,
        setTileBoundsOverlayEntries,
        blobsOverlayEnabled,
        setBlobsOverlayEnabled,
    };
};
