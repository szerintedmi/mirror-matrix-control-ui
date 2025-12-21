/**
 * Builder functions to convert domain types to overlay descriptors.
 *
 * These functions handle coordinate space normalization at the boundary,
 * converting various domain types into the centered [-1,1] coordinate space
 * used by the overlay renderer.
 */
import { asCentered } from '@/coords';
import type { ExpectedBlobPositionInfo } from '@/hooks/useStableBlobMeasurement';
import {
    computeGridOrigin,
    computeImpliedOrigin,
} from '@/services/calibration/math/gridBlueprintMath';
import type { CalibrationRunSummary } from '@/services/calibration/types';
import type { DetectedBlob } from '@/services/opencvWorkerClient';
import type { CalibrationProfileBounds } from '@/types';

import type {
    CenteredPoint,
    CircleOverlay,
    GridOverlay,
    Overlay,
    PointOverlay,
    RectOverlay,
    TileEntry,
} from './types';

// =============================================================================
// COORDINATE CONVERSION HELPERS
// =============================================================================

/**
 * Convert camera pixel coordinates to centered [-1, 1] coordinates.
 */
const cameraPixelsToCentered = (
    x: number,
    y: number,
    width: number,
    height: number,
): CenteredPoint => {
    // Camera pixels [0, width/height] -> viewport [0, 1] -> centered [-1, 1]
    const vx = x / width;
    const vy = y / height;
    return {
        x: vx * 2 - 1,
        y: vy * 2 - 1,
    };
};

/**
 * Convert viewport coordinates [0, 1] to centered [-1, 1] coordinates.
 */
const viewportToCentered = (x: number, y: number): CenteredPoint => ({
    x: x * 2 - 1,
    y: y * 2 - 1,
});

/**
 * Convert a viewport delta [0, 1] to centered delta [-1, 1] range.
 */
const viewportDeltaToCentered = (delta: number): number => delta * 2;

// =============================================================================
// BLOB OVERLAY BUILDERS
// =============================================================================

export interface BlobOverlayParams {
    blobs: DetectedBlob[];
    sourceWidth: number;
    sourceHeight: number;
    /** Optional rotation to apply to blob positions */
    rotatePoint?: (point: { x: number; y: number }) => { x: number; y: number };
}

/**
 * Build circle overlays for detected blobs.
 *
 * Uses per-axis-average sizing to match the old rendering behavior where
 * the radius was computed by averaging X and Y axis projections independently.
 */
export const buildBlobOverlays = (params: BlobOverlayParams): CircleOverlay[] => {
    const { blobs, sourceWidth, sourceHeight, rotatePoint } = params;

    // Compute average dimension for radius normalization
    // The renderer's per-axis-average mode will project per-axis and average,
    // so we normalize by the average dimension to match old behavior
    const avgDim = (sourceWidth + sourceHeight) / 2;

    return blobs.map((blob) => {
        // Apply rotation if provided
        const rotated = rotatePoint ? rotatePoint(blob) : blob;
        const center = cameraPixelsToCentered(rotated.x, rotated.y, sourceWidth, sourceHeight);
        // Radius: blob.size is diameter in pixels, convert to centered delta
        // Use average dimension for normalization since per-axis-average will handle projection
        const radius = (blob.size / 2 / avgDim) * 2;

        return {
            type: 'circle' as const,
            center,
            radius: Math.max(0.01, radius), // Minimum radius
            style: {
                strokeColor: 'rgba(239, 68, 68, 0.9)',
                sizing: 'per-axis-average' as const,
                lineWidth: 2,
            },
        };
    });
};

// =============================================================================
// EXPECTED POSITION OVERLAY BUILDER
// =============================================================================

export interface ExpectedPositionOverlayParams {
    info: ExpectedBlobPositionInfo;
}

/**
 * Build a point overlay for the expected blob position indicator.
 * Uses cyan color for "search area" indication, visible on both dark and light backgrounds.
 */
