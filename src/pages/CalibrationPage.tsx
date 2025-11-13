import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ResolutionOption {
    id: string;
    label: string;
    width?: number;
    height?: number;
}

interface NormalizedRoi {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
}

const RESOLUTION_OPTIONS: ResolutionOption[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'vga', label: '640 x 480', width: 640, height: 480 },
    { id: '720p', label: '1280 x 720', width: 1280, height: 720 },
    { id: '1080p', label: '1920 x 1080', width: 1920, height: 1080 },
    { id: '4k', label: '3840 x 2160', width: 3840, height: 2160 },
];

const DEFAULT_ROI: NormalizedRoi = {
    enabled: true,
    x: 0.15,
    y: 0.15,
    width: 0.7,
    height: 0.7,
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const clampRoi = (roi: NormalizedRoi): NormalizedRoi => {
    const width = Math.min(1, Math.max(0.01, roi.width));
    const height = Math.min(1, Math.max(0.01, roi.height));
    const x = clamp01(Math.min(roi.x, 1 - width));
    const y = clamp01(Math.min(roi.y, 1 - height));
    return {
        enabled: roi.enabled,
        x,
        y,
        width,
        height,
    };
};

const CalibrationPage: React.FC = () => {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
    const [selectedResolutionId, setSelectedResolutionId] = useState<string>('auto');
    const [previewMode, setPreviewMode] = useState<'raw' | 'processed'>('raw');
    const [brightness, setBrightness] = useState(0);
    const [contrast, setContrast] = useState(1);
    const [rotationDegrees, setRotationDegrees] = useState(0);
    const [isRotationAdjusting, setIsRotationAdjusting] = useState(false);
    const [processedFps, setProcessedFps] = useState(0);
    const [cameraStatus, setCameraStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
        'idle',
    );
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [roi, setRoi] = useState<NormalizedRoi>(DEFAULT_ROI);
    const [roiViewEnabled, setRoiViewEnabled] = useState(false);
    const [roiEditingMode, setRoiEditingMode] = useState<'idle' | 'drag' | 'resize' | 'draw'>(
        'idle',
    );
    const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>(
        () => ({ width: 0, height: 0 }),
    );

    const videoRef = useRef<HTMLVideoElement>(null);
    const processedCanvasRef = useRef<HTMLCanvasElement>(null);
    const roiCanvasRef = useRef<HTMLCanvasElement>(null);
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

    const handleRotationPointerDown = () => {
        setIsRotationAdjusting(true);
    };

    const handleRotationPointerUp = () => {
        setIsRotationAdjusting(false);
    };

    const selectedResolution = useMemo<ResolutionOption>(() => {
        return (
            RESOLUTION_OPTIONS.find((option) => option.id === selectedResolutionId) ??
            RESOLUTION_OPTIONS[0]
        );
    }, [selectedResolutionId]);

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
                    width: selectedResolution.width,
                    height: selectedResolution.height,
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
    }, [selectedDeviceId, selectedResolution.height, selectedResolution.width, stopCurrentStream]);

    useEffect(() => {
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
    }, [startStream, stopCurrentStream]);

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

    useEffect(() => {
        let animationFrameId: number;
        let frames = 0;
        let windowStart = performance.now();

        const processFrame = () => {
            const video = videoRef.current;
            const processedCanvas = processedCanvasRef.current;
            if (!video || !processedCanvas) {
                animationFrameId = requestAnimationFrame(processFrame);
                return;
            }
            if (video.readyState < 2) {
                animationFrameId = requestAnimationFrame(processFrame);
                return;
            }
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) {
                animationFrameId = requestAnimationFrame(processFrame);
                return;
            }
            if (processedCanvas.width !== width || processedCanvas.height !== height) {
                processedCanvas.width = width;
                processedCanvas.height = height;
            }
            const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                animationFrameId = requestAnimationFrame(processFrame);
                return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            const frame = ctx.getImageData(0, 0, width, height);
            const data = frame.data;
            const contrastFactor = contrast;
            const brightnessOffset = brightness * 255;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                gray = gray * contrastFactor + brightnessOffset;
                const clamped = Math.max(0, Math.min(255, gray));
                data[i] = clamped;
                data[i + 1] = clamped;
                data[i + 2] = clamped;
            }
            ctx.putImageData(frame, 0, 0);

            let rotatedCanvas = rotatedCanvasRef.current;
            if (!rotatedCanvas && typeof document !== 'undefined') {
                rotatedCanvas = document.createElement('canvas');
                rotatedCanvasRef.current = rotatedCanvas;
            }
            const rotationRadians = (rotationDegrees * Math.PI) / 180;
            let rotatedCtx: CanvasRenderingContext2D | null = null;
            if (rotatedCanvas) {
                if (rotatedCanvas.width !== width || rotatedCanvas.height !== height) {
                    rotatedCanvas.width = width;
                    rotatedCanvas.height = height;
                }
                rotatedCtx = rotatedCanvas.getContext('2d');
                if (rotatedCtx) {
                    rotatedCtx.save();
                    rotatedCtx.clearRect(0, 0, width, height);
                    rotatedCtx.translate(width / 2, height / 2);
                    rotatedCtx.rotate(rotationRadians);
                    rotatedCtx.translate(-width / 2, -height / 2);
                    const sourceForRotation = previewMode === 'processed' ? processedCanvas : video;
                    rotatedCtx.drawImage(sourceForRotation, 0, 0, width, height);
                    rotatedCtx.restore();
                }
            }

            const zoomCanvas = roiCanvasRef.current;
            const currentRoi = roiRef.current;
            if (zoomCanvas && currentRoi.enabled) {
                if (zoomCanvas.width !== width || zoomCanvas.height !== height) {
                    zoomCanvas.width = width;
                    zoomCanvas.height = height;
                }
                const zoomCtx = zoomCanvas.getContext('2d');
                if (zoomCtx) {
                    const sx = currentRoi.x * width;
                    const sy = currentRoi.y * height;
                    const sw = Math.max(1, currentRoi.width * width);
                    const sh = Math.max(1, currentRoi.height * height);
                    zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
                    const roiSource = rotatedCtx && rotatedCanvas
                        ? rotatedCanvas
                        : previewMode === 'processed'
                          ? processedCanvas
                          : video;
                    if (roiSource) {
                        zoomCtx.drawImage(
                            roiSource,
                            sx,
                            sy,
                            sw,
                            sh,
                            0,
                            0,
                            zoomCanvas.width,
                            zoomCanvas.height,
                        );
                    }
                }
            } else if (zoomCanvas) {
                zoomCanvas.getContext('2d')?.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
            }

            frames += 1;
            const now = performance.now();
            if (now - windowStart >= 1000) {
                setProcessedFps(Math.round((frames / (now - windowStart)) * 1000));
                frames = 0;
                windowStart = now;
            }

            animationFrameId = requestAnimationFrame(processFrame);
        };

        animationFrameId = requestAnimationFrame(processFrame);
        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [brightness, contrast, previewMode, rotationDegrees]);

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
            setRoi((prev) => clampRoi({ ...prev, x, y, width, height }));
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
            setRoi(clampRoi(next));
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
            next = clampRoi(next);
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

    const previewAspectRatio = useMemo(() => {
        if (videoDimensions.width > 0 && videoDimensions.height > 0) {
            return videoDimensions.width / videoDimensions.height;
        }
        return 16 / 9;
    }, [videoDimensions.height, videoDimensions.width]);

    const rotationOverlayVisible = isRotationAdjusting;

    const renderPreview = () => {
        const showFullFrame = !roiViewEnabled || !roi.enabled;
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
                                showFullFrame && previewMode === 'raw'
                                    ? 'opacity-100'
                                    : 'opacity-0 pointer-events-none'
                            }`}
                        />
                        <canvas
                            ref={processedCanvasRef}
                            className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
                                showFullFrame && previewMode === 'processed'
                                    ? 'opacity-100'
                                    : 'opacity-0 pointer-events-none'
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
                </div>
            </div>
        );
    };

    return (
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
                                onChange={(event) => setSelectedResolutionId(event.target.value)}
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
                                onChange={(event) => setRotationDegrees(Number(event.target.value))}
                                onPointerDown={handleRotationPointerDown}
                                onPointerUp={handleRotationPointerUp}
                                onPointerLeave={handleRotationPointerUp}
                                onTouchEnd={handleRotationPointerUp}
                                onBlur={handleRotationPointerUp}
                            />
                        </div>
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
    );
};

export default CalibrationPage;
