import React, {useState} from 'react';
import type { Node, Motor, DraggedMotorInfo } from '../types';

const DraggableMotor: React.FC<{ motor: Motor; isAssigned: boolean }> = ({ motor, isAssigned }) => {
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if(isAssigned) {
            e.preventDefault();
            return;
        }
        const dragData: DraggedMotorInfo = {
            source: 'list',
            motor: motor
        };
        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
    };

    const baseClasses = "flex items-center justify-center p-2 border rounded-md font-mono text-sm transition-all duration-200";
    const assignedClasses = "bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed";
    const availableClasses = "bg-cyan-800/50 border-cyan-700 text-cyan-200 cursor-grab hover:bg-cyan-700/70 hover:shadow-lg hover:shadow-cyan-500/20";
    
    return (
        <div
            draggable={!isAssigned}
            onDragStart={handleDragStart}
            className={`${baseClasses} ${isAssigned ? assignedClasses : availableClasses}`}
            title={`Node: ${motor.nodeMac}\nMotor Index: ${motor.motorIndex}\nStatus: ${isAssigned ? 'Assigned' : 'Available'}`}
        >
            Motor {motor.motorIndex}
        </div>
    );
};

interface DiscoveredNodesProps {
    nodes: Node[];
    isMotorAssigned: (motor: Motor) => boolean;
    selectedNodeMac: string | null;
    onNodeSelect: (mac: string | null) => void;
    onUnassignByDrop: (dragDataString: string) => void;
    showOnlyUnassigned: boolean;
    onClearNodeAssignments: (mac: string) => void;
}

const DiscoveredNodes: React.FC<DiscoveredNodesProps> = ({ nodes, isMotorAssigned, selectedNodeMac, onNodeSelect, onUnassignByDrop, showOnlyUnassigned, onClearNodeAssignments }) => {
    const [isDropHovering, setIsDropHovering] = useState(false);

    if (nodes.length === 0) {
        return <p className="text-gray-500 text-center mt-8">No nodes found.</p>;
    }

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const dragData = e.dataTransfer.getData('application/json');
        if (dragData) {
            const parsed: DraggedMotorInfo = JSON.parse(dragData);
            if(parsed.source === 'grid') {
                 setIsDropHovering(true);
            }
        }
    };
    
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        setIsDropHovering(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDropHovering(false);
        const dragData = e.dataTransfer.getData('application/json');
        if (dragData) {
            onUnassignByDrop(dragData);
        }
    };
    
    return (
        <div 
            className={`space-y-6 transition-colors rounded-lg ${isDropHovering ? 'bg-red-500/20' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDropHovering && <div className="text-center font-bold text-red-300 py-4">Drop to Unassign Motor</div>}
            {nodes.map(node => {
                const motorsToShow = showOnlyUnassigned ? node.motors.filter(m => !isMotorAssigned(m)) : node.motors;
                if (showOnlyUnassigned && motorsToShow.length === 0) {
                    return null;
                }
                return (
                    <div 
                        key={node.macAddress} 
                        className={`bg-gray-900/50 p-4 rounded-lg border border-gray-700 transition-all ${selectedNodeMac === node.macAddress ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20' : 'hover:border-gray-500'}`}
                    >
                        <div className="flex justify-between items-center" >
                            <div 
                                className="flex-grow cursor-pointer" 
                                onClick={() => onNodeSelect(node.macAddress)}
                            >
                                <div className="flex items-center gap-3">
                                     <span className={`h-2.5 w-2.5 rounded-full ${node.status === 'ready' ? 'bg-green-400' : 'bg-yellow-500'}`} title={`Status: ${node.status}`}></span>
                                     <h3 className="font-mono text-lg text-emerald-400 break-all">{node.macAddress}</h3>
                                </div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onClearNodeAssignments(node.macAddress); }} 
                                className="text-gray-500 hover:text-red-400 p-1.5 rounded-full hover:bg-red-900/50 transition-colors"
                                title={`Clear all assignments for this node`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mt-3">
                            {motorsToShow.map(motor => (
                                <DraggableMotor key={`${motor.nodeMac}-${motor.motorIndex}`} motor={motor} isAssigned={isMotorAssigned(motor)} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default DiscoveredNodes;
