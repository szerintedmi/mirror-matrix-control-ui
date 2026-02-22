// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildPointErrorMap, categorizePatternErrors } from '../patternValidationStatus';

import type { ProfilePlaybackValidationError } from '../profilePlaybackPlanner';

const makeError = (
    code: ProfilePlaybackValidationError['code'],
    message: string,
    extra?: Partial<ProfilePlaybackValidationError>,
): ProfilePlaybackValidationError => ({
    code,
    message,
    ...extra,
});

describe('categorizePatternErrors', () => {
    it('returns valid when no errors', () => {
        expect(categorizePatternErrors([])).toEqual({ isValid: true });
    });

    it('filters out missing_profile and missing_pattern', () => {
        const errors = [
            makeError('missing_profile', 'Select a profile'),
            makeError('missing_pattern', 'Select a pattern'),
        ];
        expect(categorizePatternErrors(errors)).toEqual({ isValid: true });
    });

    it('reports out-of-bounds errors with count', () => {
        const errors = [
            makeError('no_valid_tile_for_point', 'Point "p1" outside all tile bounds', {
                patternPointId: 'p1',
            }),
            makeError('no_valid_tile_for_point', 'Point "p2" outside all tile bounds', {
                patternPointId: 'p2',
            }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe('2 points out of bounds');
    });

    it('reports occupied tile errors distinctly from capacity', () => {
        const errors = [
            makeError('no_remaining_tile_for_point', 'All compatible tiles already assigned', {
                patternPointId: 'p1',
            }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe('1 spot conflicts');
    });

    it('reports capacity errors when no out-of-bounds or occupied', () => {
        const errors = [makeError('insufficient_calibrated_tiles', 'Not enough calibrated tiles')];
        const result = categorizePatternErrors(errors);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe('More points than tiles');
    });

    it('prioritizes out-of-bounds over occupied and capacity', () => {
        const errors = [
            makeError('no_remaining_tile_for_point', 'Tiles taken', { patternPointId: 'p1' }),
            makeError('insufficient_calibrated_tiles', 'Not enough tiles'),
            makeError('no_valid_tile_for_point', 'Point "p2" outside bounds', {
                patternPointId: 'p2',
            }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe('1 point out of bounds');
        expect(result.details).toContain('Point p2');
    });

    it('prioritizes occupied over capacity', () => {
        const errors = [
            makeError('insufficient_calibrated_tiles', 'Not enough tiles'),
            makeError('no_remaining_tile_for_point', 'Tiles taken', { patternPointId: 'p1' }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.message).toBe('1 spot conflicts');
    });

    it('formats details with point/axis/tile labels', () => {
        const errors = [
            makeError('target_out_of_bounds', 'Target exceeds range', {
                patternPointId: 'p1',
                axis: 'x',
                mirrorId: '0-0',
            }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.details).toBe('Point p1 X @ 0-0: Target exceeds range');
    });

    it('caps details at 3 with remaining count', () => {
        const errors = Array.from({ length: 5 }, (_, i) =>
            makeError('no_valid_tile_for_point', `Point ${i} outside bounds`, {
                patternPointId: `p${i}`,
            }),
        );
        const result = categorizePatternErrors(errors);
        expect(result.details).toContain('+2 more');
    });

    it('falls back to first error message for unknown codes', () => {
        const errors = [
            makeError('tile_not_calibrated', 'Tile 0-0 is not calibrated', {
                mirrorId: '0-0',
            }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.message).toBe('Tile 0-0 is not calibrated');
    });
});

describe('buildPointErrorMap', () => {
    it('returns empty map for no errors', () => {
        expect(buildPointErrorMap([]).size).toBe(0);
    });

    it('maps out-of-bounds point to friendly reason', () => {
        const errors = [
            makeError('no_valid_tile_for_point', 'technical message', {
                patternPointId: 'p1',
            }),
        ];
        const map = buildPointErrorMap(errors);
        expect(map.get('p1')).toBe('Outside tile bounds');
    });

    it('maps occupied tile error to friendly reason', () => {
        const errors = [
            makeError('no_remaining_tile_for_point', 'technical message', {
                patternPointId: 'p1',
            }),
        ];
        const map = buildPointErrorMap(errors);
        expect(map.get('p1')).toBe('Tile already assigned');
    });

    it('maps capacity error to friendly reason', () => {
        const errors = [
            makeError('insufficient_calibrated_tiles', 'technical message', {
                patternPointId: 'p1',
            }),
        ];
        const map = buildPointErrorMap(errors);
        expect(map.get('p1')).toBe('Not enough tiles');
    });

    it('keeps first error per point', () => {
        const errors = [
            makeError('no_valid_tile_for_point', 'first', { patternPointId: 'p1' }),
            makeError('no_remaining_tile_for_point', 'second', { patternPointId: 'p1' }),
        ];
        const map = buildPointErrorMap(errors);
        expect(map.get('p1')).toBe('Outside tile bounds');
    });

    it('skips errors without patternPointId', () => {
        const errors = [makeError('insufficient_calibrated_tiles', 'global error')];
        expect(buildPointErrorMap(errors).size).toBe(0);
    });
});
