// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { computeNudgeTargets } from '../motorControl';

describe('computeNudgeTargets', () => {
    test('prefers positive direction when centered and room available', () => {
        const result = computeNudgeTargets({ currentPosition: 0 });
        expect(result.direction).toBe(1);
        expect(result.outboundTarget).toBe(500);
        expect(result.returnTarget).toBe(0);
    });

    test('falls back to negative direction when positive exceeds bounds', () => {
        const result = computeNudgeTargets({ currentPosition: 900 });
        expect(result.direction).toBe(-1);
        expect(result.outboundTarget).toBe(400);
        expect(result.returnTarget).toBe(900);
    });

    test('throws when insufficient headroom in either direction', () => {
        expect(() =>
            computeNudgeTargets({
                currentPosition: 1_150,
                min: -1_200,
                max: 1_200,
                delta: 100,
            }),
        ).not.toThrow();

        expect(() =>
            computeNudgeTargets({
                currentPosition: 0,
                min: -1_200,
                max: 1_200,
                delta: 2_000,
            }),
        ).toThrowError(/insufficient headroom/);
    });
});
