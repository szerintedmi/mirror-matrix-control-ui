/**
 * Canvas 2D overlay renderer.
 *
 * Pure function that renders declarative overlay descriptors to a canvas context.
 * All coordinate conversion is handled via OverlayProjection.
 */
import type {
    CenteredPoint,
    CircleOverlay,
    GridOverlay,
    Overlay,
    OverlayProjection,
    PointOverlay,
    RectOverlay,
    SizingMode,
} from './types';

// =============================================================================
// PROJECTION HELPERS
// =============================================================================

/**
 * Convert centered coordinate [-1, 1] to viewport coordinate [0, 1].
 */
const centeredToViewport = (value: number): number => (value + 1) / 2;

/**
 * Project a centered point to canvas pixels using the projection parameters.
 */
const projectPoint = (
    point: CenteredPoint,
    projection: OverlayProjection,
): { x: number; y: number } => {
    const { canvasSize, captureSize, letterbox, cropRect } = projection;

    // Convert centered [-1,1] to viewport [0,1]
    const vx = centeredToViewport(point.x);
    const vy = centeredToViewport(point.y);

    let normalizedX: number;
    let normalizedY: number;

    if (cropRect) {
        // Convert viewport to full-frame capture pixels
        const fullFramePx = vx * captureSize.width;
        const fullFramePy = vy * captureSize.height;

        // Calculate crop region in pixels
        const cropX = cropRect.x * captureSize.width;
        const cropY = cropRect.y * captureSize.height;
        const cropWidth = cropRect.width * captureSize.width;
        const cropHeight = cropRect.height * captureSize.height;

        // Map full-frame pixels to crop-relative normalized coordinates [0, 1]
        normalizedX = (fullFramePx - cropX) / cropWidth;
        normalizedY = (fullFramePy - cropY) / cropHeight;
    } else {
        // No crop, use viewport coordinates directly
        normalizedX = vx;
        normalizedY = vy;
    }

    // Apply letterbox transform to get canvas pixels
    const { scaleX, scaleY, offsetX, offsetY } = letterbox;
    const canvasX = normalizedX * canvasSize.width * scaleX + offsetX;
    const canvasY = normalizedY * canvasSize.height * scaleY + offsetY;

    return { x: canvasX, y: canvasY };
};

/**
 * Project a delta (size/radius) to canvas pixels.
 * @param delta - Delta in centered units [-2, 2] range (full span)
 * @param sizing - Whether to use isotropic or per-axis scaling
 * @param axis - Which axis to use for per-axis scaling (defaults to average for isotropic)
 */
const projectDelta = (
    delta: number,
    sizing: SizingMode,
    projection: OverlayProjection,
    axis?: 'x' | 'y',
): number => {
    const { canvasSize, letterbox } = projection;

    // Convert centered delta to viewport delta (centered range is 2, viewport range is 1)
    const viewportDelta = delta / 2;

    // NOTE: We don't scale by cropRect here because the letterbox transform
    // is already calculated based on the crop's aspect ratio when cropRect is active.
    // The canvas size represents the crop size, so we just use letterbox + canvas directly.

    if (sizing === 'isotropic') {
        // Use minimum scale to preserve aspect ratio
        const minScale = Math.min(letterbox.scaleX, letterbox.scaleY);
        const avgCanvasSize = (canvasSize.width + canvasSize.height) / 2;
        return viewportDelta * minScale * avgCanvasSize;
    }

    if (sizing === 'per-axis-average') {
        // Project per-axis then average (matches old blob rendering behavior)
        const projectedX = viewportDelta * letterbox.scaleX * canvasSize.width;
        const projectedY = viewportDelta * letterbox.scaleY * canvasSize.height;
        return (projectedX + projectedY) / 2;
    }

    // Per-axis scaling
    if (axis === 'x') {
        return viewportDelta * letterbox.scaleX * canvasSize.width;
    } else if (axis === 'y') {
        return viewportDelta * letterbox.scaleY * canvasSize.height;
    }

    // Default to average (shouldn't happen with proper usage)
    const avgScale = (letterbox.scaleX + letterbox.scaleY) / 2;
    const avgSize = (canvasSize.width + canvasSize.height) / 2;
    return viewportDelta * avgScale * avgSize;
};

// =============================================================================
// OVERLAY RENDERERS
// =============================================================================

