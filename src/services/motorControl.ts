import {
    MOTOR_MIN_POSITION_STEPS,
    MOTOR_MAX_POSITION_STEPS,
    NUDGE_DELTA_STEPS,
} from '../constants/control';

export interface NudgeComputationResult {
    outboundTarget: number;
    returnTarget: number;
    direction: 1 | -1;
}

interface ComputeNudgeParams {
    currentPosition: number;
    min?: number;
    max?: number;
    delta?: number;
}

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

export const computeNudgeTargets = ({
    currentPosition,
    min = MOTOR_MIN_POSITION_STEPS,
    max = MOTOR_MAX_POSITION_STEPS,
    delta = NUDGE_DELTA_STEPS,
}: ComputeNudgeParams): NudgeComputationResult => {
    const canPositive = currentPosition <= max - delta;
    const canNegative = currentPosition >= min + delta;

    if (!canPositive && !canNegative) {
        throw new Error(
            `Unable to compute nudge direction: insufficient headroom from ${currentPosition} within range [${min}, ${max}]`,
        );
    }

    let direction: 1 | -1;
    if (canPositive && (!canNegative || currentPosition <= 0)) {
        direction = 1;
    } else if (canNegative) {
        direction = -1;
    } else {
        direction = 1;
    }

    const outboundTarget = clamp(currentPosition + direction * delta, min, max);
    const returnTarget = clamp(currentPosition, min, max);

    return {
        outboundTarget,
        returnTarget,
        direction,
    };
};

export const normalizeMacForTopic = (mac: string): string => mac.trim();
