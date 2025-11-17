import { describe, expect, it, vi } from 'vitest';

import type { MirrorConfig } from '@/types';

import {
    deleteCalibrationProfile,
    loadCalibrationProfiles,
    loadLastCalibrationProfileId,
    persistLastCalibrationProfileId,
    saveCalibrationProfile,
} from '../calibrationProfileStorage';

import type { CalibrationRunSummary, CalibrationRunnerState } from '../calibrationRunner';
import type { GridStateSnapshot } from '../gridStorage';

class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    getItem(key: string): string | null {
        return this.store.has(key) ? (this.store.get(key) ?? null) : null;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
}

const createMirrorConfig = (): MirrorConfig =>
    new Map([
        ['0-0', { x: null, y: null }],
        ['0-1', { x: null, y: null }],
    ]);

const createRunnerState = (): CalibrationRunnerState => {
    const measurement = {
        x: -0.18,
        y: -0.12,
        size: 0.16,
        response: 0.92,
        capturedAt: 1_704_000_000,
        sourceWidth: 1920,
        sourceHeight: 1080,
        stats: {
            sampleCount: 8,
            thresholds: {
                minSamples: 5,
                maxMedianDeviationPt: 0.01,
            },
            median: { x: -0.18, y: -0.12, size: 0.16 },
            medianAbsoluteDeviation: { x: 0.002, y: 0.002, size: 0.004 },
            passed: true,
        },
    } as const;

    const summary: CalibrationRunSummary = {
        gridBlueprint: {
            adjustedTileFootprint: { width: 0.22, height: 0.24 },
            tileGap: { x: 0.04, y: 0.06 },
            gridOrigin: { x: -0.9, y: -0.88 },
        },
        stepTestSettings: {
            deltaSteps: 450,
        },
        tiles: {
            '0-0': {
                tile: { row: 0, col: 0, key: '0-0' },
                status: 'completed',
                homeMeasurement: measurement,
                homeOffset: { dx: 0.02, dy: 0.02 },
                adjustedHome: { x: -0.2, y: -0.1 },
                stepToDisplacement: { x: 0.0005, y: 0.0006 },
                sizeDeltaAtStepTest: 0.01,
            },
            '0-1': {
                tile: { row: 0, col: 1, key: '0-1' },
                status: 'failed',
                error: 'No blob detected',
            },
        },
    };

    return {
        phase: 'completed',
        tiles: {
            '0-0': {
                tile: { row: 0, col: 0, key: '0-0' },
                assignment: { x: null, y: null },
                status: 'completed',
                metrics: {
                    home: measurement,
                    homeOffset: { dx: 0.02, dy: 0.02 },
                    adjustedHome: { x: -0.2, y: -0.1 },
                    stepToDisplacement: { x: 0.0005, y: 0.0006 },
                    sizeDeltaAtStepTest: 0.01,
                },
            },
            '0-1': {
                tile: { row: 0, col: 1, key: '0-1' },
                assignment: { x: null, y: null },
                status: 'failed',
                error: 'No blob detected',
            },
        },
        progress: {
            total: 2,
            completed: 1,
            failed: 1,
            skipped: 0,
        },
        activeTile: null,
        summary,
        error: null,
    } as CalibrationRunnerState;
};

const createGridSnapshot = (): GridStateSnapshot => ({
    gridSize: { rows: 1, cols: 2 },
    mirrorConfig: createMirrorConfig(),
});

describe('calibrationProfileStorage', () => {
    it('returns empty list when storage is empty or invalid', () => {
        const storage = new MemoryStorage();
        expect(loadCalibrationProfiles(storage)).toEqual([]);

        storage.setItem('mirror:calibration:profiles', '{not-json}');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(loadCalibrationProfiles(storage)).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
            'Failed to parse calibration profiles',
            expect.any(SyntaxError),
        );
        warnSpy.mockRestore();
    });

    it('persists calibration profiles with normalized data only', () => {
        const storage = new MemoryStorage();
        const runnerState = createRunnerState();
        const snapshot = createGridSnapshot();

        const saved = saveCalibrationProfile(storage, {
            name: 'Demo Run',
            runnerState,
            gridSnapshot: snapshot,
        });

        expect(saved).not.toBeNull();
        expect(saved!.name).toBe('Demo Run');
        expect(saved!.gridBlueprint).toBeTruthy();
        expect(saved!.tiles['0-0']).toMatchObject({
            status: 'completed',
            homeOffset: { dx: 0.02, dy: 0.02 },
            adjustedHome: { x: -0.2, y: -0.1 },
            blobSize: 0.16,
        });
        expect(saved!.tiles['0-1']).toMatchObject({
            status: 'failed',
            error: 'No blob detected',
        });
        expect(saved!.tiles['0-0'].homeMeasurement).toBeTruthy();
        const measurementRecord = (saved!.tiles['0-0'].homeMeasurement ?? {}) as Record<
            string,
            unknown
        >;
        expect('sourceWidth' in measurementRecord).toBe(false);
        expect(saved!.metrics).toEqual({
            totalTiles: 2,
            completedTiles: 1,
            failedTiles: 1,
            skippedTiles: 0,
        });

        const list = loadCalibrationProfiles(storage);
        expect(list).toHaveLength(1);
        const [entry] = list;
        expect(entry.id).toBe(saved!.id);
        expect(entry.gridStateFingerprint).toBe(saved!.gridStateFingerprint);
    });

    it('updates existing profiles when saving with the same id and supports deletion', () => {
        const storage = new MemoryStorage();
        const runnerState = createRunnerState();
        const snapshot = createGridSnapshot();

        const saved = saveCalibrationProfile(storage, {
            name: 'Demo Run',
            runnerState,
            gridSnapshot: snapshot,
        });
        expect(saved).not.toBeNull();

        const updated = saveCalibrationProfile(storage, {
            id: saved!.id,
            name: 'Updated Run',
            runnerState,
            gridSnapshot: snapshot,
        });
        expect(updated).not.toBeNull();
        expect(updated!.name).toBe('Updated Run');
        expect(loadCalibrationProfiles(storage)).toHaveLength(1);

        deleteCalibrationProfile(storage, updated!.id);
        expect(loadCalibrationProfiles(storage)).toEqual([]);
    });

    it('refuses to save when runner summary is missing', () => {
        const storage = new MemoryStorage();
        const runnerState = createRunnerState();
        runnerState.summary = undefined;
        const result = saveCalibrationProfile(storage, {
            name: 'Invalid',
            runnerState,
            gridSnapshot: createGridSnapshot(),
        });
        expect(result).toBeNull();
    });

    it('persists and clears last selected profile id', () => {
        const storage = new MemoryStorage();
        expect(loadLastCalibrationProfileId(storage)).toBeNull();
        persistLastCalibrationProfileId(storage, 'abc');
        expect(loadLastCalibrationProfileId(storage)).toBe('abc');
        persistLastCalibrationProfileId(storage, null);
        expect(loadLastCalibrationProfileId(storage)).toBeNull();
    });
});
