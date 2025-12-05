/**
 * Blueprint Strategies Module
 *
 * Encapsulates different strategies for computing tile size from blob measurements.
 * Used by summaryComputation to determine the grid blueprint tile footprint.
 *
 * Available strategies:
 * - MaxSizingStrategy: Uses maximum blob size (original behavior)
 * - RobustMaxSizingStrategy: Uses maximum of non-outlier blobs (excludes outliers > 3 MADs)
 */

import {
    detectOutliersWithKeys,
    robustMax,
    DEFAULT_OUTLIER_MAD_THRESHOLD,
    type OutlierDetectionResult,
} from './robustStatistics';

/**
 * Metadata returned by sizing strategies.
 */
export interface SizingStrategyMetadata {
    strategy: string;
    inputCount: number;
    [key: string]: unknown;
}

/**
 * Result of a tile sizing computation.
 */
export interface SizingResult {
    /** Computed tile size (width/height in centered coordinates) */
    tileSize: number;
    /** Strategy-specific metadata for diagnostics/display */
    metadata: SizingStrategyMetadata;
}

/**
 * Interface for tile sizing strategies.
 */
export interface TileSizingStrategy {
    /** Unique name for the strategy */
    readonly name: string;

    /**
     * Compute the tile size from an array of blob sizes.
     *
     * @param tileSizes - Array of measured blob sizes (in centered coordinates)
     * @returns Sizing result with computed size and metadata
     */
    compute(tileSizes: number[]): SizingResult;
}

/**
 * Entry with key for outlier tracking.
 */
export interface TileEntry {
    key: string;
    size: number;
}

/**
 * Extended result for robust sizing that includes outlier information.
 */
export interface RobustSizingResult extends SizingResult {
    metadata: SizingStrategyMetadata & {
        median: number;
        mad: number;
        nMad: number;
        upperThreshold: number;
        outlierCount: number;
        outlierKeys: string[];
        excludedCount: number;
    };
}

/**
 * Maximum sizing strategy.
 * Uses the largest blob size as the tile footprint.
 * This is the original/default behavior.
 */
export class MaxSizingStrategy implements TileSizingStrategy {
    readonly name = 'max';

    compute(tileSizes: number[]): SizingResult {
        if (tileSizes.length === 0) {
            return {
                tileSize: 0,
                metadata: {
                    strategy: this.name,
                    inputCount: 0,
                },
            };
        }

        return {
            tileSize: Math.max(...tileSizes),
            metadata: {
                strategy: this.name,
                inputCount: tileSizes.length,
            },
        };
    }
}

/**
 * Robust maximum sizing strategy.
 * Uses the maximum of non-outlier blob sizes.
 * Outliers are defined as sizes > madThreshold MADs from the median.
 */
export class RobustMaxSizingStrategy implements TileSizingStrategy {
    readonly name = 'robust-max';

    constructor(private readonly madThreshold: number = DEFAULT_OUTLIER_MAD_THRESHOLD) {}

    compute(tileSizes: number[]): RobustSizingResult {
        if (tileSizes.length === 0) {
            return {
                tileSize: 0,
                metadata: {
                    strategy: this.name,
                    inputCount: 0,
                    median: 0,
                    mad: 0,
                    nMad: 0,
                    upperThreshold: 0,
                    outlierCount: 0,
                    outlierKeys: [],
                    excludedCount: 0,
                },
            };
        }

        const tileSize = robustMax(tileSizes, {
            madThreshold: this.madThreshold,
            direction: 'high',
        });

        // We need the full detection result for metadata
        // (robustMax only returns the value, not the stats)
        const entries: TileEntry[] = tileSizes.map((size, i) => ({
            key: `tile-${i}`,
            size,
        }));
        const detection = detectOutliersWithKeys(entries, (e) => e.size, {
            madThreshold: this.madThreshold,
            direction: 'high',
        });

        return {
            tileSize,
            metadata: {
                strategy: this.name,
                inputCount: tileSizes.length,
                median: detection.median,
                mad: detection.mad,
                nMad: detection.nMad,
                upperThreshold: detection.upperThreshold,
                outlierCount: detection.outliers.length,
                outlierKeys: detection.outliers.map((e) => e.key),
                excludedCount: detection.outliers.length,
            },
        };
    }

    /**
     * Compute with tile entries that have meaningful keys.
     * Returns full outlier detection results with original keys preserved.
     */
    computeWithKeys(entries: TileEntry[]): {
        result: RobustSizingResult;
        outlierDetection: OutlierDetectionResult<TileEntry>;
    } {
        if (entries.length === 0) {
            return {
                result: {
                    tileSize: 0,
                    metadata: {
                        strategy: this.name,
                        inputCount: 0,
                        median: 0,
                        mad: 0,
                        nMad: 0,
                        upperThreshold: 0,
                        outlierCount: 0,
                        outlierKeys: [],
                        excludedCount: 0,
                    },
                },
                outlierDetection: {
                    inliers: [],
                    outliers: [],
                    outlierIndices: [],
                    median: 0,
                    mad: 0,
                    nMad: 0,
                    upperThreshold: Infinity,
                    lowerThreshold: -Infinity,
                },
            };
        }

        const detection = detectOutliersWithKeys(entries, (e) => e.size, {
            madThreshold: this.madThreshold,
            direction: 'high',
        });

        // Compute robust max from inliers
        const tileSize =
            detection.inliers.length > 0
                ? Math.max(...detection.inliers.map((e) => e.size))
                : Math.max(...entries.map((e) => e.size));

        return {
            result: {
                tileSize,
                metadata: {
                    strategy: this.name,
                    inputCount: entries.length,
                    median: detection.median,
                    mad: detection.mad,
                    nMad: detection.nMad,
                    upperThreshold: detection.upperThreshold,
                    outlierCount: detection.outliers.length,
                    outlierKeys: detection.outliers.map((e) => e.key),
                    excludedCount: detection.outliers.length,
                },
            },
            outlierDetection: detection,
        };
    }
}

/**
 * Configuration for tile sizing strategy selection.
 */
export interface TileSizingConfig {
    /** Whether to use robust sizing (excludes outliers). Default: true */
    enabled?: boolean;
    /** MAD threshold for outlier detection. Default: 3.0 */
    madThreshold?: number;
}

/**
 * Create a tile sizing strategy based on configuration.
 *
 * @param config - Sizing configuration
 * @returns Appropriate strategy instance
 */
export function createSizingStrategy(config?: TileSizingConfig): TileSizingStrategy {
    if (config?.enabled === false) {
        return new MaxSizingStrategy();
    }
    return new RobustMaxSizingStrategy(config?.madThreshold ?? DEFAULT_OUTLIER_MAD_THRESHOLD);
}

/**
 * Default sizing strategy (robust max with 3 MAD threshold).
 */
export const defaultSizingStrategy = new RobustMaxSizingStrategy();
