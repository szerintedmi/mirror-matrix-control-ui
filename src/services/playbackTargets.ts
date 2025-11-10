import { convertAngleToSteps } from '../utils/motorSteps';

import type {
    Axis,
    MirrorAssignment,
    PlaybackAxisPlan,
    PlaybackAxisTarget,
    PlaybackPlanResult,
} from '../types';

interface BuildAxisTargetsParams {
    plan: PlaybackPlanResult;
    stepsPerDegree?: number;
}

const resolveAxisAngleForSteps = (_axis: Axis, angleDeg: number) => {
    return -angleDeg;
};

const cloneMotor = (assignment: MirrorAssignment, axis: Axis) => {
    const motor = assignment[axis];
    if (!motor) {
        return null;
    }
    return { ...motor };
};

const createAxisTarget = ({
    mirrorId,
    row,
    col,
    axis,
    patternId,
    angleDeg,
    motor,
    stepsPerDegree,
}: {
    mirrorId: string;
    row: number;
    col: number;
    axis: Axis;
    patternId: string | null;
    angleDeg: number;
    motor: NonNullable<ReturnType<typeof cloneMotor>>;
    stepsPerDegree?: number;
}): PlaybackAxisTarget => {
    const conversion = convertAngleToSteps(resolveAxisAngleForSteps(axis, angleDeg), {
        stepsPerDegree,
    });
    return {
        key: `${mirrorId}:${axis}:${motor.nodeMac}:${motor.motorIndex}`,
        mirrorId,
        axis,
        patternId,
        motor,
        row,
        col,
        angleDeg,
        requestedSteps: conversion.requestedSteps,
        targetSteps: conversion.targetSteps,
        clamped: conversion.clamped,
    };
};

export const buildAxisTargets = ({
    plan,
    stepsPerDegree,
}: BuildAxisTargetsParams): PlaybackAxisPlan => {
    const axes: PlaybackAxisTarget[] = [];
    const skipped: PlaybackAxisPlan['skipped'] = [];

    for (const mirror of plan.mirrors) {
        if (!mirror.patternId) {
            continue;
        }

        const pushAxis = (axis: Axis, angle: number | null) => {
            const motor = cloneMotor(mirror.assignment, axis);
            if (!motor) {
                skipped.push({
                    mirrorId: mirror.mirrorId,
                    row: mirror.row,
                    col: mirror.col,
                    axis,
                    reason: 'missing-motor',
                });
                return;
            }
            if (angle === null || Number.isNaN(angle)) {
                skipped.push({
                    mirrorId: mirror.mirrorId,
                    row: mirror.row,
                    col: mirror.col,
                    axis,
                    reason: 'missing-angle',
                });
                return;
            }
            axes.push(
                createAxisTarget({
                    mirrorId: mirror.mirrorId,
                    row: mirror.row,
                    col: mirror.col,
                    axis,
                    patternId: mirror.patternId,
                    angleDeg: angle,
                    motor,
                    stepsPerDegree,
                }),
            );
        };

        pushAxis('x', mirror.yawDeg);
        pushAxis('y', mirror.pitchDeg);
    }

    return { axes, skipped };
};