const renderPoint = (
    ctx: CanvasRenderingContext2D,
    overlay: PointOverlay,
    projection: OverlayProjection,
): void => {
    const { position, radius, style } = overlay;
    const projected = projectPoint(position, projection);
    const projectedRadius = projectDelta(radius, style.sizing, projection);

    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.lineWidth = style.lineWidth ?? 2;

    if (style.dashed) {
        ctx.setLineDash([8, 4]);
    }

    // Draw circle
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, projectedRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw crosshair if enabled
    if (style.crosshair) {
        const crossSize = projectedRadius * 0.3;
        ctx.beginPath();
        ctx.moveTo(projected.x - crossSize, projected.y);
        ctx.lineTo(projected.x + crossSize, projected.y);
        ctx.moveTo(projected.x, projected.y - crossSize);
        ctx.lineTo(projected.x, projected.y + crossSize);
        ctx.stroke();
    }

    // Draw label if provided
    if (style.label) {
        ctx.setLineDash([]);
        ctx.font = '12px monospace';
        const labelX = projected.x + projectedRadius + (style.labelOffset?.x ?? 5);
        const labelY = projected.y + (style.labelOffset?.y ?? 4);
        ctx.fillText(style.label, labelX, labelY);
    }

    ctx.restore();
};

const renderCircle = (
    ctx: CanvasRenderingContext2D,
    overlay: CircleOverlay,
    projection: OverlayProjection,
): void => {
    const { center, radius, style } = overlay;
    const projected = projectPoint(center, projection);
    const projectedRadius = projectDelta(radius, style.sizing, projection);

    ctx.save();
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = style.lineWidth ?? Math.max(1, projectedRadius * 0.05);

    if (style.dashed) {
        ctx.setLineDash([8, 4]);
    }

    ctx.beginPath();
    ctx.arc(projected.x, projected.y, projectedRadius, 0, Math.PI * 2);

    if (style.fillColor) {
        ctx.fillStyle = style.fillColor;
        ctx.fill();
    }
    ctx.stroke();

    // Draw label if provided
    if (style.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = style.strokeColor;
        ctx.font = '10px monospace';
        const labelX = projected.x + (style.labelOffset?.x ?? 6);
        const labelY = projected.y + (style.labelOffset?.y ?? -6);
        ctx.fillText(style.label, labelX, labelY);
    }

    ctx.restore();
};

const renderRect = (
    ctx: CanvasRenderingContext2D,
    overlay: RectOverlay,
    projection: OverlayProjection,
    counterRotationRadians?: number,
): void => {
    const { bounds, style } = overlay;
    const topLeft = projectPoint({ x: bounds.minX, y: bounds.minY }, projection);

    // For rectangles, we project width and height per-axis to show actual rectangular bounds
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const projectedWidth = projectDelta(
        width,
        style.sizing,
        projection,
        style.sizing === 'per-axis' ? 'x' : undefined,
    );
    const projectedHeight = projectDelta(
        height,
        style.sizing,
        projection,
        style.sizing === 'per-axis' ? 'y' : undefined,
    );

    ctx.save();
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth =
        style.lineWidth ?? Math.max(1, Math.min(projectedWidth, projectedHeight) * 0.02);

    if (style.fillColor) {
        ctx.fillStyle = style.fillColor;
        ctx.fillRect(topLeft.x, topLeft.y, projectedWidth, projectedHeight);
    }
    ctx.strokeRect(topLeft.x, topLeft.y, projectedWidth, projectedHeight);

    // Draw label if provided
    if (style.label) {
        ctx.fillStyle = style.strokeColor;
        ctx.font = '10px monospace';
        const labelX = topLeft.x + (style.labelOffset?.x ?? 4);
        const labelY = topLeft.y + (style.labelOffset?.y ?? 12);

        if (counterRotationRadians && Math.abs(counterRotationRadians) > 1e-3) {
            ctx.save();
            ctx.translate(labelX, labelY);
            ctx.rotate(-counterRotationRadians);
            ctx.fillText(style.label, 0, 0);
            ctx.restore();
        } else {
            ctx.fillText(style.label, labelX, labelY);
        }
    }

    ctx.restore();
};

