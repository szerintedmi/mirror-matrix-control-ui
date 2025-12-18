// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
    centeredBoundsToPattern,
    centeredToPattern,
    getSpaceParams,
    patternToCentered,
    type SpaceConversionParams,
} from '../spaceConversion';

import type { CalibrationProfile } from '../../types';

describe('spaceConversion', () => {
    describe('getSpaceParams', () => {
        it('extracts params from profile with explicit values', () => {
            const profile = {
                calibrationCameraAspect: 1.5,
                arrayRotation: 90,
            } as CalibrationProfile;

            const params = getSpaceParams(profile);

            expect(params.aspect).toBe(1.5);
            expect(params.rotation).toBe(90);
        });

        it('uses defaults for missing values', () => {
            const profile = {
                calibrationCameraAspect: null,
                arrayRotation: undefined,
            } as unknown as CalibrationProfile;

            const params = getSpaceParams(profile);

            expect(params.aspect).toBeCloseTo(16 / 9, 5);
            expect(params.rotation).toBe(0);
        });
    });

    describe('patternToCentered', () => {
        const defaultParams: SpaceConversionParams = { aspect: 16 / 9, rotation: 0 };

        it('scales Y by aspect ratio (no rotation)', () => {
            const point = { x: 0.5, y: 0.5 };
            const result = patternToCentered(point, defaultParams);

            expect(result.x).toBe(0.5);
            expect(result.y).toBeCloseTo(0.5 * (16 / 9), 10);
        });

        it('leaves origin unchanged', () => {
            const point = { x: 0, y: 0 };
            const result = patternToCentered(point, defaultParams);

            expect(result.x).toBe(0);
            expect(result.y).toBe(0);
        });

        it('handles corners of pattern space', () => {
            const params: SpaceConversionParams = { aspect: 2, rotation: 0 };

            const topRight = patternToCentered({ x: 1, y: 1 }, params);
            expect(topRight.x).toBe(1);
            expect(topRight.y).toBe(2);

            const bottomLeft = patternToCentered({ x: -1, y: -1 }, params);
            expect(bottomLeft.x).toBe(-1);
            expect(bottomLeft.y).toBe(-2);
        });

        describe('rotation handling', () => {
            const aspectParams = (rotation: 0 | 90 | 180 | 270): SpaceConversionParams => ({
                aspect: 1, // Use 1 to isolate rotation effects
                rotation,
            });

            it('0° rotation: identity', () => {
                const result = patternToCentered({ x: 1, y: 0 }, aspectParams(0));
                expect(result.x).toBeCloseTo(1, 10);
                expect(result.y).toBeCloseTo(0, 10);
            });

            it('90° CW rotation: (x, y) → (y, -x)', () => {
                const result = patternToCentered({ x: 1, y: 0 }, aspectParams(90));
                expect(result.x).toBeCloseTo(0, 10);
                expect(result.y).toBeCloseTo(-1, 10);
            });

            it('180° rotation: (x, y) → (-x, -y)', () => {
                const result = patternToCentered({ x: 1, y: 0 }, aspectParams(180));
                expect(result.x).toBeCloseTo(-1, 10);
                expect(result.y).toBeCloseTo(0, 10);
            });

            it('270° CW rotation: (x, y) → (-y, x)', () => {
                const result = patternToCentered({ x: 1, y: 0 }, aspectParams(270));
                expect(result.x).toBeCloseTo(0, 10);
                expect(result.y).toBeCloseTo(1, 10);
            });

            it('combines rotation with aspect scaling', () => {
                const params: SpaceConversionParams = { aspect: 2, rotation: 90 };
                // (1, 0) --rotate 90 CW--> (0, -1) --scale Y by 2--> (0, -2)
                const result = patternToCentered({ x: 1, y: 0 }, params);
                expect(result.x).toBeCloseTo(0, 10);
                expect(result.y).toBeCloseTo(-2, 10);
            });
        });
    });

    describe('centeredToPattern', () => {
        const defaultParams: SpaceConversionParams = { aspect: 16 / 9, rotation: 0 };

        it('removes aspect ratio scaling from Y (no rotation)', () => {
            const point = { x: 0.5, y: 0.5 * (16 / 9) };
            const result = centeredToPattern(point, defaultParams);

            expect(result.x).toBeCloseTo(0.5, 10);
            expect(result.y).toBeCloseTo(0.5, 10);
        });

        it('leaves origin unchanged', () => {
            const point = { x: 0, y: 0 };
            const result = centeredToPattern(point, defaultParams);

            expect(result.x).toBe(0);
            expect(result.y).toBe(0);
        });

        describe('rotation handling', () => {
            const aspectParams = (rotation: 0 | 90 | 180 | 270): SpaceConversionParams => ({
                aspect: 1,
                rotation,
            });

            it('90° CW inverse: (y, -x) → (x, y)', () => {
                // If patternToCentered(1, 0) at 90° gave (0, -1),
                // then centeredToPattern(0, -1) at 90° should give (1, 0)
                const result = centeredToPattern({ x: 0, y: -1 }, aspectParams(90));
                expect(result.x).toBeCloseTo(1, 10);
                expect(result.y).toBeCloseTo(0, 10);
            });

            it('180° inverse: (-x, -y) → (x, y)', () => {
                const result = centeredToPattern({ x: -1, y: 0 }, aspectParams(180));
                expect(result.x).toBeCloseTo(1, 10);
                expect(result.y).toBeCloseTo(0, 10);
            });

            it('270° CW inverse: (-y, x) → (x, y)', () => {
                const result = centeredToPattern({ x: 0, y: 1 }, aspectParams(270));
                expect(result.x).toBeCloseTo(1, 10);
                expect(result.y).toBeCloseTo(0, 10);
            });
        });
    });

    describe('round-trip conversion', () => {
        const testCases: Array<{
            name: string;
            params: SpaceConversionParams;
        }> = [
            { name: 'aspect 16:9, no rotation', params: { aspect: 16 / 9, rotation: 0 } },
            { name: 'aspect 16:9, 90° rotation', params: { aspect: 16 / 9, rotation: 90 } },
            { name: 'aspect 16:9, 180° rotation', params: { aspect: 16 / 9, rotation: 180 } },
            { name: 'aspect 16:9, 270° rotation', params: { aspect: 16 / 9, rotation: 270 } },
            { name: 'aspect 4:3, no rotation', params: { aspect: 4 / 3, rotation: 0 } },
            { name: 'square aspect, 90° rotation', params: { aspect: 1, rotation: 90 } },
        ];

        const points = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: -1 },
            { x: 0.5, y: -0.3 },
        ];

        testCases.forEach(({ name, params }) => {
            describe(name, () => {
                points.forEach((point) => {
                    it(`round-trip for (${point.x}, ${point.y})`, () => {
                        const centered = patternToCentered(point, params);
                        const roundTrip = centeredToPattern(centered, params);

                        expect(roundTrip.x).toBeCloseTo(point.x, 10);
                        expect(roundTrip.y).toBeCloseTo(point.y, 10);
                    });
                });
            });
        });
    });

    describe('centeredBoundsToPattern', () => {
        it('scales Y bounds by inverse aspect ratio', () => {
            const bounds = {
                x: { min: -1, max: 1 },
                y: { min: -1.78, max: 1.78 },
            };
            const params: SpaceConversionParams = { aspect: 1.78, rotation: 0 };

            const result = centeredBoundsToPattern(bounds, params);

            expect(result.xMin).toBe(-1);
            expect(result.xMax).toBe(1);
            expect(result.yMin).toBeCloseTo(-1, 5);
            expect(result.yMax).toBeCloseTo(1, 5);
        });

        it('preserves asymmetric bounds', () => {
            const bounds = {
                x: { min: -0.5, max: 0.8 },
                y: { min: -1, max: 0.5 },
            };
            const params: SpaceConversionParams = { aspect: 2, rotation: 0 };

            const result = centeredBoundsToPattern(bounds, params);

            expect(result.xMin).toBe(-0.5);
            expect(result.xMax).toBe(0.8);
            expect(result.yMin).toBe(-0.5);
            expect(result.yMax).toBe(0.25);
        });
    });
});
