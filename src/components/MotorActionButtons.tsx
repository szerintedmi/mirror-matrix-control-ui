import React from 'react';

import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '../constants/control';

import type { MotorControllerApi } from '../hooks/useMotorController';
import type { Motor, MotorTelemetry } from '../types';

type LayoutMode = 'horizontal' | 'vertical';

interface MotorActionButtonsProps {
    motor: Motor | null;
    telemetry?: MotorTelemetry;
    controller: MotorControllerApi;
    layout?: LayoutMode;
    compact?: boolean;
    label?: React.ReactNode;
    dataTestIdPrefix?: string;
}

const formatSteps = (steps: number): string => {
    if (Math.abs(steps) >= 10_000) {
        return `${(steps / 1_000).toFixed(1)}k`;
    }
    if (Math.abs(steps) >= 1_000) {
        return `${(steps / 1_000).toFixed(2)}k`;
    }
    return steps.toString();
};

const resolveStepsBadge = (telemetry?: MotorTelemetry) => {
    if (!telemetry) {
        return {
            className: 'bg-gray-700 text-gray-300',
            label: '—',
            title: 'No telemetry',
        };
    }

    const steps = telemetry.stepsSinceHome;
    if (steps >= STEPS_SINCE_HOME_CRITICAL) {
        return {
            className: 'bg-red-900/70 text-red-200 border border-red-500/60',
            label: formatSteps(steps),
            title: `${steps} steps since last home (critical)`,
        };
    }
    if (steps >= STEPS_SINCE_HOME_WARNING) {
        return {
            className: 'bg-amber-900/40 text-amber-200 border border-amber-500/60',
            label: formatSteps(steps),
            title: `${steps} steps since last home (warning)`,
        };
    }
    return {
        className: 'bg-emerald-900/30 text-emerald-200 border border-emerald-500/40',
        label: formatSteps(steps),
        title: `${steps} steps since last home`,
    };
};

const resolveFeedbackTone = (state: MotorControllerApi['feedback']['state']): string => {
    switch (state) {
        case 'pending':
            return 'text-sky-200';
        case 'success':
            return 'text-emerald-200';
        case 'error':
            return 'text-red-200';
        default:
            return 'text-gray-300';
    }
};

export const MotorActionButtons: React.FC<MotorActionButtonsProps> = ({
    motor,
    telemetry,
    controller,
    layout = 'horizontal',
    compact = false,
    label,
    dataTestIdPrefix,
}) => {
    const badge = resolveStepsBadge(telemetry);
    const feedback = controller.feedback;
    const showFeedback = feedback.state !== 'idle';
    const macLabel = motor ? motor.nodeMac.toUpperCase() : '';
    const buttonBase =
        'flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
    const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';

    const containerClass =
        layout === 'vertical' ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2';

    return (
        <div className="space-y-2">
            <div className={containerClass}>
                {label && <div className="text-xs text-gray-300">{label}</div>}
                <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
                    title={badge.title}
                    data-testid={dataTestIdPrefix ? `${dataTestIdPrefix}-steps` : undefined}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        className="h-3 w-3"
                        fill="currentColor"
                        aria-hidden
                    >
                        <path d="M10 2a1 1 0 01.894.553l6 12A1 1 0 0116 16H4a1 1 0 01-.894-1.447l6-12A1 1 0 0110 2zM10 5.618L5.764 14h8.472L10 5.618z" />
                    </svg>
                    {badge.label}
                </span>
                <button
                    type="button"
                    onClick={controller.nudge}
                    className={`${buttonBase} border-cyan-700 bg-cyan-900/40 text-cyan-200 hover:bg-cyan-700/40 focus-visible:ring-cyan-500 focus-visible:ring-offset-gray-900`}
                    data-testid={dataTestIdPrefix ? `${dataTestIdPrefix}-nudge` : undefined}
                    title={
                        motor
                            ? `Nudge motor ${motor.motorIndex} on ${macLabel}`
                            : 'No motor assigned'
                    }
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        className={iconClass}
                        fill="currentColor"
                        aria-hidden
                    >
                        <path d="M4 11h5v3l5-4-5-4v3H4v2z" />
                    </svg>
                    <span>Nudge</span>
                </button>
                <button
                    type="button"
                    onClick={controller.home}
                    className={`${buttonBase} border-emerald-700 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-700/40 focus-visible:ring-emerald-500 focus-visible:ring-offset-gray-900`}
                    data-testid={dataTestIdPrefix ? `${dataTestIdPrefix}-home` : undefined}
                    title={
                        motor
                            ? `Home motor ${motor.motorIndex} on ${macLabel}`
                            : 'No motor assigned'
                    }
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        className={iconClass}
                        fill="currentColor"
                        aria-hidden
                    >
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    </svg>
                    <span>Home</span>
                </button>
            </div>
            {showFeedback && feedback.message && (
                <div
                    className={`text-[11px] ${resolveFeedbackTone(feedback.state)} transition-opacity`}
                    data-testid={dataTestIdPrefix ? `${dataTestIdPrefix}-feedback` : undefined}
                >
                    {feedback.message}
                    {feedback.code && (
                        <span className="ml-1 text-xs text-gray-400">({feedback.code})</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default MotorActionButtons;
