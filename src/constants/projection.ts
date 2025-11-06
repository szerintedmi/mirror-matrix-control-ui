import type { ProjectionSettings } from '../types';

export const MIRROR_DIMENSION_M = 0.05; // 50 mm mirrors
export const MIRROR_PITCH_M = 0.053; // 50 mm mirror + 3 mm gap

export const MIN_WALL_DISTANCE_M = 1;
export const MAX_WALL_DISTANCE_M = 20;
export const MIN_WALL_ANGLE_DEG = -90;
export const MAX_WALL_ANGLE_DEG = 90;

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
    wallDistance: 5,
    wallAngleHorizontal: 0,
    wallAngleVertical: 0,
    lightAngleHorizontal: 0,
    lightAngleVertical: 0,
};
