import { describe, expect, it } from 'vitest';

import {
    createHistoryStacks,
    pushHistorySnapshot,
    redoHistorySnapshot,
    undoHistorySnapshot,
} from '../history';

describe('history helpers', () => {
    it('pushes snapshots and enforces limit', () => {
        const history = createHistoryStacks<number>();
        const withOne = pushHistorySnapshot(history, 1, 2);
        expect(withOne.past).toEqual([1]);
        expect(withOne.future).toHaveLength(0);

        const withTwo = pushHistorySnapshot(withOne, 2, 2);
        expect(withTwo.past).toEqual([1, 2]);

        const withThree = pushHistorySnapshot(withTwo, 3, 2);
        expect(withThree.past).toEqual([2, 3]);
        expect(withThree.future).toHaveLength(0);
    });

    it('undoes to previous snapshot and queues current in future', () => {
        const base = { past: [[1], [2]], future: [] };
        const current = [3];
        const { history: nextHistory, value } = undoHistorySnapshot(base, current);
        expect(value).toEqual([2]);
        expect(nextHistory.past).toEqual([[1]]);
        expect(nextHistory.future).toEqual([current]);
    });

    it('redos from future stack', () => {
        const base = { past: [[1]], future: [[3], [4]] };
        const current = [2];
        const { history: nextHistory, value } = redoHistorySnapshot(base, current);
        expect(value).toEqual([3]);
        expect(nextHistory.past).toEqual([[1], current]);
        expect(nextHistory.future).toEqual([[4]]);
    });
});
