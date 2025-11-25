import type { CalibrationCommandLogEntry } from '@/services/calibrationRunner';

export interface CommandLogGroup {
    id: string;
    label: string;
    entries: CalibrationCommandLogEntry[];
    latest: CalibrationCommandLogEntry | null;
}

export const parseLogTileAddress = (
    entry: CalibrationCommandLogEntry,
): { row: number; col: number; key: string } | null => {
    if (entry.tile) {
        return { row: entry.tile.row, col: entry.tile.col, key: entry.tile.key };
    }
    if (!entry.group) {
        return null;
    }
    const match = entry.group.match(/^(?:measure|tile)-(\d+)-(\d+)$/);
    if (!match) {
        return null;
    }
    const [, rowStr, colStr] = match;
    const row = Number(rowStr);
    const col = Number(colStr);
    return {
        row,
        col,
        key: `${row}-${col}`,
    };
};

export const formatLogTileLabel = (entry: CalibrationCommandLogEntry): string | null => {
    const tile = parseLogTileAddress(entry);
    if (!tile) {
        return null;
    }
    return `R${tile.row}C${tile.col}`;
};

export const compareLogEntries = (
    a: CalibrationCommandLogEntry,
    b: CalibrationCommandLogEntry,
): number => {
    if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
    }
    return a.sequence - b.sequence;
};

const deriveGroupId = (entry: CalibrationCommandLogEntry): string => {
    const tileAddress = parseLogTileAddress(entry);
    if (entry.group) {
        return entry.group;
    }
    if (entry.phase === 'measuring' && tileAddress) {
        return `measure-${tileAddress.key}`;
    }
    return entry.phase;
};

const deriveGroupLabel = (entry: CalibrationCommandLogEntry, groupId: string): string => {
    const tileLabel = formatLogTileLabel(entry);
    if (groupId === 'homing') {
        return 'Homing all';
    }
    if (groupId === 'staging') {
        return 'Staging all';
    }
    if (groupId.startsWith('measure-') && tileLabel) {
        return `Measuring Tile ${tileLabel}`;
    }
    if (groupId.startsWith('tile-') && tileLabel) {
        return `Tile ${tileLabel}`;
    }
    if (entry.phase === 'measuring' && tileLabel) {
        return `Measuring Tile ${tileLabel}`;
    }
    return 'Commands';
};

export const buildCommandLogGroups = (entries: CalibrationCommandLogEntry[]): CommandLogGroup[] => {
    const groups = new Map<string, CommandLogGroup>();
    const sorted = [...entries].sort(compareLogEntries);

    sorted.forEach((entry) => {
        const groupId = deriveGroupId(entry);
        const label = deriveGroupLabel(entry, groupId);
        const bucket = groups.get(groupId) ?? {
            id: groupId,
            label,
            entries: [],
            latest: null,
        };
        bucket.entries.push(entry);
        bucket.latest =
            bucket.latest && compareLogEntries(bucket.latest, entry) >= 0 ? bucket.latest : entry;
        groups.set(groupId, bucket);
    });

    return Array.from(groups.values()).sort((a, b) => {
        if (!a.latest || !b.latest) {
            if (a.latest && !b.latest) {
                return -1;
            }
            if (!a.latest && b.latest) {
                return 1;
            }
            return 0;
        }
        return compareLogEntries(b.latest, a.latest);
    });
};
