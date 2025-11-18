export const STEP_EPSILON = 1e-9;

export const clampNormalized = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value < -1) {
        return -1;
    }
    if (value > 1) {
        return 1;
    }
    return value;
};

export const convertDeltaToSteps = (
    delta: number | null | undefined,
    perStep: number | null | undefined,
): number | null => {
    if (delta == null || perStep == null || Math.abs(perStep) < STEP_EPSILON) {
        return null;
    }
    const steps = delta / perStep;
    return Number.isFinite(steps) ? steps : null;
};
