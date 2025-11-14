import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { BlobDetectorParams } from '@/services/opencvWorkerClient';

import DetectionSettingsPanel from '../DetectionSettingsPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const blobParams: BlobDetectorParams = {
    thresholdStep: 10,
    minThreshold: 50,
    maxThreshold: 150,
    minArea: 200,
    maxArea: 5000,
    minDistBetweenBlobs: 20,
    minRepeatability: 2,
    filterByArea: true,
    filterByColor: false,
    blobColor: 255,
    filterByCircularity: false,
    minCircularity: 0.5,
    filterByConvexity: false,
    minConvexity: 0.5,
    filterByInertia: false,
    minInertiaRatio: 0.5,
};

describe('DetectionSettingsPanel', () => {
    it('surfaces camera metrics and propagates control events', () => {
        const handlers = {
            onSelectDevice: vi.fn(),
            onSelectResolution: vi.fn(),
            onChangeBrightness: vi.fn(),
            onChangeContrast: vi.fn(),
            onChangeRotation: vi.fn(),
            onRotationAdjustStart: vi.fn(),
            onRotationAdjustEnd: vi.fn(),
            onChangeClaheClipLimit: vi.fn(),
            onChangeClaheTileGridSize: vi.fn(),
            onUpdateBlobParam: vi.fn(),
            onToggleUseWasmDetector: vi.fn(),
        };
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <DetectionSettingsPanel
                    devices={[
                        {
                            deviceId: 'cam-1',
                            kind: 'videoinput',
                            label: 'Camera 1',
                            groupId: '',
                            toJSON() {
                                return this;
                            },
                        } as MediaDeviceInfo,
                    ]}
                    selectedDeviceId="default"
                    onSelectDevice={handlers.onSelectDevice}
                    selectedResolutionId="auto"
                    onSelectResolution={handlers.onSelectResolution}
                    videoDimensions={{ width: 800, height: 600 }}
                    roi={{ enabled: true, x: 0.1, y: 0.1, width: 0.5, height: 0.5 }}
                    processedFps={24}
                    previewMode="processed"
                    detectedBlobCount={3}
                    opencvStatus="ready"
                    opencvInfo={{ version: '4.8.0' } as never}
                    opencvError={null}
                    cameraStatus="ready"
                    cameraError={null}
                    brightness={0.1}
                    onChangeBrightness={handlers.onChangeBrightness}
                    contrast={1.2}
                    onChangeContrast={handlers.onChangeContrast}
                    rotationDegrees={1.5}
                    onChangeRotation={handlers.onChangeRotation}
                    onRotationAdjustStart={handlers.onRotationAdjustStart}
                    onRotationAdjustEnd={handlers.onRotationAdjustEnd}
                    claheClipLimit={2}
                    onChangeClaheClipLimit={handlers.onChangeClaheClipLimit}
                    claheTileGridSize={8}
                    onChangeClaheTileGridSize={handlers.onChangeClaheTileGridSize}
                    blobParams={blobParams}
                    onUpdateBlobParam={handlers.onUpdateBlobParam}
                    useWasmDetector={false}
                    onToggleUseWasmDetector={handlers.onToggleUseWasmDetector}
                    nativeBlobDetectorAvailable
                />,
            );
        });

        expect(container.textContent).toContain('Feed: 800 × 600');
        expect(container.textContent).toContain('ROI: 400 × 300');
        expect(container.textContent).toContain('Detected blobs: 3');
        expect(container.textContent).toContain('OpenCV: 4.8.0');

        const selects = container.querySelectorAll('select');
        expect(selects.length).toBeGreaterThanOrEqual(2);
        act(() => {
            selects[0].value = 'cam-1';
            selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(handlers.onSelectDevice).toHaveBeenCalledWith('cam-1');

        act(() => {
            selects[1].value = 'vga';
            selects[1].dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(handlers.onSelectResolution).toHaveBeenCalledWith('vga');

        const rotationSlider = container.querySelector('#calibration-rotation');
        expect(rotationSlider).not.toBeNull();
        act(() => {
            rotationSlider?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        });
        expect(handlers.onRotationAdjustStart).toHaveBeenCalled();
        act(() => {
            rotationSlider?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        });
        expect(handlers.onRotationAdjustEnd).toHaveBeenCalled();

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
