import React, { act, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { CaptureBlobMeasurement } from '@/services/calibration/types';

import {
    useStableBlobMeasurement,
    type BlobSample,
    type BlobSelectionParams,
    type ExpectedBlobPositionInfo,
} from '../useStableBlobMeasurement';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock the calibration constants to speed up tests
vi.mock('@/constants/calibration', async () => {
    const actual = await vi.importActual('@/constants/calibration');
    return {
        ...actual,
        DETECTION_BLOB_CAPTURE_DELAY_MS: 0,
        DETECTION_BLOB_MIN_SAMPLES: 3,
        DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT: 0.01,
        DETECTION_BLOB_IGNORE_SAMPLE_ABOVE_DEVIATION_PT: 0.05,
    };
});

const createMockSample = (overrides: Partial<BlobSample> = {}): BlobSample => ({
    x: 0.5,
    y: 0.5,
    size: 0.02,
    response: 100,
    capturedAt: Date.now(),
    sourceWidth: 1920,
    sourceHeight: 1080,
    ...overrides,
});

interface TestHarnessProps {
    readSample: (params?: BlobSelectionParams) => BlobSample | null;
    onExpectedPositionChange?: (info: ExpectedBlobPositionInfo | null) => void;
    onCaptureFn: (fn: CaptureBlobMeasurement) => void;
    onSequenceRefReady?: (ref: React.MutableRefObject<number>) => void;
}

const TestHarness: React.FC<TestHarnessProps> = ({
    readSample,
    onExpectedPositionChange,
    onCaptureFn,
    onSequenceRefReady,
}) => {
    const detectionSequenceRef = useRef(0);
    const captureMeasurement = useStableBlobMeasurement({
        readSample,
        detectionSequenceRef,
        onExpectedPositionChange,
    });

    useEffect(() => {
        onCaptureFn(captureMeasurement);
        onSequenceRefReady?.(detectionSequenceRef);
    }, [captureMeasurement, onCaptureFn, onSequenceRefReady]);

    return null;
};

describe('useStableBlobMeasurement', () => {
    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
        vi.useRealTimers();
    });

    describe('coordinate passthrough', () => {
        it('passes expectedPosition directly to readSample without conversion', async () => {
            const readSample = vi.fn<(params?: BlobSelectionParams) => BlobSample | null>();
            readSample.mockImplementation(() => createMockSample());

            let captureFn: CaptureBlobMeasurement | null = null;
            let seqRef: React.MutableRefObject<number> | null = null;

            act(() => {
                root.render(
                    <TestHarness
                        readSample={readSample}
                        onCaptureFn={(fn) => {
                            captureFn = fn;
                        }}
                        onSequenceRefReady={(ref) => {
                            seqRef = ref;
                        }}
                    />,
                );
            });

            const expectedPosition = { x: 0.7, y: 0.3 };
            const measurePromise = captureFn!({
                timeoutMs: 1000,
                expectedPosition,
                maxDistance: 0.25,
            });

            // Simulate detection sequence changes to trigger sample reads
            for (let i = 0; i < 3; i++) {
                seqRef!.current++;
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(50);
                });
            }

            await act(async () => {
                await measurePromise;
            });

            // Verify readSample was called with the exact expectedPosition (no centeredToView conversion)
            // Previously it would convert 0.7 -> (0.7 + 1) / 2 = 0.85, but now it should be 0.7
            expect(readSample).toHaveBeenCalledWith(
                expect.objectContaining({
                    expectedPosition: { x: 0.7, y: 0.3 },
                }),
            );
        });

        it('passes maxDistance directly to readSample without /2 scaling', async () => {
            const readSample = vi.fn<(params?: BlobSelectionParams) => BlobSample | null>();
            readSample.mockImplementation(() => createMockSample());

            let captureFn: CaptureBlobMeasurement | null = null;
            let seqRef: React.MutableRefObject<number> | null = null;

            act(() => {
                root.render(
                    <TestHarness
                        readSample={readSample}
                        onCaptureFn={(fn) => {
                            captureFn = fn;
                        }}
                        onSequenceRefReady={(ref) => {
                            seqRef = ref;
                        }}
                    />,
                );
            });

            const measurePromise = captureFn!({
                timeoutMs: 1000,
                expectedPosition: { x: 0.5, y: 0.5 },
                maxDistance: 0.25,
            });

            for (let i = 0; i < 3; i++) {
                seqRef!.current++;
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(50);
                });
            }

            await act(async () => {
                await measurePromise;
            });

            // Verify maxDistance is passed directly (not divided by 2)
            // Previously it would convert 0.25 -> 0.125, but now it should be 0.25
            expect(readSample).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxDistance: 0.25,
                }),
            );
        });

        it('does not pass selectionParams when expectedPosition is undefined', async () => {
            const readSample = vi.fn<(params?: BlobSelectionParams) => BlobSample | null>();
            readSample.mockImplementation(() => createMockSample());

            let captureFn: CaptureBlobMeasurement | null = null;
            let seqRef: React.MutableRefObject<number> | null = null;

            act(() => {
                root.render(
                    <TestHarness
                        readSample={readSample}
                        onCaptureFn={(fn) => {
                            captureFn = fn;
                        }}
                        onSequenceRefReady={(ref) => {
                            seqRef = ref;
                        }}
                    />,
                );
            });

            const measurePromise = captureFn!({
                timeoutMs: 1000,
            });

            for (let i = 0; i < 3; i++) {
                seqRef!.current++;
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(50);
                });
            }

            await act(async () => {
                await measurePromise;
            });

            expect(readSample).toHaveBeenCalledWith(undefined);
        });
    });

    describe('onExpectedPositionChange callback', () => {
        it('calls onExpectedPositionChange with position and maxDistance', async () => {
            const readSample = vi.fn(() => createMockSample());
            const onExpectedPositionChange =
                vi.fn<(info: ExpectedBlobPositionInfo | null) => void>();

            let captureFn: CaptureBlobMeasurement | null = null;
            let seqRef: React.MutableRefObject<number> | null = null;

            act(() => {
                root.render(
                    <TestHarness
                        readSample={readSample}
                        onExpectedPositionChange={onExpectedPositionChange}
                        onCaptureFn={(fn) => {
                            captureFn = fn;
                        }}
                        onSequenceRefReady={(ref) => {
                            seqRef = ref;
                        }}
                    />,
                );
            });

            const expectedPosition = { x: 0.6, y: 0.4 };
            const maxDistance = 0.15;

            const measurePromise = captureFn!({
                timeoutMs: 1000,
                expectedPosition,
                maxDistance,
            });

            for (let i = 0; i < 3; i++) {
                seqRef!.current++;
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(50);
                });
            }

            await act(async () => {
                await measurePromise;
            });

            expect(onExpectedPositionChange).toHaveBeenCalledWith({
                position: { x: 0.6, y: 0.4 },
                maxDistance: 0.15,
            });
        });

        it('calls onExpectedPositionChange with null when no expectedPosition', async () => {
            const readSample = vi.fn(() => createMockSample());
            const onExpectedPositionChange =
                vi.fn<(info: ExpectedBlobPositionInfo | null) => void>();

            let captureFn: CaptureBlobMeasurement | null = null;
            let seqRef: React.MutableRefObject<number> | null = null;

            act(() => {
                root.render(
                    <TestHarness
                        readSample={readSample}
                        onExpectedPositionChange={onExpectedPositionChange}
                        onCaptureFn={(fn) => {
                            captureFn = fn;
                        }}
                        onSequenceRefReady={(ref) => {
                            seqRef = ref;
                        }}
                    />,
                );
            });

            const measurePromise = captureFn!({
                timeoutMs: 1000,
            });

            for (let i = 0; i < 3; i++) {
                seqRef!.current++;
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(50);
                });
            }

            await act(async () => {
                await measurePromise;
            });

            expect(onExpectedPositionChange).toHaveBeenCalledWith(null);
        });
    });

    describe('measurement aggregation', () => {
        it('returns null when timeout expires without enough samples', async () => {
            const readSample = vi.fn(() => null);

            let captureFn: CaptureBlobMeasurement | null = null;

            act(() => {
                root.render(
                    <TestHarness
                        readSample={readSample}
                        onCaptureFn={(fn) => {
                            captureFn = fn;
                        }}
                    />,
                );
            });

            const measurePromise = captureFn!({
                timeoutMs: 200,
            });

            // Advance past timeout
            await act(async () => {
                await vi.advanceTimersByTimeAsync(250);
            });

            let measurement;
            await act(async () => {
                measurement = await measurePromise;
            });

            expect(measurement).toBeNull();
        });

        it('returns measurement converted to centered coordinates', async () => {
            // Input is in isotropic coords (what readBestBlobMeasurement returns)
            // For 1920x1080: maxDim=1920, offsetY=420
            // These isotropic coords will be converted to viewport, then to centered
            const readSample = vi.fn(() =>
                createMockSample({
                    x: 0.6, // isotropic coords (0 to 1)
                    y: 0.4,
                    size: 0.02,
                }),
            );

            let captureFn: CaptureBlobMeasurement | null = null;
            let seqRef: React.MutableRefObject<number> | null = null;

            act(() => {
                root.render(
                    <TestHarness
                        readSample={readSample}
                        onCaptureFn={(fn) => {
                            captureFn = fn;
                        }}
                        onSequenceRefReady={(ref) => {
                            seqRef = ref;
                        }}
                    />,
                );
            });

            const measurePromise = captureFn!({
                timeoutMs: 1000,
            });

            for (let i = 0; i < 3; i++) {
                seqRef!.current++;
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(50);
                });
            }

            let measurement;
            await act(async () => {
                measurement = await measurePromise;
            });

            // Conversion flow: isotropic -> viewport -> centered
            // For 1920x1080 (16:9): maxDim=1920, offsetY=(1920-1080)/2=420
            //
            // isotropic (0.6, 0.4) -> viewport:
            //   viewportX = (0.6 * 1920 - 0) / 1920 = 0.6
            //   viewportY = (0.4 * 1920 - 420) / 1080 = 348 / 1080 ≈ 0.3222
            //
            // viewport -> centered:
            //   centeredX = 0.6 * 2 - 1 = 0.2
            //   centeredY = 0.3222 * 2 - 1 ≈ -0.3556
            expect(measurement).not.toBeNull();
            expect(measurement!.x).toBeCloseTo(0.2);
            expect(measurement!.y).toBeCloseTo(-0.3556, 3);
        });
    });
});
