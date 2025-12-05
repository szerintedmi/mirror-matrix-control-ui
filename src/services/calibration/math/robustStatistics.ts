/**
 * Robust Statistics Module
 *
 * Pure mathematical functions for robust statistical analysis.
 * Used for outlier detection and robust estimators in calibration.
 *
 * Key concepts:
 * - MAD (Median Absolute Deviation): robust measure of variability
 * - Normalized MAD: MAD scaled to be comparable to standard deviation (factor 1.4826)
 * - Outliers: values beyond a threshold number of MADs from median
 */

/**
 * Factor to normalize MAD to be comparable with standard deviation.
 * For a normal distribution, nMAD = MAD * 1.4826 approximates the standard deviation.
 */
export const NORMALIZED_MAD_FACTOR = 1.4826;

/**
 * Default threshold for outlier detection (number of MADs from median).
 * 3 MADs corresponds to ~0.3% of normal variation being classified as outliers.
 */
export const DEFAULT_OUTLIER_MAD_THRESHOLD = 3.0;

/**
 * Compute the median of an array of numbers.
 *
 * @param values - Array of numbers
 * @returns Median value, or 0 for empty arrays
 *
 * @example
 * computeMedian([1, 2, 3]) // 2
 * computeMedian([1, 2, 3, 4]) // 2.5
 * computeMedian([]) // 0
 */
export function computeMedian(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
}

/**
 * Compute the Median Absolute Deviation (MAD) from a given center.
 *
 * MAD = median(|xi - center|)
 *
 * @param values - Array of numbers
 * @param center - Center value (typically the median)
 * @returns MAD value, or 0 for empty arrays
 *
 * @example
 * const median = computeMedian([1, 2, 3, 4, 100]);
 * computeMAD([1, 2, 3, 4, 100], median) // 1
 */
export function computeMAD(values: number[], center: number): number {
    if (values.length === 0) {
        return 0;
    }
    const deviations = values.map((v) => Math.abs(v - center));
    return computeMedian(deviations);
}

/**
 * Compute the normalized MAD (scaled to be comparable to standard deviation).
 *
 * @param values - Array of numbers
 * @param center - Center value (typically the median)
 * @returns Normalized MAD value
 */
export function computeNormalizedMAD(values: number[], center: number): number {
    return computeMAD(values, center) * NORMALIZED_MAD_FACTOR;
}

/**
 * Parameters for outlier detection.
 */
export interface OutlierDetectionParams {
    /** Number of MADs from median to consider a value an outlier. Default: 3.0 */
    madThreshold?: number;
    /** Whether to detect outliers on both sides (high and low) or only high. Default: 'both' */
    direction?: 'both' | 'high' | 'low';
}

/**
 * Result of outlier detection.
 */
export interface OutlierDetectionResult<T = number> {
    /** Values that are NOT outliers */
    inliers: T[];
    /** Values that ARE outliers */
    outliers: T[];
    /** Indices of outlier values in the original array */
    outlierIndices: number[];
    /** Computed median of all values */
    median: number;
    /** Computed MAD (non-normalized) */
    mad: number;
    /** Computed normalized MAD */
    nMad: number;
    /** Threshold used for detection (median + madThreshold * nMad) */
    upperThreshold: number;
    /** Lower threshold (for 'both' or 'low' direction) */
    lowerThreshold: number;
}

/**
 * Detect outliers in an array of numbers using MAD-based detection.
 *
 * Outliers are values that deviate more than `madThreshold` normalized MADs from the median.
 *
 * @param values - Array of numbers to analyze
 * @param params - Detection parameters
 * @returns Outlier detection result with inliers, outliers, and statistics
 *
 * @example
 * const values = [1, 2, 3, 4, 100]; // 100 is an outlier
 * const result = detectOutliers(values, { madThreshold: 3.0 });
 * console.log(result.outliers); // [100]
 * console.log(result.inliers); // [1, 2, 3, 4]
 */
