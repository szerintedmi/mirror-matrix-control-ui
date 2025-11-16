import { useCallback, type MutableRefObject } from 'react';

import {
    DETECTION_BLOB_CAPTURE_DELAY_MS,
    DETECTION_BLOB_IGNORE_SAMPLE_ABOVE_DEVIATION_PT,
    DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT,
    DETECTION_BLOB_MIN_SAMPLES,
} from '@/constants/calibration';
import type {
    BlobMeasurement,
    BlobMeasurementStats,
    CaptureBlobMeasurement,
} from '@/services/calibrationRunner';

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

const computeMedian = (values: number[]): number => {
    if (!values.length) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
};

export interface BlobSample {
    x: number;
    y: number;
    size: number;
    response: number;
    capturedAt: number;
    sourceWidth: number;
    sourceHeight: number;
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

    const medianX = computeMedian(xValues);
    const medianY = computeMedian(yValues);
    const medianSize = computeMedian(sizeValues);
    const medianResponse = computeMedian(responseValues);

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
        medianAbsoluteDeviation: {
            x: madX,
            y: madY,
            size: madSize,
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

interface UseStableBlobMeasurementParams {
    readSample: () => BlobSample | null;
    detectionSequenceRef: MutableRefObject<number>;
}

export const useStableBlobMeasurement = ({
    readSample,
    detectionSequenceRef,
}: UseStableBlobMeasurementParams): CaptureBlobMeasurement => {
    return useCallback<CaptureBlobMeasurement>(
        async ({ timeoutMs, signal }) => {
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
                    const sample = readSample();
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
                            return measurement;
                        }
                    }
                }
                await waitFor(50, signal);
            }
            return null;
        },
        [detectionSequenceRef, readSample],
    );
};
