import React from 'react';

import type { DraggedMotorInfo, Motor } from '../types';

export type MotorChipTone = 'default' | 'warning';

interface MotorChipProps {
    motor: Motor;
    disabled?: boolean;
    label?: string;
    tone?: MotorChipTone;
    tooltip?: string;
    dataTestId?: string;
}

const toneClassMap: Record<MotorChipTone, string> = {
    default:
        'bg-cyan-800/50 border-cyan-700 text-cyan-200 hover:bg-cyan-700/70 hover:shadow-lg hover:shadow-cyan-500/20',
    warning:
        'bg-amber-800/50 border-amber-600 text-amber-100 hover:bg-amber-700/70 hover:shadow-lg hover:shadow-amber-500/20',
};

const MotorChip: React.FC<MotorChipProps> = ({
    motor,
    disabled = false,
    label,
    tone = 'default',
    tooltip,
    dataTestId,
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

    const baseClasses =
        'flex items-center justify-center px-3 py-2 border rounded-md font-mono text-sm transition-all duration-200';
    const disabledClasses = 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed';
    const activeClasses = `${toneClassMap[tone]} cursor-grab`;

    return (
        <div
            data-testid={dataTestId}
            draggable={!disabled}
            onDragStart={handleDragStart}
            className={`${baseClasses} ${disabled ? disabledClasses : activeClasses}`}
            title={
                tooltip ??
                `Node: ${motor.nodeMac}\nMotor Index: ${motor.motorIndex}\nStatus: ${disabled ? 'Assigned' : 'Available'}`
            }
        >
            {label ?? `Motor ${motor.motorIndex}`}
        </div>
    );
};

export default MotorChip;
