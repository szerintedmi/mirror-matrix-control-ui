import React from 'react';

import MirrorCell from './MirrorCell';

import type { MirrorConfig, GridPosition, Axis, DriverStatusSnapshot } from '../types';

interface MirrorGridProps {
    rows: number;
    cols: number;
    mirrorConfig: MirrorConfig;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    onMoveCommand: (pos: GridPosition, axis: 'x' | 'y', direction: number) => void;
    isTestMode: boolean;
    selectedNodeMac: string | null;
    driverStatuses: Map<string, DriverStatusSnapshot>;
}

const MirrorGrid: React.FC<MirrorGridProps> = ({
    rows,
    cols,
    mirrorConfig,
    onMotorDrop,
    onMoveCommand,
    isTestMode,
    selectedNodeMac,
    driverStatuses,
}) => {
    return (
        <div
            className="grid gap-1 bg-gray-900 p-2"
            style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
        >
            {Array.from({ length: rows * cols }).map((_, index) => {
                const row = Math.floor(index / cols);
                const col = index % cols;
                const pos = { row, col };
                const key = `${row}-${col}`;
                const assignment = mirrorConfig.get(key) || { x: null, y: null };

                return (
                    <MirrorCell
                        key={key}
                        position={pos}
                        assignment={assignment}
                        onMotorDrop={onMotorDrop}
                        onMoveCommand={onMoveCommand}
                        isTestMode={isTestMode}
                        selectedNodeMac={selectedNodeMac}
                        driverStatuses={driverStatuses}
                    />
                );
            })}
        </div>
    );
};

export default MirrorGrid;
