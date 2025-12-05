import { clamp01 } from '@/constants/calibration';
import type { NormalizedRoi } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type CoordSpace = 'camera' | 'viewport' | 'isotropic' | 'centered' | 'pattern';

export type CameraPixels = Brand<{ x: number; y: number }, 'CameraPixels'>;
export type ViewportCoord = Brand<{ x: number; y: number }, 'ViewportCoord'>;
export type IsotropicCoord = Brand<{ x: number; y: number }, 'IsotropicCoord'>;
export type CenteredCoord = Brand<{ x: number; y: number }, 'CenteredCoord'>;
export type PatternCoord = Brand<{ x: number; y: number }, 'PatternCoord'>;

export type CameraPixelsDelta = Brand<number, 'CameraPixelsDelta'>;
export type ViewportDelta = Brand<number, 'ViewportDelta'>;
export type IsotropicDelta = Brand<number, 'IsotropicDelta'>;
export type CenteredDelta = Brand<number, 'CenteredDelta'>;

export type CoordOf<T extends CoordSpace> = T extends 'camera'
    ? CameraPixels
    : T extends 'viewport'
      ? ViewportCoord
      : T extends 'isotropic'
        ? IsotropicCoord
        : T extends 'centered'
          ? CenteredCoord
          : PatternCoord;

export type AnyCoord = CameraPixels | ViewportCoord | IsotropicCoord | CenteredCoord | PatternCoord;

export interface ConvertContext {
    width: number;
    height: number;
    roi?: NormalizedRoi | null;
}

// =============================================================================
// CONSTRUCTORS
// =============================================================================

export const asCameraPixels = (x: number, y: number): CameraPixels => ({ x, y }) as CameraPixels;
export const asViewport = (x: number, y: number): ViewportCoord => ({ x, y }) as ViewportCoord;
export const asIsotropic = (x: number, y: number): IsotropicCoord => ({ x, y }) as IsotropicCoord;
export const asCentered = (x: number, y: number): CenteredCoord => ({ x, y }) as CenteredCoord;
export const asPattern = (x: number, y: number): PatternCoord => ({ x, y }) as PatternCoord;

export const asCameraPixelsDelta = (d: number): CameraPixelsDelta => d as CameraPixelsDelta;
export const asViewportDelta = (d: number): ViewportDelta => d as ViewportDelta;
export const asIsotropicDelta = (d: number): IsotropicDelta => d as IsotropicDelta;
export const asCenteredDelta = (d: number): CenteredDelta => d as CenteredDelta;

// =============================================================================
// INTERNAL CONVERSION HELPERS
// =============================================================================

const toViewport = (coord: AnyCoord, from: CoordSpace, ctx: ConvertContext): ViewportCoord => {
    switch (from) {
        case 'viewport':
            return coord as ViewportCoord;
        case 'camera':
            return asViewport(
                (coord as CameraPixels).x / ctx.width,
                (coord as CameraPixels).y / ctx.height,
            );
        case 'centered':
        case 'pattern': {
            const c = coord as CenteredCoord;
            return asViewport((c.x + 1) / 2, (c.y + 1) / 2);
        }
        case 'isotropic': {
            const c = coord as IsotropicCoord;
            const maxDim = Math.max(ctx.width, ctx.height);
            const offsetX = (maxDim - ctx.width) / 2;
            const offsetY = (maxDim - ctx.height) / 2;
            return asViewport((c.x * maxDim - offsetX) / ctx.width, (c.y * maxDim - offsetY) / ctx.height);
        }
        default:
            return coord as never;
    }
};

