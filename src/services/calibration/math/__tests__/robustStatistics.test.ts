// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
    computeMedian,
    computeMAD,
    computeNormalizedMAD,
    detectOutliers,
    detectOutliersWithKeys,
    robustMax,
    robustMin,
    NORMALIZED_MAD_FACTOR,
    DEFAULT_OUTLIER_MAD_THRESHOLD,
} from '../robustStatistics';

describe('robustStatistics', () => {
    describe('computeMedian', () => {
        it('should return 0 for empty array', () => {
            expect(computeMedian([])).toBe(0);
        });

        it('should return the single value for single-element array', () => {
            expect(computeMedian([42])).toBe(42);
        });

        it('should return the middle value for odd-length array', () => {
            expect(computeMedian([1, 2, 3])).toBe(2);
            expect(computeMedian([5, 1, 3])).toBe(3); // sorts to [1, 3, 5]
            expect(computeMedian([1, 2, 3, 4, 5])).toBe(3);
        });

        it('should return the average of two middle values for even-length array', () => {
            expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
            expect(computeMedian([1, 2])).toBe(1.5);
            expect(computeMedian([10, 20, 30, 40])).toBe(25);
        });

        it('should handle negative values', () => {
            expect(computeMedian([-3, -1, -2])).toBe(-2);
            expect(computeMedian([-10, 0, 10])).toBe(0);
        });

        it('should handle duplicate values', () => {
            expect(computeMedian([5, 5, 5])).toBe(5);
            expect(computeMedian([1, 2, 2, 3])).toBe(2);
        });
    });

    describe('computeMAD', () => {
        it('should return 0 for empty array', () => {
            expect(computeMAD([], 0)).toBe(0);
        });

        it('should return 0 for single value (deviation from itself)', () => {
            expect(computeMAD([5], 5)).toBe(0);
        });

        it('should compute MAD correctly for simple case', () => {
            // Values: [1, 2, 3, 4, 5], median = 3
            // Deviations: [2, 1, 0, 1, 2]
            // MAD = median of deviations = 1
            expect(computeMAD([1, 2, 3, 4, 5], 3)).toBe(1);
        });

        it('should compute MAD correctly with outlier', () => {
            // Values: [1, 2, 3, 4, 100], median = 3
            // Deviations: [2, 1, 0, 1, 97]
            // Sorted deviations: [0, 1, 1, 2, 97]
            // MAD = 1
            expect(computeMAD([1, 2, 3, 4, 100], 3)).toBe(1);
        });

        it('should return 0 when all values are identical', () => {
            expect(computeMAD([5, 5, 5, 5], 5)).toBe(0);
        });
    });

    describe('computeNormalizedMAD', () => {
        it('should multiply MAD by normalization factor', () => {
            const values = [1, 2, 3, 4, 5];
            const median = 3;
            const mad = computeMAD(values, median);
            expect(computeNormalizedMAD(values, median)).toBe(mad * NORMALIZED_MAD_FACTOR);
        });
    });

    describe('detectOutliers', () => {
        it('should return empty result for empty array', () => {
            const result = detectOutliers([]);
            expect(result.inliers).toEqual([]);
            expect(result.outliers).toEqual([]);
            expect(result.outlierIndices).toEqual([]);
            expect(result.median).toBe(0);
        });

        it('should return no outliers for single value', () => {
            const result = detectOutliers([42]);
            expect(result.inliers).toEqual([42]);
            expect(result.outliers).toEqual([]);
            expect(result.median).toBe(42);
        });

        it('should return no outliers when all values are identical', () => {
            const result = detectOutliers([5, 5, 5, 5]);
            expect(result.inliers).toEqual([5, 5, 5, 5]);
            expect(result.outliers).toEqual([]);
            expect(result.mad).toBe(0);
        });

        it('should detect obvious outlier with default threshold', () => {
            // Values: [1, 2, 3, 4, 100]
            // Median = 3, MAD = 1, nMAD = 1.4826
            // Threshold = 3 + 3 * 1.4826 = 7.45
            // 100 > 7.45, so it's an outlier
            const result = detectOutliers([1, 2, 3, 4, 100]);
            expect(result.outliers).toContain(100);
            expect(result.inliers).toEqual([1, 2, 3, 4]);
            expect(result.outlierIndices).toEqual([4]);
        });

        it('should respect custom madThreshold', () => {
            const values = [1, 2, 3, 4, 10];
            // With high threshold, 10 should not be outlier
            const result1 = detectOutliers(values, { madThreshold: 10 });
            expect(result1.outliers).toEqual([]);

            // With low threshold, 10 should be outlier
            const result2 = detectOutliers(values, { madThreshold: 1 });
            expect(result2.outliers).toContain(10);
        });

        it('should detect only high outliers with direction=high', () => {
            const values = [-100, 1, 2, 3, 4, 100];
            const result = detectOutliers(values, { direction: 'high' });
            expect(result.outliers).toEqual([100]);
            expect(result.inliers).toContain(-100);
        });

        it('should detect only low outliers with direction=low', () => {
            const values = [-100, 1, 2, 3, 4, 100];
            const result = detectOutliers(values, { direction: 'low' });
            expect(result.outliers).toEqual([-100]);
            expect(result.inliers).toContain(100);
        });

        it('should detect both high and low outliers with direction=both', () => {
            const values = [-100, 1, 2, 3, 4, 100];
            const result = detectOutliers(values, { direction: 'both' });
            expect(result.outliers).toContain(-100);
            expect(result.outliers).toContain(100);
            expect(result.inliers).toEqual([1, 2, 3, 4]);
        });

        it('should handle two values (edge case)', () => {
            const result = detectOutliers([1, 2]);
            // Median = 1.5, MAD = 0.5
            expect(result.median).toBe(1.5);
            expect(result.mad).toBe(0.5);
            // Neither value should be an outlier with default threshold
            expect(result.outliers).toEqual([]);
        });

        it('should provide correct thresholds in result', () => {
            const values = [1, 2, 3, 4, 5];
            const result = detectOutliers(values);
            expect(result.upperThreshold).toBe(
                result.median + DEFAULT_OUTLIER_MAD_THRESHOLD * result.nMad,
            );
            expect(result.lowerThreshold).toBe(
                result.median - DEFAULT_OUTLIER_MAD_THRESHOLD * result.nMad,
            );
        });
    });

    describe('detectOutliersWithKeys', () => {
        interface TileEntry {
            key: string;
            size: number;
        }

        it('should detect outliers while preserving entry metadata', () => {
            const entries: TileEntry[] = [
                { key: '0-0', size: 0.2 },
                { key: '0-1', size: 0.21 },
                { key: '1-0', size: 0.19 },
                { key: '1-1', size: 0.5 }, // outlier
            ];

            const result = detectOutliersWithKeys(entries, (e) => e.size);

            expect(result.outliers).toHaveLength(1);
            expect(result.outliers[0].key).toBe('1-1');
            expect(result.inliers).toHaveLength(3);
            expect(result.inliers.map((e) => e.key)).toEqual(['0-0', '0-1', '1-0']);
        });

        it('should handle empty array', () => {
            const result = detectOutliersWithKeys<TileEntry>([], (e) => e.size);
            expect(result.inliers).toEqual([]);
            expect(result.outliers).toEqual([]);
        });

        it('should handle duplicate values correctly', () => {
            const entries: TileEntry[] = [
                { key: '0-0', size: 0.2 },
                { key: '0-1', size: 0.2 },
                { key: '1-0', size: 0.2 },
            ];

            const result = detectOutliersWithKeys(entries, (e) => e.size);

            expect(result.outliers).toEqual([]);
            expect(result.inliers).toHaveLength(3);
        });
    });

    describe('robustMax', () => {
        it('should return 0 for empty array', () => {
            expect(robustMax([])).toBe(0);
        });

        it('should return single value for single-element array', () => {
            expect(robustMax([42])).toBe(42);
        });

        it('should exclude high outliers from max', () => {
            // 100 is an outlier, should return max of inliers
            expect(robustMax([1, 2, 3, 4, 100])).toBe(4);
        });

        it('should return regular max when no outliers', () => {
            expect(robustMax([1, 2, 3, 4, 5])).toBe(5);
        });

        it('should return regular max when all are outliers', () => {
            // Edge case: if detection somehow marks all as outliers, fall back to regular max
            // This shouldn't happen with 'high' direction, but test the safety fallback
            const values = [100, 200, 300];
            expect(robustMax(values)).toBe(300);
        });

        it('should respect custom madThreshold', () => {
            const values = [1, 2, 3, 4, 10];
            // With very high threshold, 10 should not be excluded
            expect(robustMax(values, { madThreshold: 100 })).toBe(10);
            // With very low threshold, 10 should be excluded
            expect(robustMax(values, { madThreshold: 1 })).toBe(4);
        });
    });

    describe('robustMin', () => {
        it('should return 0 for empty array', () => {
            expect(robustMin([])).toBe(0);
        });

        it('should return single value for single-element array', () => {
            expect(robustMin([42])).toBe(42);
        });

        it('should exclude low outliers from min', () => {
            expect(robustMin([-100, 1, 2, 3, 4])).toBe(1);
        });

        it('should return regular min when no outliers', () => {
            expect(robustMin([1, 2, 3, 4, 5])).toBe(1);
        });
    });

    describe('constants', () => {
        it('should have correct NORMALIZED_MAD_FACTOR', () => {
            // Standard value for normal distribution
            expect(NORMALIZED_MAD_FACTOR).toBeCloseTo(1.4826, 4);
        });

        it('should have correct DEFAULT_OUTLIER_MAD_THRESHOLD', () => {
            expect(DEFAULT_OUTLIER_MAD_THRESHOLD).toBe(3.0);
        });
    });
});
