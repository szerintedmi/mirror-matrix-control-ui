import type { ProfilePlaybackValidationError } from './profilePlaybackPlanner';

export interface PatternValidationStatus {
    isValid: boolean;
    message?: string;
    details?: string;
}

const IGNORED_CODES = new Set(['missing_profile', 'missing_pattern']);

const OUT_OF_BOUNDS_CODES = new Set(['no_valid_tile_for_point', 'target_out_of_bounds']);

const CAPACITY_CODES = new Set(['insufficient_calibrated_tiles', 'pattern_exceeds_mirrors']);

/**
 * Categorize planner errors into a user-friendly validation status.
 * Used by both the pattern list and playback page to ensure consistent messaging.
 */
export function categorizePatternErrors(
    errors: ProfilePlaybackValidationError[],
): PatternValidationStatus {
    const relevantErrors = errors.filter((e) => !IGNORED_CODES.has(e.code));

    if (relevantErrors.length === 0) {
        return { isValid: true };
    }

    const outOfBoundsErrors = relevantErrors.filter((e) => OUT_OF_BOUNDS_CODES.has(e.code));
    const capacityErrors = relevantErrors.filter((e) => CAPACITY_CODES.has(e.code));

    // Prioritize out-of-bounds (more specific/actionable) over capacity
    const prioritizedErrors = outOfBoundsErrors.length > 0 ? outOfBoundsErrors : relevantErrors;

    let message: string;
    if (outOfBoundsErrors.length > 0) {
        message = `Point(s) outside bounds (${outOfBoundsErrors.length})`;
    } else if (capacityErrors.length > 0) {
        message = 'More points than tiles';
    } else {
        message = relevantErrors[0].message;
    }

    const detailsList = prioritizedErrors.slice(0, 3).map((error) => {
        const pointLabel = error.patternPointId ? `Point ${error.patternPointId}` : 'Point';
        const axisLabel = error.axis ? ` ${error.axis.toUpperCase()}` : '';
        const tileLabel = error.mirrorId ? ` @ ${error.mirrorId}` : '';
        return `${pointLabel}${axisLabel}${tileLabel}: ${error.message}`;
    });

    const remainingCount = prioritizedErrors.length > 3 ? prioritizedErrors.length - 3 : 0;
    const details =
        detailsList.join(' • ') + (remainingCount > 0 ? ` • +${remainingCount} more` : '');

    return { isValid: false, message, details };
}
