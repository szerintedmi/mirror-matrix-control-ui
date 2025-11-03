import React, { useMemo } from 'react';

import type { DriverPresence, DriverView } from '../context/StatusContext';
import type { MirrorAssignment, MirrorConfig } from '../types';

interface MotorStatusOverviewProps {
    rows: number;
    cols: number;
    mirrorConfig: MirrorConfig;
    drivers: DriverView[];
}

interface AxisDotView {
    axis: 'x' | 'y';
    colorClass: string;
    animate: boolean;
    title: string;
}

interface TileDotView {
    key: string;
    dots: AxisDotView[];
    tileTitle: string;
}

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
    const motorStatus = useMemo(() => {
        const map = new Map<string, { presence: DriverPresence; moving: boolean }>();
        for (const driver of drivers) {
            for (const motor of Object.values(driver.snapshot.motors)) {
                map.set(`${driver.mac}-${motor.id}`, {
                    presence: driver.presence,
                    moving: motor.moving,
                });
            }
        }
        return map;
    }, [drivers]);

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
                            axis,
                            colorClass: 'bg-slate-600',
                            animate: false,
                            title: `Tile ${row + 1},${col + 1} axis ${axis.toUpperCase()}: Unassigned`,
                        };
                    }
                    const status = motorStatus.get(`${motor.nodeMac}-${motor.motorIndex}`);
                    const presence = status?.presence ?? 'offline';
                    const moving = status?.moving ?? false;
                    const colorClass = getPresenceColor(presence, moving, true);
                    const labelPresence =
                        presence === 'ready'
                            ? moving
                                ? 'Moving'
                                : 'Ready'
                            : presence === 'stale'
                              ? 'Delayed heartbeat'
                              : 'Offline';
                    const label = `Tile ${row + 1},${col + 1} axis ${axis.toUpperCase()}: MAC ${motor.nodeMac} • Motor ${motor.motorIndex} • ${labelPresence}`;
                    return {
                        axis,
                        colorClass,
                        animate: presence === 'ready' && moving,
                        title: label,
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
            <div className="mb-3 flex items-center justify-between text-sm text-gray-300">
                <span className="font-semibold text-gray-100">Array Overview</span>
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
                            {tile.dots.map((dot) => (
                                <span
                                    key={`${tile.key}-${dot.axis}`}
                                    className={`h-2.5 w-2.5 rounded-full ${dot.colorClass} ${dot.animate ? 'animate-pulse' : ''}`}
                                    title={dot.title}
                                    data-testid="motor-overview-dot"
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default MotorStatusOverview;
