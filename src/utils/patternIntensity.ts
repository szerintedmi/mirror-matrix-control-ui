import { MAX_TILE_INTENSITY, MIN_TILE_INTENSITY } from '../constants/pattern';

const clamp01 = (value: number): number => {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
};

export const calculateNormalizedIntensity = (
    overlapCount: number,
    maxOverlapCount: number,
): number => {
    if (overlapCount <= 0 || maxOverlapCount <= 0) {
        return 0;
    }
    if (maxOverlapCount === 1) {
        return 1;
    }
    const normalized = (overlapCount - 1) / (maxOverlapCount - 1);
    return clamp01(normalized);
};

export const calculateDisplayIntensity = (
    overlapCount: number,
    maxOverlapCount: number,
): number => {
    const normalized = calculateNormalizedIntensity(overlapCount, maxOverlapCount);
    if (normalized === 0) {
        return MIN_TILE_INTENSITY;
    }
    const span = MAX_TILE_INTENSITY - MIN_TILE_INTENSITY;
    if (span <= 0) {
        return clamp01(MAX_TILE_INTENSITY);
    }
    return clamp01(MIN_TILE_INTENSITY + normalized * span);
};

export const intensityToFill = (intensity: number): string => {
    const clamped = clamp01(intensity);
    return `rgba(248, 250, 252, ${clamped.toFixed(3)})`;
};

export const intensityToStroke = (intensity: number): string => {
    const clamped = clamp01(intensity * 0.9 + 0.1);
    return `rgba(226, 232, 240, ${clamped.toFixed(3)})`;
};
