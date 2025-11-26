import React, { useMemo, useState } from 'react';

import {
    DEFAULT_CLAHE_CLIP_LIMIT,
    DEFAULT_CLAHE_TILE_GRID_SIZE,
    RESOLUTION_OPTIONS,
} from '@/constants/calibration';
import type { CameraStatus, PreviewMode } from '@/hooks/useCameraPipeline';
import type { BlobDetectorParams, OpenCvWorkerStatus } from '@/services/opencvWorkerClient';
import type { NormalizedRoi } from '@/types';

interface DetectionSettingsPanelProps {
    devices: MediaDeviceInfo[];
    selectedDeviceId: string;
    onSelectDevice: (deviceId: string) => void;
    selectedResolutionId: string;
    onSelectResolution: (resolutionId: string) => void;
    videoDimensions: { width: number; height: number };
    roi: NormalizedRoi;
    processedFps: number;
    previewMode: PreviewMode;
    detectedBlobCount: number;
    opencvStatus: OpenCvWorkerStatus;
    cameraStatus: CameraStatus;
    cameraError: string | null;
    detectionReady: boolean;
    brightness: number;
    onChangeBrightness: (value: number) => void;
    contrast: number;
    onChangeContrast: (value: number) => void;
    rotationDegrees: number;
    onChangeRotation: (value: number) => void;
    onRotationAdjustStart: () => void;
    onRotationAdjustEnd: () => void;
    claheClipLimit: number;
    onChangeClaheClipLimit: (value: number) => void;
    claheTileGridSize: number;
    onChangeClaheTileGridSize: (value: number) => void;
    blobParams: BlobDetectorParams;
    onUpdateBlobParam: <K extends keyof BlobDetectorParams>(
        key: K,
        value: BlobDetectorParams[K],
    ) => void;
    useWasmDetector: boolean;
    onToggleUseWasmDetector: (value: boolean) => void;
    nativeBlobDetectorAvailable: boolean;
}

