/**
 * Tests for overlay builder functions.
 */
import { describe, expect, it } from 'vitest';

import type { CalibrationRunSummary } from '@/services/calibration/types';

import {
    buildAlignmentGridOverlay,
    buildBlobOverlays,
    buildExpectedPositionOverlay,
    buildTileBoundsOverlays,
} from '../builders';

describe('buildBlobOverlays', () => {
    it('converts detected blobs to circle overlays', () => {
        const result = buildBlobOverlays({
            blobs: [{ x: 960, y: 540, size: 100, response: 0.8 }],
            sourceWidth: 1920,
            sourceHeight: 1080,
        });

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('circle');
        expect(result[0].style.sizing).toBe('per-axis-average');
    });

    it('applies rotation when rotatePoint is provided', () => {
        const rotatePoint = (p: { x: number; y: number }) => ({
            x: p.y,
            y: -p.x + 1920,
        });

        const result = buildBlobOverlays({
            blobs: [{ x: 100, y: 200, size: 50, response: 0.5 }],
            sourceWidth: 1920,
            sourceHeight: 1080,
            rotatePoint,
        });

        expect(result).toHaveLength(1);
        // Position should be rotated
        expect(result[0].center.x).not.toBeCloseTo(-1 + (100 / 1920) * 2);
    });
});

describe('buildExpectedPositionOverlay', () => {
    it('creates point overlay with crosshair', () => {
        const result = buildExpectedPositionOverlay({
            info: {
                position: { x: 0.5, y: 0.5 },
                maxDistance: 0.1,
            },
        });

        expect(result.type).toBe('point');
        expect(result.style.crosshair).toBe(true);
        expect(result.style.dashed).toBe(true);
        expect(result.style.sizing).toBe('isotropic');
    });

    it('converts viewport coords to centered coords', () => {
        const result = buildExpectedPositionOverlay({
            info: {
                position: { x: 0.5, y: 0.5 }, // Center in viewport [0,1]
            },
        });

        // Center in viewport (0.5, 0.5) -> center in centered (0, 0)
        expect(result.position.x).toBeCloseTo(0);
        expect(result.position.y).toBeCloseTo(0);
    });
});

describe('buildAlignmentGridOverlay', () => {
    const createMockSummary = (
        overrides: Partial<{
            computedTileSize: number;
            adjustedTileFootprintWidth: number;
            adjustedTileFootprintHeight: number;
            tileGapX: number;
            tileGapY: number;
        }> = {},
    ): CalibrationRunSummary => ({
        gridBlueprint: {
            adjustedTileFootprint: {
                width: overrides.adjustedTileFootprintWidth ?? 0.15,
                height:
                    overrides.adjustedTileFootprintHeight ??
                    overrides.adjustedTileFootprintWidth ??
                    0.15,
            },
            tileGap: {
                x: overrides.tileGapX ?? 0,
                y: overrides.tileGapY ?? overrides.tileGapX ?? 0,
            },
            gridOrigin: { x: -0.1, y: -0.1 },
            cameraOriginOffset: { x: 0, y: 0 },
            sourceWidth: 1920,
            sourceHeight: 1080,
        },
        camera: { sourceWidth: 1920, sourceHeight: 1080 },
        stepTestSettings: { deltaSteps: 100 },
        tiles: {
            '0,0': {
                tile: { row: 0, col: 0, key: '0,0' },
                status: 'completed',
                homeMeasurement: { x: 0, y: 0, size: 0.12, response: 0.8, capturedAt: Date.now() },
            },
        },
        outlierAnalysis: overrides.computedTileSize
            ? {
                  enabled: true,
                  outlierTileKeys: [],
                  outlierCount: 0,
                  median: overrides.computedTileSize,
                  mad: 0,
                  nMad: 0,
                  upperThreshold: overrides.computedTileSize,
                  computedTileSize: overrides.computedTileSize,
              }
            : undefined,
    });

    it('returns null when no gridBlueprint', () => {
        const summary: CalibrationRunSummary = {
            gridBlueprint: null,
            camera: null,
            stepTestSettings: { deltaSteps: 100 },
            tiles: {},
        };

        const result = buildAlignmentGridOverlay({ summary });
        expect(result).toBeNull();
    });

    it('returns null when no tiles', () => {
        const summary = createMockSummary();
        summary.tiles = {};

        const result = buildAlignmentGridOverlay({ summary });
        expect(result).toBeNull();
    });

    it('uses pitch-derived footprint for tile spacing', () => {
        // The overlay should align to the measured pitch from the blueprint.
        const summary = createMockSummary({
            computedTileSize: 0.12, // Blob-based (smaller)
            adjustedTileFootprintWidth: 0.18,
            adjustedTileFootprintHeight: 0.15,
        });

        const result = buildAlignmentGridOverlay({ summary });

        expect(result).not.toBeNull();
        expect(result!.tileWidth).toBeCloseTo(0.18);
        expect(result!.tileHeight).toBeCloseTo(0.15);
        expect(result!.renderTileWidth).toBeUndefined();
        expect(result!.renderTileHeight).toBeUndefined();
        expect(result!.tileSizing).toBe('isotropic');
    });

    it('uses configured gap from blueprint', () => {
        const summary = createMockSummary({ tileGapX: 0.02, tileGapY: 0.03 });

        const result = buildAlignmentGridOverlay({ summary });

        expect(result).not.toBeNull();
        expect(result!.gapX).toBe(0.02);
        expect(result!.gapY).toBe(0.03);
    });

    it('handles gap=0 correctly (tiles should touch)', () => {
        const summary = createMockSummary({ tileGapX: 0, tileGapY: 0 });

        const result = buildAlignmentGridOverlay({ summary });

        expect(result).not.toBeNull();
        expect(result!.gapX).toBe(0);
        expect(result!.gapY).toBe(0);
        // With gap=0, tile spacing = tile dimensions, so tiles touch edge-to-edge
    });
});

describe('buildTileBoundsOverlays', () => {
    it('creates rect overlays for tile bounds', () => {
        const result = buildTileBoundsOverlays({
            entries: [
                {
                    key: '0,0',
                    row: 0,
                    col: 0,
                    bounds: { x: { min: -0.1, max: 0.1 }, y: { min: -0.1, max: 0.1 } },
                },
            ],
            cameraOriginOffset: { x: 0, y: 0 },
        });

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('rect');
        expect(result[0].style.sizing).toBe('per-axis');
    });

    it('filters out zero-size bounds', () => {
        const result = buildTileBoundsOverlays({
            entries: [
                {
                    key: '0,0',
                    row: 0,
                    col: 0,
                    bounds: { x: { min: 0, max: 0 }, y: { min: 0, max: 0 } }, // Zero size
                },
            ],
            cameraOriginOffset: { x: 0, y: 0 },
        });

        expect(result).toHaveLength(0);
    });

    it('applies cameraOriginOffset to bounds', () => {
        const result = buildTileBoundsOverlays({
            entries: [
                {
                    key: '0,0',
                    row: 0,
                    col: 0,
                    bounds: { x: { min: 0, max: 0.2 }, y: { min: 0, max: 0.2 } },
                },
            ],
            cameraOriginOffset: { x: 0.1, y: 0.05 },
        });

        expect(result[0].bounds.minX).toBeCloseTo(0.1);
        expect(result[0].bounds.minY).toBeCloseTo(0.05);
        expect(result[0].bounds.maxX).toBeCloseTo(0.3);
        expect(result[0].bounds.maxY).toBeCloseTo(0.25);
    });
});
