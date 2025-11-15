import React from 'react';

import MotorActionButtons from '@/components/MotorActionButtons';
import { useMotorController } from '@/hooks/useMotorController';
import type { Motor, MotorTelemetry } from '@/types';

interface TileAxisActionProps {
    axis: 'x' | 'y';
    motor: Motor | null;
    telemetry?: MotorTelemetry;
}

const TileAxisAction: React.FC<TileAxisActionProps> = ({ axis, motor, telemetry }) => {
    const controller = useMotorController(motor, telemetry);
    if (!motor) {
        return <div className="text-[10px] text-gray-500">{axis.toUpperCase()}: Unassigned</div>;
    }
    return (
        <div className="mt-1 first:mt-0">
            <MotorActionButtons
                motor={motor}
                telemetry={telemetry}
                controller={controller}
                compact
                showHome={false}
                showStepsBadge={false}
                dataTestIdPrefix={`calibration-runner-${motor.nodeMac}-${motor.motorIndex}-${axis}`}
                label={axis.toUpperCase()}
            />
        </div>
    );
};

export default TileAxisAction;
