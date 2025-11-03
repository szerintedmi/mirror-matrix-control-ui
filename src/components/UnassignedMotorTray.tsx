import React, { useMemo, useState } from 'react';

import MotorChip from './MotorChip';

import type { DriverPresence } from '../context/StatusContext';
import type { DraggedMotorInfo, Motor } from '../types';

interface UnassignedGroup {
    macAddress: string;
    presence: DriverPresence;
    staleForMs: number;
    brokerDisconnected: boolean;
    motors: Motor[];
}

interface UnassignedMotorTrayProps {
    groups: UnassignedGroup[];
    onUnassignByDrop: (dragDataString: string) => void;
    staleThresholdMs: number;
}

const presenceDotClass = (presence: DriverPresence): string => {
    switch (presence) {
        case 'ready':
            return 'bg-emerald-400';
        case 'stale':
            return 'bg-amber-400';
        default:
            return 'bg-red-500';
    }
};

const UnassignedMotorTray: React.FC<UnassignedMotorTrayProps> = ({
    groups,
    onUnassignByDrop,
    staleThresholdMs,
}) => {
    const [isDropHovering, setIsDropHovering] = useState(false);

    const totalUnassigned = useMemo(
        () => groups.reduce((sum, group) => sum + group.motors.length, 0),
        [groups],
    );

    if (groups.length === 0) {
        return (
            <div className="rounded-md border border-dashed border-gray-600 bg-gray-900/40 px-4 py-3 text-sm text-gray-400">
                All discovered motors are assigned. Drag from the nodes list to add more tiles.
            </div>
        );
    }

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const dragData = event.dataTransfer.getData('application/json');
        if (!dragData) {
            return;
        }
        const parsed: DraggedMotorInfo = JSON.parse(dragData);
        if (parsed.source === 'grid') {
            setIsDropHovering(true);
        }
    };

    const handleDragLeave = () => {
        setIsDropHovering(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDropHovering(false);
        const dragData = event.dataTransfer.getData('application/json');
        if (dragData) {
            onUnassignByDrop(dragData);
        }
    };

    return (
        <div
            className={`rounded-lg border border-gray-700 bg-gray-800/60 p-3 transition-colors ${isDropHovering ? 'border-red-500/70 bg-red-900/30' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="region"
            aria-label="Unassigned motors tray"
            data-testid="unassigned-motor-tray"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">
                    Unassigned Motors
                </h3>
                <span
                    className="text-xs text-gray-300"
                    data-testid="unassigned-axes-summary"
                >
                    {totalUnassigned} {totalUnassigned === 1 ? 'axis' : 'axes'} available
                </span>
            </div>
            {isDropHovering && (
                <div className="mt-3 text-center text-sm font-semibold text-red-200">
                    Drop here to return a motor to the tray
                </div>
            )}
            <div className="mt-3 space-y-3">
                {groups.map((group) => {
                    const macLabel = group.macAddress.toUpperCase();
                    const staleSeconds = group.staleForMs / 1_000;
                    const presenceDescription =
                        group.brokerDisconnected && group.presence === 'offline'
                            ? 'Broker disconnected'
                            : group.presence === 'ready'
                              ? 'Online'
                              : group.presence === 'stale'
                                ? `No heartbeat for ${staleSeconds.toFixed(1)}s (threshold ${(
                                      staleThresholdMs / 1_000
                                  ).toFixed(1)}s)`
                                : 'Offline';
                    return (
                        <div
                            key={group.macAddress}
                            className="rounded-md border border-gray-700 bg-gray-900/40 p-3"
                        >
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                                <span
                                    className={`h-2.5 w-2.5 rounded-full ${presenceDotClass(group.presence)}`}
                                />
                                <span className="font-mono text-sm text-emerald-300">
                                    {macLabel}
                                </span>
                                <span>{presenceDescription}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {group.motors.map((motor) => (
                                    <MotorChip
                                        key={`${motor.nodeMac}-${motor.motorIndex}`}
                                        motor={motor}
                                        disabled={false}
                                        dataTestId={`unassigned-motor-${motor.nodeMac}-${motor.motorIndex}`}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default UnassignedMotorTray;
