import { describe, expect, it } from 'vitest';

import { mapPointerToContent } from '@/hooks/useRoiOverlayInteractions';

describe('mapPointerToContent', () => {
    it('returns identity when content and container ARs match', () => {
        const result = mapPointerToContent(0.5, 0.5, 16 / 9, 16 / 9);
        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.inContent).toBe(true);
    });

    it('maps center correctly with horizontal letterbox (pillarboxing)', () => {
        // Content is 1:1, container is 2:1 → pillarboxed (bars on left/right)
        const result = mapPointerToContent(0.5, 0.5, 1, 2);
        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.inContent).toBe(true);
    });

    it('maps center correctly with vertical letterbox', () => {
        // Content is 2:1, container is 1:1 → letterboxed (bars on top/bottom)
        const result = mapPointerToContent(0.5, 0.5, 2, 1);
        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.inContent).toBe(true);
    });

    it('rejects pointer in the left pillarbox bar', () => {
        // Content 1:1 in a 2:1 container → content occupies center 50% of width
        // scaleX = 1/2 = 0.5, offsetX = (1 - 0.5) / 2 = 0.25
        // Click at rawX = 0.1 → (0.1 - 0.25) / 0.5 = -0.3 → outside
        const result = mapPointerToContent(0.1, 0.5, 1, 2);
        expect(result.inContent).toBe(false);
        expect(result.x).toBe(0); // clamped
    });

    it('rejects pointer in the right pillarbox bar', () => {
        // Content 1:1 in a 2:1 container → content ends at 0.75
        const result = mapPointerToContent(0.9, 0.5, 1, 2);
        expect(result.inContent).toBe(false);
        expect(result.x).toBe(1); // clamped
    });

    it('rejects pointer in the top letterbox bar', () => {
        // Content 2:1 in a 1:1 container → content occupies center 50% of height
        // scaleY = 1/2 = 0.5, offsetY = 0.25
        const result = mapPointerToContent(0.5, 0.1, 2, 1);
        expect(result.inContent).toBe(false);
        expect(result.y).toBe(0); // clamped
    });

    it('rejects pointer in the bottom letterbox bar', () => {
        const result = mapPointerToContent(0.5, 0.9, 2, 1);
        expect(result.inContent).toBe(false);
        expect(result.y).toBe(1); // clamped
    });

    it('maps edge of content area correctly (pillarboxed)', () => {
        // Content 1:1 in 2:1 container → content left edge at rawX = 0.25
        const result = mapPointerToContent(0.25, 0.5, 1, 2);
        expect(result.x).toBeCloseTo(0);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.inContent).toBe(true);
    });

    it('maps right edge of content area correctly (pillarboxed)', () => {
        // Content right edge at rawX = 0.75
        const result = mapPointerToContent(0.75, 0.5, 1, 2);
        expect(result.x).toBeCloseTo(1);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.inContent).toBe(true);
    });

    it('maps within content with non-trivial letterbox', () => {
        // Content 4:3, container 16:9
        // contentAR = 4/3 ≈ 1.333, containerAR = 16/9 ≈ 1.778
        // content is wider than needed → pillarboxed
        // scaleX = (4/3) / (16/9) = 0.75, offsetX = (1 - 0.75) / 2 = 0.125
        const result = mapPointerToContent(0.5, 0.5, 4 / 3, 16 / 9);
        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.inContent).toBe(true);
    });

    it('maps a point within the content area with vertical letterbox', () => {
        // Content 16:9 in a 4:3 container
        // scaleY = (4/3) / (16/9) = 0.75, offsetY = 0.125
        // Point at rawY = 0.5 → (0.5 - 0.125) / 0.75 = 0.5
        const result = mapPointerToContent(0.5, 0.5, 16 / 9, 4 / 3);
        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.inContent).toBe(true);

        // Point at rawY = 0.25 → (0.25 - 0.125) / 0.75 ≈ 0.167
        const result2 = mapPointerToContent(0.5, 0.25, 16 / 9, 4 / 3);
        expect(result2.y).toBeCloseTo(0.167, 2);
        expect(result2.inContent).toBe(true);
    });
});
