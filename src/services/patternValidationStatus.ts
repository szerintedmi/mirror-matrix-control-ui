import type { ProfilePlaybackValidationError } from './profilePlaybackPlanner';

export interface PatternValidationStatus {
    isValid: boolean;
    message?: string;
    details?: string;
}

const IGNORED_CODES = new Set(['missing_profile', 'missing_pattern']);

const OUT_OF_BOUNDS_CODES = new Set(['no_valid_tile_for_point', 'target_out_of_bounds']);

const OCCUPIED_CODES = new Set(['no_remaining_tile_for_point']);

const CAPACITY_CODES = new Set(['insufficient_calibrated_tiles', 'pattern_exceeds_mirrors']);

/**
 * Categorize planner errors into a user-friendly validation status.
 * Used by both the pattern list and playback page to ensure consistent messaging.
 *
 * Priority: out-of-bounds > tiles occupied > capacity > other
 */
export function categorizePatternErrors(
    errors: ProfilePlaybackValidationError[],
): PatternValidationStatus {
    const relevantErrors = errors.filter((e) => !IGNORED_CODES.has(e.code));

    if (relevantErrors.length === 0) {
        return { isValid: true };
    }

    const outOfBoundsErrors = relevantErrors.filter((e) => OUT_OF_BOUNDS_CODES.has(e.code));
    const occupiedErrors = relevantErrors.filter((e) => OCCUPIED_CODES.has(e.code));
    const capacityErrors = relevantErrors.filter((e) => CAPACITY_CODES.has(e.code));

    // Prioritize the most specific/actionable errors for details
    let prioritizedErrors: ProfilePlaybackValidationError[];
    if (outOfBoundsErrors.length > 0) {
        prioritizedErrors = outOfBoundsErrors;
    } else if (occupiedErrors.length > 0) {
        prioritizedErrors = occupiedErrors;
    } else {
        prioritizedErrors = relevantErrors;
    }

    let message: string;
    if (outOfBoundsErrors.length > 0) {
        const n = outOfBoundsErrors.length;
        message = n === 1 ? '1 point out of bounds' : `${n} points out of bounds`;
    } else if (occupiedErrors.length > 0) {
        const n = occupiedErrors.length;
        message = n === 1 ? '1 spot conflicts' : `${n} spots conflict`;
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

/**
 * Build a map from point ID to a short error reason string.
 * Used to provide per-point tooltips in the pattern editor canvas.
 */
export function buildPointErrorMap(errors: ProfilePlaybackValidationError[]): Map<string, string> {
    const map = new Map<string, string>();

    for (const error of errors) {
        if (!error.patternPointId || map.has(error.patternPointId)) continue;

        let reason: string;
        if (OUT_OF_BOUNDS_CODES.has(error.code)) {
            reason = 'Outside tile bounds';
        } else if (OCCUPIED_CODES.has(error.code)) {
            reason = 'Tile already assigned';
        } else if (CAPACITY_CODES.has(error.code)) {
            reason = 'Not enough tiles';
        } else {
            reason = error.message;
        }
        map.set(error.patternPointId, reason);
    }

    return map;
}
