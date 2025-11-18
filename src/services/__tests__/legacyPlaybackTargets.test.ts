import { describe, expect, it } from 'vitest';

import { buildLegacyPlaybackAxisTargets } from '../legacyPlaybackTargets';

import type { LegacyPlaybackPlanResult } from '../../types';

const createPlan = (): LegacyPlaybackPlanResult => ({
    patternId: 'pattern-1',
    assignments: [],
    errors: [],
    mirrors: [
        {
            mirrorId: 'mirror-0-0',
            row: 0,
            col: 0,
            patternId: 'tile-0',
            yawDeg: 1,
            pitchDeg: -0.5,
            assignment: {
                x: { nodeMac: 'AA', motorIndex: 0 },
                y: null,
            },
            errors: [],
        },
        {
            mirrorId: 'mirror-0-1',
            row: 0,
            col: 1,
            patternId: 'tile-1',
            yawDeg: 10,
            pitchDeg: 0.25,
            assignment: {
                x: { nodeMac: 'BB', motorIndex: 1 },
                y: { nodeMac: 'BB', motorIndex: 2 },
            },
            errors: [],
        },
    ],
});

describe('buildLegacyPlaybackAxisTargets', () => {
    it('creates axis targets for mirrors with assignments', () => {
        const result = buildLegacyPlaybackAxisTargets({ plan: createPlan() });
        expect(result.axes).toHaveLength(3);
        const first = result.axes[0];
        expect(first.axis).toBe('x');
        expect(first.targetSteps).toBe(-190);
        expect(first.clamped).toBe(false);
        const yAxis = result.axes.find((axis) => axis.axis === 'y');
        expect(yAxis?.targetSteps).toBeCloseTo(-47.5, 5);
    });

    it('reports skipped axes and clamp diagnostics', () => {
        const result = buildLegacyPlaybackAxisTargets({ plan: createPlan() });
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0]).toMatchObject({ reason: 'missing-motor', axis: 'y' });

        const clampedAxis = result.axes.find(
            (axis) => axis.mirrorId === 'mirror-0-1' && axis.axis === 'x',
        );
        expect(clampedAxis?.clamped).toBe(true);
        expect(clampedAxis?.targetSteps).toBe(-1_200);
    });
});
