import { describe, expect, it } from 'vitest';

import { TILE_PLACEMENT_UNIT } from '../../constants/pattern';
import { DEFAULT_PROJECTION_SETTINGS } from '../../constants/projection';
import { planLegacyPlayback } from '../legacyPlaybackPlanner';

import type { LegacyPattern, MirrorConfig } from '../../types';

const cloneProjectionSettings = () => ({
    ...DEFAULT_PROJECTION_SETTINGS,
    wallOrientation: {
        ...DEFAULT_PROJECTION_SETTINGS.wallOrientation,
        vector: { ...DEFAULT_PROJECTION_SETTINGS.wallOrientation.vector },
    },
    sunOrientation: {
        ...DEFAULT_PROJECTION_SETTINGS.sunOrientation,
        vector: { ...DEFAULT_PROJECTION_SETTINGS.sunOrientation.vector },
    },
    worldUpOrientation: {
        ...DEFAULT_PROJECTION_SETTINGS.worldUpOrientation,
        vector: { ...DEFAULT_PROJECTION_SETTINGS.worldUpOrientation.vector },
    },
    pixelSpacing: { ...DEFAULT_PROJECTION_SETTINGS.pixelSpacing },
});

const createMirrorConfig = (): MirrorConfig => {
    const config: MirrorConfig = new Map();
    config.set('0-0', {
        x: { nodeMac: 'AA:BB:CC:DD:EE:01', motorIndex: 0 },
        y: { nodeMac: 'AA:BB:CC:DD:EE:01', motorIndex: 1 },
    });
    config.set('0-1', {
        x: { nodeMac: 'FF:00:11:22:33:44', motorIndex: 2 },
        y: null,
    });
    return config;
};

const createPattern = (tileCount: number): LegacyPattern => ({
    id: 'pattern-test',
    name: 'Test Pattern',
    canvas: { width: TILE_PLACEMENT_UNIT * tileCount, height: TILE_PLACEMENT_UNIT },
    tiles: Array.from({ length: tileCount }, (_, index) => ({
        id: `tile-${index}`,
        center: {
            x: TILE_PLACEMENT_UNIT * (0.5 + index),
            y: TILE_PLACEMENT_UNIT / 2,
        },
        size: {
            width: TILE_PLACEMENT_UNIT,
            height: TILE_PLACEMENT_UNIT,
        },
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

describe('legacyPlaybackPlanner', () => {
    it('maps mirror assignments and solver outputs into the playback plan', () => {
        const mirrorConfig = createMirrorConfig();
        const plan = planLegacyPlayback({
            gridSize: { rows: 1, cols: 2 },
            mirrorConfig,
            projectionSettings: cloneProjectionSettings(),
            pattern: createPattern(2),
        });

        expect(plan.mirrors).toHaveLength(2);
        const first = plan.mirrors[0];
        expect(first.assignment.x?.nodeMac).toBe('AA:BB:CC:DD:EE:01');
        expect(first.assignment.y?.motorIndex).toBe(1);
        expect(first.patternId).not.toBeNull();
        expect(plan.errors).toHaveLength(0);
    });

    it('propagates solver errors when the pattern exceeds available mirrors', () => {
        const plan = planLegacyPlayback({
            gridSize: { rows: 1, cols: 2 },
            mirrorConfig: createMirrorConfig(),
            projectionSettings: cloneProjectionSettings(),
            pattern: createPattern(5),
        });

        expect(plan.errors.length).toBeGreaterThan(0);
        expect(plan.errors.some((error) => error.code === 'pattern_exceeds_mirrors')).toBe(true);
    });
});
