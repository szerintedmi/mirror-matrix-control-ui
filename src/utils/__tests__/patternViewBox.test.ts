// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
    computeAutoZoomBounds,
    boundsToViewBox,
    parseViewBox,
    screenToCentered,
    getViewBoxScale,
} from '../patternViewBox';

describe('patternViewBox', () => {
    describe('computeAutoZoomBounds', () => {
        it('should return null for empty inputs', () => {
            const result = computeAutoZoomBounds([], [], 0.04);
            expect(result).toBeNull();
        });

        it('should compute bounds from points only', () => {
            const points = [
                { x: 0, y: 0 },
                { x: 0.5, y: 0.5 },
            ];
            const result = computeAutoZoomBounds(points, [], 0.04, 0);

            expect(result).not.toBeNull();
            // x: 0 - 0.04 = -0.04 to 0.5 + 0.04 = 0.54
            expect(result!.xMin).toBeCloseTo(-0.04);
            expect(result!.xMax).toBeCloseTo(0.54);
            // y: 0 - 0.04 = -0.04 to 0.5 + 0.04 = 0.54
            expect(result!.yMin).toBeCloseTo(-0.04);
            expect(result!.yMax).toBeCloseTo(0.54);
        });

        it('should compute bounds from tile bounds only', () => {
            const tileBounds = [
                { xMin: -0.5, xMax: 0, yMin: -0.5, yMax: 0 },
                { xMin: 0, xMax: 0.5, yMin: 0, yMax: 0.5 },
            ];
            const result = computeAutoZoomBounds([], tileBounds, 0.04, 0);

            expect(result).not.toBeNull();
            expect(result!.xMin).toBeCloseTo(-0.5);
            expect(result!.xMax).toBeCloseTo(0.5);
            expect(result!.yMin).toBeCloseTo(-0.5);
            expect(result!.yMax).toBeCloseTo(0.5);
        });

        it('should compute union of points and tile bounds', () => {
            const points = [{ x: 0.8, y: 0.8 }];
            const tileBounds = [{ xMin: -0.5, xMax: 0, yMin: -0.5, yMax: 0 }];
            const result = computeAutoZoomBounds(points, tileBounds, 0.04, 0);

            expect(result).not.toBeNull();
            // Takes max of both
            expect(result!.xMin).toBeCloseTo(-0.5);
            expect(result!.xMax).toBeCloseTo(0.84); // 0.8 + 0.04
            expect(result!.yMin).toBeCloseTo(-0.5);
            expect(result!.yMax).toBeCloseTo(0.84);
        });

        it('should apply padding correctly', () => {
            const points = [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
            ];
            // Bounds without padding: -0.04 to 1.04 (width = 1.08)
            // With 10% padding: 1.08 * 0.1 = 0.108 on each side
            const result = computeAutoZoomBounds(points, [], 0.04, 0.1);

            expect(result).not.toBeNull();
            const width = result!.xMax - result!.xMin;
            expect(width).toBeGreaterThan(1.08);
        });

        it('should handle negative coordinates', () => {
            const points = [
                { x: -0.8, y: -0.8 },
                { x: -0.2, y: -0.2 },
            ];
            const result = computeAutoZoomBounds(points, [], 0.04, 0);

            expect(result).not.toBeNull();
            expect(result!.xMin).toBeCloseTo(-0.84);
            expect(result!.xMax).toBeCloseTo(-0.16);
        });
    });

    describe('boundsToViewBox', () => {
        it('should return default viewBox for null bounds', () => {
            const result = boundsToViewBox(null);
            expect(result).toBe('0 0 1 1');
        });

        it('should convert centered bounds to view space', () => {
            // Centered space: -1 to 1 (full range)
            const bounds = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
            const result = boundsToViewBox(bounds);
            expect(result).toBe('0 0 1 1');
        });

        it('should preserve content aspect ratio (not force square)', () => {
            // Bounds wider than tall
            const bounds = { xMin: -0.6, xMax: 0.6, yMin: -0.3, yMax: 0.3 };
            const result = boundsToViewBox(bounds);
            const parsed = parseViewBox(result);

            // Width in view space: (0.6+1)/2 - (-0.6+1)/2 = 0.8 - 0.2 = 0.6
            // Height in view space: (0.3+1)/2 - (-0.3+1)/2 = 0.65 - 0.35 = 0.3
            // Should use actual dimensions, not force square
            expect(parsed.width).toBeCloseTo(0.6);
            expect(parsed.height).toBeCloseTo(0.3);
        });

        it('should start viewBox at content origin (top-left alignment)', () => {
            // Bounds offset from center
            const bounds = { xMin: 0, xMax: 0.5, yMin: 0, yMax: 0.5 };
            const result = boundsToViewBox(bounds);
            const parsed = parseViewBox(result);

            // ViewBox should start at content origin, not be centered
            // xMin=0 in centered -> 0.5 in view space
            // yMin=0 in centered -> 0.5 in view space
            expect(parsed.x).toBeCloseTo(0.5);
            expect(parsed.y).toBeCloseTo(0.5);
            expect(parsed.width).toBeCloseTo(0.25);
            expect(parsed.height).toBeCloseTo(0.25);
        });

        it('should enforce minimum viewBox size', () => {
            // Very small bounds
            const bounds = { xMin: -0.01, xMax: 0.01, yMin: -0.01, yMax: 0.01 };
            const result = boundsToViewBox(bounds);
            const parsed = parseViewBox(result);

            // Should not be smaller than MIN_VIEWBOX_SIZE (0.05)
            expect(parsed.width).toBeGreaterThanOrEqual(0.05);
            expect(parsed.height).toBeGreaterThanOrEqual(0.05);
        });
    });

    describe('parseViewBox', () => {
        it('should parse valid viewBox string', () => {
            const result = parseViewBox('0.1 0.2 0.3 0.4');
            expect(result).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
        });

        it('should handle default viewBox', () => {
            const result = parseViewBox('0 0 1 1');
            expect(result).toEqual({ x: 0, y: 0, width: 1, height: 1 });
        });

        it('should handle negative values', () => {
            const result = parseViewBox('-0.5 -0.5 2 2');
            expect(result).toEqual({ x: -0.5, y: -0.5, width: 2, height: 2 });
        });
    });

    describe('screenToCentered', () => {
        it('should convert center with default viewBox', () => {
            const result = screenToCentered(0.5, 0.5, '0 0 1 1');
            expect(result.x).toBeCloseTo(0);
            expect(result.y).toBeCloseTo(0);
        });

        it('should convert corners with default viewBox', () => {
            const topLeft = screenToCentered(0, 0, '0 0 1 1');
            expect(topLeft.x).toBeCloseTo(-1);
            expect(topLeft.y).toBeCloseTo(-1);

            const bottomRight = screenToCentered(1, 1, '0 0 1 1');
            expect(bottomRight.x).toBeCloseTo(1);
            expect(bottomRight.y).toBeCloseTo(1);
        });

        it('should handle zoomed viewBox', () => {
            // ViewBox centered at (0.5, 0.5) with size 0.5
            // This means the visible area is [0.25, 0.75] in view space
            const viewBox = '0.25 0.25 0.5 0.5';

            // Screen center (0.5, 0.5) maps to center of viewBox
            const center = screenToCentered(0.5, 0.5, viewBox);
            // ViewBox coords: 0.25 + 0.5 * 0.5 = 0.5, 0.5
            // Centered: 0.5 * 2 - 1 = 0, 0
            expect(center.x).toBeCloseTo(0);
            expect(center.y).toBeCloseTo(0);

            // Screen top-left (0, 0) maps to top-left of viewBox
            const topLeft = screenToCentered(0, 0, viewBox);
            // ViewBox coords: 0.25, 0.25
            // Centered: 0.25 * 2 - 1 = -0.5, -0.5
            expect(topLeft.x).toBeCloseTo(-0.5);
            expect(topLeft.y).toBeCloseTo(-0.5);
        });

        it('should handle offset viewBox', () => {
            // ViewBox starts at (0.2, 0.3) with size 0.5
            const viewBox = '0.2 0.3 0.5 0.5';

            const topLeft = screenToCentered(0, 0, viewBox);
            // ViewBox coords: 0.2, 0.3
            // Centered: 0.2 * 2 - 1 = -0.6, 0.3 * 2 - 1 = -0.4
            expect(topLeft.x).toBeCloseTo(-0.6);
            expect(topLeft.y).toBeCloseTo(-0.4);
        });
    });

    describe('getViewBoxScale', () => {
        it('should return 1 for default viewBox', () => {
            expect(getViewBoxScale('0 0 1 1')).toBe(1);
        });

        it('should return smaller dimension of viewBox', () => {
            // Square viewBox - returns same value
            expect(getViewBoxScale('0 0 0.5 0.5')).toBe(0.5);
            expect(getViewBoxScale('0.25 0.25 0.25 0.25')).toBe(0.25);
            // Non-square viewBox - returns smaller dimension
            expect(getViewBoxScale('0 0 0.6 0.3')).toBe(0.3);
            expect(getViewBoxScale('0 0 0.2 0.8')).toBe(0.2);
        });
    });

    describe('round-trip consistency', () => {
        it('should correctly map screen positions through viewBox transformation', () => {
            // Create bounds and get viewBox
            const points = [
                { x: 0.2, y: 0.2 },
                { x: 0.6, y: 0.6 },
            ];
            const blobRadius = 0.04;
            const padding = 0.05;
            const bounds = computeAutoZoomBounds(points, [], blobRadius, padding);
            const viewBox = boundsToViewBox(bounds);

            // With top-left alignment, screen (0, 0) maps to bounds min
            // bounds: xMin = 0.2 - 0.04 - padding, yMin = 0.2 - 0.04 - padding
            const screenTopLeft = screenToCentered(0, 0, viewBox);
            expect(screenTopLeft.x).toBeCloseTo(bounds!.xMin, 1);
            expect(screenTopLeft.y).toBeCloseTo(bounds!.yMin, 1);

            // Screen (1, 1) maps to bounds max
            const screenBottomRight = screenToCentered(1, 1, viewBox);
            expect(screenBottomRight.x).toBeCloseTo(bounds!.xMax, 1);
            expect(screenBottomRight.y).toBeCloseTo(bounds!.yMax, 1);
        });
    });
});
