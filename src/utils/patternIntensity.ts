import {
    INTENSITY_GAMMA,
    MAX_TILE_INTENSITY,
    MIN_TILE_INTENSITY,
    TILE_PLACEMENT_UNIT,
} from '../constants/pattern';

const clamp01 = (value: number): number => {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
};

export const calculateNormalizedIntensity = (
    overlapCount: number,
    maxOverlapCount: number,
): number => {
    if (overlapCount <= 0 || maxOverlapCount <= 0) {
        return 0;
    }
    if (maxOverlapCount === 1) {
        return 1;
    }
    const normalized = (overlapCount - 1) / (maxOverlapCount - 1);
    return clamp01(normalized);
};

export const calculateDisplayIntensity = (
    overlapCount: number,
    maxOverlapCount: number,
): number => {
    if (maxOverlapCount <= 0) {
        return clamp01(MAX_TILE_INTENSITY);
    }
    const ratio = overlapCount <= 0 ? 0 : overlapCount / maxOverlapCount;
    const eased = ratio <= 0 ? 0 : Math.pow(ratio, INTENSITY_GAMMA);
    const span = MAX_TILE_INTENSITY - MIN_TILE_INTENSITY;
    return clamp01(MIN_TILE_INTENSITY + span * eased);
};

export const intensityToFill = (intensity: number): string => {
    const clamped = clamp01(intensity);
    return `rgba(248, 250, 252, ${clamped.toFixed(3)})`;
};

export const intensityToStroke = (intensity: number): string => {
    const clamped = clamp01(intensity * 0.9 + 0.1);
    return `rgba(226, 232, 240, ${clamped.toFixed(3)})`;
};

export interface TileFootprint {
    id?: string;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
}

export interface CanvasCellIntensity {
    row: number;
    col: number;
    count: number;
    intensity: number;
}

export interface CanvasCoverageResult {
    cells: CanvasCellIntensity[];
    maxCount: number;
}

export interface CanvasRasterField {
    width: number;
    height: number;
    counts: Uint16Array;
    intensities: Float32Array;
    maxCount: number;
    litPixels: number;
}

const clampIndex = (value: number, max: number): number => {
    if (value < 0) return 0;
    if (value > max) return max;
    return value;
};

const clampDimension = (value: number): number => Math.max(1, Math.round(value));

const circleIntersectsRect = (
    centerX: number,
    centerY: number,
    radius: number,
    rectMinX: number,
    rectMinY: number,
    rectMaxX: number,
    rectMaxY: number,
): boolean => {
    const nearestX = Math.max(rectMinX, Math.min(centerX, rectMaxX));
    const nearestY = Math.max(rectMinY, Math.min(centerY, rectMaxY));
    const dx = centerX - nearestX;
    const dy = centerY - nearestY;
    const radiusSq = radius * radius;
    const distanceSq = dx * dx + dy * dy;
    const threshold = Math.max(0, radiusSq - 1e-6);
    return distanceSq <= threshold;
};

export const computeCanvasCoverage = (
    tiles: TileFootprint[],
    canvasRows: number,
    canvasCols: number,
): CanvasCoverageResult => {
    if (tiles.length === 0 || canvasRows <= 0 || canvasCols <= 0) {
        return { cells: [], maxCount: 1 };
    }

    const counts = Array.from({ length: canvasRows }, () => new Array(canvasCols).fill(0));

    tiles.forEach((tile) => {
        const radius = Math.min(tile.width, tile.height) / 2;
        const minX = tile.centerX - radius;
        const maxX = tile.centerX + radius;
        const minY = tile.centerY - radius;
        const maxY = tile.centerY + radius;

        const startCol = clampIndex(Math.floor(minX / TILE_PLACEMENT_UNIT), canvasCols - 1);
        const endCol = clampIndex(Math.floor(maxX / TILE_PLACEMENT_UNIT), canvasCols - 1);
        const startRow = clampIndex(Math.floor(minY / TILE_PLACEMENT_UNIT), canvasRows - 1);
        const endRow = clampIndex(Math.floor(maxY / TILE_PLACEMENT_UNIT), canvasRows - 1);

        for (let row = startRow; row <= endRow; row += 1) {
            for (let col = startCol; col <= endCol; col += 1) {
                const cellMinX = col * TILE_PLACEMENT_UNIT;
                const cellMinY = row * TILE_PLACEMENT_UNIT;
                const cellMaxX = cellMinX + TILE_PLACEMENT_UNIT;
                const cellMaxY = cellMinY + TILE_PLACEMENT_UNIT;
                if (
                    circleIntersectsRect(
                        tile.centerX,
                        tile.centerY,
                        radius,
                        cellMinX,
                        cellMinY,
                        cellMaxX,
                        cellMaxY,
                    )
                ) {
                    counts[row][col] += 1;
                }
            }
        }
    });

    let maxCount = 0;
    const cells: CanvasCellIntensity[] = [];
    for (let row = 0; row < canvasRows; row += 1) {
        for (let col = 0; col < canvasCols; col += 1) {
            const count = counts[row][col];
            if (count > 0) {
                cells.push({
                    row,
                    col,
                    count,
                    intensity: 0,
                });
                maxCount = Math.max(maxCount, count);
            }
        }
    }

    if (maxCount === 0) {
        return { cells: [], maxCount: 1 };
    }

    const enriched = cells.map((cell) => ({
        ...cell,
        intensity: calculateDisplayIntensity(cell.count, maxCount),
    }));

    return { cells: enriched, maxCount };
};

