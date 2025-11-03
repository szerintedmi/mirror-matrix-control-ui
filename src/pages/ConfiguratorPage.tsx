import React, { useCallback, useMemo, useState } from 'react';

import DiscoveredNodes, { type DiscoveredNode } from '../components/DiscoveredNodes';
import GridConfigurator from '../components/GridConfigurator';
import MirrorGrid from '../components/MirrorGrid';
import UnassignedMotorTray from '../components/UnassignedMotorTray';
import { useMqtt } from '../context/MqttContext';
import { useStatusStore } from '../context/StatusContext';
import { useCommandFeedback } from '../hooks/useCommandFeedback';
import { useMotorCommands } from '../hooks/useMotorCommands';
import { normalizeCommandError } from '../utils/commandErrors';
import { formatRelativeTime } from '../utils/time';

import type { NavigationControls } from '../App';
import type {
    Motor,
    MotorTelemetry,
    MirrorConfig,
    MirrorAssignment,
    GridPosition,
    DraggedMotorInfo,
    Axis,
    DriverStatusSnapshot,
} from '../types';

type DiscoveryFilter = 'online' | 'all' | 'new' | 'offline' | 'unassigned';

interface ModalState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
}

interface ConfiguratorPageProps {
    navigation: NavigationControls;
    gridSize: { rows: number; cols: number };
    onGridSizeChange: (rows: number, cols: number) => void;
    mirrorConfig: MirrorConfig;
    setMirrorConfig: React.Dispatch<React.SetStateAction<MirrorConfig>>;
}

