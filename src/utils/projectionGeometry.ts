import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { MIRROR_DIMENSION_M, MIRROR_PITCH_M } from '../constants/projection';

import type {
    Pattern,
    PatternCanvas,
    ProjectionFootprint,
    ProjectionSettings,
    ProjectedSpot,
} from '../types';

const degToRad = (value: number): number => (value * Math.PI) / 180;

const safeRows = (rows: number): number => Math.max(1, Math.round(rows));
const safeCols = (cols: number): number => Math.max(1, Math.round(cols));

export const inferGridFromCanvas = (canvas: PatternCanvas): { rows: number; cols: number } => ({
    rows: safeRows(canvas.height / TILE_PLACEMENT_UNIT),
    cols: safeCols(canvas.width / TILE_PLACEMENT_UNIT),
});

export const calculateProjectionSpan = (
    gridSize: { rows: number; cols: number },
    settings: ProjectionSettings,
): { width: number | null; height: number | null; arrayWidth: number; arrayHeight: number } => {
    const rows = safeRows(gridSize.rows);
    const cols = safeCols(gridSize.cols);

    const arrayWidth = Math.max(cols * MIRROR_PITCH_M, MIRROR_DIMENSION_M);
    const arrayHeight = Math.max(rows * MIRROR_PITCH_M, MIRROR_DIMENSION_M);

    const { wallDistance, wallOrientation, sunOrientation } = settings;

    const baseWidth = arrayWidth * wallDistance;
    const baseHeight = arrayHeight * wallDistance;

    const lightHRad = degToRad(sunOrientation.yaw);
    const lightVRad = degToRad(sunOrientation.pitch);
    const totalHAngleRad = degToRad(wallOrientation.yaw + sunOrientation.yaw);
    const totalVAngleRad = degToRad(wallOrientation.pitch + sunOrientation.pitch);

    const projectedWidth =
        Math.abs(Math.cos(totalHAngleRad)) < 1e-3
            ? null
            : (baseWidth * Math.cos(lightHRad)) / Math.cos(totalHAngleRad);

    const projectedHeight =
        Math.abs(Math.cos(totalVAngleRad)) < 1e-3
            ? null
            : (baseHeight * Math.cos(lightVRad)) / Math.cos(totalVAngleRad);

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

const rotateYawPitch = (vector: Vec3, yaw: number, pitch: number): Vec3 => {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const x1 = vector.x * cosY + vector.z * sinY;
    const z1 = -vector.x * sinY + vector.z * cosY;
    const y1 = vector.y;

    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);
    const y2 = y1 * cosX - z1 * sinX;
    const z2 = y1 * sinX + z1 * cosX;

    return { x: x1, y: y2, z: z2 };
};

const subtractVec = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
});

const addScaledVec = (start: Vec3, direction: Vec3, scale: number): Vec3 => ({
    x: start.x + direction.x * scale,
    y: start.y + direction.y * scale,
    z: start.z + direction.z * scale,
});

const dotVec = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const computeProjectionFootprint = ({
    gridSize,
    pattern,
    settings,
}: {
    gridSize: { rows: number; cols: number };
    pattern: Pattern | null;
    settings: ProjectionSettings;
}): ProjectionFootprint => {
    const span = calculateProjectionSpan(gridSize, settings);
    const { emitters } = buildGridEmitters(gridSize);

    const canvasWidth = pattern?.canvas.width ?? gridSize.cols * TILE_PLACEMENT_UNIT;
    const canvasHeight = pattern?.canvas.height ?? gridSize.rows * TILE_PLACEMENT_UNIT;

    const sourceTiles =
        pattern && pattern.tiles.length > 0 ? pattern.tiles : buildFallbackTiles(gridSize);

    const yawRad = degToRad(settings.wallOrientation.yaw);
    const pitchRad = degToRad(settings.wallOrientation.pitch);
    const wallNormal = rotateYawPitch({ x: 0, y: 0, z: -1 }, yawRad, pitchRad);
    const wallCenter: Vec3 = { x: 0, y: 0, z: settings.wallDistance };
    const inverseYaw = -yawRad;
    const inversePitch = -pitchRad;

    const baseWidth = span.arrayWidth;
    const baseHeight = span.arrayHeight;

    const spots: ProjectedSpot[] = sourceTiles.map((tile, index) => {
        const normalizedX = clamp01(canvasWidth > 0 ? tile.center.x / canvasWidth : 0.5);
        const normalizedY = clamp01(canvasHeight > 0 ? tile.center.y / canvasHeight : 0.5);
        const signedX = normalizedX - 0.5;
        const signedY = 0.5 - normalizedY; // invert so positive is up

        const clampedIndex = Math.min(index, emitters.length - 1);
        const emitter = emitters[clampedIndex] ?? { x: 0, y: 0 };
        const emitterPos: Vec3 = { x: emitter.x, y: emitter.y, z: 0 };

        const nominalTarget: Vec3 = {
            x: signedX * baseWidth,
            y: signedY * baseHeight,
            z: settings.wallDistance,
        };

        const direction = subtractVec(nominalTarget, emitterPos);
        const denom = dotVec(direction, wallNormal);
        let worldPoint: Vec3;
        if (Math.abs(denom) < 1e-6) {
            worldPoint = { ...nominalTarget };
        } else {
            const t = dotVec(subtractVec(wallCenter, emitterPos), wallNormal) / denom;
            worldPoint = addScaledVec(emitterPos, direction, t);
        }

        const local = rotateYawPitch(subtractVec(worldPoint, wallCenter), inverseYaw, inversePitch);

        return {
            id: tile.id,
            normalizedX,
            normalizedY,
            wallX: local.x,
            wallY: local.y,
            world: worldPoint,
        };
    });

    return {
        projectedWidth: span.width,
        projectedHeight: span.height,
        spots,
        arrayWidth: span.arrayWidth,
        arrayHeight: span.arrayHeight,
    };
};
