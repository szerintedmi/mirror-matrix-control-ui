// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { categorizePatternErrors } from '../patternValidationStatus';

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
        expect(result.message).toBe('Point(s) outside bounds (2)');
    });

    it('reports capacity errors when no out-of-bounds', () => {
        const errors = [
            makeError('insufficient_calibrated_tiles', 'No remaining tile for point "p1"', {
                patternPointId: 'p1',
            }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe('More points than tiles');
    });

    it('prioritizes out-of-bounds over capacity when both present', () => {
        const errors = [
            makeError('insufficient_calibrated_tiles', 'Not enough tiles'),
            makeError('no_valid_tile_for_point', 'Point "p1" outside bounds', {
                patternPointId: 'p1',
            }),
        ];
        const result = categorizePatternErrors(errors);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe('Point(s) outside bounds (1)');
        // Details should be from the prioritized (out-of-bounds) errors
        expect(result.details).toContain('Point p1');
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
