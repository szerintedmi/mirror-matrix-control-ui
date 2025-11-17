import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { MIRROR_DIMENSION_M, MIRROR_PITCH_M } from '../constants/projection';

import { deriveWallBasis } from './orientation';

import type {
    LegacyPattern,
    LegacyPatternCanvas,
    ProjectionFootprint,
    ProjectionSettings,
    ProjectedSpot,
} from '../types';

const safeRows = (rows: number): number => Math.max(1, Math.round(rows));
const safeCols = (cols: number): number => Math.max(1, Math.round(cols));

export const inferGridFromCanvas = (
    canvas: LegacyPatternCanvas,
): { rows: number; cols: number } => ({
    rows: safeRows(canvas.height / TILE_PLACEMENT_UNIT),
    cols: safeCols(canvas.width / TILE_PLACEMENT_UNIT),
});

export const calculateProjectionSpan = (
    gridSize: { rows: number; cols: number },
    settings: ProjectionSettings,
): { width: number; height: number; arrayWidth: number; arrayHeight: number } => {
    const rows = safeRows(gridSize.rows);
    const cols = safeCols(gridSize.cols);

    const arrayWidth = Math.max(cols * MIRROR_PITCH_M, MIRROR_DIMENSION_M);
    const arrayHeight = Math.max(rows * MIRROR_PITCH_M, MIRROR_DIMENSION_M);

    const stepX = settings.pixelSpacing.x;
    const stepY = settings.pixelSpacing.y;

    const projectedWidth =
        cols <= 1 ? MIRROR_DIMENSION_M : Math.max((cols - 1) * stepX, MIRROR_DIMENSION_M);
    const projectedHeight =
        rows <= 1 ? MIRROR_DIMENSION_M : Math.max((rows - 1) * stepY, MIRROR_DIMENSION_M);

    return {
        width: projectedWidth,
        height: projectedHeight,
        arrayWidth,
        arrayHeight,
    };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const buildFallbackTiles = (gridSize: {
    rows: number;
    cols: number;
}): Array<{
    id: string;
    center: { x: number; y: number };
}> => {
    const tiles: Array<{ id: string; center: { x: number; y: number } }> = [];
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            tiles.push({
                id: `grid-${row}-${col}`,
                center: {
                    x: (col + 0.5) * TILE_PLACEMENT_UNIT,
                    y: (row + 0.5) * TILE_PLACEMENT_UNIT,
                },
            });
        }
    }
    return tiles;
};

export const buildGridEmitters = (gridSize: {
    rows: number;
    cols: number;
}): {
    emitters: Array<{ x: number; y: number }>;
    width: number;
    height: number;
} => {
    const width = gridSize.cols * MIRROR_PITCH_M;
    const height = gridSize.rows * MIRROR_PITCH_M;
    const left = -width / 2;
    const top = height / 2;
    const emitters: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            emitters.push({
                x: left + (col + 0.5) * MIRROR_PITCH_M,
                y: top - (row + 0.5) * MIRROR_PITCH_M,
            });
        }
    }
    return { emitters, width, height };
};

interface Vec3 {
    x: number;
    y: number;
    z: number;
}

const subtractVec = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
});

const addVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

const scaleVec = (v: Vec3, scalar: number): Vec3 => ({
    x: v.x * scalar,
    y: v.y * scalar,
    z: v.z * scalar,
});

const dotVec = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const computeProjectionFootprint = ({
    gridSize,
    pattern,
    settings,
}: {
    gridSize: { rows: number; cols: number };
    pattern: LegacyPattern | null;
    settings: ProjectionSettings;
}): ProjectionFootprint => {
    const span = calculateProjectionSpan(gridSize, settings);
    const canvasWidth = pattern?.canvas.width ?? gridSize.cols * TILE_PLACEMENT_UNIT;
    const canvasHeight = pattern?.canvas.height ?? gridSize.rows * TILE_PLACEMENT_UNIT;

    const sourceTiles =
        pattern && pattern.tiles.length > 0 ? pattern.tiles : buildFallbackTiles(gridSize);

    const normalizedTargets = sourceTiles.map((tile) => ({
        id: tile.id,
        normalizedX: clamp01(canvasWidth > 0 ? tile.center.x / canvasWidth : 0.5),
        normalizedY: clamp01(canvasHeight > 0 ? tile.center.y / canvasHeight : 0.5),
    }));

    const cols = safeCols(gridSize.cols);
    const rows = safeRows(gridSize.rows);
    const stepX = settings.pixelSpacing.x;
    const stepY = settings.pixelSpacing.y;

    const { wallNormal, uWall, vWall } = deriveWallBasis(
        settings.wallOrientation,
        settings.worldUpOrientation,
    );

    const arrayWidth = gridSize.cols * MIRROR_PITCH_M;
    const arrayHeight = gridSize.rows * MIRROR_PITCH_M;
    const arrayOrigin: Vec3 = {
        x: -arrayWidth / 2 + MIRROR_PITCH_M / 2,
        y: arrayHeight / 2 - MIRROR_PITCH_M / 2,
        z: 0,
    };
    const wallPoint = addVec(arrayOrigin, scaleVec(wallNormal, settings.wallDistance));
    const projectedOrigin = addVec(
        arrayOrigin,
        scaleVec(wallNormal, dotVec(subtractVec(wallPoint, arrayOrigin), wallNormal)),
    );
    const patternOrigin = addVec(projectedOrigin, scaleVec(vWall, settings.projectionOffset));

    let minWallX = Number.POSITIVE_INFINITY;
    let maxWallX = Number.NEGATIVE_INFINITY;
    let minWallY = Number.POSITIVE_INFINITY;
    let maxWallY = Number.NEGATIVE_INFINITY;

    const spots: ProjectedSpot[] = normalizedTargets.map((target) => {
        const offsetU = (target.normalizedX - 0.5) * cols * stepX;
        const offsetV = (0.5 - target.normalizedY) * rows * stepY;
        const worldPoint = addVec(
            patternOrigin,
            addVec(scaleVec(uWall, offsetU), scaleVec(vWall, offsetV)),
        );

        minWallX = Math.min(minWallX, offsetU);
        maxWallX = Math.max(maxWallX, offsetU);
        minWallY = Math.min(minWallY, offsetV);
        maxWallY = Math.max(maxWallY, offsetV);

        return {
            id: target.id,
            normalizedX: target.normalizedX,
            normalizedY: target.normalizedY,
            wallX: offsetU,
            wallY: offsetV,
            world: worldPoint,
        };
    });

    const projectedWidth =
        spots.length > 0 ? Math.max(maxWallX - minWallX, MIRROR_DIMENSION_M) : span.width;
    const projectedHeight =
        spots.length > 0 ? Math.max(maxWallY - minWallY, MIRROR_DIMENSION_M) : span.height;

    return {
        projectedWidth,
        projectedHeight,
        spots,
        arrayWidth: span.arrayWidth,
        arrayHeight: span.arrayHeight,
    };
};
