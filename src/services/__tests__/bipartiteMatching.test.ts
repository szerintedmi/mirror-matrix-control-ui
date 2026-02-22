// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { maxBipartiteMatching } from '../bipartiteMatching';

describe('maxBipartiteMatching', () => {
    it('returns empty matching for empty adjacency', () => {
        const result = maxBipartiteMatching(new Map());
        expect(result.size).toBe(0);
    });

    it('matches a single pair', () => {
        const adj = new Map([['a', ['1']]]);
        const result = maxBipartiteMatching(adj);
        expect(result.get('a')).toBe('1');
    });

    it('finds perfect matching in a simple graph', () => {
        const adj = new Map([
            ['a', ['1', '2']],
            ['b', ['1', '2']],
        ]);
        const result = maxBipartiteMatching(adj);
        expect(result.size).toBe(2);
        // Both a and b should be matched to different nodes
        expect(result.get('a')).not.toBe(result.get('b'));
    });

    it('handles the case where greedy fails but augmenting paths succeed', () => {
        // Classic greedy failure:
        // a -> [1]       (only option)
        // b -> [1, 2]    (greedy might take 1 first, blocking a)
        //
        // Correct matching: a->1, b->2
        const adj = new Map([
            ['b', ['1', '2']],
            ['a', ['1']],
        ]);
        const result = maxBipartiteMatching(adj);
        expect(result.size).toBe(2);
        expect(result.get('a')).toBe('1');
        expect(result.get('b')).toBe('2');
    });

    it('returns partial matching when perfect matching is impossible', () => {
        // Three left nodes, two right nodes, but only two can be matched
        const adj = new Map([
            ['a', ['1']],
            ['b', ['1']],
            ['c', ['2']],
        ]);
        const result = maxBipartiteMatching(adj);
        expect(result.size).toBe(2);
        // c must match to 2, and one of a/b matches to 1
        expect(result.get('c')).toBe('2');
    });

    it('handles a complex graph requiring multiple augmentations', () => {
        // a -> [1, 2]
        // b -> [1]
        // c -> [2, 3]
        // d -> [3, 4]
        //
        // Optimal: b->1, a->2, c->3, d->4
        const adj = new Map([
            ['a', ['1', '2']],
            ['b', ['1']],
            ['c', ['2', '3']],
            ['d', ['3', '4']],
        ]);
        const result = maxBipartiteMatching(adj);
        expect(result.size).toBe(4);
        // Verify no two left nodes share a right node
        const rightNodes = new Set(result.values());
        expect(rightNodes.size).toBe(4);
    });

    it('handles disconnected left nodes (no adjacency)', () => {
        const adj = new Map([
            ['a', ['1']],
            ['b', []],
        ]);
        const result = maxBipartiteMatching(adj);
        expect(result.size).toBe(1);
        expect(result.get('a')).toBe('1');
        expect(result.has('b')).toBe(false);
    });
});
