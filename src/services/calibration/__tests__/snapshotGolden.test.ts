// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { profileToRunSummary } from '@/services/calibrationProfileStorage';
import type { CalibrationProfile } from '@/types';

const fixturePath = path.resolve(
    __dirname,
    '../../../../specs/fixtures/calibration/golden-profile.json',
);

describe('canonical calibration snapshot – golden fixture', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
        type: string;
        version: number;
        profile: CalibrationProfile;
    };

    it('matches profile -> summary shape and preserves bounds/step scales', () => {
        expect(fixture.type).toBe('mirror.calibration.profile');
        const profile = fixture.profile;

        const summary = profileToRunSummary(profile);

        // Camera metadata
        expect(summary.camera).toEqual({
            sourceWidth: profile.calibrationCameraResolution?.width ?? 0,
            sourceHeight: profile.calibrationCameraResolution?.height ?? 0,
        });

        // Blueprint and step settings should be carried over exactly
        expect(summary.gridBlueprint).toEqual(profile.gridBlueprint);
        expect(summary.stepTestSettings).toEqual(profile.stepTestSettings);

        // Tiles: motor reach, footprint, and step scales must be present and match stored values
        const tileKeys = Object.keys(profile.tiles);
        expect(Object.keys(summary.tiles)).toEqual(tileKeys);

        tileKeys.forEach((key) => {
            const profileTile = profile.tiles[key];
            const summaryTile = summary.tiles[key];

            expect(summaryTile.motorReachBounds).toEqual(
                profileTile.motorReachBounds ?? profileTile.combinedBounds,
            );
            expect(summaryTile.footprintBounds).toEqual(
                profileTile.footprintBounds ?? profileTile.combinedBounds,
            );
            expect(summaryTile.stepScale).toEqual({
                x: profileTile.axes.x.stepScale,
                y: profileTile.axes.y.stepScale,
            });

            // Home measurement should carry resolution for downstream camera usage
            expect(summaryTile.homeMeasurement?.sourceWidth).toBe(
                profile.calibrationCameraResolution?.width,
            );
            expect(summaryTile.homeMeasurement?.sourceHeight).toBe(
                profile.calibrationCameraResolution?.height,
            );
        });
    });
});