export const buildExpectedPositionOverlay = (
    params: ExpectedPositionOverlayParams,
): PointOverlay => {
    const { info } = params;
    const center = viewportToCentered(info.position.x, info.position.y);

    // Calculate radius from maxDistance or use default
    let radius: number;
    if (info.maxDistance !== undefined) {
        radius = viewportDeltaToCentered(info.maxDistance);
    } else {
        radius = 0.1; // Default radius in centered coords
    }

    const toleranceLabel =
        info.maxDistance !== undefined ? ` tol:${(info.maxDistance * 100).toFixed(0)}%` : '';

    return {
        type: 'point' as const,
        position: center,
        radius,
        style: {
            // Cyan - distinct "search area" color, visible on dark and light backgrounds
            color: 'rgba(6, 182, 212, 0.85)',
            sizing: 'isotropic' as const,
            crosshair: true,
            dashed: true,
            lineWidth: 2, // Subtle line weight
            label: `exp: (${info.position.x.toFixed(2)}, ${info.position.y.toFixed(2)})${toleranceLabel}`,
        },
    };
};

// =============================================================================
// ALIGNMENT GRID OVERLAY BUILDER
// =============================================================================

export interface AlignmentGridOverlayParams {
    summary: CalibrationRunSummary;
    /** Rotation function to apply to measurement points */
    rotatePoint?: (point: { x: number; y: number }) => { x: number; y: number };
}

const ALIGNMENT_TEAL_STROKE = 'rgba(16, 185, 129, 0.7)';
const ALIGNMENT_TEAL_FILL = 'rgba(16, 185, 129, 0.15)';
const ALIGNMENT_TEAL_LABEL = 'rgba(16, 185, 129, 0.95)';

/**
 * Build a grid overlay for the alignment grid visualization.
 *
 * Uses pitch-derived spacing for alignment, while rendering tiles as pixel-square
 * using the isotropic blob size when available.
 */
export const buildAlignmentGridOverlay = (
    params: AlignmentGridOverlayParams,
): GridOverlay | null => {
    const { summary, rotatePoint } = params;

    if (!summary.gridBlueprint) {
        return null;
    }

    const blueprint = summary.gridBlueprint;
    const tileEntries = Object.values(summary.tiles);

    if (!tileEntries.length) {
        return null;
    }

    const offsetX = blueprint.cameraOriginOffset.x;
    const offsetY = blueprint.cameraOriginOffset.y;

    // Use pitch-derived footprint for spacing so the grid aligns to measured positions.
    const tileWidth = blueprint.adjustedTileFootprint.width;
    const tileHeight = blueprint.adjustedTileFootprint.height;
    const gapX = blueprint.tileGap?.x ?? 0;
    const gapY = blueprint.tileGap?.y ?? 0;
    const spacingX = tileWidth + gapX;
    const spacingY = tileHeight + gapY;
    const renderTileWidth = undefined;
    const renderTileHeight = undefined;

    // Recompute display origin from measured tiles using size-based spacing.
    const spacing = { spacingX, spacingY };
    const halfTile = { x: tileWidth / 2, y: tileHeight / 2 };
    const impliedOrigins = tileEntries
        .filter((entry) => Boolean(entry.homeMeasurement))
        .map((entry) =>
            computeImpliedOrigin(
                asCentered(entry.homeMeasurement!.x, entry.homeMeasurement!.y),
                { row: entry.tile.row, col: entry.tile.col },
                spacing,
                halfTile,
            ),
        );
    const displayOrigin = impliedOrigins.length
        ? computeGridOrigin(impliedOrigins)
        : blueprint.gridOrigin;

    // Grid origin in centered coords (already in centered space from blueprint)
    const origin: CenteredPoint = {
        x: displayOrigin.x + offsetX,
        y: displayOrigin.y + offsetY,
    };

    // Build tile entries
    const tiles: TileEntry[] = tileEntries.map((entry) => {
        const measurement = entry.homeMeasurement
            ? (() => {
                  const raw = {
                      x: entry.homeMeasurement.x + offsetX,
                      y: entry.homeMeasurement.y + offsetY,
                  };
                  const rotated = rotatePoint ? rotatePoint(raw) : raw;
                  return rotated as CenteredPoint;
              })()
            : undefined;

        return {
            row: entry.tile.row,
            col: entry.tile.col,
            label: `[${entry.tile.row},${entry.tile.col}]`,
            measurement,
        };
    });

    return {
        type: 'grid' as const,
        origin,
        tileWidth,
        tileHeight,
        gapX,
        gapY,
        renderTileWidth,
        renderTileHeight,
        tileSizing: 'isotropic' as const,
        tiles,
        style: {
            strokeColor: ALIGNMENT_TEAL_STROKE,
            fillColor: ALIGNMENT_TEAL_FILL,
            labelColor: ALIGNMENT_TEAL_LABEL,
            lineWidth: 2,
            sizing: 'per-axis' as const,
        },
    };
};

