import React, { useState } from 'react';

import { useMotorController } from '../hooks/useMotorController';

import MotorActionButtons from './MotorActionButtons';

import type {
    GridPosition,
    MirrorAssignment,
    Motor,
    MotorTelemetry,
    Axis,
    DraggedMotorInfo,
    DriverStatusSnapshot,
} from '../types';

type MotorSlotVariant = 'default' | 'warning' | 'info';

interface WarningBadge {
    label: string;
    className: string;
}

const MOTOR_SLOT_VARIANT_STYLES: Record<
    MotorSlotVariant,
    { idle: string; hover: string; text: string; border: string }
> = {
    default: {
        idle: 'bg-gray-700/50',
        hover: 'bg-cyan-500/30',
        text: 'text-cyan-300',
        border: 'border-gray-700/70',
    },
    warning: {
        idle: 'bg-amber-900/40',
        hover: 'bg-amber-500/30',
        text: 'text-amber-200',
        border: 'border-amber-500/50',
    },
    info: {
        idle: 'bg-sky-900/35',
        hover: 'bg-sky-500/25',
        text: 'text-sky-200',
        border: 'border-sky-500/40',
    },
};

export interface MirrorCellAnalysis {
    crossDriver: boolean;
    orphanAxis: boolean;
    hasOffline: boolean;
    hasStale: boolean;
    warningBadges: WarningBadge[];
    variants: {
        x: MotorSlotVariant;
        y: MotorSlotVariant;
    };
}

export const analyzeMirrorCell = (
    assignment: MirrorAssignment,
    driverStatuses: Map<string, DriverStatusSnapshot>,
): MirrorCellAnalysis => {
    const axisCount = (assignment.x ? 1 : 0) + (assignment.y ? 1 : 0);
    const orphanAxis = axisCount === 1;
    const crossDriver = Boolean(
        assignment.x && assignment.y && assignment.x.nodeMac !== assignment.y.nodeMac,
    );

    const statuses = [assignment.x, assignment.y]
        .map((motor) => (motor ? driverStatuses.get(motor.nodeMac) : undefined))
        .filter((status): status is DriverStatusSnapshot => Boolean(status));

    const hasOffline = statuses.some(
        (status) => status.presence === 'offline' || status.brokerDisconnected,
    );
    const hasStale = statuses.some((status) => status.presence === 'stale');

    const warningBadges: WarningBadge[] = [];
    if (hasOffline) {
        warningBadges.push({ label: 'Driver offline', className: 'bg-red-500/20 text-red-200' });
    } else if (hasStale) {
        warningBadges.push({ label: 'Driver stale', className: 'bg-amber-500/20 text-amber-200' });
    }
    if (crossDriver) {
        warningBadges.push({ label: 'Mixed drivers', className: 'bg-pink-500/20 text-pink-200' });
    }
    if (orphanAxis) {
        warningBadges.push({ label: 'Needs partner', className: 'bg-sky-500/20 text-sky-200' });
    }

    const resolveVariant = (motor: Motor | null): MotorSlotVariant => {
        if (!motor) {
            return 'default';
        }
        const status = driverStatuses.get(motor.nodeMac);
        if (status?.presence === 'offline' || status?.brokerDisconnected) {
            return 'warning';
        }
        if (status?.presence === 'stale') {
            return 'warning';
        }
        if (crossDriver) {
            return 'warning';
        }
        if (orphanAxis) {
            return 'info';
        }
        return 'default';
    };

    return {
        crossDriver,
        orphanAxis,
        hasOffline,
        hasStale,
        warningBadges,
        variants: {
            x: resolveVariant(assignment.x),
            y: resolveVariant(assignment.y),
        },
    };
};

interface MotorSlotProps {
    axis: Axis;
    motor: Motor | null;
    telemetry?: MotorTelemetry;
    position: GridPosition;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    variant?: MotorSlotVariant;
    dataTestId?: string;
}

