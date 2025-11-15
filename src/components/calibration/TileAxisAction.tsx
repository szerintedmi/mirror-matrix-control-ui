import React from 'react';

import MotorActionButtons from '@/components/MotorActionButtons';
import { useMotorController } from '@/hooks/useMotorController';
import type { Motor, MotorTelemetry } from '@/types';

interface TileAxisActionProps {
    axis: 'x' | 'y';
    motor: Motor | null;
    telemetry?: MotorTelemetry;
    className?: string;
    layout?: 'stacked' | 'inline';
    showLabel?: boolean;
    showHomeButton?: boolean;
}

const TileAxisAction: React.FC<TileAxisActionProps> = ({
    axis,
    motor,
    telemetry,
    className,
    layout = 'stacked',
    showLabel = true,
    showHomeButton = false,
}) => {
    const controller = useMotorController(motor, telemetry);
    const layoutClass =
        layout === 'inline' ? 'flex items-center gap-1 text-[10px]' : 'mt-1 first:mt-0';
    const resolvedClass = [layoutClass, className].filter(Boolean).join(' ').trim();
    if (!motor) {
        return (
            <div className={`${resolvedClass} text-[10px] text-gray-500`.trim()}>
                {axis.toUpperCase()}: Unassigned
            </div>
        );
    }
    return (
        <div className={`${resolvedClass}`.trim()}>
            <MotorActionButtons
                motor={motor}
                telemetry={telemetry}
                controller={controller}
                compact
                showHome={showHomeButton}
                showStepsBadge={false}
                showLabel={showLabel}
                dataTestIdPrefix={`calibration-runner-${motor.nodeMac}-${motor.motorIndex}-${axis}`}
                label={showLabel ? axis.toUpperCase() : undefined}
            />
        </div>
    );
};

export default TileAxisAction;
