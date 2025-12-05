import { describe, expect, it } from 'vitest';

import {
    asCameraPixels,
    asCentered,
    asIsotropic,
    asViewport,
    convert,
    convertDelta,
    createTransformer,
    type ConvertContext,
} from './index';

const ctx: ConvertContext = { width: 1920, height: 1080 };

const expectClose = (actual: number, expected: number, precision = 6) => {
    expect(actual).toBeCloseTo(expected, precision);
};

const expectCoordClose = (
    actual: { x: number; y: number },
    expected: { x: number; y: number },
    precision = 6,
) => {
    expectClose(actual.x, expected.x, precision);
    expectClose(actual.y, expected.y, precision);
};

describe('coords kernel', () => {
    const transformer = createTransformer(ctx);

    it('converts camera pixels to viewport and centered', () => {
        const px = asCameraPixels(960, 540); // center of 1920x1080
        const viewport = transformer.toViewport(px, 'camera');
        expectCoordClose(viewport, asViewport(0.5, 0.5));

        const centered = transformer.toCentered(px, 'camera');
        expectCoordClose(centered, asCentered(0, 0));
    });

    it('converts centered to camera pixels', () => {
        const centered = asCentered(0, 0);
        const camera = transformer.toCamera(centered, 'centered');
        expectCoordClose(camera, asCameraPixels(960, 540));
    });

    it('round-trips isotropic through camera pixels', () => {
        // top-left corner in isotropic space
        const iso = asIsotropic(0, 0);
        const camera = transformer.toCamera(iso, 'isotropic');
        const back = transformer.toIsotropic(camera, 'camera');
        expectCoordClose(back, iso);
    });

    it('supports direct convert helper between spaces', () => {
        const centered = asCentered(0.25, -0.25);
        const iso = convert(centered, 'centered', 'isotropic', ctx);
        const back = convert(iso, 'isotropic', 'centered', ctx);
        expectCoordClose(back, centered);
    });

    it('converts deltas per axis', () => {
        // viewport delta 0.1 on X -> 192px in camera; back to centered -> 0.2
        const cameraDx = convertDelta(0.1, 'x', 'viewport', 'camera', ctx);
        expectClose(cameraDx, 192);

        const centeredDx = convertDelta(cameraDx, 'x', 'camera', 'centered', ctx);
        expectClose(centeredDx, 0.2);

        // isotropic delta uses max dimension (1920)
        const isoDy = convertDelta(0.1, 'y', 'viewport', 'isotropic', ctx);
        expectClose(isoDy, 0.05625, 9);
    });
});