// =============================================================================
// TILE BOUNDS OVERLAY BUILDER
// =============================================================================

export interface TileBoundsOverlayEntry {
    key: string;
    row: number;
    col: number;
    bounds: CalibrationProfileBounds;
}

export interface TileBoundsOverlayParams {
    entries: TileBoundsOverlayEntry[];
    cameraOriginOffset: { x: number; y: number };
}

const TILE_BOUNDS_COLORS = ['#fb7185', '#38bdf8', '#c084fc', '#facc15', '#4ade80', '#f472b6'];

/**
 * Build rectangle overlays for tile bounds visualization.
 */
export const buildTileBoundsOverlays = (params: TileBoundsOverlayParams): RectOverlay[] => {
    const { entries, cameraOriginOffset } = params;

    return entries
        .filter((entry) => {
            const width = entry.bounds.x.max - entry.bounds.x.min;
            const height = entry.bounds.y.max - entry.bounds.y.min;
            return width > 0 && height > 0;
        })
        .map((entry, index) => {
            // Bounds are already in centered coords [-1, 1]
            const minX = entry.bounds.x.min + cameraOriginOffset.x;
            const minY = entry.bounds.y.min + cameraOriginOffset.y;
            const maxX = entry.bounds.x.max + cameraOriginOffset.x;
            const maxY = entry.bounds.y.max + cameraOriginOffset.y;

            const color = TILE_BOUNDS_COLORS[index % TILE_BOUNDS_COLORS.length];

            return {
                type: 'rect' as const,
                bounds: { minX, minY, maxX, maxY },
                style: {
                    strokeColor: color,
                    sizing: 'per-axis' as const, // Tile bounds use per-axis to show actual rectangular reach
                    label: entry.key,
                    lineWidth: 2,
                },
            };
        });
};

// =============================================================================
// COMBINED BUILDER
// =============================================================================

export interface BuildAllOverlaysParams {
    blobs?: BlobOverlayParams;
    expectedPosition?: ExpectedPositionOverlayParams;
    alignmentGrid?: AlignmentGridOverlayParams;
    tileBounds?: TileBoundsOverlayParams;
}

/**
 * Build all overlays from the provided parameters.
 * Returns a flat array of overlays ready for rendering.
 */
export const buildAllOverlays = (params: BuildAllOverlaysParams): Overlay[] => {
    const overlays: Overlay[] = [];

    if (params.blobs) {
        overlays.push(...buildBlobOverlays(params.blobs));
    }

    if (params.expectedPosition) {
        overlays.push(buildExpectedPositionOverlay(params.expectedPosition));
    }

    if (params.alignmentGrid) {
        const gridOverlay = buildAlignmentGridOverlay(params.alignmentGrid);
        if (gridOverlay) {
            overlays.push(gridOverlay);
        }
    }

    if (params.tileBounds) {
        overlays.push(...buildTileBoundsOverlays(params.tileBounds));
    }

    return overlays;
};
