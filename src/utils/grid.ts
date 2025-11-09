import type { GridPosition, MirrorAssignment, MirrorConfig } from '../types';

export const formatGridKey = (row: number, col: number): string => `${row}-${col}`;

export const parseGridKey = (key: string): GridPosition | null => {
    const [rawRow, rawCol] = key.split('-', 2);
    const row = Number.parseInt(rawRow ?? '', 10);
    const col = Number.parseInt(rawCol ?? '', 10);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) {
        return null;
    }
    return { row, col };
};

export const getMirrorAssignment = (
    config: MirrorConfig,
    row: number,
    col: number,
): MirrorAssignment => config.get(formatGridKey(row, col)) ?? { x: null, y: null };
