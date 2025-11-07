import { describe, expect, it } from 'vitest';

import { DEFAULT_PROJECTION_SETTINGS } from '../../constants/projection';
import { getWallUpAlignmentError } from '../geometryValidation';
import { cloneOrientationState } from '../orientation';

describe('geometryValidation', () => {
    it('returns null when wall normal and world up are separated', () => {
        const wall = cloneOrientationState(DEFAULT_PROJECTION_SETTINGS.wallOrientation);
        const worldUp = cloneOrientationState(DEFAULT_PROJECTION_SETTINGS.worldUpOrientation);

        expect(getWallUpAlignmentError(wall, worldUp)).toBeNull();
    });

    it('returns error when wall normal aligns with world up', () => {
        const wall = cloneOrientationState(DEFAULT_PROJECTION_SETTINGS.wallOrientation);
        const worldUp = cloneOrientationState(DEFAULT_PROJECTION_SETTINGS.worldUpOrientation);
        worldUp.vector = { ...wall.vector };
        worldUp.yaw = wall.yaw;
        worldUp.pitch = wall.pitch;

        const error = getWallUpAlignmentError(wall, worldUp);
        expect(error).toMatch(/cannot be parallel/i);
    });
});
