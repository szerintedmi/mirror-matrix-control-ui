import { dotVec3, normalizeVec3 } from './orientation';

import type { OrientationState, ProjectionSettings } from '../types';

export const WALL_UP_ALIGNMENT_THRESHOLD = 0.98;

export const getWallUpAlignmentError = (
    wallOrientation: OrientationState,
    worldUpOrientation: OrientationState,
): string | null => {
    const wall = normalizeVec3(wallOrientation.vector);
    const world = normalizeVec3(worldUpOrientation.vector);
    const alignment = Math.abs(dotVec3(wall, world));
    if (alignment >= WALL_UP_ALIGNMENT_THRESHOLD) {
        return 'World up vector cannot be parallel to the wall normal. Adjust either orientation to create a stable vertical axis.';
    }
    return null;
};

export const validateProjectionSettings = (settings: ProjectionSettings): string | null =>
    getWallUpAlignmentError(settings.wallOrientation, settings.worldUpOrientation);
