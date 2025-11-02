import React, { useState, useEffect, useCallback } from 'react';

import DiscoveredNodes from '../components/DiscoveredNodes';
import GridConfigurator from '../components/GridConfigurator';
import MirrorGrid from '../components/MirrorGrid';
import { discoverNodes } from '../services/mockApi';

import type { NavigationControls } from '../App';
import type {
    Node,
    Motor,
    MirrorConfig,
    MirrorAssignment,
    GridPosition,
    DraggedMotorInfo,
    Axis,
} from '../types';

interface ModalState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
}

interface ConfiguratorPageProps {
    navigation: NavigationControls;
    gridSize: { rows: number; cols: number };
    onGridSizeChange: (rows: number, cols: number) => void;
}

const ConfiguratorPage: React.FC<ConfiguratorPageProps> = ({
    navigation,
    gridSize,
    onGridSizeChange,
}) => {
    const [discoveredNodes, setDiscoveredNodes] = useState<Node[]>([]);
    const [mirrorConfig, setMirrorConfig] = useState<MirrorConfig>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [isTestMode, setIsTestMode] = useState(false);
    const [selectedNodeMac, setSelectedNodeMac] = useState<string | null>(null);
    const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
    const [modalState, setModalState] = useState<ModalState>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
    });

    const fetchNodes = useCallback(async () => {
        try {
            const nodes = await discoverNodes();
            setDiscoveredNodes(nodes);
        } catch (error) {
            console.error('Failed to discover nodes', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNodes();
    }, [fetchNodes]);

    const handleGridSizeChange = (rows: number, cols: number) => {
        onGridSizeChange(rows, cols);
        // Preserve existing config for cells that are still within bounds
        setMirrorConfig((prevConfig) => {
            const newConfig: MirrorConfig = new Map();
            for (const [key, assignment] of prevConfig.entries()) {
                const [row, col] = key.split('-').map(Number);
                if (row < rows && col < cols) {
                    newConfig.set(key, assignment);
                }
            }
            return newConfig;
        });
    };

    const isMotorAssigned = useCallback(
        (motor: Motor) => {
            for (const assignment of mirrorConfig.values()) {
                if (
                    assignment.x?.nodeMac === motor.nodeMac &&
                    assignment.x?.motorIndex === motor.motorIndex
                )
                    return true;
                if (
                    assignment.y?.nodeMac === motor.nodeMac &&
                    assignment.y?.motorIndex === motor.motorIndex
                )
                    return true;
            }
            return false;
        },
        [mirrorConfig],
    );

    const unassignMotor = useCallback((motor: Motor) => {
        setMirrorConfig((prevConfig) => {
            const newConfig: MirrorConfig = new Map(prevConfig);
            let updated = false;
            for (const key of newConfig.keys()) {
                const assignment = newConfig.get(key);
                if (!assignment) {
                    continue;
                }
                const newAssignment: MirrorAssignment = { x: assignment.x, y: assignment.y };
                let assignmentChanged = false;

                if (
                    newAssignment.x?.nodeMac === motor.nodeMac &&
                    newAssignment.x?.motorIndex === motor.motorIndex
                ) {
                    newAssignment.x = null;
                    assignmentChanged = true;
                }
                if (
                    newAssignment.y?.nodeMac === motor.nodeMac &&
                    newAssignment.y?.motorIndex === motor.motorIndex
                ) {
                    newAssignment.y = null;
                    assignmentChanged = true;
                }

                if (assignmentChanged) {
                    if (newAssignment.x === null && newAssignment.y === null) {
                        newConfig.delete(key);
                    } else {
                        newConfig.set(key, newAssignment);
                    }
                    updated = true;
                    break;
                }
            }
            return updated ? newConfig : prevConfig;
        });
    }, []);

    const handleMotorDrop = useCallback(
        (pos: GridPosition, axis: Axis, dragDataString: string) => {
            if (isTestMode) return;
            const dragData: DraggedMotorInfo = JSON.parse(dragDataString);
            const motorToMove = dragData.motor;

            setMirrorConfig((prevConfig) => {
                const newConfig: MirrorConfig = new Map(prevConfig);

                for (const key of newConfig.keys()) {
                    const assignment = newConfig.get(key);
                    if (!assignment) {
                        continue;
                    }
                    let assignmentChanged = false;
                    const newAssignment: MirrorAssignment = { x: assignment.x, y: assignment.y };

                    if (
                        newAssignment.x?.nodeMac === motorToMove.nodeMac &&
                        newAssignment.x?.motorIndex === motorToMove.motorIndex
                    ) {
                        newAssignment.x = null;
                        assignmentChanged = true;
                    }
                    if (
                        newAssignment.y?.nodeMac === motorToMove.nodeMac &&
                        newAssignment.y?.motorIndex === motorToMove.motorIndex
                    ) {
                        newAssignment.y = null;
                        assignmentChanged = true;
                    }

                    if (assignmentChanged) {
                        if (newAssignment.x === null && newAssignment.y === null) {
                            newConfig.delete(key);
                        } else {
                            newConfig.set(key, newAssignment);
                        }
                        break;
                    }
                }

                const key = `${pos.row}-${pos.col}`;
                const currentAssignment = newConfig.get(key) || { x: null, y: null };

                newConfig.set(key, {
                    ...currentAssignment,
                    [axis]: motorToMove,
                });

                return newConfig;
            });
        },
        [isTestMode],
    );

    const handleUnassignByDrop = useCallback(
        (dragDataString: string) => {
            const dragData: DraggedMotorInfo = JSON.parse(dragDataString);
            if (dragData.source === 'grid') {
                unassignMotor(dragData.motor);
            }
        },
        [unassignMotor],
    );

    const handleMoveCommand = (pos: GridPosition, axis: 'x' | 'y', direction: number) => {
        const key = `${pos.row}-${pos.col}`;
        const motor = mirrorConfig.get(key)?.[axis];
        if (motor) {
            console.log(`MQTT OUT:
  Topic: nodes/${motor.nodeMac}/motors/${motor.motorIndex}/move
  Payload: { "direction": ${direction > 0 ? '"+"' : '"-"'}, "speed": 100 }
  (Simulating move command for mirror at [${pos.row}, ${pos.col}] on axis ${axis.toUpperCase()})`);
        } else {
            console.warn(
                `No motor assigned to axis ${axis.toUpperCase()} for mirror at [${pos.row}, ${pos.col}]`,
            );
        }
    };

    const handleNodeSelect = (mac: string | null) => {
        setSelectedNodeMac((current) => (current === mac ? null : mac));
    };

    const confirmAction = (title: string, message: string, onConfirm: () => void) => {
        setModalState({ isOpen: true, title, message, onConfirm });
    };

    const handleResetAll = () => {
        confirmAction(
            'Reset All Assignments?',
            'Are you sure you want to clear the entire grid? This action cannot be undone.',
            () => {
                setMirrorConfig(new Map());
                setModalState({ ...modalState, isOpen: false });
            },
        );
    };

    const handleClearNodeAssignments = (nodeMac: string) => {
        confirmAction(
            `Clear Assignments for ${nodeMac.slice(-5)}?`,
            `Are you sure you want to unassign all motors from this node?`,
            () => {
                setMirrorConfig((prevConfig) => {
                    const newConfig: MirrorConfig = new Map(prevConfig);
                    for (const key of newConfig.keys()) {
                        const assignment = newConfig.get(key);
                        if (!assignment) {
                            continue;
                        }
                        const newAssignment: MirrorAssignment = {
                            x: assignment.x,
                            y: assignment.y,
                        };
                        let changed = false;
                        if (newAssignment.x?.nodeMac === nodeMac) {
                            newAssignment.x = null;
                            changed = true;
                        }
                        if (newAssignment.y?.nodeMac === nodeMac) {
                            newAssignment.y = null;
                            changed = true;
                        }
                        if (changed) {
                            if (newAssignment.x || newAssignment.y) {
                                newConfig.set(key, newAssignment);
                            } else {
                                newConfig.delete(key);
                            }
                        }
                    }
                    return newConfig;
                });
                setModalState({ ...modalState, isOpen: false });
            },
        );
    };

    return (
        <>
            {modalState.isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                    aria-modal="true"
                    role="dialog"
                >
                    <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-700">
                        <h2 className="text-xl font-bold text-white">{modalState.title}</h2>
                        <p className="mt-2 text-gray-300">{modalState.message}</p>
                        <div className="mt-6 flex justify-end space-x-4">
                            <button
                                onClick={() => setModalState({ ...modalState, isOpen: false })}
                                className="px-4 py-2 rounded-md bg-gray-600 text-white font-semibold hover:bg-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={modalState.onConfirm}
                                className="px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col p-4 sm:p-6 lg:p-8">
                <header className="mb-6 flex flex-wrap justify-between items-start gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-cyan-400 tracking-tight">
                            Mirror Array Configurator
                        </h1>
                        <p className="text-gray-400 mt-1">
                            Visually assign motors to mirrors and test your configuration.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigation.navigateTo('library')}
                            className="px-4 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors border border-gray-600"
                        >
                            &larr; Back to Library
                        </button>
                        <button
                            onClick={handleResetAll}
                            className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-800/70 text-red-200 hover:bg-red-700/80 transition-colors border border-red-600/80"
                            title="Reset all assignments"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            Reset All
                        </button>
                    </div>
                </header>

                <div className="flex flex-col lg:flex-row flex-grow gap-8">
                    <main className="flex-grow lg:w-2/3 flex flex-col bg-gray-800/50 rounded-lg p-4 shadow-lg ring-1 ring-white/10">
                        <GridConfigurator
                            rows={gridSize.rows}
                            cols={gridSize.cols}
                            onSizeChange={handleGridSizeChange}
                            isTestMode={isTestMode}
                            onTestModeChange={setIsTestMode}
                        />
                        <div className="flex-grow mt-4 overflow-auto p-2 bg-black/20 rounded-md">
                            <MirrorGrid
                                rows={gridSize.rows}
                                cols={gridSize.cols}
                                mirrorConfig={mirrorConfig}
                                onMotorDrop={handleMotorDrop}
                                onMoveCommand={handleMoveCommand}
                                isTestMode={isTestMode}
                                selectedNodeMac={selectedNodeMac}
                            />
                        </div>
                    </main>

                    <aside className="lg:w-1/3 flex flex-col bg-gray-800/50 rounded-lg p-4 shadow-lg ring-1 ring-white/10">
                        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                            <h2 className="text-2xl font-semibold text-gray-100">Nodes</h2>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="unassignedFilter"
                                        checked={showOnlyUnassigned}
                                        onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
                                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-600"
                                    />
                                    <label
                                        htmlFor="unassignedFilter"
                                        className="text-sm text-gray-300"
                                    >
                                        Show only unassigned
                                    </label>
                                </div>
                                <button
                                    onClick={() => {
                                        setIsLoading(true);
                                        fetchNodes();
                                    }}
                                    className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                                    title="Rediscover Nodes"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 4v5h5M20 20v-5h-5M4 4a8 8 0 0113.52 4.857M20 20a8 8 0 01-13.52-4.857"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto pr-2">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <p className="text-gray-400">Discovering nodes...</p>
                                </div>
                            ) : (
                                <DiscoveredNodes
                                    nodes={discoveredNodes}
                                    isMotorAssigned={isMotorAssigned}
                                    selectedNodeMac={selectedNodeMac}
                                    onNodeSelect={handleNodeSelect}
                                    onUnassignByDrop={handleUnassignByDrop}
                                    showOnlyUnassigned={showOnlyUnassigned}
                                    onClearNodeAssignments={handleClearNodeAssignments}
                                />
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </>
    );
};

export default ConfiguratorPage;