export function detectOutliers(
    values: number[],
    params?: OutlierDetectionParams,
): OutlierDetectionResult<number> {
    const madThreshold = params?.madThreshold ?? DEFAULT_OUTLIER_MAD_THRESHOLD;
    const direction = params?.direction ?? 'both';

    const result: OutlierDetectionResult<number> = {
        inliers: [],
        outliers: [],
        outlierIndices: [],
        median: 0,
        mad: 0,
        nMad: 0,
        upperThreshold: Infinity,
        lowerThreshold: -Infinity,
    };

    if (values.length === 0) {
        return result;
    }

    // Single value: no outliers possible
    if (values.length === 1) {
        result.inliers = [...values];
        result.median = values[0];
        return result;
    }

    const median = computeMedian(values);
    const mad = computeMAD(values, median);
    const nMad = mad * NORMALIZED_MAD_FACTOR;

    result.median = median;
    result.mad = mad;
    result.nMad = nMad;

    // If MAD is 0 (all values identical), no outliers
    if (mad === 0) {
        result.inliers = [...values];
        return result;
    }

    const deviation = madThreshold * nMad;
    result.upperThreshold = median + deviation;
    result.lowerThreshold = median - deviation;

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        let isOutlier = false;

        if (direction === 'both' || direction === 'high') {
            if (value > result.upperThreshold) {
                isOutlier = true;
            }
        }
        if (direction === 'both' || direction === 'low') {
            if (value < result.lowerThreshold) {
                isOutlier = true;
            }
        }

        if (isOutlier) {
            result.outliers.push(value);
            result.outlierIndices.push(i);
        } else {
            result.inliers.push(value);
        }
    }

    return result;
}

/**
 * Detect outliers with associated metadata (e.g., tile keys).
 *
 * @param entries - Array of entries with values and metadata
 * @param getValue - Function to extract the numeric value from an entry
 * @param params - Detection parameters
 * @returns Outlier detection result with original entries
 */
export function detectOutliersWithKeys<T>(
    entries: T[],
    getValue: (entry: T) => number,
    params?: OutlierDetectionParams,
): OutlierDetectionResult<T> {
    const values = entries.map(getValue);
    const numericResult = detectOutliers(values, params);

    const inlierSet = new Set(numericResult.inliers);
    const inliers: T[] = [];
    const outliers: T[] = [];
    const outlierIndices: number[] = [];

    // Track which numeric values we've already matched as inliers
    const inlierCounts = new Map<number, number>();
    for (const v of numericResult.inliers) {
        inlierCounts.set(v, (inlierCounts.get(v) ?? 0) + 1);
    }

    for (let i = 0; i < entries.length; i++) {
        const value = values[i];
        const remaining = inlierCounts.get(value) ?? 0;
        if (remaining > 0 && inlierSet.has(value)) {
            inliers.push(entries[i]);
            inlierCounts.set(value, remaining - 1);
        } else {
            outliers.push(entries[i]);
            outlierIndices.push(i);
        }
    }

    return {
        inliers,
        outliers,
        outlierIndices,
        median: numericResult.median,
        mad: numericResult.mad,
        nMad: numericResult.nMad,
        upperThreshold: numericResult.upperThreshold,
        lowerThreshold: numericResult.lowerThreshold,
    };
}

/**
 * Compute a robust maximum that excludes outliers.
 *
 * Falls back to regular max if:
 * - Array is empty (returns 0)
 * - All values are outliers (returns regular max)
 * - Only one value (returns that value)
 *
 * @param values - Array of numbers
 * @param params - Outlier detection parameters
 * @returns Robust maximum (max of inliers)
 *
 * @example
 * robustMax([1, 2, 3, 4, 100], { madThreshold: 3.0 }) // 4 (100 excluded as outlier)
 * robustMax([1, 2, 3]) // 3 (no outliers)
 */
export function robustMax(values: number[], params?: OutlierDetectionParams): number {
    if (values.length === 0) {
        return 0;
    }
    if (values.length === 1) {
        return values[0];
    }

    const result = detectOutliers(values, { ...params, direction: 'high' });

    // If all values are outliers (shouldn't happen with 'high' direction, but safety check)
    if (result.inliers.length === 0) {
        return Math.max(...values);
    }

    return Math.max(...result.inliers);
}

/**
 * Compute a robust minimum that excludes outliers.
 *
 * @param values - Array of numbers
 * @param params - Outlier detection parameters
 * @returns Robust minimum (min of inliers)
 */
export function robustMin(values: number[], params?: OutlierDetectionParams): number {
    if (values.length === 0) {
        return 0;
    }
    if (values.length === 1) {
        return values[0];
    }

    const result = detectOutliers(values, { ...params, direction: 'low' });

    if (result.inliers.length === 0) {
        return Math.min(...values);
    }

    return Math.min(...result.inliers);
}
