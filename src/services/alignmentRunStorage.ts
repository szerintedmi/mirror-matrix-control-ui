import type { AlignmentRunSummaryOutput } from '@/hooks/useAlignmentController';

const ALIGNMENT_RUNS_STORAGE_KEY = 'mirror:alignment:runs';
const STORAGE_VERSION = 1;

interface StoredPayload {
    version: number;
    entries: AlignmentRunSummaryOutput[];
}

export const loadAlignmentRuns = (storage?: Storage): AlignmentRunSummaryOutput[] => {
    if (!storage) return [];
    const raw = storage.getItem(ALIGNMENT_RUNS_STORAGE_KEY);
    if (!raw) return [];
    try {
        const payload = JSON.parse(raw) as StoredPayload;
        if (!payload || payload.version !== STORAGE_VERSION || !Array.isArray(payload.entries)) {
            return [];
        }
        return payload.entries;
    } catch {
        return [];
    }
};

export const saveAlignmentRun = (
    storage: Storage | undefined,
    summary: AlignmentRunSummaryOutput,
): void => {
    if (!storage) return;
    const existing = loadAlignmentRuns(storage);
    existing.push(summary);
    const payload: StoredPayload = {
        version: STORAGE_VERSION,
        entries: existing,
    };
    try {
        storage.setItem(ALIGNMENT_RUNS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist alignment run', error);
    }
};

export const exportAlignmentRunJson = (summary: AlignmentRunSummaryOutput): void => {
    const json = JSON.stringify(summary, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alignment-run-${summary.completedAt.replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
};
