/**
 * Declarative overlay system for camera preview rendering.
 *
 * This module provides:
 * - Type-safe overlay descriptors in centered [-1, 1] coordinate space
 * - Builder functions to convert domain types to overlays
 * - A pure Canvas 2D renderer with projection support
 */

// Types
export type {
    CenteredBounds,
    CenteredPoint,
    CircleOverlay,
    CircleStyle,
    GridOverlay,
    GridStyle,
    Overlay,
    OverlayProjection,
    PointOverlay,
    PointStyle,
    RectOverlay,
    RectStyle,
    SizingMode,
    TileEntry,
} from './types';

// Builders
export {
    buildAllOverlays,
    buildAlignmentGridOverlay,
    buildBlobOverlays,
    buildExpectedPositionOverlay,
    buildTileBoundsOverlays,
} from './builders';

export type {
    AlignmentGridOverlayParams,
    BlobOverlayParams,
    BuildAllOverlaysParams,
    ExpectedPositionOverlayParams,
    TileBoundsOverlayEntry,
    TileBoundsOverlayParams,
} from './builders';

// Renderer
export { projectDelta, projectPoint, renderOverlays } from './renderer';

export type { RenderOptions } from './renderer';

// Projection
export {
    buildLetterboxTransform,
    buildOverlayProjection,
    createPointRotator,
    getRotatedDimensions,
    rotatePointAroundCenter,
    transformRoi,
} from './projection';

export type { BuildProjectionParams, LetterboxTransform, RoiRect } from './projection';