const ConfiguratorPage: React.FC<ConfiguratorPageProps> = ({
    navigation,
    gridSize,
    onGridSizeChange,
    mirrorConfig,
    setMirrorConfig,
}) => {
    const { state: connectionState, connectionUrl } = useMqtt();
    const { homeAll } = useMotorCommands();
    const globalHomeFeedback = useCommandFeedback();
    const {
        drivers,
        counts,
        discoveryCount,
        acknowledgeDriver,
        schemaError,
        brokerConnected,
        latestActivityAt,
        staleThresholdMs,
    } = useStatusStore();

    const [selectedNodeMac, setSelectedNodeMac] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<DiscoveryFilter>('online');
    const [modalState, setModalState] = useState<ModalState>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
        onCancel: undefined,
        confirmLabel: undefined,
        cancelLabel: undefined,
    });

    const assignmentMetrics = useMemo(() => {
        let assignedAxes = 0;
        let assignedTiles = 0;
        for (const assignment of mirrorConfig.values()) {
            const hasX = Boolean(assignment.x);
            const hasY = Boolean(assignment.y);
            if (hasX) {
                assignedAxes += 1;
            }
            if (hasY) {
                assignedAxes += 1;
            }
            if (hasX || hasY) {
                assignedTiles += 1;
            }
        }
        return { assignedAxes, assignedTiles };
    }, [mirrorConfig]);

    const totalMotors = counts.totalMotors;
    const unassignedAxesEstimate = Math.max(totalMotors - assignmentMetrics.assignedAxes, 0);
    const recommendedTileCapacity = totalMotors > 0 ? Math.floor(totalMotors / 2) : 0;

    const pruneAssignmentsWithinBounds = useCallback(
        (rows: number, cols: number) => {
            setMirrorConfig((prevConfig) => {
                let mutated = false;
                const nextConfig: MirrorConfig = new Map();
                for (const [key, assignment] of prevConfig.entries()) {
                    const [row, col] = key.split('-').map(Number);
                    if (row >= rows || col >= cols) {
                        mutated = true;
                        continue;
                    }
                    nextConfig.set(key, assignment);
                }
                return mutated ? nextConfig : prevConfig;
            });
        },
        [setMirrorConfig],
    );

    const handleGridSizeChange = (rows: number, cols: number) => {
        const normalizedRows = Math.max(1, rows);
        const normalizedCols = Math.max(1, cols);

        if (normalizedRows === gridSize.rows && normalizedCols === gridSize.cols) {
            return;
        }

        const isShrink = normalizedRows < gridSize.rows || normalizedCols < gridSize.cols;

        const outOfBoundsKeys: string[] = [];
        for (const key of mirrorConfig.keys()) {
            const [row, col] = key.split('-').map(Number);
            if (row >= normalizedRows || col >= normalizedCols) {
                outOfBoundsKeys.push(key);
            }
        }

        if (isShrink && outOfBoundsKeys.length > 0) {
            const previous = gridSize;
            const next = { rows: normalizedRows, cols: normalizedCols };
            const affectedPositions = outOfBoundsKeys
                .slice(0, 6)
                .map((key) => {
                    const [row, col] = key.split('-');
                    return `[${row},${col}]`;
                })
                .join(', ');
            const truncatedList =
                outOfBoundsKeys.length > 6
                    ? `${affectedPositions}, … (${outOfBoundsKeys.length} total)`
                    : affectedPositions;

            onGridSizeChange(normalizedRows, normalizedCols);
            confirmAction(
                `Shrink grid to ${normalizedRows}×${normalizedCols}?`,
                `This change will unassign ${outOfBoundsKeys.length} tile${outOfBoundsKeys.length === 1 ? '' : 's'} (${truncatedList}). Continue?`,
                () => {
                    pruneAssignmentsWithinBounds(next.rows, next.cols);
                },
                {
                    confirmLabel: 'Shrink and unassign',
                    cancelLabel: 'Keep current size',
                    onCancel: () => {
                        onGridSizeChange(previous.rows, previous.cols);
                    },
                },
            );
            return;
        }

        onGridSizeChange(normalizedRows, normalizedCols);
        pruneAssignmentsWithinBounds(normalizedRows, normalizedCols);
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

    const unassignMotor = useCallback(
        (motor: Motor) => {
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
        },
        [setMirrorConfig],
    );

    const handleMotorDrop = useCallback(
        (pos: GridPosition, axis: Axis, dragDataString: string) => {
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
        [setMirrorConfig],
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

    const handleNodeSelect = useCallback(
        (mac: string | null) => {
            setSelectedNodeMac((current) => {
                const next = current === mac ? null : mac;
                if (mac && next === mac) {
                    acknowledgeDriver(mac);
                }
                return next;
            });
        },
        [acknowledgeDriver],
    );

    const confirmAction = (
        title: string,
        message: string,
        onConfirm: () => void,
        options?: Pick<ModalState, 'confirmLabel' | 'cancelLabel' | 'onCancel'>,
    ) => {
        setModalState({
            isOpen: true,
            title,
            message,
            onConfirm,
            confirmLabel: options?.confirmLabel,
            cancelLabel: options?.cancelLabel,
            onCancel: options?.onCancel,
        });
    };

    const handleResetAll = () => {
        confirmAction(
            'Reset All Assignments?',
            'Are you sure you want to clear the entire grid? This action cannot be undone.',
            () => {
                setMirrorConfig(new Map());
            },
        );
    };

    const handleHomeAllDrivers = async () => {
        if (drivers.length === 0) {
            globalHomeFeedback.fail('No drivers available');
            return;
        }
        globalHomeFeedback.begin('Dispatching Home All…');
        try {
            await homeAll({ macAddresses: drivers.map((driver) => driver.topicMac) });
            globalHomeFeedback.succeed('Home All dispatched');
        } catch (error) {
            const details = normalizeCommandError(error);
            globalHomeFeedback.fail(details.message, details.code);
        }
    };

    const handleClearNodeAssignments = (nodeMac: string) => {
        const label = nodeMac.toUpperCase();
        confirmAction(
            `Clear Assignments for ${label.slice(-5)}?`,
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
            },
        );
    };

    const discoveredNodes = useMemo<DiscoveredNode[]>(() => {
        if (drivers.length === 0) {
            return [];
        }
        return drivers.map((driver) => {
            const motorEntries = Object.values(driver.snapshot.motors);
            const motors = motorEntries
                .slice()
                .sort((a, b) => a.id - b.id)
                .map<Motor>((motor) => ({
                    nodeMac: driver.topicMac,
                    motorIndex: motor.id,
                }));
            const motorTelemetry: Record<number, MotorTelemetry> = {};
            motorEntries.forEach((motor) => {
                motorTelemetry[motor.id] = {
                    id: motor.id,
                    position: motor.position,
                    moving: motor.moving,
                    awake: motor.awake,
                    homed: motor.homed,
                    stepsSinceHome: motor.stepsSinceHome,
                };
            });
            const unassignedMotors = motors.filter((motor) => !isMotorAssigned(motor)).length;
            const movingMotors = motorEntries.filter((motor) => motor.moving).length;
            const homedMotors = motorEntries.filter((motor) => motor.homed).length;
            return {
                macAddress: driver.topicMac,
                macLabel: driver.mac,
                presence: driver.presence,
                nodeState: driver.snapshot.nodeState,
                motors,
                motorTelemetry,
                isNew: driver.isNew,
                firstSeenAt: driver.firstSeenAt,
                lastSeenAt: driver.lastSeenAt,
                ip: driver.snapshot.ip,
                movingMotors,
                homedMotors,
                totalMotors: motors.length,
                hasUnassigned: unassignedMotors > 0,
                unassignedMotors,
                staleForMs: driver.staleForMs,
                brokerDisconnected: driver.brokerDisconnected,
            };
        });
    }, [drivers, isMotorAssigned]);

    const filteredNodes = useMemo<DiscoveredNode[]>(() => {
        switch (activeFilter) {
            case 'online':
                return discoveredNodes.filter((node) => node.presence !== 'offline');
            case 'new':
                return discoveredNodes.filter((node) => node.isNew);
            case 'offline':
                return discoveredNodes.filter((node) => node.presence === 'offline');
            case 'unassigned':
                return discoveredNodes.filter((node) => node.hasUnassigned);
            case 'all':
            default:
                return discoveredNodes;
        }
    }, [activeFilter, discoveredNodes]);

    const filterOptions = useMemo(() => {
        const onlineCount = discoveredNodes.filter((node) => node.presence !== 'offline').length;
        const offlineCount = discoveredNodes.filter((node) => node.presence === 'offline').length;
        const unassignedCount = discoveredNodes.filter((node) => node.hasUnassigned).length;

        return [
            { id: 'online' as const, label: onlineCount > 0 ? `Online (${onlineCount})` : 'Online' },
            { id: 'all' as const, label: 'All' },
            { id: 'new' as const, label: discoveryCount > 0 ? `New (${discoveryCount})` : 'New' },
            {
                id: 'offline' as const,
                label: offlineCount > 0 ? `Offline (${offlineCount})` : 'Offline',
            },
            {
                id: 'unassigned' as const,
                label:
                    unassignedCount > 0 ? `Unassigned (${unassignedCount})` : 'Unassigned',
            },
        ];
    }, [discoveredNodes, discoveryCount]);

    const unassignedGroups = useMemo(
        () =>
            discoveredNodes
                .map((node) => ({
                    macAddress: node.macAddress,
                    presence: node.presence,
                    staleForMs: node.staleForMs,
                    brokerDisconnected: node.brokerDisconnected,
                    motors: node.motors.filter((motor) => !isMotorAssigned(motor)),
                }))
                .filter((group) => group.motors.length > 0),
        [discoveredNodes, isMotorAssigned],
    );

    const driverStatusByMac = useMemo(() => {
        const map = new Map<string, DriverStatusSnapshot>();
        drivers.forEach((driver) => {
            const motors: DriverStatusSnapshot['motors'] = {};
            Object.values(driver.snapshot.motors).forEach((motor) => {
                motors[motor.id] = {
                    id: motor.id,
                    position: motor.position,
                    moving: motor.moving,
                    awake: motor.awake,
                    homed: motor.homed,
                    stepsSinceHome: motor.stepsSinceHome,
                };
            });

            map.set(driver.topicMac, {
                presence: driver.presence,
                staleForMs: driver.staleForMs,
                brokerDisconnected: driver.brokerDisconnected,
                motors,
            });
        });
        return map;
    }, [drivers]);

    const connectionPhaseLabel = useMemo(() => {
        switch (connectionState.status) {
            case 'connected':
                return 'Connected';
            case 'connecting':
                return 'Connecting';
            case 'reconnecting':
                return 'Reconnecting';
            default:
                return 'Disconnected';
        }
    }, [connectionState.status]);

    const connectionIndicatorClass = useMemo(() => {
        if (brokerConnected) {
            return 'bg-emerald-400';
        }
        if (connectionState.status === 'connecting' || connectionState.status === 'reconnecting') {
            return 'bg-amber-400';
        }
        return 'bg-red-500';
    }, [brokerConnected, connectionState.status]);

    const lastActivityLabel = useMemo(
        () => formatRelativeTime(latestActivityAt),
        [latestActivityAt],
    );

    const selectedNodeMacEffective = useMemo(() => {
        if (!selectedNodeMac) {
            return null;
        }
        return discoveredNodes.some((node) => node.macAddress === selectedNodeMac)
            ? selectedNodeMac
            : null;
    }, [discoveredNodes, selectedNodeMac]);

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
                                onClick={() => {
                                    modalState.onCancel?.();
                                    setModalState({
                                        isOpen: false,
                                        title: '',
                                        message: '',
                                        onConfirm: () => {},
                                        onCancel: undefined,
                                        confirmLabel: undefined,
                                        cancelLabel: undefined,
                                    });
                                }}
                                className="px-4 py-2 rounded-md bg-gray-600 text-white font-semibold hover:bg-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
                            >
                                {modalState.cancelLabel ?? 'Cancel'}
                            </button>
                            <button
                                onClick={() => {
                                    modalState.onConfirm();
                                    setModalState({
                                        isOpen: false,
                                        title: '',
                                        message: '',
                                        onConfirm: () => {},
                                        onCancel: undefined,
                                        confirmLabel: undefined,
                                        cancelLabel: undefined,
                                    });
                                }}
                                className="px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                            >
                                {modalState.confirmLabel ?? 'Confirm'}
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
                    <div className="flex flex-col items-end gap-3 text-sm">
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <span className="flex items-center gap-2 text-gray-300">
                                <span
                                    className={`h-2.5 w-2.5 rounded-full ${connectionIndicatorClass}`}
                                />
                                {connectionPhaseLabel}
                            </span>
                            <span className="text-gray-500" title={connectionUrl}>
                                {connectionUrl}
                            </span>
                            <span className="text-gray-400">Last activity {lastActivityLabel}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigation.navigateTo('library')}
                                className="px-4 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors border border-gray-600"
                            >
                                &larr; Back to Library
                            </button>
                            <button
                                onClick={handleHomeAllDrivers}
                                className="flex items-center gap-2 px-4 py-2 rounded-md border border-emerald-600/70 bg-emerald-900/40 text-emerald-200 transition-colors hover:bg-emerald-700/40"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path d="M10 2a1 1 0 01.894.553l5 10A1 1 0 0115 14H5a1 1 0 01-.894-1.447l5-10A1 1 0 0110 2zM10 6.118L6.764 12h6.472L10 6.118z" />
                                </svg>
                                Home All
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
                        {globalHomeFeedback.feedback.state !== 'idle' &&
                            globalHomeFeedback.feedback.message && (
                                <p
                                    className={`text-xs ${
                                        globalHomeFeedback.feedback.state === 'error'
                                            ? 'text-red-200'
                                            : globalHomeFeedback.feedback.state === 'pending'
                                              ? 'text-sky-200'
                                              : 'text-emerald-200'
                                    }`}
                                >
                                    {globalHomeFeedback.feedback.message}
                                    {globalHomeFeedback.feedback.code && (
                                        <span className="ml-1 text-[10px] text-gray-400">
                                            ({globalHomeFeedback.feedback.code})
                                        </span>
                                    )}
                                </p>
                            )}
                    </div>
                </header>

                <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
                        <p className="text-sm text-gray-400">Online Drivers</p>
                        <p className="mt-1 text-2xl font-semibold text-gray-100">
                            {counts.onlineDrivers}
                            <span className="ml-1 text-sm font-normal text-gray-400">
                                / {counts.totalDrivers}
                            </span>
                        </p>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
                        <p className="text-sm text-gray-400">Offline Drivers</p>
                        <p className="mt-1 text-2xl font-semibold text-gray-100">
                            {counts.offlineDrivers}
                        </p>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
                        <p className="text-sm text-gray-400">Moving Motors</p>
                        <p className="mt-1 text-2xl font-semibold text-gray-100">
                            {counts.movingMotors}
                        </p>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
                        <p className="text-sm text-gray-400">Homed Motors</p>
                        <p className="mt-1 text-2xl font-semibold text-gray-100">
                            {counts.homedMotors}
                            <span className="ml-2 text-xs font-normal text-gray-400">
                                Unhomed: {counts.unhomedMotors}
                            </span>
                        </p>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
                        <p className="text-sm text-gray-400">Needs Homing</p>
                        <p className="mt-1 text-2xl font-semibold text-gray-100">
                            {counts.needsHomeCriticalMotors + counts.needsHomeWarningMotors}
                            <span className="ml-2 text-xs font-normal text-red-300">
                                Critical: {counts.needsHomeCriticalMotors}
                            </span>
                            <span className="ml-2 text-xs font-normal text-amber-300">
                                Warning: {counts.needsHomeWarningMotors}
                            </span>
                        </p>
                    </div>
                </section>

                <div className="flex flex-col lg:flex-row flex-grow gap-8">
                    <main className="flex-grow lg:w-2/3 flex flex-col bg-gray-800/50 rounded-lg p-4 shadow-lg ring-1 ring-white/10">
                        <GridConfigurator
                            rows={gridSize.rows}
                            cols={gridSize.cols}
                            onSizeChange={handleGridSizeChange}
                            assignedAxes={assignmentMetrics.assignedAxes}
                            assignedTiles={assignmentMetrics.assignedTiles}
                            totalMotors={totalMotors}
                            unassignedAxes={unassignedAxesEstimate}
                            recommendedTileCapacity={recommendedTileCapacity}
                        />
                        <div className="mt-3">
                            <UnassignedMotorTray
                                groups={unassignedGroups}
                                onUnassignByDrop={handleUnassignByDrop}
                                staleThresholdMs={staleThresholdMs}
                            />
                        </div>
                        <div className="flex-grow mt-4 overflow-auto p-2 bg-black/20 rounded-md">
                            <MirrorGrid
                                rows={gridSize.rows}
                                cols={gridSize.cols}
                                mirrorConfig={mirrorConfig}
                                onMotorDrop={handleMotorDrop}
                                selectedNodeMac={selectedNodeMacEffective}
                                driverStatuses={driverStatusByMac}
                            />
                        </div>
                    </main>

                    <aside className="lg:w-1/3 flex flex-col bg-gray-800/50 rounded-lg p-4 shadow-lg ring-1 ring-white/10">
                        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                            <div>
                                <h2 className="text-2xl font-semibold text-gray-100">Nodes</h2>
                                <p className="text-xs text-gray-400">
                                    Session discoveries: {discoveryCount}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {filterOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setActiveFilter(option.id)}
                                        data-testid={`node-filter-${option.id}`}
                                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                            activeFilter === option.id
                                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {schemaError && (
                            <div className="mb-4 rounded-md border border-red-500/70 bg-red-900/30 p-3 text-sm text-red-200">
                                Failed to parse status payloads. Discovery paused until the payload
                                format is fixed.
                            </div>
                        )}
                        {!brokerConnected && (
                            <div className="mb-4 rounded-md border border-amber-500/70 bg-amber-900/30 p-3 text-sm text-amber-200">
                                Broker offline. Retaining last known statuses while awaiting
                                reconnection.
                            </div>
                        )}
                        <div className="flex-grow overflow-y-auto pr-2">
                            <DiscoveredNodes
                                nodes={filteredNodes}
                                isMotorAssigned={isMotorAssigned}
                                selectedNodeMac={selectedNodeMacEffective}
                                onNodeSelect={handleNodeSelect}
                                onUnassignByDrop={handleUnassignByDrop}
                                onClearNodeAssignments={handleClearNodeAssignments}
                                staleThresholdMs={staleThresholdMs}
                            />
                        </div>
                    </aside>
                </div>
            </div>
        </>
    );
};

export default ConfiguratorPage;
