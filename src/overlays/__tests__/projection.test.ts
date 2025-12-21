/**
 * Tests for overlay projection utilities.
 */
import { describe, expect, it } from 'vitest';

import {
    buildOverlayProjection,
    createPointRotator,
    getRotatedDimensions,
    rotatePointAroundCenter,
    transformRoi,
} from '../projection';

describe('transformRoi', () => {
    const roi = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

    it('returns unchanged roi for 0 degrees', () => {
        const result = transformRoi(roi, 0, 'toScreen');

        expect(result.x).toBeCloseTo(roi.x);
        expect(result.y).toBeCloseTo(roi.y);
        expect(result.width).toBeCloseTo(roi.width);
        expect(result.height).toBeCloseTo(roi.height);
    });

    it('rotates roi 90 degrees toScreen', () => {
        const result = transformRoi(roi, 90, 'toScreen');

        // After 90 CW rotation, width and height should swap
        expect(result.width).toBeCloseTo(roi.height);
        expect(result.height).toBeCloseTo(roi.width);
    });

    it('rotates roi 180 degrees', () => {
        const result = transformRoi(roi, 180, 'toScreen');

        // Width/height preserved, position rotated
        expect(result.width).toBeCloseTo(roi.width);
        expect(result.height).toBeCloseTo(roi.height);
    });

    it('is reversible with toSource', () => {
        const rotated = transformRoi(roi, 90, 'toScreen');
        const restored = transformRoi(rotated, 90, 'toSource');

        expect(restored.x).toBeCloseTo(roi.x);
        expect(restored.y).toBeCloseTo(roi.y);
        expect(restored.width).toBeCloseTo(roi.width);
        expect(restored.height).toBeCloseTo(roi.height);
    });

    it('handles arbitrary rotation angles', () => {
        // Small fine-adjustment rotation (e.g., camera alignment)
        const result = transformRoi(roi, 5, 'toScreen');

        // Should rotate center and expand bounding box slightly
        expect(result.width).toBeGreaterThan(roi.width);
        expect(result.height).toBeGreaterThan(roi.height);
    });

    it('handles negative rotation angles', () => {
        const result = transformRoi(roi, -10, 'toScreen');

        // Should work without throwing
        expect(result.width).toBeGreaterThan(roi.width);
        expect(result.height).toBeGreaterThan(roi.height);
    });

    it('is reversible with arbitrary angles', () => {
        const rotated = transformRoi(roi, 5.5, 'toScreen');
        const restored = transformRoi(rotated, 5.5, 'toSource');

        // Center should be restored (bounding box may differ due to expansion)
        const roiCx = roi.x + roi.width / 2;
        const roiCy = roi.y + roi.height / 2;
        const restoredCx = restored.x + restored.width / 2;
        const restoredCy = restored.y + restored.height / 2;

        expect(restoredCx).toBeCloseTo(roiCx);
        expect(restoredCy).toBeCloseTo(roiCy);
    });
});

describe('getRotatedDimensions', () => {
    it('returns same dimensions for 0 degrees', () => {
        const result = getRotatedDimensions(1920, 1080, 0);

        expect(result.width).toBeCloseTo(1920);
        expect(result.height).toBeCloseTo(1080);
    });

    it('swaps dimensions for 90 degrees', () => {
        const result = getRotatedDimensions(1920, 1080, 90);

        expect(result.width).toBeCloseTo(1080);
        expect(result.height).toBeCloseTo(1920);
    });

    it('returns same dimensions for 180 degrees', () => {
        const result = getRotatedDimensions(1920, 1080, 180);

        expect(result.width).toBeCloseTo(1920);
        expect(result.height).toBeCloseTo(1080);
    });
});

describe('rotatePointAroundCenter', () => {
    it('returns same point for 0 radians', () => {
        const point = { x: 0.3, y: 0.7 };
        const result = rotatePointAroundCenter(point, 0);

        expect(result.x).toBeCloseTo(point.x);
        expect(result.y).toBeCloseTo(point.y);
    });

    it('rotates point 90 degrees clockwise', () => {
        // Point at (0.5, 0) - center right
        // After 90 CW rotation around center, should be at (0.5, 0.5) + rotated offset
        const point = { x: 1, y: 0.5 }; // Right edge center
        const result = rotatePointAroundCenter(point, Math.PI / 2);

        // Should move to bottom center
        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(1);
    });

    it('rotates center point to itself', () => {
        const center = { x: 0.5, y: 0.5 };
        const result = rotatePointAroundCenter(center, Math.PI / 4);

        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(0.5);
    });
});

describe('createPointRotator', () => {
    it('returns undefined for 0 degrees', () => {
        const rotator = createPointRotator(0);
        expect(rotator).toBeUndefined();
    });

    it('returns undefined for 360 degrees', () => {
        const rotator = createPointRotator(360);
        expect(rotator).toBeUndefined();
    });

    it('returns function for non-zero rotation', () => {
        const rotator = createPointRotator(90);
        expect(rotator).toBeInstanceOf(Function);
    });

    it('rotator applies correct rotation', () => {
        const rotator = createPointRotator(90)!;
        const point = { x: 1, y: 0.5 };
        const result = rotator(point);

        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(1);
    });
});

describe('buildOverlayProjection', () => {
    it('creates projection with correct canvas and capture sizes', () => {
        const result = buildOverlayProjection({
            canvasWidth: 800,
            canvasHeight: 600,
            captureWidth: 1920,
            captureHeight: 1080,
        });

        expect(result.canvasSize.width).toBe(800);
        expect(result.canvasSize.height).toBe(600);
        expect(result.captureSize.width).toBe(1920);
        expect(result.captureSize.height).toBe(1080);
    });

    it('computes letterbox for pillarboxed content', () => {
        // 4:3 content in 16:9 canvas -> pillarbox
        const result = buildOverlayProjection({
            canvasWidth: 1920,
            canvasHeight: 1080,
            captureWidth: 1440, // 4:3 aspect
            captureHeight: 1080,
        });

        // Content is narrower, so scaleX < scaleY
        expect(result.letterbox.scaleX).toBeLessThan(result.letterbox.scaleY);
        expect(result.letterbox.offsetX).toBeGreaterThan(0);
    });

    it('computes letterbox for letterboxed content', () => {
        // 21:9 content in 16:9 canvas -> letterbox
        const result = buildOverlayProjection({
            canvasWidth: 1920,
            canvasHeight: 1080,
            captureWidth: 2560, // 21:9 aspect
            captureHeight: 1080,
        });

        // Content is wider, so scaleY < scaleX
        expect(result.letterbox.scaleY).toBeLessThan(result.letterbox.scaleX);
        expect(result.letterbox.offsetY).toBeGreaterThan(0);
    });

    it('includes crop rect when ROI is enabled', () => {
        const result = buildOverlayProjection({
            canvasWidth: 800,
            canvasHeight: 600,
            captureWidth: 1920,
            captureHeight: 1080,
            roi: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, enabled: true },
        });

        expect(result.cropRect).toBeDefined();
        expect(result.cropRect!.x).toBe(0.1);
        expect(result.cropRect!.width).toBe(0.5);
    });

    it('omits crop rect when ROI is disabled', () => {
        const result = buildOverlayProjection({
            canvasWidth: 800,
            canvasHeight: 600,
            captureWidth: 1920,
            captureHeight: 1080,
            roi: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, enabled: false },
        });

        expect(result.cropRect).toBeUndefined();
    });
});
