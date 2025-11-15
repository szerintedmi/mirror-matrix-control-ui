export const formatPercent = (
    value: number | null | undefined,
    { signed = false }: { signed?: boolean } = {},
): string => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    const percent = (value * 100).toFixed(2);
    if (!signed) {
        return `${percent}%`;
    }
    return value > 0 ? `+${percent}%` : `${percent}%`;
};

export const formatPerKilostep = (value: number | null | undefined): string => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    const scaled = value * 1000;
    const digits = Math.abs(scaled) >= 10 ? 1 : 2;
    const formatted = scaled.toFixed(digits);
    return scaled > 0 ? `+${formatted}` : formatted;
};

export const clampSteps = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

export const convertNormalizedToSteps = (
    value: number | null | undefined,
    perStep: number | null | undefined,
    min: number,
    max: number,
): number | null => {
    if (
        value === null ||
        value === undefined ||
        Number.isNaN(value) ||
        perStep === null ||
        perStep === undefined ||
        perStep === 0 ||
        Number.isNaN(perStep)
    ) {
        return null;
    }
    const steps = Math.round(value / perStep);
    if (!Number.isFinite(steps)) {
        return null;
    }
    return clampSteps(steps, min, max);
};

export const formatStepValue = (value: number | null): string => {
    if (value === null || Number.isNaN(value)) {
        return '—';
    }
    const formatted = value.toLocaleString();
    return value > 0 ? `+${formatted}` : formatted;
};

export const formatDecimal = (
    value: number | null | undefined,
    { digits = 4, signed = false }: { digits?: number; signed?: boolean } = {},
): string => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    const formatted = value.toFixed(digits);
    if (signed && value > 0) {
        return `+${formatted}`;
    }
    return formatted;
};

export const formatTimestamp = (value: number | null | undefined): string => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    return date.toLocaleString();
};
