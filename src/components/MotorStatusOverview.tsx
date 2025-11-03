import React, { useMemo, useState } from 'react';

import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '../constants/control';
import { useCommandFeedback } from '../hooks/useCommandFeedback';
import { useMotorCommands } from '../hooks/useMotorCommands';
import { useMotorController } from '../hooks/useMotorController';
import { normalizeCommandError } from '../utils/commandErrors';

import MotorActionButtons from './MotorActionButtons';

import type { DriverPresence, DriverView } from '../context/StatusContext';
import type { MirrorAssignment, MirrorConfig, Motor, MotorTelemetry } from '../types';

interface MotorStatusOverviewProps {
    rows: number;
    cols: number;
    mirrorConfig: MirrorConfig;
    drivers: DriverView[];
}

interface AxisDotView {
    key: string;
    axis: 'x' | 'y';
    colorClass: string;
    animate: boolean;
    title: string;
    motor: Motor | null;
    extraClass?: string;
}

interface TileDotView {
    key: string;
    dots: AxisDotView[];
    tileTitle: string;
}

interface SelectedMotorState {
    key: string;
    axis: 'x' | 'y';
    tileTitle: string;
    motor: Motor;
}

const SelectedMotorPanel: React.FC<{
    selection: SelectedMotorState;
    telemetry?: MotorTelemetry;
    onClear: () => void;
}> = ({ selection, telemetry, onClear }) => {
    const controller = useMotorController(selection.motor, telemetry);

    return (
        <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900/70 p-4">
            <div className="flex items-center justify-between text-sm text-gray-300">
                <span>
                    {selection.tileTitle} • Axis {selection.axis.toUpperCase()} •{' '}
                    {selection.motor.nodeMac.slice(-5)}:{selection.motor.motorIndex}
                </span>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-xs text-gray-400 transition-colors hover:text-gray-200"
                >
                    Clear
                </button>
            </div>
            <div className="mt-3">
                <MotorActionButtons
                    motor={selection.motor}
                    telemetry={telemetry}
                    controller={controller}
                    dataTestIdPrefix={`overview-${selection.key}`}
                />
            </div>
        </div>
    );
};

const getPresenceColor = (
    presence: DriverPresence,
    isMoving: boolean,
    isAssigned: boolean,
): string => {
    if (presence === 'offline') {
        return 'bg-red-500';
    }
    if (presence === 'stale') {
        return 'bg-amber-400';
    }
    if (isMoving) {
        return 'bg-cyan-400';
    }
    return isAssigned ? 'bg-emerald-400' : 'bg-slate-500';
};

