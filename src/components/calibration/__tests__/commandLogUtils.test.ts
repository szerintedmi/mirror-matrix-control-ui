import { describe, expect, it } from 'vitest';

import type { CalibrationCommandLogEntry } from '@/services/calibration/types';

import { buildCommandLogGroups, formatLogTileLabel, parseLogTileAddress } from '../commandLogUtils';

const baseEntry: Omit<CalibrationCommandLogEntry, 'id' | 'timestamp' | 'sequence'> = {
    hint: 'noop',
    phase: 'measuring',
};

const tile = { row: 0, col: 0, key: '0-0' } as const;

describe('commandLogUtils', () => {
    it('parses tile address from group ids when tile is missing', () => {
        const entry: CalibrationCommandLogEntry = {
            ...baseEntry,
            id: 'e1',
            group: 'measure-1-2',
            timestamp: 1,
            sequence: 1,
        };
        expect(parseLogTileAddress(entry)).toEqual({ row: 1, col: 2, key: '1-2' });
        expect(formatLogTileLabel(entry)).toBe('R1C2');
    });

    it('groups commands by phase and tile with stable ordering', () => {
        const entries: CalibrationCommandLogEntry[] = [
            {
                ...baseEntry,
                id: 'measure-2',
                hint: 'Captured home measurement',
                phase: 'measuring',
                group: 'measure-0-0',
                tile,
                timestamp: 10,
                sequence: 2,
            },
            {
                ...baseEntry,
                id: 'measure-1',
                hint: 'Moving tile to home',
                phase: 'measuring',
                group: 'measure-0-0',
                tile,
                timestamp: 10,
                sequence: 1,
            },
            {
                ...baseEntry,
                id: 'home-all',
                hint: 'HOME ALL',
                phase: 'homing',
                timestamp: 5,
                sequence: 1,
                group: 'homing',
            },
        ];

        const groups = buildCommandLogGroups(entries);

        expect(groups[0].label).toBe('Measuring Tile R0C0');
        expect(groups[0].entries.map((e) => e.id)).toEqual(['measure-1', 'measure-2']);
        expect(groups[1].label).toBe('Homing all');
    });
});
