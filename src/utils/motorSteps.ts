import {
    MOTOR_MAX_POSITION_STEPS,
    MOTOR_MIN_POSITION_STEPS,
    STEPS_PER_DEGREE,
} from '../constants/control';

export interface AngleToStepsOptions {
    stepsPerDegree?: number;
    min?: number;
    max?: number;
    zeroOffsetSteps?: number;
}

export interface AngleToStepsResult {
    requestedSteps: number;
    targetSteps: number;
    clamped: boolean;
}

export const convertAngleToSteps = (
    degrees: number,
    {
        stepsPerDegree = STEPS_PER_DEGREE,
        min = MOTOR_MIN_POSITION_STEPS,
        max = MOTOR_MAX_POSITION_STEPS,
        zeroOffsetSteps = 0,
    }: AngleToStepsOptions = {},
): AngleToStepsResult => {
    const requestedSteps = degrees * stepsPerDegree + zeroOffsetSteps;
    const targetSteps = Math.max(min, Math.min(max, requestedSteps));
    return {
        requestedSteps,
        targetSteps,
        clamped: targetSteps !== requestedSteps,
    };
};
