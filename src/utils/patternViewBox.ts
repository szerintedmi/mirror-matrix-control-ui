/**
 * Pattern ViewBox Utilities
 *
 * Functions for computing auto-zoom viewBox from pattern points and calibration tile bounds.
 * Used by PatternDesignerPage to automatically fit content in view.
 */

export interface ViewBoxBounds {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export interface TileBound {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export interface PatternPointLike {
    x: number;
    y: number;
}

export interface ParsedViewBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Default viewBox showing full canvas */
const DEFAULT_VIEWBOX = '0 0 1 1';

/** Minimum viewBox dimension to prevent extreme zoom */
const MIN_VIEWBOX_SIZE = 0.05;

/** Minimum extent in centered space when no calibration tile bounds exist */
const MIN_CENTERED_EXTENT = 0.5;

/**
 * Computes the combined bounding box for auto-zoom.
 * Takes the union of pattern points bbox and calibration tile bounds bbox.
 * Returns bounds in centered space [-1, 1].
 *
 * When no tile bounds exist, uses a minimum extent (±0.5) to prevent
 * over-zooming on just pattern points.
 *
 * @param points - Pattern points in centered space
 * @param tileBounds - Calibration tile bounds in centered space
 * @param blobRadius - Radius of blobs (adds padding around points)
 * @param padding - Additional percentage padding (0.05 = 5%)
 * @returns Bounding box in centered space, or null if no content
 */
export function computeAutoZoomBounds(
    points: PatternPointLike[],
    tileBounds: TileBound[],
    blobRadius: number,
    padding: number = 0.05,
): ViewBoxBounds | null {
    if (points.length === 0 && tileBounds.length === 0) {
        return null;
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    // When no tile bounds, start with a minimum extent centered at origin
    // This prevents over-zooming on just pattern points
    if (tileBounds.length === 0) {
        xMin = -MIN_CENTERED_EXTENT;
        xMax = MIN_CENTERED_EXTENT;
        yMin = -MIN_CENTERED_EXTENT;
        yMax = MIN_CENTERED_EXTENT;
    }

    for (const point of points) {
        xMin = Math.min(xMin, point.x - blobRadius);
        xMax = Math.max(xMax, point.x + blobRadius);
        yMin = Math.min(yMin, point.y - blobRadius);
        yMax = Math.max(yMax, point.y + blobRadius);
    }

    for (const bound of tileBounds) {
        xMin = Math.min(xMin, bound.xMin);
        xMax = Math.max(xMax, bound.xMax);
        yMin = Math.min(yMin, bound.yMin);
        yMax = Math.max(yMax, bound.yMax);
    }

    if (
        !Number.isFinite(xMin) ||
        !Number.isFinite(xMax) ||
        !Number.isFinite(yMin) ||
        !Number.isFinite(yMax)
    ) {
        return null;
    }

    const width = xMax - xMin;
    const height = yMax - yMin;
    const maxDim = Math.max(width, height);
    const paddingAmount = maxDim * padding;

    return {
        xMin: xMin - paddingAmount,
        xMax: xMax + paddingAmount,
        yMin: yMin - paddingAmount,
        yMax: yMax + paddingAmount,
    };
}

/**
 * Converts centered-space bounds to SVG viewBox string.
 * Uses actual content dimensions (not forced square) for better viewport utilization.
 *
 * @param bounds - Bounds in centered space [-1, 1]
 * @returns viewBox string "x y width height" in view space [0, 1]
 */
export function boundsToViewBox(bounds: ViewBoxBounds | null): string {
    if (!bounds) {
        return DEFAULT_VIEWBOX;
    }

    // Convert centered space [-1,1] to view space [0,1]
    const viewXMin = (bounds.xMin + 1) / 2;
    const viewXMax = (bounds.xMax + 1) / 2;
    const viewYMin = (bounds.yMin + 1) / 2;
    const viewYMax = (bounds.yMax + 1) / 2;

    // Use actual content dimensions, enforcing minimum size
    const width = Math.max(viewXMax - viewXMin, MIN_VIEWBOX_SIZE);
    const height = Math.max(viewYMax - viewYMin, MIN_VIEWBOX_SIZE);

    return `${viewXMin} ${viewYMin} ${width} ${height}`;
}

/**
 * Parses a viewBox string into its components.
 *
 * @param viewBox - SVG viewBox string "x y width height"
 * @returns Parsed viewBox object
 */
export function parseViewBox(viewBox: string): ParsedViewBox {
    const parts = viewBox.split(' ').map(Number);
    return {
        x: parts[0] ?? 0,
        y: parts[1] ?? 0,
        width: parts[2] ?? 1,
        height: parts[3] ?? 1,
    };
}

/**
 * Converts screen-relative position to centered coordinates given a viewBox.
 * Used for mouse event handling with dynamic viewBox.
 *
 * @param relX - Relative X position in rendered element [0, 1]
 * @param relY - Relative Y position in rendered element [0, 1]
 * @param viewBox - Current SVG viewBox string "x y width height"
 * @returns Coordinates in centered space [-1, 1]
 */
export function screenToCentered(
    relX: number,
    relY: number,
    viewBox: string,
): { x: number; y: number } {
    const vb = parseViewBox(viewBox);

    // Map from relative [0,1] to viewBox coordinates (view space)
    const viewX = vb.x + relX * vb.width;
    const viewY = vb.y + relY * vb.height;

    // Convert view space [0,1] to centered space [-1,1]
    return {
        x: viewX * 2 - 1,
        y: viewY * 2 - 1,
    };
}

/**
 * Gets the scale factor from a viewBox for scaling stroke widths.
 * Returns the smaller of width/height to ensure strokes don't get too thick.
 *
 * @param viewBox - SVG viewBox string "x y width height"
 * @returns Scale factor relative to default viewBox (1.0)
 */
export function getViewBoxScale(viewBox: string): number {
    const vb = parseViewBox(viewBox);
    return Math.min(vb.width, vb.height);
}
