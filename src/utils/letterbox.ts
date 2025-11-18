import { clamp01 } from '@/constants/calibration';

export interface LetterboxTransform {
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
}

const normalizeAspect = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
        return 1;
    }
    return value;
};

export const buildLetterboxTransform = (
    contentAspect: number,
    viewportAspect: number,
): LetterboxTransform => {
    const safeContent = normalizeAspect(contentAspect);
    const safeViewport = normalizeAspect(viewportAspect);
    if (Math.abs(safeContent - safeViewport) < 1e-6) {
        return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    }
    if (safeContent >= safeViewport) {
        const scaleY = safeViewport / safeContent;
        return { scaleX: 1, scaleY, offsetX: 0, offsetY: (1 - scaleY) / 2 };
    }
    const scaleX = safeContent / safeViewport;
    return { scaleX, scaleY: 1, offsetX: (1 - scaleX) / 2, offsetY: 0 };
};

export const cameraToViewport = (
    value: number,
    axis: 'x' | 'y',
    transform: LetterboxTransform,
): number => {
    const scale = axis === 'x' ? transform.scaleX : transform.scaleY;
    const offset = axis === 'x' ? transform.offsetX : transform.offsetY;
    return clamp01(offset + clamp01(value) * scale);
};

export const cameraDeltaToViewport = (
    delta: number,
    axis: 'x' | 'y',
    transform: LetterboxTransform,
): number => {
    const scale = axis === 'x' ? transform.scaleX : transform.scaleY;
    return delta * scale;
};

export const viewportToCamera = (
    value: number,
    axis: 'x' | 'y',
    transform: LetterboxTransform,
): number => {
    const scale = axis === 'x' ? transform.scaleX : transform.scaleY;
    const offset = axis === 'x' ? transform.offsetX : transform.offsetY;
    if (scale <= 0) {
        return 0;
    }
    return clamp01((value - offset) / scale);
};

export const viewportDeltaToCamera = (
    delta: number,
    axis: 'x' | 'y',
    transform: LetterboxTransform,
): number => {
    const scale = axis === 'x' ? transform.scaleX : transform.scaleY;
    if (scale <= 0) {
        return 0;
    }
    return delta / scale;
};
