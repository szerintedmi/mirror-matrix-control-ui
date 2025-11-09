import { describe, expect, it } from 'vitest';

import { convertAngleToSteps } from '../motorSteps';

describe('convertAngleToSteps', () => {
    it('converts angles to steps using the default scale', () => {
        const result = convertAngleToSteps(2);
        expect(result.requestedSteps).toBe(380);
        expect(result.targetSteps).toBe(380);
        expect(result.clamped).toBe(false);
    });

    it('preserves negative angles and applies zero offset', () => {
        const result = convertAngleToSteps(-1.5, { zeroOffsetSteps: 10 });
        expect(result.requestedSteps).toBeCloseTo(-275, 5);
        expect(result.targetSteps).toBeCloseTo(-275, 5);
        expect(result.clamped).toBe(false);
    });

    it('clamps when requested steps exceed motor limits', () => {
        const result = convertAngleToSteps(10);
        expect(result.targetSteps).toBe(1_200);
        expect(result.clamped).toBe(true);
    });
});
