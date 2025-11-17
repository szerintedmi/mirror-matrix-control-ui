import { anglesToVector } from '../utils/orientation';

import type { ProjectionSettings } from '../types';

export const MIRROR_DIMENSION_M = 0.05; // 50 mm mirrors
export const MIRROR_PITCH_M = 0.053; // 50 mm mirror + 3 mm gap

export const MIN_WALL_DISTANCE_M = 1;
export const MAX_WALL_DISTANCE_M = 20;
export const MIN_WALL_ANGLE_DEG = -90;
export const MAX_WALL_ANGLE_DEG = 90;
export const MIN_PROJECTION_OFFSET_M = -5;
export const MAX_PROJECTION_OFFSET_M = 5;
export const MIN_PIXEL_SPACING_M = 0.01;
export const MAX_PIXEL_SPACING_M = 0.5;
export const MIN_SUN_ANGULAR_DIAMETER_DEG = 0.1;
export const MAX_SUN_ANGULAR_DIAMETER_DEG = 2;
export const MIN_SLOPE_BLUR_SIGMA_DEG = 0;
export const MAX_SLOPE_BLUR_SIGMA_DEG = 5;

const createForwardOrientation = (yaw: number, pitch: number) => ({
    mode: 'angles' as const,
    yaw,
    pitch,
    vector: anglesToVector(yaw, pitch, 'forward'),
});

const createUpOrientation = (yaw: number, pitch: number) => ({
    mode: 'angles' as const,
    yaw,
    pitch,
    vector: anglesToVector(yaw, pitch, 'up'),
});

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
    wallDistance: 5,
    wallOrientation: createForwardOrientation(0, 0),
    sunOrientation: createForwardOrientation(0, 0),
    worldUpOrientation: createUpOrientation(0, -90),
    projectionOffset: 0,
    pixelSpacing: {
        x: MIRROR_PITCH_M,
        y: MIRROR_PITCH_M,
    },
    sunAngularDiameterDeg: 0.53,
    slopeBlurSigmaDeg: 0,
};
