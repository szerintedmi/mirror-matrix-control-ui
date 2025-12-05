// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
    MaxSizingStrategy,
    RobustMaxSizingStrategy,
    createSizingStrategy,
    defaultSizingStrategy,
    type TileEntry,
} from '../blueprintStrategies';

describe('blueprintStrategies', () => {
    describe('MaxSizingStrategy', () => {
        const strategy = new MaxSizingStrategy();

        it('should have correct name', () => {
            expect(strategy.name).toBe('max');
        });

        it('should return 0 for empty array', () => {
            const result = strategy.compute([]);
            expect(result.tileSize).toBe(0);
            expect(result.metadata.inputCount).toBe(0);
        });

        it('should return the maximum value', () => {
            const result = strategy.compute([0.1, 0.2, 0.3, 0.4, 0.5]);
            expect(result.tileSize).toBe(0.5);
            expect(result.metadata.inputCount).toBe(5);
        });

        it('should not exclude any outliers', () => {
            // Even extreme values are included
            const result = strategy.compute([0.1, 0.2, 0.3, 1.0]);
            expect(result.tileSize).toBe(1.0);
        });

        it('should include strategy name in metadata', () => {
            const result = strategy.compute([0.1, 0.2]);
            expect(result.metadata.strategy).toBe('max');
        });
    });

    describe('RobustMaxSizingStrategy', () => {
        const strategy = new RobustMaxSizingStrategy();

        it('should have correct name', () => {
            expect(strategy.name).toBe('robust-max');
        });

        it('should return 0 for empty array', () => {
            const result = strategy.compute([]);
            expect(result.tileSize).toBe(0);
            expect(result.metadata.inputCount).toBe(0);
            expect(result.metadata.outlierCount).toBe(0);
        });

        it('should exclude outliers from max calculation', () => {
            // 1.0 is clearly an outlier among 0.1-0.2 range values
            const result = strategy.compute([0.1, 0.15, 0.12, 0.18, 1.0]);
            expect(result.tileSize).toBeLessThan(1.0);
            expect(result.tileSize).toBeCloseTo(0.18, 2);
            expect(result.metadata.outlierCount).toBe(1);
        });

        it('should return regular max when no outliers', () => {
            const result = strategy.compute([0.1, 0.12, 0.14, 0.16, 0.18]);
            expect(result.tileSize).toBe(0.18);
            expect(result.metadata.outlierCount).toBe(0);
        });

        it('should include statistical metadata', () => {
            const result = strategy.compute([0.1, 0.2, 0.3, 0.4, 0.5]);
            expect(result.metadata.median).toBeCloseTo(0.3, 5);
            expect(result.metadata.mad).toBeGreaterThan(0);
            expect(result.metadata.nMad).toBeGreaterThan(0);
            expect(result.metadata.upperThreshold).toBeGreaterThan(0);
        });

        it('should respect custom madThreshold', () => {
            const sensitiveStrategy = new RobustMaxSizingStrategy(1.0);
            const tolerantStrategy = new RobustMaxSizingStrategy(10.0);

            const values = [0.1, 0.12, 0.14, 0.16, 0.3];

            const sensitiveResult = sensitiveStrategy.compute(values);
            const tolerantResult = tolerantStrategy.compute(values);

            // Sensitive strategy should exclude 0.3
            expect(sensitiveResult.metadata.outlierCount).toBeGreaterThan(0);
            expect(sensitiveResult.tileSize).toBeLessThan(0.3);

            // Tolerant strategy should include 0.3
            expect(tolerantResult.metadata.outlierCount).toBe(0);
            expect(tolerantResult.tileSize).toBe(0.3);
        });

        describe('computeWithKeys', () => {
            it('should preserve tile keys in outlier detection', () => {
                const entries: TileEntry[] = [
                    { key: '0-0', size: 0.2 },
                    { key: '0-1', size: 0.21 },
                    { key: '1-0', size: 0.19 },
                    { key: '1-1', size: 0.5 }, // outlier
                ];

                const { result, outlierDetection } = strategy.computeWithKeys(entries);

                expect(result.metadata.outlierCount).toBe(1);
                expect(result.metadata.outlierKeys).toContain('1-1');
                expect(outlierDetection.outliers[0].key).toBe('1-1');
            });

            it('should compute correct robust max from inliers', () => {
                const entries: TileEntry[] = [
                    { key: '0-0', size: 0.2 },
                    { key: '0-1', size: 0.25 },
                    { key: '1-0', size: 0.22 },
                    { key: '1-1', size: 0.8 }, // outlier
                ];

                const { result } = strategy.computeWithKeys(entries);

                // Max of inliers is 0.25
                expect(result.tileSize).toBeCloseTo(0.25, 2);
            });

            it('should fall back to regular max if all are outliers', () => {
                // Edge case: shouldn't happen with 'high' direction, but test safety
                const entries: TileEntry[] = [
                    { key: '0-0', size: 100 },
                    { key: '0-1', size: 200 },
                ];

                const { result } = strategy.computeWithKeys(entries);

                // Should still return a value
                expect(result.tileSize).toBeGreaterThan(0);
            });

            it('should handle empty entries', () => {
                const { result, outlierDetection } = strategy.computeWithKeys([]);

                expect(result.tileSize).toBe(0);
                expect(result.metadata.inputCount).toBe(0);
                expect(outlierDetection.inliers).toEqual([]);
            });
        });
    });

    describe('createSizingStrategy', () => {
        it('should return RobustMaxSizingStrategy by default', () => {
            const strategy = createSizingStrategy();
            expect(strategy.name).toBe('robust-max');
        });

        it('should return RobustMaxSizingStrategy when enabled is true', () => {
            const strategy = createSizingStrategy({ enabled: true });
            expect(strategy.name).toBe('robust-max');
        });

        it('should return MaxSizingStrategy when enabled is false', () => {
            const strategy = createSizingStrategy({ enabled: false });
            expect(strategy.name).toBe('max');
        });

        it('should pass madThreshold to RobustMaxSizingStrategy', () => {
            const strategy = createSizingStrategy({ madThreshold: 5.0 });
            expect(strategy).toBeInstanceOf(RobustMaxSizingStrategy);

            // Test that the threshold is applied
            const values = [0.1, 0.15, 0.2, 0.35];
            const result = strategy.compute(values);
            // With threshold 5.0, 0.35 should not be an outlier
            expect(result.tileSize).toBe(0.35);
        });
    });

    describe('defaultSizingStrategy', () => {
        it('should be a RobustMaxSizingStrategy', () => {
            expect(defaultSizingStrategy).toBeInstanceOf(RobustMaxSizingStrategy);
            expect(defaultSizingStrategy.name).toBe('robust-max');
        });
    });
});
