import type { LegacyPattern } from '../types';

export const TILE_PLACEMENT_UNIT = 10;
export const MAX_CANVAS_DIMENSION_UNITS = 1024;
export const MIN_CANVAS_CELLS = 1;
export const MAX_CANVAS_CELLS = Math.max(
    MIN_CANVAS_CELLS,
    Math.floor(MAX_CANVAS_DIMENSION_UNITS / TILE_PLACEMENT_UNIT),
);

export const MIN_TILE_INTENSITY = 0.2;
export const MAX_TILE_INTENSITY = 0.95;
export const INTENSITY_GAMMA = 1.4;
export const SNAP_OVERLAP_EPSILON = 1e-3;
export const FREE_OVERLAP_DISTANCE = TILE_PLACEMENT_UNIT * 0.45;

const SINGLE_PIXEL_CENTER_PATTERN: LegacyPattern = {
    id: 'builtin-single-center',
    name: 'Single Pixel (center)',
    canvas: {
        width: TILE_PLACEMENT_UNIT,
        height: TILE_PLACEMENT_UNIT,
    },
    tiles: [
        {
            id: 'builtin-single-center-tile',
            center: {
                x: TILE_PLACEMENT_UNIT / 2,
                y: TILE_PLACEMENT_UNIT / 2,
            },
            size: {
                width: TILE_PLACEMENT_UNIT,
                height: TILE_PLACEMENT_UNIT,
            },
        },
    ],
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
};

export const BUILTIN_PATTERNS: readonly LegacyPattern[] = Object.freeze([
    SINGLE_PIXEL_CENTER_PATTERN,
]);
