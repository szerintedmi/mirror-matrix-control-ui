export const clampCenteredNormalized = (value: number): number => {
    if (Number.isNaN(value)) {
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

export const viewToCentered = (value: number): number => clampCenteredNormalized(value * 2 - 1);

export const centeredToView = (value: number): number => (value + 1) / 2;

export const centeredDeltaToView = (delta: number): number => delta / 2;

export const viewDeltaToCentered = (delta: number): number => delta * 2;
