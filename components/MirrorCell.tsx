import React, { useState } from 'react';
import type { GridPosition, MirrorAssignment, Motor, Axis, DraggedMotorInfo } from '../types';

interface MotorSlotProps {
    axis: Axis;
    motor: Motor | null;
    position: GridPosition;
    isTestMode: boolean;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    onMoveCommand: (pos: GridPosition, axis: 'x' | 'y', direction: number) => void;
}

const MotorSlot: React.FC<MotorSlotProps> = ({
    axis,
    motor,
    position,
    isTestMode,
    onMotorDrop,
    onMoveCommand,
}) => {
    const [isHovering, setIsHovering] = useState(false);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (isTestMode) return;
        e.preventDefault();
        setIsHovering(true);
    };

    const handleDragLeave = () => {
        if (isTestMode) return;
        setIsHovering(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        if (isTestMode) return;
        e.preventDefault();
        setIsHovering(false);
        const dragData = e.dataTransfer.getData('application/json');
        if (dragData) {
            onMotorDrop(position, axis, dragData);
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isTestMode && motor) {
            onMoveCommand(position, axis, 1);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        if (isTestMode && motor) {
            e.stopPropagation();
            e.preventDefault();
            onMoveCommand(position, axis, -1);
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (!motor || isTestMode) {
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

    const baseBg = isHovering ? 'bg-cyan-500/30' : 'bg-gray-700/50';
    const testModeClasses = isTestMode && motor ? 'cursor-pointer hover:bg-cyan-600/50' : '';
    const draggableClasses = !isTestMode && motor ? 'cursor-grab' : '';
    const motorTextColor = motor ? 'text-cyan-300' : 'text-gray-500';

    return (
        <div
            draggable={!isTestMode && !!motor}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            className={`flex items-center justify-center p-2 rounded transition-colors duration-200 h-10 ${baseBg} ${testModeClasses} ${draggableClasses}`}
            title={
                isTestMode && motor
                    ? `Left-click to move +, Right-click to move -`
                    : motor
                      ? `Drag to reassign`
                      : `Drop a motor here`
            }
        >
            {motor ? (
                <span className={`font-mono text-sm ${motorTextColor}`}>
                    {motor.nodeMac.slice(-5)}:{motor.motorIndex}
                </span>
            ) : (
                <span className="font-mono text-sm text-gray-500">--</span>
            )}
        </div>
    );
};

interface MirrorCellProps {
    position: GridPosition;
    assignment: MirrorAssignment;
    onMotorDrop: (pos: GridPosition, axis: Axis, dragDataString: string) => void;
    onMoveCommand: (pos: GridPosition, axis: 'x' | 'y', direction: number) => void;
    isTestMode: boolean;
    selectedNodeMac: string | null;
}

const MirrorCell: React.FC<MirrorCellProps> = ({
    position,
    assignment,
    onMotorDrop,
    onMoveCommand,
    isTestMode,
    selectedNodeMac,
}) => {
    const [isSelected, setIsSelected] = useState(false);

    const borderStyle = isSelected
        ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-cyan-400'
        : 'ring-1 ring-gray-700';

    const isNodeXHighlighted = assignment.x?.nodeMac === selectedNodeMac;
    const isNodeYHighlighted = assignment.y?.nodeMac === selectedNodeMac;
    const nodeHighlightClass =
        selectedNodeMac && (isNodeXHighlighted || isNodeYHighlighted)
            ? 'shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]'
            : '';

    return (
        <div
            onClick={() => setIsSelected(!isSelected)}
            onBlur={() => setIsSelected(false)}
            tabIndex={0}
            className={`relative aspect-square flex flex-col rounded-md p-1.5 gap-2 transition-all duration-200 outline-none ${borderStyle} ${isSelected ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700/70'} ${nodeHighlightClass}`}
        >
            <div className="text-center text-xs font-semibold text-gray-400 select-none">
                [{position.row},{position.col}]
            </div>

            <div className="w-full flex flex-col gap-1.5 mt-auto">
                <MotorSlot
                    axis="x"
                    motor={assignment.x}
                    position={position}
                    isTestMode={isTestMode}
                    onMotorDrop={onMotorDrop}
                    onMoveCommand={onMoveCommand}
                />
                <MotorSlot
                    axis="y"
                    motor={assignment.y}
                    position={position}
                    isTestMode={isTestMode}
                    onMotorDrop={onMotorDrop}
                    onMoveCommand={onMoveCommand}
                />
            </div>
        </div>
    );
};

export default MirrorCell;