const DetectionSettingsPanel: React.FC<DetectionSettingsPanelProps> = ({
    devices,
    selectedDeviceId,
    onSelectDevice,
    selectedResolutionId,
    onSelectResolution,
    videoDimensions,
    roi,
    processedFps,
    previewMode,
    detectedBlobCount,
    opencvStatus,
    cameraStatus,
    cameraError,
    detectionReady,
    brightness,
    onChangeBrightness,
    contrast,
    onChangeContrast,
    rotationDegrees,
    onChangeRotation,
    onRotationAdjustStart,
    onRotationAdjustEnd,
    claheClipLimit,
    onChangeClaheClipLimit,
    claheTileGridSize,
    onChangeClaheTileGridSize,
    blobParams,
    onUpdateBlobParam,
    useWasmDetector,
    onToggleUseWasmDetector,
    nativeBlobDetectorAvailable,
}) => {
    const [showAdvancedDetection, setShowAdvancedDetection] = useState(false);

    const roiPixelSize = useMemo(() => {
        if (!roi.enabled || videoDimensions.width <= 0 || videoDimensions.height <= 0) {
            return null;
        }
        return {
            width: Math.round(roi.width * videoDimensions.width),
            height: Math.round(roi.height * videoDimensions.height),
        };
    }, [roi.enabled, roi.height, roi.width, videoDimensions.height, videoDimensions.width]);

    return (
        <div className="flex flex-col gap-4">
            {/* Detection Readiness Banner */}
            <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                    detectionReady
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-amber-500/40 bg-amber-500/10'
                }`}
            >
                <span
                    className={`h-2.5 w-2.5 rounded-full ${
                        detectionReady ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                    }`}
                />
                <span
                    className={`text-sm font-medium ${
                        detectionReady ? 'text-emerald-200' : 'text-amber-200'
                    }`}
                >
                    {detectionReady ? 'Detection Ready' : 'Initializing…'}
                </span>
                {!detectionReady && (
                    <span className="ml-auto text-xs text-amber-300/70">
                        {cameraStatus !== 'ready' && 'Camera '}
                        {opencvStatus !== 'ready' && 'OpenCV'}
                    </span>
                )}
            </div>

            <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                <h2 className="text-lg font-semibold text-gray-100">Camera Setup</h2>
                <div className="mt-4 grid gap-4">
                    <label className="flex flex-col gap-2 text-sm text-gray-300">
                        Camera Device
                        <select
                            value={selectedDeviceId}
                            onChange={(event) => onSelectDevice(event.target.value)}
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
                            onChange={(event) => onSelectResolution(event.target.value)}
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
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                    <div>
                        Feed:{' '}
                        {videoDimensions.width > 0
                            ? `${videoDimensions.width}×${videoDimensions.height}`
                            : '—'}
                    </div>
                    <div>FPS: {processedFps}</div>
                    {roiPixelSize && (
                        <div>
                            ROI: {roiPixelSize.width}×{roiPixelSize.height}
                        </div>
                    )}
                    {previewMode === 'processed' && <div>Blobs: {detectedBlobCount}</div>}
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
                                onClick={() => onChangeBrightness(0)}
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
                            onChange={(event) => onChangeBrightness(Number(event.target.value))}
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
                                onClick={() => onChangeContrast(1)}
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
                            onChange={(event) => onChangeContrast(Number(event.target.value))}
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
                                onClick={() => onChangeClaheClipLimit(DEFAULT_CLAHE_CLIP_LIMIT)}
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
                            onChange={(event) => onChangeClaheClipLimit(Number(event.target.value))}
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
                                    onChangeClaheTileGridSize(DEFAULT_CLAHE_TILE_GRID_SIZE)
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
                                onChangeClaheTileGridSize(Number(event.target.value))
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
                                onClick={() => onChangeRotation(0)}
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
                            onChange={(event) => onChangeRotation(Number(event.target.value))}
                            onPointerDown={onRotationAdjustStart}
                            onPointerUp={onRotationAdjustEnd}
                            onPointerLeave={onRotationAdjustEnd}
                            onTouchEnd={onRotationAdjustEnd}
                            onBlur={onRotationAdjustEnd}
                        />
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-gray-800 bg-gray-950 p-4 shadow-lg">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-100">Blob Detection</h2>
                    <span className="text-xs text-gray-400">Detected: {detectedBlobCount}</span>
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
                                    onUpdateBlobParam('minThreshold', Number(event.target.value))
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
                                    onUpdateBlobParam('maxThreshold', Number(event.target.value))
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
                                    onUpdateBlobParam('minArea', Number(event.target.value))
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
                                    onUpdateBlobParam('maxArea', Number(event.target.value))
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
                                        checked={useWasmDetector && nativeBlobDetectorAvailable}
                                        onChange={(event) =>
                                            onToggleUseWasmDetector(event.target.checked)
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
                                        onUpdateBlobParam(
                                            'thresholdStep',
                                            Number(event.target.value),
                                        )
                                    }
                                />
                            </label>
                            <label className="flex flex-col gap-2">
                                <span>Min distance ({blobParams.minDistBetweenBlobs} px)</span>
                                <input
                                    type="range"
                                    min={5}
                                    max={100}
                                    step={5}
                                    value={blobParams.minDistBetweenBlobs}
                                    onChange={(event) =>
                                        onUpdateBlobParam(
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
                                        onUpdateBlobParam('filterByConvexity', event.target.checked)
                                    }
                                />
                            </label>
                            <label className="flex flex-col gap-2">
                                <span>Min convexity ({blobParams.minConvexity.toFixed(2)})</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={blobParams.minConvexity}
                                    onChange={(event) =>
                                        onUpdateBlobParam(
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
                                        onUpdateBlobParam('filterByInertia', event.target.checked)
                                    }
                                />
                            </label>
                            <label className="flex flex-col gap-2">
                                <span>Min inertia ({blobParams.minInertiaRatio.toFixed(2)})</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={blobParams.minInertiaRatio}
                                    onChange={(event) =>
                                        onUpdateBlobParam(
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
                                        onUpdateBlobParam(
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
                                        onUpdateBlobParam(
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
                                        onUpdateBlobParam('filterByColor', event.target.checked)
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
                                        onUpdateBlobParam('blobColor', Number(event.target.value))
                                    }
                                    disabled={!blobParams.filterByColor}
                                />
                            </label>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default DetectionSettingsPanel;
