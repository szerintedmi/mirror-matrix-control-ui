import React from 'react';
import type { MirrorConfig, GridPosition, Motor, Axis } from '../types';
import MirrorCell from './MirrorCell';

interface MirrorGridProps {
    rows: number;
    cols: number;
    mirrorConfig: MirrorConfig;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    onMoveCommand: (pos: GridPosition, axis: 'x' | 'y', direction: number) => void;
    isTestMode: boolean;
    selectedNodeMac: string | null;
}

const MirrorGrid: React.FC<MirrorGridProps> = ({
    rows,
    cols,
    mirrorConfig,
    onMotorDrop,
    onMoveCommand,
    isTestMode,
    selectedNodeMac,
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
                    />
                );
            })}
        </div>
    );
};

export default MirrorGrid;
