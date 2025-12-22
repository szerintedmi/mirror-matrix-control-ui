import React, { useCallback, useState } from 'react';

import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '@/constants/control';

import TileConfigMenu from './TileConfigMenu';

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

const MOTOR_SLOT_VARIANT_STYLES: Record<
    MotorSlotVariant,
    { idle: string; hover: string; text: string; border: string }
> = {
    default: {
        idle: 'bg-gray-800/60',
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

/** Render steps-since-home warning icon if motor has drifted */
const StepsWarningIcon: React.FC<{ telemetry?: MotorTelemetry; className?: string }> = ({
    telemetry,
    className = '',
}) => {
    if (!telemetry) return null;
    const steps = telemetry.stepsSinceHome;
    if (steps < STEPS_SINCE_HOME_WARNING) return null;

    const isCritical = steps >= STEPS_SINCE_HOME_CRITICAL;
    const colorClass = isCritical ? 'text-red-400' : 'text-amber-400';
    const title = `${steps.toLocaleString()} steps since last home${isCritical ? ' (critical)' : ''}`;

    return (
        <span title={title} className={`${colorClass} ${className}`.trim()}>
            <svg className="size-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M10 2a1 1 0 01.894.553l6 12A1 1 0 0116 16H4a1 1 0 01-.894-1.447l6-12A1 1 0 0110 2zM10 5.618L5.764 14h8.472L10 5.618z" />
            </svg>
        </span>
    );
};

const formatMotorId = (motor: Motor | null): string | null =>
    motor ? `${motor.nodeMac.slice(-5)}:${motor.motorIndex}` : null;

interface DraggableMotorRowProps {
    axis: Axis;
    motor: Motor | null;
    telemetry?: MotorTelemetry;
    position: GridPosition;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    variant?: MotorSlotVariant;
    onNudge?: () => void;
}

const DraggableMotorRow: React.FC<DraggableMotorRowProps> = ({
    axis,
    motor,
    telemetry,
    position,
    onMotorDrop,
    variant = 'default',
    onNudge,
}) => {
    const [isHovering, setIsHovering] = useState(false);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsHovering(true);
    };

    const handleDragLeave = () => {
        setIsHovering(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
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
    const bgClass = isHovering ? styles.hover : styles.idle;
    const draggableClasses = motor ? 'cursor-grab active:cursor-grabbing' : '';
    const motorTextColor = motor ? styles.text : 'text-gray-500';

    const slotTitle = (() => {
        if (!motor) {
            return 'Drop a motor here';
        }
        if (variant === 'warning') {
            return 'Driver needs attention - drag to reassign';
        }
        if (variant === 'info') {
            return 'Single axis assigned - add a partner or drag to adjust';
        }
        return 'Drag to reassign';
    })();

    return (
        <div
            draggable={!!motor}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 transition-colors ${styles.border} ${bgClass} ${draggableClasses}`}
            title={slotTitle}
        >
            <span className="flex items-center gap-1.5 font-mono text-sm text-gray-300">
                <span className="w-3 text-[11px] font-semibold text-gray-400 uppercase">
                    {axis.toUpperCase()}
                </span>
                <span className={motorTextColor}>{formatMotorId(motor) ?? '--'}</span>
                <StepsWarningIcon telemetry={telemetry} />
            </span>
            <div className="flex items-center gap-1">
                {motor && onNudge && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onNudge();
                        }}
                        className="flex size-6 items-center justify-center rounded border border-cyan-700 bg-cyan-900/40 text-cyan-200 transition hover:bg-cyan-700/40"
                        title={`Nudge ${axis.toUpperCase()} motor (${formatMotorId(motor)})`}
                    >
                        <svg
                            className="size-3.5"
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
                {motor && (
                    <svg
                        className="size-4 text-gray-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden
                    >
                        <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                    </svg>
                )}
            </div>
        </div>
    );
};

interface MirrorCellProps {
    position: GridPosition;
    assignment: MirrorAssignment;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    selectedNodeMac: string | null;
    driverStatuses: Map<string, DriverStatusSnapshot>;
    /** Callback to open the tile info modal */
    onOpenModal?: (position: GridPosition) => void;
    /** Callback to home a single motor */
    onHomeMotor?: (motor: Motor) => void;
    /** Callback to home the entire tile (both axes) */
    onHomeTile?: (position: GridPosition, motors: { x: Motor | null; y: Motor | null }) => void;
    /** Callback to nudge a single motor */
    onNudgeMotor?: (motor: Motor, currentPosition: number) => void;
}

const MirrorCell: React.FC<MirrorCellProps> = ({
    position,
    assignment,
    onMotorDrop,
    selectedNodeMac,
    driverStatuses,
    onOpenModal,
    onHomeMotor,
    onHomeTile,
    onNudgeMotor,
}) => {
    const [isHovered, setIsHovered] = useState(false);

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

    // Border classes based on status (priority: offline > stale > crossDriver > default)
    const borderClass = analysis.hasOffline
        ? 'border-red-500/60'
        : analysis.hasStale
          ? 'border-amber-500/60'
          : analysis.crossDriver
            ? 'border-amber-500/60'
            : 'border-gray-700';

    // Background class
    const bgClass = 'bg-gray-900/60';

    const handleCardClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            const interactiveAncestor = target.closest(
                'button, a, input, textarea, select, [role="button"], [draggable="true"]',
            );
            if (interactiveAncestor && interactiveAncestor !== event.currentTarget) {
                return;
            }
            if (onOpenModal) {
                onOpenModal(position);
            }
        },
        [onOpenModal, position],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.currentTarget !== event.target) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (onOpenModal) {
                    onOpenModal(position);
                }
            }
        },
        [onOpenModal, position],
    );

    const showMenu = isHovered && (onHomeTile || onHomeMotor);

    const handleNudgeX = useCallback(() => {
        if (assignment.x && onNudgeMotor && telemetryX) {
            onNudgeMotor(assignment.x, telemetryX.position);
        }
    }, [assignment.x, onNudgeMotor, telemetryX]);

    const handleNudgeY = useCallback(() => {
        if (assignment.y && onNudgeMotor && telemetryY) {
            onNudgeMotor(assignment.y, telemetryY.position);
        }
    }, [assignment.y, onNudgeMotor, telemetryY]);

    return (
        <div
            dir="ltr"
            data-testid={`mirror-cell-${position.row}-${position.col}`}
            onClick={handleCardClick}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="button"
            tabIndex={0}
            aria-label={`Tile [${position.row},${position.col}]${analysis.warningBadges.length > 0 ? ` - ${analysis.warningBadges.map((b) => b.label).join(', ')}` : ''}`}
            className={`relative rounded-md border px-2 py-1.5 text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${borderClass} ${bgClass} ${nodeHighlightClass} cursor-pointer`}
        >
            {/* Menu in top right corner */}
            {showMenu && (
                <div className="absolute top-1.5 right-1.5">
                    <TileConfigMenu
                        position={position}
                        xMotor={assignment.x}
                        yMotor={assignment.y}
                        onHomeMotor={onHomeMotor}
                        onHomeTile={onHomeTile}
                    />
                </div>
            )}

            {/* Header with position */}
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-semibold">
                <span className="font-mono">
                    [{position.row},{position.col}]
                </span>
            </div>

            {/* Warning badges */}
            {analysis.warningBadges.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1 text-[10px] font-semibold tracking-wide uppercase">
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

            {/* Motor rows with drag-and-drop */}
            <div className="space-y-1.5">
                <DraggableMotorRow
                    axis="x"
                    motor={assignment.x}
                    telemetry={telemetryX}
                    position={position}
                    onMotorDrop={onMotorDrop}
                    variant={analysis.variants.x}
                    onNudge={assignment.x && onNudgeMotor && telemetryX ? handleNudgeX : undefined}
                />
                <DraggableMotorRow
                    axis="y"
                    motor={assignment.y}
                    telemetry={telemetryY}
                    position={position}
                    onMotorDrop={onMotorDrop}
                    variant={analysis.variants.y}
                    onNudge={assignment.y && onNudgeMotor && telemetryY ? handleNudgeY : undefined}
                />
            </div>
        </div>
    );
};

export default MirrorCell;
