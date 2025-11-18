import { describe, expect, it, vi } from 'vitest';

import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { MirrorConfig } from '@/types';
import { clampNormalized } from '@/utils/calibrationMath';

import {
    buildCalibrationProfileExportPayload,
    deleteCalibrationProfile,
    importCalibrationProfileFromJson,
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

const measurementFactory = ({ x, y, size }: { x: number; y: number; size: number }) => ({
    x,
    y,
    size,
    response: 0.8,
    capturedAt: 1_704_000_000,
    sourceWidth: 1920,
    sourceHeight: 1080,
    stats: {
        sampleCount: 5,
        thresholds: {
            minSamples: 5,
            maxMedianDeviationPt: 0.01,
        },
        median: { x, y, size },
        nMad: { x: 0.0002, y: 0.0002, size: 0.0002 },
        passed: true,
    },
});

const createRunnerState = (): CalibrationRunnerState => {
    const summary: CalibrationRunSummary = {
        gridBlueprint: {
            adjustedTileFootprint: { width: 0.1307459831237793, height: 0.2324373033311632 },
            tileGap: { x: 0, y: 0 },
            gridOrigin: { x: 0.1262927532196046, y: -0.16657087537977439 },
        },
        stepTestSettings: {
            deltaSteps: 1200,
        },
        tiles: {
            '0-0': {
                tile: { row: 0, col: 0, key: '0-0' },
                status: 'completed',
                homeMeasurement: measurementFactory({
                    x: 0.19166574478149423,
                    y: 0.005588701036241428,
                    size: 0.12282742261886596,
                }),
                homeOffset: { dx: 0, dy: 0.05594092475043422 },
                adjustedHome: { x: 0.19166574478149423, y: -0.05035222371419279 },
                stepToDisplacement: { x: -0.00032960216204325356, y: -0.0005600848551149723 },
                sizeDeltaAtStepTest: 0.004601287841796878,
                inferredBounds: {
                    x: { min: -0.20385684967041007, max: 0.5871883392333985 },
                    y: { min: -0.6665131251017253, max: 0.6776905271742082 },
                },
            },
            '0-1': {
                tile: { row: 0, col: 1, key: '0-1' },
                status: 'completed',
                homeMeasurement: measurementFactory({
                    x: 0.3496796607971191,
                    y: 0.00841098361545134,
                    size: 0.12410826683044433,
                }),
                homeOffset: { dx: 0.027267932891845537, dy: 0.05876320732964413 },
                adjustedHome: { x: 0.32241172790527356, y: -0.05035222371419279 },
                stepToDisplacement: { x: -0.0003242341677347819, y: -0.0006024321803340205 },
                sizeDeltaAtStepTest: 0.003791069984436027,
                inferredBounds: {
                    x: { min: -0.039401340484619185, max: 0.7387606620788574 },
                    y: { min: -0.7145076327853732, max: 0.731329600016276 },
                },
            },
            '1-0': {
                tile: { row: 1, col: 0, key: '1-0' },
                status: 'completed',
                homeMeasurement: measurementFactory({
                    x: 0.2755418777465821,
                    y: 0.29920645819769964,
                    size: 0.1307459831237793,
                }),
                homeOffset: { dx: 0.08387613296508789, dy: 0.11712137858072924 },
                adjustedHome: { x: 0.19166574478149423, y: 0.1820850796169704 },
                stepToDisplacement: { x: -0.0003325993220011392, y: -0.000606114281548394 },
                sizeDeltaAtStepTest: 0.004261237382888791,
                inferredBounds: {
                    x: { min: -0.12357730865478489, max: 0.6746610641479491 },
                    y: { min: -0.4281306796603731, max: 1 },
                },
            },
            '1-1': {
                tile: { row: 1, col: 1, key: '1-1' },
                status: 'completed',
                homeMeasurement: measurementFactory({
                    x: 0.34384269714355464,
                    y: 0.1820850796169704,
                    size: 0.12429475784301758,
                }),
                homeOffset: { dx: 0.021430969238281083, dy: 0 },
                adjustedHome: { x: 0.32241172790527356, y: 0.1820850796169704 },
                stepToDisplacement: { x: -0.00033713078498840327, y: -0.0005891155313562463 },
                sizeDeltaAtStepTest: 0.0021966099739074707,
                inferredBounds: {
                    x: { min: -0.0607142448425293, max: 0.7483996391296386 },
                    y: { min: -0.5248535580105251, max: 0.8890237172444659 },
                },
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
                    home: summary.tiles['0-0'].homeMeasurement!,
                    homeOffset: summary.tiles['0-0'].homeOffset ?? null,
                    adjustedHome: summary.tiles['0-0'].adjustedHome ?? null,
                    stepToDisplacement: summary.tiles['0-0'].stepToDisplacement ?? {
                        x: null,
                        y: null,
                    },
                    sizeDeltaAtStepTest: summary.tiles['0-0'].sizeDeltaAtStepTest ?? null,
                },
            },
            '0-1': {
                tile: { row: 0, col: 1, key: '0-1' },
                assignment: { x: null, y: null },
                status: 'completed',
                metrics: {
                    home: summary.tiles['0-1'].homeMeasurement!,
                    homeOffset: summary.tiles['0-1'].homeOffset ?? null,
                    adjustedHome: summary.tiles['0-1'].adjustedHome ?? null,
                    stepToDisplacement: summary.tiles['0-1'].stepToDisplacement ?? {
                        x: null,
                        y: null,
                    },
                    sizeDeltaAtStepTest: summary.tiles['0-1'].sizeDeltaAtStepTest ?? null,
                },
            },
        },
        progress: {
            total: 4,
            completed: 4,
            failed: 0,
            skipped: 0,
        },
        activeTile: null,
        summary,
        error: null,
    } as CalibrationRunnerState;
};

