import { useCallback, type MutableRefObject } from 'react';

import {
    DETECTION_BLOB_CAPTURE_DELAY_MS,
    DETECTION_BLOB_IGNORE_SAMPLE_ABOVE_DEVIATION_PT,
    DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT,
    DETECTION_BLOB_MIN_SAMPLES,
} from '@/constants/calibration';
import { asViewport, convert, convertDelta } from '@/coords';
import { computeMedian } from '@/services/calibration/math/robustStatistics';
import type { CaptureBlobMeasurement } from '@/services/calibration/types';
import type { BlobMeasurement, BlobMeasurementStats } from '@/types';

/** Parameters for blob selection when reading a sample. */
export interface BlobSelectionParams {
    /** Expected blob position in view coordinates (0 to 1). If provided, selects closest blob. */
    expectedPosition?: { x: number; y: number };
    /** Maximum distance from expected position to accept a blob (view coords). */
    maxDistance?: number;
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

export interface BlobSample {
    x: number;
    y: number;
    size: number;
    response: number;
    capturedAt: number;
    sourceWidth: number;
    sourceHeight: number;
    roiWidth?: number;
    roiHeight?: number;
}

const aggregateBlobSamples = (
    samples: BlobSample[],
): {
    measurement: BlobMeasurement;
    stats: BlobMeasurementStats;
    maxMedianAbsoluteDeviation: number;
    deviationX: number[];
    deviationY: number[];
    deviationSize: number[];
    madX: number;
    madY: number;
    madSize: number;
} => {
    const xValues = samples.map((sample) => sample.x);
    const yValues = samples.map((sample) => sample.y);
    const sizeValues = samples.map((sample) => sample.size);
    const responseValues = samples.map((sample) => sample.response ?? 0);

    console.log('[BlobAggregate] Sample sizes:', sizeValues);
    console.log('[BlobAggregate] Sample count:', samples.length);
    console.log(
        '[BlobAggregate] First sample roiWidth:',
        samples[0]?.roiWidth,
        'roiHeight:',
        samples[0]?.roiHeight,
    );

    const medianX = computeMedian(xValues);
    const medianY = computeMedian(yValues);
    const medianSize = computeMedian(sizeValues);
    const medianResponse = computeMedian(responseValues);

    console.log('[BlobAggregate] Median size:', medianSize);

    const deviationX = xValues.map((value) => Math.abs(value - medianX));
    const deviationY = yValues.map((value) => Math.abs(value - medianY));
    const deviationSize = sizeValues.map((value) => Math.abs(value - medianSize));

    const madX = computeMedian(deviationX);
    const madY = computeMedian(deviationY);
    const madSize = computeMedian(deviationSize);

    const maxDeviation = Math.max(...deviationX, ...deviationY, ...deviationSize);
    const maxMedianAbsoluteDeviation = Math.max(madX, madY, madSize);
    const threshold = DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT;
    const passed = maxDeviation <= threshold && maxMedianAbsoluteDeviation <= threshold;

    const NORMALIZED_MAD_FACTOR = 1.4826;
    const stats: BlobMeasurementStats = {
        sampleCount: samples.length,
        thresholds: {
            minSamples: DETECTION_BLOB_MIN_SAMPLES,
            maxMedianDeviationPt: DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT,
        },
        median: {
            x: medianX,
            y: medianY,
            size: medianSize,
        },
        nMad: {
            x: madX * NORMALIZED_MAD_FACTOR,
            y: madY * NORMALIZED_MAD_FACTOR,
            size: madSize * NORMALIZED_MAD_FACTOR,
        },
        passed,
    };

    const lastSample = samples[samples.length - 1];
    const measurement: BlobMeasurement = {
        x: medianX,
        y: medianY,
        size: medianSize,
        response: medianResponse,
        capturedAt: lastSample.capturedAt,
        sourceWidth: lastSample.sourceWidth,
        sourceHeight: lastSample.sourceHeight,
        roiWidth: lastSample.roiWidth,
        roiHeight: lastSample.roiHeight,
        stats,
    };

    return {
        measurement,
        stats,
        maxMedianAbsoluteDeviation,
        deviationX,
        deviationY,
        deviationSize,
        madX,
        madY,
        madSize,
    };
};

const isSampleWithinIgnoreThreshold = (sample: BlobSample, accepted: BlobSample[]): boolean => {
    if (!accepted.length) {
        return true;
    }
    const medianX = computeMedian(accepted.map((entry) => entry.x));
    const medianY = computeMedian(accepted.map((entry) => entry.y));
    const medianSize = computeMedian(accepted.map((entry) => entry.size));
    const threshold = DETECTION_BLOB_IGNORE_SAMPLE_ABOVE_DEVIATION_PT;
    return (
        Math.abs(sample.x - medianX) <= threshold &&
        Math.abs(sample.y - medianY) <= threshold &&
        Math.abs(sample.size - medianSize) <= threshold
    );
};

const formatSampleList = (samples: BlobSample[]): string =>
    samples
        .map(
            (sample, index) =>
                `#${index}:x=${sample.x.toFixed(4)},y=${sample.y.toFixed(4)},size=${sample.size.toFixed(4)}`,
        )
        .join(' | ');

interface BuildErrorMessageParams {
    maxMedianAbsoluteDeviation: number;
    samples: BlobSample[];
    deviationX: number[];
    deviationY: number[];
    deviationSize: number[];
    madX: number;
    madY: number;
    madSize: number;
}

const buildUnstableErrorMessage = ({
    maxMedianAbsoluteDeviation,
    samples,
    deviationX,
    deviationY,
    deviationSize,
    madX,
    madY,
    madSize,
}: BuildErrorMessageParams): string => {
    const medianExceeded = maxMedianAbsoluteDeviation > DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT;
    const axisMaxPairs = [
        { axis: 'x', max: Math.max(...deviationX), mad: madX },
        { axis: 'y', max: Math.max(...deviationY), mad: madY },
        { axis: 'size', max: Math.max(...deviationSize), mad: madSize },
    ];
    const failingAxis = axisMaxPairs.reduce((worst, current) => {
        if (medianExceeded) {
            return current.mad > worst.mad ? current : worst;
        }
        return current.max > worst.max ? current : worst;
    }, axisMaxPairs[0]);
    const failingValue = medianExceeded ? failingAxis.mad : failingAxis.max;
    const descriptor = medianExceeded ? 'median deviation' : 'sample deviation';
    return `Blob measurement unstable: ${descriptor} (${failingAxis.axis}) ${failingValue.toFixed(4)} exceeds ${DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT.toFixed(4)} (samples=${formatSampleList(samples)})`;
};

const convertMeasurementToCentered = (measurement: BlobMeasurement): BlobMeasurement => {
    // Source dimensions are always present when this function is called
    // (measurements come from BlobSample which has required sourceWidth/sourceHeight)
    const sourceWidth = measurement.sourceWidth!;
    const sourceHeight = measurement.sourceHeight!;

    // For position conversion, always use full-frame context (positions are in full-frame space)
    const positionCtx = { width: sourceWidth, height: sourceHeight } as const;

    // Sizes are normalized to the full frame, so convert using the full-frame context
    // to stay consistent with position conversion.
    const sizeCtx = positionCtx;

    // Convert viewport [0,1] → centered [-1,1]; measurements now originate in viewport space.
    const viewportCoord = asViewport(measurement.x, measurement.y);
    const centeredCoord = convert(viewportCoord, 'viewport', 'centered', positionCtx);
    const centeredSize = convertDelta(measurement.size, 'x', 'viewport', 'centered', sizeCtx);

    const convertStats = measurement.stats
        ? {
              ...measurement.stats,
              thresholds: {
                  ...measurement.stats.thresholds,
                  maxMedianDeviationPt: measurement.stats.thresholds.maxMedianDeviationPt * 2,
              },
              median: (() => {
                  const medianViewport = asViewport(
                      measurement.stats.median.x,
                      measurement.stats.median.y,
                  );
                  const medianCentered = convert(
                      medianViewport,
                      'viewport',
                      'centered',
                      positionCtx,
                  );
                  return {
                      x: medianCentered.x,
                      y: medianCentered.y,
                      size: convertDelta(
                          measurement.stats.median.size,
                          'x',
                          'viewport',
                          'centered',
                          sizeCtx,
                      ),
                  };
              })(),
              nMad: {
                  x: convertDelta(
                      measurement.stats.nMad.x,
                      'x',
                      'viewport',
                      'centered',
                      positionCtx,
                  ),
                  y: convertDelta(
                      measurement.stats.nMad.y,
                      'y',
                      'viewport',
                      'centered',
                      positionCtx,
                  ),
                  size: convertDelta(
                      measurement.stats.nMad.size,
                      'x',
                      'viewport',
                      'centered',
                      sizeCtx,
                  ),
              },
          }
        : undefined;

    return {
        ...measurement,
        x: centeredCoord.x,
        y: centeredCoord.y,
        size: centeredSize,
        stats: convertStats,
    };
};

/** Expected position info for debug overlay display */
export interface ExpectedBlobPositionInfo {
    /** Position in view coords (0 to 1) */
    position: { x: number; y: number };
    /** Max distance threshold for accepting a blob (view coords) */
    maxDistance?: number;
}

interface UseStableBlobMeasurementParams {
    readSample: (params?: BlobSelectionParams) => BlobSample | null;
    detectionSequenceRef: MutableRefObject<number>;
    /** Optional callback to set the expected position for debug overlay display */
    onExpectedPositionChange?: (info: ExpectedBlobPositionInfo | null) => void;
}

export const useStableBlobMeasurement = ({
    readSample,
    detectionSequenceRef,
    onExpectedPositionChange,
}: UseStableBlobMeasurementParams): CaptureBlobMeasurement => {
    return useCallback<CaptureBlobMeasurement>(
        async ({ timeoutMs, signal, expectedPosition, maxDistance }) => {
            // Update debug overlay with expected position and tolerance (in view coords 0-1)
            onExpectedPositionChange?.(
                expectedPosition ? { position: expectedPosition, maxDistance } : null,
            );

            // Expected position and max distance are already in view coords (0 to 1)
            const selectionParams: BlobSelectionParams | undefined =
                expectedPosition || maxDistance !== undefined
                    ? { expectedPosition, maxDistance }
                    : undefined;
            if (DETECTION_BLOB_CAPTURE_DELAY_MS > 0) {
                await waitFor(DETECTION_BLOB_CAPTURE_DELAY_MS, signal);
            }
            const start = performance.now();
            const samples: BlobSample[] = [];
            let baselineSequence = detectionSequenceRef.current;
            while (performance.now() - start < timeoutMs) {
                if (signal?.aborted) {
                    throw new Error('Calibration measurement aborted');
                }
                const sequenceChanged = detectionSequenceRef.current !== baselineSequence;
                if (sequenceChanged) {
                    baselineSequence = detectionSequenceRef.current;
                    const sample = readSample(selectionParams);
                    if (sample) {
                        if (!isSampleWithinIgnoreThreshold(sample, samples)) {
                            continue;
                        }
                        samples.push(sample);
                        if (samples.length >= DETECTION_BLOB_MIN_SAMPLES) {
                            const {
                                measurement,
                                stats,
                                maxMedianAbsoluteDeviation,
                                deviationX,
                                deviationY,
                                deviationSize,
                                madX,
                                madY,
                                madSize,
                            } = aggregateBlobSamples(samples);
                            if (!stats.passed) {
                                throw new Error(
                                    buildUnstableErrorMessage({
                                        maxMedianAbsoluteDeviation,
                                        samples,
                                        deviationX,
                                        deviationY,
                                        deviationSize,
                                        madX,
                                        madY,
                                        madSize,
                                    }),
                                );
                            }
                            return convertMeasurementToCentered(measurement);
                        }
                    }
                }
                await waitFor(50, signal);
            }
            return null;
        },
        [detectionSequenceRef, onExpectedPositionChange, readSample],
    );
};
