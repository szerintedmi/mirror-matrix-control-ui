// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { computeDirectOverlaps } from '../tileOverlap';

const toLookup = (records: { id: string; count: number }[]) =>
    new Map(records.map((entry) => [entry.id, entry.count]));

describe('computeDirectOverlaps', () => {
    it('counts only overlaps with actual shared area', () => {
        const radius = 5;
        const tiles = [
            { id: 'left', centerX: 0, centerY: 0, width: radius * 2, height: radius * 2 },
            { id: 'mid', centerX: radius * 1.6, centerY: 0, width: radius * 2, height: radius * 2 },
            {
                id: 'right',
                centerX: radius * 3.2,
                centerY: 0,
                width: radius * 2,
                height: radius * 2,
            },
        ];

        const lookup = toLookup(computeDirectOverlaps(tiles));

        expect(lookup.get('left')).toBe(2);
        expect(lookup.get('mid')).toBe(2); // no triple intersection
        expect(lookup.get('right')).toBe(2);
    });

    it('treats tangential circles as non-overlapping', () => {
        const radius = 5;
        const tiles = [
            { id: 'a', centerX: 0, centerY: 0, width: radius * 2, height: radius * 2 },
            { id: 'b', centerX: radius * 2, centerY: 0, width: radius * 2, height: radius * 2 },
        ];

        const lookup = toLookup(computeDirectOverlaps(tiles));

        expect(lookup.get('a')).toBe(1);
        expect(lookup.get('b')).toBe(1);
    });

    it('captures true multi-tile overlaps', () => {
        const radius = 5;
        const tiles = [
            { id: 'a', centerX: 0, centerY: 0, width: radius * 2, height: radius * 2 },
            { id: 'b', centerX: radius * 0.8, centerY: 0, width: radius * 2, height: radius * 2 },
            {
                id: 'c',
                centerX: radius * 0.4,
                centerY: radius * 0.6,
                width: radius * 2,
                height: radius * 2,
            },
        ];

        const lookup = toLookup(computeDirectOverlaps(tiles));

        expect(lookup.get('a')).toBe(3);
        expect(lookup.get('b')).toBe(3);
        expect(lookup.get('c')).toBe(3);
    });

    it('handles fully contained circles', () => {
        const tiles = [
            { id: 'outer', centerX: 0, centerY: 0, width: 20, height: 20 },
            { id: 'inner', centerX: 4, centerY: 0, width: 10, height: 10 },
        ];

        const lookup = toLookup(computeDirectOverlaps(tiles));

        expect(lookup.get('outer')).toBe(2);
        expect(lookup.get('inner')).toBe(2);
    });
});