const renderGrid = (
    ctx: CanvasRenderingContext2D,
    overlay: GridOverlay,
    projection: OverlayProjection,
    counterRotationRadians?: number,
): void => {
    const {
        origin,
        tileWidth,
        tileHeight,
        gapX,
        gapY,
        tiles,
        style,
        renderTileWidth,
        renderTileHeight,
        tileSizing,
    } = overlay;

    ctx.save();
    ctx.lineWidth = style.lineWidth ?? 2;
    ctx.strokeStyle = style.strokeColor;
    ctx.fillStyle = style.fillColor ?? 'transparent';

    // Project origin to canvas coords
    const originProjected = projectPoint(origin, projection);

    const spacingSizing = style.sizing;
    const resolvedTileSizing = tileSizing ?? spacingSizing;

    // Project spacing using the sizing mode from style (per-axis by default)
    const projectedSpacingTileWidth = projectDelta(tileWidth, spacingSizing, projection, 'x');
    const projectedSpacingTileHeight = projectDelta(tileHeight, spacingSizing, projection, 'y');
    const projectedGapX = projectDelta(gapX, spacingSizing, projection, 'x');
    const projectedGapY = projectDelta(gapY, spacingSizing, projection, 'y');
    const projectedSpacingX = projectedSpacingTileWidth + projectedGapX;
    const projectedSpacingY = projectedSpacingTileHeight + projectedGapY;

    let projectedTileWidth: number;
    let projectedTileHeight: number;

    if (
        resolvedTileSizing === 'isotropic' &&
        renderTileWidth === undefined &&
        renderTileHeight === undefined
    ) {
        // Auto-fit square tiles within spacing so they never overlap the gap on either axis.
        const fillSize = Math.max(
            0,
            Math.min(
                projectedSpacingTileWidth - projectedGapX,
                projectedSpacingTileHeight - projectedGapY,
            ),
        );
        projectedTileWidth = fillSize;
        projectedTileHeight = fillSize;
    } else {
        const tileWidthForRender = renderTileWidth ?? tileWidth;
        const tileHeightForRender = renderTileHeight ?? tileHeight;
        projectedTileWidth = projectDelta(
            tileWidthForRender,
            resolvedTileSizing,
            projection,
            resolvedTileSizing === 'per-axis' ? 'x' : undefined,
        );
        projectedTileHeight = projectDelta(
            tileHeightForRender,
            resolvedTileSizing,
            projection,
            resolvedTileSizing === 'per-axis' ? 'y' : undefined,
        );
    }

    for (const tile of tiles) {
        // Calculate tile center in canvas coords
        const projectedCenter = {
            x: originProjected.x + tile.col * projectedSpacingX + projectedSpacingTileWidth / 2,
            y: originProjected.y + tile.row * projectedSpacingY + projectedSpacingTileHeight / 2,
        };

        const halfWidth = projectedTileWidth / 2;
        const halfHeight = projectedTileHeight / 2;

        // Draw tile rectangle
        ctx.beginPath();
        ctx.rect(
            projectedCenter.x - halfWidth,
            projectedCenter.y - halfHeight,
            projectedTileWidth,
            projectedTileHeight,
        );
        if (style.fillColor) {
            ctx.fill();
        }
        ctx.stroke();

        // Draw tile label
        const label = tile.label ?? `[${tile.row},${tile.col}]`;
        ctx.fillStyle = style.labelColor ?? style.strokeColor;
        ctx.font = '10px monospace';

        const labelX = projectedCenter.x - halfWidth + 4;
        const labelY = projectedCenter.y - halfHeight + 12;

        if (counterRotationRadians && Math.abs(counterRotationRadians) > 1e-3) {
            ctx.save();
            ctx.translate(labelX, labelY);
            ctx.rotate(-counterRotationRadians);
            ctx.fillText(label, 0, 0);
            ctx.restore();
        } else {
            ctx.fillText(label, labelX, labelY);
        }

        // Draw measurement point if provided
        if (tile.measurement) {
            const measurementProjected = projectPoint(tile.measurement, projection);
            ctx.fillStyle = '#facc15'; // Yellow
            ctx.beginPath();
            ctx.arc(measurementProjected.x, measurementProjected.y, 4, 0, Math.PI * 2);
            ctx.fill();

            // Measurement label
            ctx.font = '10px monospace';
            if (counterRotationRadians && Math.abs(counterRotationRadians) > 1e-3) {
                ctx.save();
                ctx.translate(measurementProjected.x + 6, measurementProjected.y - 6);
                ctx.rotate(-counterRotationRadians);
                ctx.fillText(label, 0, 0);
                ctx.restore();
            } else {
                ctx.fillText(label, measurementProjected.x + 6, measurementProjected.y - 6);
            }
        }

        // Reset fill style for next iteration
        ctx.fillStyle = style.fillColor ?? 'transparent';
    }

    ctx.restore();
};

// =============================================================================
// MAIN RENDER FUNCTION
// =============================================================================

export interface RenderOptions {
    /** Counter-rotation for labels when canvas is rotated */
    counterRotationRadians?: number;
}

/**
 * Render an array of overlay descriptors to a canvas context.
 *
 * @param ctx - Canvas 2D rendering context
 * @param overlays - Array of overlay descriptors to render
 * @param projection - Projection parameters for coordinate conversion
 * @param options - Optional rendering options
 */
export const renderOverlays = (
    ctx: CanvasRenderingContext2D,
    overlays: Overlay[],
    projection: OverlayProjection,
    options?: RenderOptions,
): void => {
    const counterRotationRadians = options?.counterRotationRadians ?? 0;

    for (const overlay of overlays) {
        switch (overlay.type) {
            case 'point':
                renderPoint(ctx, overlay, projection);
                break;
            case 'circle':
                renderCircle(ctx, overlay, projection);
                break;
            case 'rect':
                renderRect(ctx, overlay, projection, counterRotationRadians);
                break;
            case 'grid':
                renderGrid(ctx, overlay, projection, counterRotationRadians);
                break;
        }
    }
};

// =============================================================================
// EXPORTS
// =============================================================================

export { projectPoint, projectDelta };