const MotorSlot: React.FC<MotorSlotProps> = ({
    axis,
    motor,
    position,
    telemetry,
    onMotorDrop,
    variant = 'default',
    dataTestId,
}) => {
    const [isHovering, setIsHovering] = useState(false);
    const controller = useMotorController(motor, telemetry);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsHovering(true);
    };

    const handleDragLeave = () => {
        setIsHovering(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsHovering(false);
        const dragData = e.dataTransfer.getData('application/json');
        if (dragData) {
            onMotorDrop(position, axis, dragData);
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (!motor) {
            e.preventDefault();
            return;
        }
        const dragData: DraggedMotorInfo = {
            source: 'grid',
            motor: motor,
            position: position,
            axis: axis,
        };
        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
    };

    const styles = MOTOR_SLOT_VARIANT_STYLES[variant];
    const baseBg = isHovering ? styles.hover : styles.idle;
    const draggableClasses = motor ? 'cursor-grab' : '';
    const motorTextColor = motor ? styles.text : 'text-gray-500';
    const borderClasses = styles.border;

    const slotTitle = (() => {
        if (!motor) {
            return 'Drop a motor here';
        }
        if (variant === 'warning') {
            return 'Driver needs attention — drag to reassign or inspect status';
        }
        if (variant === 'info') {
            return 'Single axis assigned — add a partner or drag to adjust';
        }
        return 'Drag to reassign';
    })();

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <span className="w-5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {axis.toUpperCase()}
                </span>
                <div
                    data-testid={dataTestId}
                    draggable={!!motor}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    aria-disabled={!motor}
                    className={`flex flex-1 h-10 items-center justify-center rounded transition-colors duration-200 border ${borderClasses} ${baseBg} ${draggableClasses}`}
                    title={slotTitle}
                >
                    {motor ? (
                        <span className={`font-mono text-sm ${motorTextColor}`}>
                            {motor.nodeMac.slice(-5)}:{motor.motorIndex}
                        </span>
                    ) : (
                        <span className="font-mono text-sm text-gray-500">--</span>
                    )}
                </div>
            </div>
            {motor ? (
                <div className="pl-7">
                    <MotorActionButtons
                        motor={motor}
                        telemetry={telemetry}
                        controller={controller}
                        layout="horizontal"
                        dataTestIdPrefix={`grid-${position.row}-${position.col}-${axis}`}
                        compact
                    />
                </div>
            ) : null}
        </div>
    );
};

interface MirrorCellProps {
    position: GridPosition;
    assignment: MirrorAssignment;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    selectedNodeMac: string | null;
    driverStatuses: Map<string, DriverStatusSnapshot>;
}

const MirrorCell: React.FC<MirrorCellProps> = ({
    position,
    assignment,
    onMotorDrop,
    selectedNodeMac,
    driverStatuses,
}) => {
    const [isSelected, setIsSelected] = useState(false);

    const analysis = analyzeMirrorCell(assignment, driverStatuses);

    const isNodeXHighlighted = assignment.x?.nodeMac === selectedNodeMac;
    const isNodeYHighlighted = assignment.y?.nodeMac === selectedNodeMac;
    const nodeHighlightClass =
        selectedNodeMac && (isNodeXHighlighted || isNodeYHighlighted)
            ? 'shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]'
            : '';

    const telemetryX = assignment.x
        ? driverStatuses.get(assignment.x.nodeMac)?.motors[assignment.x.motorIndex]
        : undefined;
    const telemetryY = assignment.y
        ? driverStatuses.get(assignment.y.nodeMac)?.motors[assignment.y.motorIndex]
        : undefined;

    const ringClasses = analysis.hasOffline
        ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-red-500/80'
        : analysis.hasStale
          ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-amber-400/80'
          : isSelected
            ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-cyan-400'
            : 'ring-1 ring-gray-700';

    const backgroundClass = isSelected ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700/70';
    const borderVisualClass = analysis.crossDriver
        ? 'border border-amber-500/60'
        : 'border border-transparent';

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsSelected((prev) => !prev);
        } else if (event.key === 'Escape') {
            setIsSelected(false);
        }
    };

    return (
        <div
            data-testid={`mirror-cell-${position.row}-${position.col}`}
            onClick={() => setIsSelected(!isSelected)}
            onBlur={() => setIsSelected(false)}
            onKeyDown={handleKeyDown}
            role="button"
            aria-pressed={isSelected}
            tabIndex={0}
            className={`relative flex flex-col rounded-md p-1.5 gap-1 transition-all duration-200 outline-none ${ringClasses} ${backgroundClass} ${borderVisualClass} ${nodeHighlightClass}`}
        >
            <div className="text-center text-xs font-semibold text-gray-400 select-none">
                [{position.row},{position.col}]
            </div>

            {analysis.warningBadges.length > 0 && (
                <div className="flex flex-wrap gap-1 text-[10px] font-semibold uppercase tracking-wide">
                    {analysis.warningBadges.map((badge) => (
                        <span
                            key={badge.label}
                            className={`rounded-full px-2 py-0.5 ${badge.className}`}
                        >
                            {badge.label}
                        </span>
                    ))}
                </div>
            )}

            <div className="w-full flex flex-col gap-1.5 mt-1">
                <MotorSlot
                    axis="x"
                    motor={assignment.x}
                    telemetry={telemetryX}
                    position={position}
                    onMotorDrop={onMotorDrop}
                    variant={analysis.variants.x}
                    dataTestId={`mirror-slot-x-${position.row}-${position.col}`}
                />
                <MotorSlot
                    axis="y"
                    motor={assignment.y}
                    telemetry={telemetryY}
                    position={position}
                    onMotorDrop={onMotorDrop}
                    variant={analysis.variants.y}
                    dataTestId={`mirror-slot-y-${position.row}-${position.col}`}
                />
            </div>
        </div>
    );
};

export default MirrorCell;
