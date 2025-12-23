import React from 'react';

import type { DraggedMotorInfo, Motor, MotorTelemetry } from '../types';

export type MotorChipTone = 'default' | 'warning';

interface MotorChipProps {
    motor: Motor;
    telemetry?: MotorTelemetry;
    disabled?: boolean;
    tone?: MotorChipTone;
    tooltip?: string;
    dataTestId?: string;
    onNudge?: (motor: Motor, currentPosition: number) => void;
    onClick?: (motor: Motor) => void;
}

const toneStyles: Record<
    MotorChipTone,
    { idle: string; hover: string; text: string; border: string }
> = {
    default: {
        idle: 'bg-gray-800/60',
        hover: 'hover:bg-cyan-500/30',
        text: 'text-cyan-300',
        border: 'border-gray-700/70',
    },
    warning: {
        idle: 'bg-amber-900/40',
        hover: 'hover:bg-amber-500/30',
        text: 'text-amber-200',
        border: 'border-amber-500/50',
    },
};

const MotorChip: React.FC<MotorChipProps> = ({
    motor,
    telemetry,
    disabled = false,
    tone = 'default',
    tooltip,
    dataTestId,
    onNudge,
    onClick,
}) => {
    const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
        if (disabled) {
            event.preventDefault();
            return;
        }
        const dragData: DraggedMotorInfo = {
            source: 'list',
            motor,
        };
        event.dataTransfer.setData('application/json', JSON.stringify(dragData));
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleClick = (event: React.MouseEvent | React.KeyboardEvent) => {
        if (disabled && onClick) {
            event.stopPropagation();
            onClick(motor);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick(event);
        }
    };

    const handleNudgeClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (onNudge && telemetry) {
            onNudge(motor, telemetry.position);
        }
    };

    const styles = toneStyles[tone];
    const canNudge = onNudge && telemetry;

    if (disabled) {
        return (
            <div
                data-testid={dataTestId}
                role={onClick ? 'button' : undefined}
                tabIndex={onClick ? 0 : undefined}
                onClick={handleClick}
                onKeyDown={onClick ? handleKeyDown : undefined}
                className={`flex items-center gap-1 rounded border border-gray-700/50 bg-gray-800/40 px-1.5 py-1 font-mono text-xs text-gray-500 ${onClick ? 'cursor-pointer hover:border-gray-600 hover:bg-gray-700/40' : ''}`}
                title={tooltip ?? `Motor ${motor.motorIndex} - Assigned (click to locate)`}
            >
                <span>:{motor.motorIndex}</span>
                {canNudge && (
                    <button
                        type="button"
                        onClick={handleNudgeClick}
                        className="flex size-4 items-center justify-center rounded text-gray-500 transition hover:bg-gray-600 hover:text-gray-300"
                        title="Nudge motor"
                    >
                        <svg
                            className="size-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                            />
                        </svg>
                    </button>
                )}
            </div>
        );
    }

    return (
        <div
            data-testid={dataTestId}
            draggable
            onDragStart={handleDragStart}
            className={`flex cursor-grab items-center gap-1 rounded border px-1.5 py-1 font-mono text-xs transition-colors active:cursor-grabbing ${styles.border} ${styles.idle} ${styles.hover}`}
            title={
                tooltip ??
                `Node: ${motor.nodeMac}\nMotor Index: ${motor.motorIndex}\nDrag to assign`
            }
        >
            <span className={styles.text}>:{motor.motorIndex}</span>
            {canNudge && (
                <button
                    type="button"
                    onClick={handleNudgeClick}
                    className="flex size-4 items-center justify-center rounded text-gray-500 transition hover:bg-cyan-700/50 hover:text-cyan-200"
                    title="Nudge motor"
                >
                    <svg
                        className="size-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                        />
                    </svg>
                </button>
            )}
            {/* Drag handle indicator */}
            <svg
                className="size-3 text-gray-500"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden
            >
                <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
            </svg>
        </div>
    );
};

export default MotorChip;
