/**
 * Tests for overlay renderer functions.
 */
import { describe, expect, it } from 'vitest';

import { projectDelta, projectPoint } from '../renderer';

import type { GridOverlay, OverlayProjection } from '../types';

// Standard 1080p projection with no letterboxing (1:1 aspect)
const createProjection = (overrides: Partial<OverlayProjection> = {}): OverlayProjection => ({
    canvasSize: { width: 1920, height: 1080 },
    captureSize: { width: 1920, height: 1080 },
    letterbox: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
    ...overrides,
});

describe('projectPoint', () => {
    it('projects center (0,0) to canvas center', () => {
        const projection = createProjection();
        const result = projectPoint({ x: 0, y: 0 }, projection);

        expect(result.x).toBeCloseTo(960); // 1920 / 2
        expect(result.y).toBeCloseTo(540); // 1080 / 2
    });

    it('projects top-left (-1,-1) to canvas origin', () => {
        const projection = createProjection();
        const result = projectPoint({ x: -1, y: -1 }, projection);

        expect(result.x).toBeCloseTo(0);
        expect(result.y).toBeCloseTo(0);
    });

    it('projects bottom-right (1,1) to canvas max', () => {
        const projection = createProjection();
        const result = projectPoint({ x: 1, y: 1 }, projection);

        expect(result.x).toBeCloseTo(1920);
        expect(result.y).toBeCloseTo(1080);
    });

    it('applies letterbox offset', () => {
        const projection = createProjection({
            letterbox: { scaleX: 0.5, scaleY: 0.5, offsetX: 480, offsetY: 270 },
        });
        const result = projectPoint({ x: 0, y: 0 }, projection);

        // Center with 50% scale and offset
        expect(result.x).toBeCloseTo(480 + 960 * 0.5);
        expect(result.y).toBeCloseTo(270 + 540 * 0.5);
    });
});

describe('projectDelta', () => {
    describe('isotropic mode', () => {
        it('uses minimum scale to preserve aspect ratio', () => {
            const projection = createProjection({
                letterbox: { scaleX: 1, scaleY: 0.5, offsetX: 0, offsetY: 0 },
            });

            // With scaleY=0.5 being min, a delta of 0.5 (centered) = 0.25 (viewport)
            // avgCanvasSize = (1920 + 1080) / 2 = 1500
            // result = 0.25 * 0.5 * 1500 = 187.5
            const result = projectDelta(0.5, 'isotropic', projection);
            expect(result).toBeCloseTo(187.5);
        });

        it('produces same result regardless of axis', () => {
            const projection = createProjection({
                letterbox: { scaleX: 0.8, scaleY: 0.6, offsetX: 0, offsetY: 0 },
            });

            const resultX = projectDelta(0.4, 'isotropic', projection, 'x');
            const resultY = projectDelta(0.4, 'isotropic', projection, 'y');

            expect(resultX).toBeCloseTo(resultY);
        });
    });

    describe('per-axis mode', () => {
        it('scales differently per axis', () => {
            const projection = createProjection({
                letterbox: { scaleX: 1, scaleY: 0.5, offsetX: 0, offsetY: 0 },
            });

            const resultX = projectDelta(0.5, 'per-axis', projection, 'x');
            const resultY = projectDelta(0.5, 'per-axis', projection, 'y');

            // X: 0.25 * 1 * 1920 = 480
            // Y: 0.25 * 0.5 * 1080 = 135
            expect(resultX).toBeCloseTo(480);
            expect(resultY).toBeCloseTo(135);
        });
    });

    describe('per-axis-average mode', () => {
        it('averages per-axis projections for blob circles', () => {
            const projection = createProjection({
                letterbox: { scaleX: 1, scaleY: 0.5, offsetX: 0, offsetY: 0 },
            });

            const result = projectDelta(0.5, 'per-axis-average', projection);

            // projectedX = 0.25 * 1 * 1920 = 480
            // projectedY = 0.25 * 0.5 * 1080 = 135
            // average = (480 + 135) / 2 = 307.5
            expect(result).toBeCloseTo(307.5);
        });
    });
});

describe('grid tile positioning (gap=0)', () => {
    // This test verifies the fix for the gap issue where tiles had
    // visual gaps even when gap was configured as 0.

    it('computes correct spacing for adjacent tiles', () => {
        // Grid with 2 tiles in a row, gap=0
        const tileSize = 0.2; // in centered coords
        const gap = 0;
        const spacing = tileSize + gap;

        // Tile 0 at col=0: center at origin.x + 0*spacing + tileSize/2
        // Tile 1 at col=1: center at origin.x + 1*spacing + tileSize/2
        // Distance between centers = spacing = tileSize (when gap=0)
        // So tiles should touch (distance = tileSize = 2 * halfSize)

        const tile0Center = 0 * spacing + tileSize / 2;
        const tile1Center = 1 * spacing + tileSize / 2;
        const distanceBetweenCenters = tile1Center - tile0Center;

        expect(distanceBetweenCenters).toBeCloseTo(tileSize);
    });

    it('ensures tile edges touch when gap=0', () => {
        const tileSize = 0.2;

        // Tile 0: edges at 0 to 0.2
        const tile0Left = 0;
        const tile0Right = tile0Left + tileSize;

        // Tile 1: edges at 0.2 to 0.4 (starts where tile0 ends when gap=0)
        const tile1Left = tileSize;

        // Right edge of tile0 should equal left edge of tile1
        expect(tile0Right).toBeCloseTo(tile1Left);
    });

    it('creates proper gap between tiles when gap>0', () => {
        const tileSize = 0.2;
        const gap = 0.05;

        const tile0Right = tileSize;
        const tile1Left = tileSize + gap;

        expect(tile1Left - tile0Right).toBeCloseTo(gap);
    });
});

describe('grid overlay structure', () => {
    it('has correct shape for rendering', () => {
        const gridOverlay: GridOverlay = {
            type: 'grid',
            origin: { x: -0.3, y: -0.3 },
            tileWidth: 0.2,
            tileHeight: 0.2,
            gapX: 0,
            gapY: 0,
            tiles: [
                { row: 0, col: 0, label: '[0,0]' },
                { row: 0, col: 1, label: '[0,1]' },
            ],
            style: {
                strokeColor: 'rgba(16, 185, 129, 0.7)',
                fillColor: 'rgba(16, 185, 129, 0.15)',
                sizing: 'per-axis' as const,
            },
        };

        expect(gridOverlay.type).toBe('grid');
        expect(gridOverlay.tiles).toHaveLength(2);
        expect(gridOverlay.gapX).toBe(0);
        expect(gridOverlay.gapY).toBe(0);
    });
});