const createGridSnapshot = (): GridStateSnapshot => ({
    gridSize: { rows: 2, cols: 2 },
    mirrorConfig: createMirrorConfig(),
});

describe('calibrationProfileStorage', () => {
    describe('loadCalibrationProfiles', () => {
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
    });

    describe('saveCalibrationProfile', () => {
        let storage: MemoryStorage;
        let runnerState: CalibrationRunnerState;
        let snapshot: GridStateSnapshot;

        const saveProfile = (overrides?: Partial<Parameters<typeof saveCalibrationProfile>[1]>) =>
            saveCalibrationProfile(storage, {
                name: 'Demo Run',
                runnerState,
                gridSnapshot: snapshot,
                ...overrides,
            });

        beforeEach(() => {
            storage = new MemoryStorage();
            runnerState = createRunnerState();
            snapshot = createGridSnapshot();
        });

        it('persists calibration profiles without stripping measurement metadata', () => {
            const saved = saveProfile();

            expect(saved).not.toBeNull();
            expect(saved!.schemaVersion).toBe(2);
            expect(saved!.tiles['0-0']).toMatchObject({ status: 'completed' });
            expect(saved!.calibrationSpace.globalBounds).not.toBeNull();
            const measurementRecord = saved!.tiles['0-0'].homeMeasurement;
            expect(measurementRecord).not.toBeNull();
            expect(measurementRecord!.sourceWidth).toBe(1920);
            expect(measurementRecord!.sourceHeight).toBe(1080);
            expect(saved!.metrics).toEqual({
                totalTiles: 4,
                completedTiles: 4,
                failedTiles: 0,
                skippedTiles: 0,
            });

            const list = loadCalibrationProfiles(storage);
            expect(list).toHaveLength(1);
            expect(list[0]!.id).toBe(saved!.id);
        });

        it('updates existing profiles when saving with the same id and supports deletion', () => {
            const saved = saveProfile();
            expect(saved).not.toBeNull();

            const updated = saveProfile({ id: saved!.id, name: 'Updated Run' });
            expect(updated).not.toBeNull();
            expect(updated!.name).toBe('Updated Run');
            expect(loadCalibrationProfiles(storage)).toHaveLength(1);

            deleteCalibrationProfile(storage, updated!.id);
            expect(loadCalibrationProfiles(storage)).toEqual([]);
        });

        it('refuses to save when runner summary is missing', () => {
            runnerState.summary = undefined;
            const result = saveProfile();
            expect(result).toBeNull();
        });

        it('derives inferred bounds from adjusted home steps and motor ranges', () => {
            const summary = runnerState.summary!;
            const tileKey = '0-0';
            const customMeasurement = measurementFactory({ x: 0.18, y: -0.07, size: 0.12 });
            const adjustedHome = { x: 0.18, y: -0.07, stepsX: 220, stepsY: -160 };
            const stepToDisplacement = { x: 0.00042, y: -0.00051 };

            summary.tiles[tileKey] = {
                ...summary.tiles[tileKey],
                homeMeasurement: customMeasurement,
                adjustedHome,
                stepToDisplacement,
                inferredBounds: null,
            };

            runnerState.tiles[tileKey] = {
                ...runnerState.tiles[tileKey],
                status: 'completed',
                metrics: {
                    home: customMeasurement,
                    adjustedHome: { x: adjustedHome.x, y: adjustedHome.y },
                    stepToDisplacement,
                    sizeDeltaAtStepTest: 0,
                },
            };

            const saved = saveProfile({ name: 'Bounds from steps' });

            expect(saved).not.toBeNull();
            const bounds = saved!.tiles[tileKey].inferredBounds!;

            const expectedXMin = clampNormalized(
                adjustedHome.x +
                    (MOTOR_MIN_POSITION_STEPS - adjustedHome.stepsX) * stepToDisplacement.x,
            );
            const expectedXMax = clampNormalized(
                adjustedHome.x +
                    (MOTOR_MAX_POSITION_STEPS - adjustedHome.stepsX) * stepToDisplacement.x,
            );
            const expectedYMin = clampNormalized(
                adjustedHome.y +
                    (MOTOR_MIN_POSITION_STEPS - adjustedHome.stepsY) * stepToDisplacement.y,
            );
            const expectedYMax = clampNormalized(
                adjustedHome.y +
                    (MOTOR_MAX_POSITION_STEPS - adjustedHome.stepsY) * stepToDisplacement.y,
            );

            expect(bounds.x.min).toBeCloseTo(Math.min(expectedXMin, expectedXMax), 6);
            expect(bounds.x.max).toBeCloseTo(Math.max(expectedXMin, expectedXMax), 6);
            expect(bounds.y.min).toBeCloseTo(Math.min(expectedYMin, expectedYMax), 6);
            expect(bounds.y.max).toBeCloseTo(Math.max(expectedYMin, expectedYMax), 6);
        });

        it('does not derive inferred bounds when adjusted home is missing', () => {
            const tileKey = '0-0';

            runnerState.summary!.tiles[tileKey] = {
                ...runnerState.summary!.tiles[tileKey],
                adjustedHome: undefined,
                inferredBounds: null,
            };
            runnerState.tiles[tileKey] = {
                ...runnerState.tiles[tileKey],
                metrics: {
                    ...(runnerState.tiles[tileKey].metrics ?? {}),
                    adjustedHome: null,
                },
            };

            const saved = saveProfile({ name: 'Missing adjusted home' });

            expect(saved).not.toBeNull();
            expect(saved!.tiles[tileKey].inferredBounds).toBeNull();
        });
    });

    describe('last selected profile persistence', () => {
        it('persists and clears last selected profile id', () => {
            const storage = new MemoryStorage();
            expect(loadLastCalibrationProfileId(storage)).toBeNull();
            persistLastCalibrationProfileId(storage, 'abc');
            expect(loadLastCalibrationProfileId(storage)).toBe('abc');
            persistLastCalibrationProfileId(storage, null);
            expect(loadLastCalibrationProfileId(storage)).toBeNull();
        });
    });

    describe('import/export calibration profiles', () => {
        let storage: MemoryStorage;
        let runnerState: CalibrationRunnerState;
        let snapshot: GridStateSnapshot;

        beforeEach(() => {
            storage = new MemoryStorage();
            runnerState = createRunnerState();
            snapshot = createGridSnapshot();
        });

        it('wraps exported payloads with metadata marker', () => {
            const saved = saveCalibrationProfile(storage, {
                name: 'Demo Run',
                runnerState,
                gridSnapshot: snapshot,
            });
            expect(saved).not.toBeNull();
            const payload = buildCalibrationProfileExportPayload(saved!);
            expect(payload.type).toBe('mirror.calibration.profile');
            expect(payload.version).toBe(1);
            expect(payload.profile.id).toBe(saved!.id);
        });

        it('imports exported payloads and resolves id conflicts', () => {
            const saved = saveCalibrationProfile(storage, {
                name: 'Demo Run',
                runnerState,
                gridSnapshot: snapshot,
            });
            expect(saved).not.toBeNull();
            const payloadJson = JSON.stringify(buildCalibrationProfileExportPayload(saved!));

            const targetStorage = new MemoryStorage();
            const firstImport = importCalibrationProfileFromJson(targetStorage, payloadJson);
            expect(firstImport.error).toBeUndefined();
            expect(firstImport.profile).not.toBeNull();
            expect(loadCalibrationProfiles(targetStorage)).toHaveLength(1);

            const secondImport = importCalibrationProfileFromJson(targetStorage, payloadJson);
            expect(secondImport.profile).not.toBeNull();
            expect(secondImport.replacedProfileId).toBe(saved!.id);
            expect(secondImport.profile!.id).not.toBe(saved!.id);
            expect(loadCalibrationProfiles(targetStorage)).toHaveLength(2);
        });

        it('rejects invalid payloads early', () => {
            const malformedResult = importCalibrationProfileFromJson(storage, '{not json');
            expect(malformedResult.profile).toBeNull();
            expect(malformedResult.error).toContain('JSON');

            const saved = saveCalibrationProfile(storage, {
                name: 'Demo Run',
                runnerState,
                gridSnapshot: snapshot,
            });
            expect(saved).not.toBeNull();
            const payload = buildCalibrationProfileExportPayload(saved!);
            const invalidPayload = {
                ...payload,
                profile: { ...payload.profile, schemaVersion: 999 },
            };
            const invalidResult = importCalibrationProfileFromJson(
                storage,
                JSON.stringify(invalidPayload),
            );
            expect(invalidResult.profile).toBeNull();
            expect(invalidResult.error).toContain('schema version');
        });
    });
});