const clampPixel = (value: number, max: number): number => {
    if (value < 0) return 0;
    if (value > max) return max;
    return value;
};

export const rasterizeTileCoverage = (
    tiles: TileFootprint[],
    canvasWidth: number,
    canvasHeight: number,
): CanvasRasterField => {
    const width = clampDimension(canvasWidth);
    const height = clampDimension(canvasHeight);
    const totalPixels = width * height;
    const counts = new Uint16Array(totalPixels);
    const intensities = new Float32Array(totalPixels);

    if (tiles.length === 0 || totalPixels === 0) {
        return {
            width,
            height,
            counts,
            intensities,
            maxCount: 1,
            litPixels: 0,
        };
    }

    let maxCount = 0;
    let litPixels = 0;

    tiles.forEach((tile) => {
        const radius = Math.min(tile.width, tile.height) / 2;
        const minX = clampPixel(Math.floor(tile.centerX - radius), width - 1);
        const maxX = clampPixel(Math.ceil(tile.centerX + radius) - 1, width - 1);
        const minY = clampPixel(Math.floor(tile.centerY - radius), height - 1);
        const maxY = clampPixel(Math.ceil(tile.centerY + radius) - 1, height - 1);

        for (let y = minY; y <= maxY; y += 1) {
            let offset = y * width + minX;
            const rectMinY = y;
            const rectMaxY = y + 1;
            for (let x = minX; x <= maxX; x += 1) {
                const rectMinX = x;
                const rectMaxX = x + 1;
                if (
                    !circleIntersectsRect(
                        tile.centerX,
                        tile.centerY,
                        radius,
                        rectMinX,
                        rectMinY,
                        rectMaxX,
                        rectMaxY,
                    )
                ) {
                    offset += 1;
                    continue;
                }
                const next = counts[offset] + 1;
                counts[offset] = next;
                if (next === 1) {
                    litPixels += 1;
                }
                if (next > maxCount) {
                    maxCount = next;
                }
                offset += 1;
            }
        }
    });

    if (maxCount <= 0) {
        return {
            width,
            height,
            counts,
            intensities,
            maxCount: 1,
            litPixels: 0,
        };
    }

    for (let index = 0; index < totalPixels; index += 1) {
        const count = counts[index];
        intensities[index] = count > 0 ? calculateDisplayIntensity(count, maxCount) : 0;
    }

    return {
        width,
        height,
        counts,
        intensities,
        maxCount,
        litPixels,
    };
};

export interface TileHeatmapIntensity<TTile extends TileFootprint = TileFootprint> {
    tile: TTile;
    count: number;
    intensity: number;
}

export const mapTileIntensitiesFromCoverage = <TTile extends TileFootprint>(
    tiles: TTile[],
    coverage: CanvasCoverageResult,
    canvasRows: number,
    canvasCols: number,
): TileHeatmapIntensity<TTile>[] => {
    if (tiles.length === 0) {
        return [];
    }

    if (coverage.cells.length === 0) {
        return tiles.map((tile) => ({
            tile,
            count: 0,
            intensity: MIN_TILE_INTENSITY,
        }));
    }

    const lookup = new Map<string, CanvasCellIntensity>();
    coverage.cells.forEach((cell) => {
        lookup.set(`${cell.row}-${cell.col}`, cell);
    });

    return tiles.map((tile) => {
        const radius = Math.min(tile.width, tile.height) / 2;
        const minCol = clampIndex(
            Math.floor((tile.centerX - radius) / TILE_PLACEMENT_UNIT),
            canvasCols - 1,
        );
        const maxCol = clampIndex(
            Math.floor((tile.centerX + radius) / TILE_PLACEMENT_UNIT),
            canvasCols - 1,
        );
        const minRow = clampIndex(
            Math.floor((tile.centerY - radius) / TILE_PLACEMENT_UNIT),
            canvasRows - 1,
        );
        const maxRow = clampIndex(
            Math.floor((tile.centerY + radius) / TILE_PLACEMENT_UNIT),
            canvasRows - 1,
        );

        let bestCount = 0;
        let bestIntensity = MIN_TILE_INTENSITY;

        for (let row = minRow; row <= maxRow; row += 1) {
            for (let col = minCol; col <= maxCol; col += 1) {
                const cell = lookup.get(`${row}-${col}`);
                if (!cell) {
                    continue;
                }
                const cellMinX = col * TILE_PLACEMENT_UNIT;
                const cellMinY = row * TILE_PLACEMENT_UNIT;
                const cellMaxX = cellMinX + TILE_PLACEMENT_UNIT;
                const cellMaxY = cellMinY + TILE_PLACEMENT_UNIT;
                if (
                    !circleIntersectsRect(
                        tile.centerX,
                        tile.centerY,
                        radius,
                        cellMinX,
                        cellMinY,
                        cellMaxX,
                        cellMaxY,
                    )
                ) {
                    continue;
                }
                if (cell.count > bestCount) {
                    bestCount = cell.count;
                    bestIntensity = cell.intensity;
                }
            }
        }

        return {
            tile,
            count: bestCount,
            intensity: bestIntensity,
        };
    });
};
