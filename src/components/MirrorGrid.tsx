import React from 'react';

import MirrorCell from './MirrorCell';

import type { MirrorConfig, GridPosition, Axis, DriverStatusSnapshot } from '../types';

interface MirrorGridProps {
    rows: number;
    cols: number;
    mirrorConfig: MirrorConfig;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    selectedNodeMac: string | null;
    driverStatuses: Map<string, DriverStatusSnapshot>;
    orientation?: 'mirror' | 'projection';
}

const MirrorGrid: React.FC<MirrorGridProps> = ({
    rows,
    cols,
    mirrorConfig,
    onMotorDrop,
    selectedNodeMac,
    driverStatuses,
    orientation = 'mirror',
}) => {
    const gridDirection = orientation === 'mirror' ? 'rtl' : 'ltr';
    return (
        <div
            className="grid gap-x-1 gap-y-0.5 bg-gray-900 p-2"
            style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                direction: gridDirection,
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
                        selectedNodeMac={selectedNodeMac}
                        driverStatuses={driverStatuses}
                    />
                );
            })}
        </div>
    );
};

export default MirrorGrid;