const MotorStatusOverview: React.FC<MotorStatusOverviewProps> = ({
    rows,
    cols,
    mirrorConfig,
    drivers,
}) => {
    const { homeAll } = useMotorCommands();
    const homeFeedback = useCommandFeedback();

    const motorStatus = useMemo(() => {
        const map = new Map<
            string,
            { presence: DriverPresence; moving: boolean; telemetry?: MotorTelemetry }
        >();
        for (const driver of drivers) {
            const topicMac = driver.snapshot.topicMac;
            for (const motor of Object.values(driver.snapshot.motors)) {
                map.set(`${topicMac}-${motor.id}`, {
                    presence: driver.presence,
                    moving: motor.moving,
                    telemetry: {
                        id: motor.id,
                        position: motor.position,
                        moving: motor.moving,
                        awake: motor.awake,
                        homed: motor.homed,
                        stepsSinceHome: motor.stepsSinceHome,
                    },
                });
            }
        }
        return map;
    }, [drivers]);

    const handleHomeAll = async () => {
        if (drivers.length === 0) {
            homeFeedback.fail('No drivers available');
            return;
        }
        const macAddresses = Array.from(new Set(drivers.map((driver) => driver.snapshot.topicMac)));
        homeFeedback.begin('Homing all axes…');
        try {
            await homeAll({ macAddresses });
            homeFeedback.succeed('Home All dispatched');
        } catch (error) {
            const details = normalizeCommandError(error);
            homeFeedback.fail(details.message, details.code);
        }
    };

    const [selectedMotor, setSelectedMotor] = useState<SelectedMotorState | null>(null);

    const tiles = useMemo<TileDotView[]>(() => {
        const views: TileDotView[] = [];
        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const key = `${row}-${col}`;
                const assignment: MirrorAssignment = mirrorConfig.get(key) || { x: null, y: null };
                const axes: Array<'x' | 'y'> = ['x', 'y'];
                const dots = axes.map<AxisDotView>((axis) => {
                    const motor = assignment[axis];
                    if (!motor) {
                        return {
                            key: `${key}-${axis}`,
                            axis,
                            colorClass: 'bg-slate-600',
                            animate: false,
                            title: `Tile ${row + 1},${col + 1} axis ${axis.toUpperCase()}: Unassigned`,
                            motor: null,
                        };
                    }
                    const status = motorStatus.get(`${motor.nodeMac}-${motor.motorIndex}`);
                    const presence = status?.presence ?? 'offline';
                    const moving = status?.moving ?? false;
                    const colorClass = getPresenceColor(presence, moving, true);
                    const macLabel = motor.nodeMac.toUpperCase();
                    const labelPresence =
                        presence === 'ready'
                            ? moving
                                ? 'Moving'
                                : 'Ready'
                            : presence === 'stale'
                              ? 'Delayed heartbeat'
                              : 'Offline';
                    const label = `Tile ${row + 1},${col + 1} axis ${axis.toUpperCase()}: MAC ${macLabel} • Motor ${motor.motorIndex} • ${labelPresence}`;
                    const stepsClass = (() => {
                        const steps = status?.telemetry?.stepsSinceHome;
                        if (steps === undefined) {
                            return '';
                        }
                        if (steps >= STEPS_SINCE_HOME_CRITICAL) {
                            return 'shadow-[0_0_0_2px_rgba(248,113,113,0.9)]';
                        }
                        if (steps >= STEPS_SINCE_HOME_WARNING) {
                            return 'shadow-[0_0_0_2px_rgba(251,191,36,0.9)]';
                        }
                        return '';
                    })();
                    return {
                        key: `${key}-${axis}`,
                        axis,
                        colorClass,
                        animate: presence === 'ready' && moving,
                        title: label,
                        motor,
                        extraClass: stepsClass,
                    };
                });

                views.push({
                    key,
                    dots,
                    tileTitle: `Tile ${row + 1},${col + 1}`,
                });
            }
        }
        return views;
    }, [cols, mirrorConfig, motorStatus, rows]);

    if (tiles.length === 0) {
        return null;
    }

    return (
        <section className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3 text-sm text-gray-300">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-gray-100">Array Overview</span>
                    <button
                        type="button"
                        onClick={handleHomeAll}
                        className="rounded-md border border-emerald-600/70 bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                    >
                        Home All
                    </button>
                    {homeFeedback.feedback.state !== 'idle' && homeFeedback.feedback.message && (
                        <span
                            className={`text-xs ${
                                homeFeedback.feedback.state === 'error'
                                    ? 'text-red-200'
                                    : homeFeedback.feedback.state === 'pending'
                                      ? 'text-sky-200'
                                      : 'text-emerald-200'
                            }`}
                        >
                            {homeFeedback.feedback.message}
                            {homeFeedback.feedback.code && (
                                <span className="ml-1 text-[10px] text-gray-400">
                                    ({homeFeedback.feedback.code})
                                </span>
                            )}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Assigned
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" /> Moving
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-amber-400" /> Stale
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-500" /> Offline
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-slate-600" /> Unassigned
                    </span>
                </div>
            </div>
            <div
                className="grid gap-1"
                data-testid="motor-overview"
                style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                }}
            >
                {tiles.map((tile) => (
                    <div
                        key={tile.key}
                        className="flex h-8 items-center justify-center rounded bg-gray-900/70"
                        title={tile.tileTitle}
                    >
                        <div className="flex items-center gap-1">
                            {tile.dots.map((dot) => {
                                const isSelected = selectedMotor?.key === dot.key;
                                const baseClasses = `h-2.5 w-2.5 rounded-full ${dot.colorClass} ${dot.animate ? 'animate-pulse' : ''}`;
                                const interactiveClasses = dot.motor
                                    ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 hover:scale-110'
                                    : 'cursor-not-allowed opacity-70';
                                const ringClass = isSelected
                                    ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-cyan-400'
                                    : '';
                                return (
                                    <button
                                        key={dot.key}
                                        type="button"
                                        className={`${baseClasses} ${interactiveClasses} ${ringClass} ${dot.extraClass ?? ''}`}
                                        title={dot.title}
                                        data-testid="motor-overview-dot"
                                        onClick={() => {
                                            if (!dot.motor) {
                                                return;
                                            }
                                            const motor = dot.motor;
                                            setSelectedMotor((current) =>
                                                current && current.key === dot.key
                                                    ? null
                                                    : {
                                                          key: dot.key,
                                                          axis: dot.axis,
                                                          tileTitle: tile.tileTitle,
                                                          motor,
                                                      },
                                            );
                                        }}
                                        disabled={!dot.motor}
                                    >
                                        <span className="sr-only">{dot.title}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            {selectedMotor && (
                <SelectedMotorPanel
                    selection={selectedMotor}
                    telemetry={
                        motorStatus.get(
                            `${selectedMotor.motor.nodeMac}-${selectedMotor.motor.motorIndex}`,
                        )?.telemetry
                    }
                    onClear={() => setSelectedMotor(null)}
                />
            )}
        </section>
    );
};

export default MotorStatusOverview;