const fromViewport = (coord: ViewportCoord, to: CoordSpace, ctx: ConvertContext): AnyCoord => {
    switch (to) {
        case 'viewport':
            return coord;
        case 'camera':
            return asCameraPixels(coord.x * ctx.width, coord.y * ctx.height);
        case 'centered':
            return asCentered(coord.x * 2 - 1, coord.y * 2 - 1);
        case 'pattern':
            return asPattern(coord.x * 2 - 1, coord.y * 2 - 1);
        case 'isotropic': {
            const maxDim = Math.max(ctx.width, ctx.height);
            const offsetX = (maxDim - ctx.width) / 2;
            const offsetY = (maxDim - ctx.height) / 2;
            return asIsotropic(
                clamp01((coord.x * ctx.width + offsetX) / maxDim),
                clamp01((coord.y * ctx.height + offsetY) / maxDim),
            );
        }
        default:
            return coord as never;
    }
};

// =============================================================================
// PUBLIC CONVERSION API
// =============================================================================

export const convert = <TTo extends CoordSpace>(
    coord: AnyCoord,
    from: CoordSpace,
    to: TTo,
    ctx: ConvertContext,
): CoordOf<TTo> => {
    if (from === to) {
        return coord as CoordOf<TTo>;
    }
    const viewport = toViewport(coord, from, ctx);
    return fromViewport(viewport, to, ctx) as CoordOf<TTo>;
};

export const convertDelta = (
    delta: number,
    axis: 'x' | 'y',
    from: CoordSpace,
    to: CoordSpace,
    ctx: ConvertContext,
): number => {
    if (from === to) {
        return delta;
    }

    // Normalize to viewport delta first
    let viewportDelta: number;
    switch (from) {
        case 'camera':
            viewportDelta = axis === 'x' ? delta / ctx.width : delta / ctx.height;
            break;
        case 'centered':
        case 'pattern':
            viewportDelta = delta / 2;
            break;
        case 'isotropic': {
            const maxDim = Math.max(ctx.width, ctx.height);
            const sourceDim = axis === 'x' ? ctx.width : ctx.height;
            viewportDelta = (delta * maxDim) / sourceDim;
            break;
        }
        case 'viewport':
        default:
            viewportDelta = delta;
    }

    // Convert viewport delta to target space
    switch (to) {
        case 'camera': {
            return axis === 'x' ? viewportDelta * ctx.width : viewportDelta * ctx.height;
        }
        case 'centered':
        case 'pattern':
            return viewportDelta * 2;
        case 'isotropic': {
            const maxDim = Math.max(ctx.width, ctx.height);
            const sourceDim = axis === 'x' ? ctx.width : ctx.height;
            return (viewportDelta * sourceDim) / maxDim;
        }
        case 'viewport':
        default:
            return viewportDelta;
    }
};

// =============================================================================
// TRANSFORMER
// =============================================================================

export class Transformer {
    private readonly ctx: ConvertContext;

    constructor(ctx: ConvertContext) {
        this.ctx = ctx;
    }

    withRoi(roi: NormalizedRoi | null): Transformer {
        return new Transformer({ ...this.ctx, roi: roi ?? null });
    }

    toViewport(coord: AnyCoord, from: CoordSpace = 'camera'): ViewportCoord {
        return convert(coord, from, 'viewport', this.ctx);
    }

    toCamera(coord: AnyCoord, from: CoordSpace = 'viewport'): CameraPixels {
        return convert(coord, from, 'camera', this.ctx);
    }

    toCentered(coord: AnyCoord, from: CoordSpace = 'camera'): CenteredCoord {
        return convert(coord, from, 'centered', this.ctx);
    }

    toPattern(coord: AnyCoord, from: CoordSpace = 'camera'): PatternCoord {
        return convert(coord, from, 'pattern', this.ctx);
    }

    toIsotropic(coord: AnyCoord, from: CoordSpace = 'camera'): IsotropicCoord {
        return convert(coord, from, 'isotropic', this.ctx);
    }

    delta(delta: number, axis: 'x' | 'y', from: CoordSpace, to: CoordSpace): number {
        return convertDelta(delta, axis, from, to, this.ctx);
    }
}

export const createTransformer = (ctx: ConvertContext): Transformer => new Transformer(ctx);
