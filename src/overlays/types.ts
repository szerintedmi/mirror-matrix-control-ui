/**
 * Declarative overlay types for camera preview rendering.
 *
 * All positions are normalized to centered coordinates [-1, 1] from the coords kernel.
 * The renderer handles projection to canvas pixels via OverlayProjection.
 */
import type { CenteredCoord } from '@/coords';

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Point in centered coordinate space [-1, 1].
 * Uses branded types from coords kernel for type safety.
 */
export interface CenteredPoint {
    x: CenteredCoord['x'];
    y: CenteredCoord['y'];
}

/**
 * Axis-aligned bounds in centered coordinate space [-1, 1].
 */
export interface CenteredBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * Sizing mode for overlay elements.
 * - 'isotropic': Preserves aspect ratio using min scale (squares stay square)
 * - 'per-axis': Scales independently per axis (rectangles can become non-square)
 * - 'per-axis-average': Projects per-axis then averages (for blob circles matching both axes)
 */
export type SizingMode = 'isotropic' | 'per-axis' | 'per-axis-average';

// =============================================================================
// STYLE TYPES
// =============================================================================

export interface PointStyle {
    color: string;
    sizing: SizingMode;
    crosshair?: boolean;
    dashed?: boolean;
    label?: string;
    labelOffset?: { x: number; y: number };
    /** Line width in pixels (default: 2) */
    lineWidth?: number;
}

export interface CircleStyle {
    strokeColor: string;
    sizing: SizingMode;
    fillColor?: string;
    lineWidth?: number;
    dashed?: boolean;
    label?: string;
    labelOffset?: { x: number; y: number };
}

export interface RectStyle {
    strokeColor: string;
    sizing: SizingMode;
    fillColor?: string;
    lineWidth?: number;
    label?: string;
    labelOffset?: { x: number; y: number };
}

export interface GridStyle {
    strokeColor: string;
    fillColor?: string;
    labelColor?: string;
    lineWidth?: number;
    sizing: SizingMode;
}

// =============================================================================
// OVERLAY TYPES (Discriminated Union)
// =============================================================================

export interface PointOverlay {
    type: 'point';
    position: CenteredPoint;
    /** Radius in centered units (will be scaled by sizing mode) */
    radius: number;
    style: PointStyle;
}

export interface CircleOverlay {
    type: 'circle';
    center: CenteredPoint;
    /** Radius in centered units (will be scaled by sizing mode) */
    radius: number;
    style: CircleStyle;
}

export interface RectOverlay {
    type: 'rect';
    bounds: CenteredBounds;
    style: RectStyle;
}

export interface TileEntry {
    row: number;
    col: number;
    label?: string;
    /** Optional measurement point to render within tile */
    measurement?: CenteredPoint;
}

/**
 * Grid overlay for displaying tile grids with optional measurement points.
 *
 * **Sizing semantics:**
 * - `style.sizing` controls how **spacing** (tileWidth/Height + gap) is projected to canvas.
 *   Use 'per-axis' to align grid positions to the actual rectangular coordinate space.
 * - `tileSizing` controls how **rendered tile rectangles** are projected.
 *   Use 'isotropic' to render square tiles even when spacing is rectangular.
 *
 * Example: Alignment grid uses per-axis spacing (match measured positions) with
 * isotropic tile rendering (squares stay square regardless of aspect ratio).
 */
export interface GridOverlay {
    type: 'grid';
    /** Grid origin in centered coordinates */
    origin: CenteredPoint;
    /** Tile width for spacing calculation in centered units */
    tileWidth: number;
    /** Tile height for spacing calculation in centered units */
    tileHeight: number;
    /** Gap between tiles in centered units */
    gapX: number;
    gapY: number;
    /** Optional render width (decoupled from spacing) in centered units */
    renderTileWidth?: number;
    /** Optional render height (decoupled from spacing) in centered units */
    renderTileHeight?: number;
    /** Sizing mode for tile rendering (defaults to style.sizing) */
    tileSizing?: SizingMode;
    tiles: TileEntry[];
    /** Style for rendering. Note: style.sizing controls spacing projection. */
    style: GridStyle;
}

/**
 * Union of all overlay types.
 * Use discriminated union pattern for type-safe rendering.
 */
export type Overlay = PointOverlay | CircleOverlay | RectOverlay | GridOverlay;

// =============================================================================
// PROJECTION TYPES
// =============================================================================

/**
 * Projection parameters for converting centered coords to canvas pixels.
 * Handles letterboxing and optional ROI cropping.
 *
 * Note: Rotation is handled externally via `counterRotationRadians` (for labels)
 * and `rotatePoint` functions (for coordinates) before overlays are built.
 */
export interface OverlayProjection {
    /** Canvas dimensions in pixels */
    canvasSize: { width: number; height: number };
    /** Capture/source frame dimensions in pixels */
    captureSize: { width: number; height: number };
    /** Letterbox transform parameters */
    letterbox: {
        scaleX: number;
        scaleY: number;
        offsetX: number;
        offsetY: number;
    };
    /** Optional ROI crop rectangle (in capture frame coords 0-1) */
    cropRect?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
