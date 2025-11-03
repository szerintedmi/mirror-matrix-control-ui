import React, { useState } from 'react';

import { useCommandFeedback } from '../hooks/useCommandFeedback';
import { useMotorCommands } from '../hooks/useMotorCommands';
import { useMotorController } from '../hooks/useMotorController';
import { normalizeCommandError } from '../utils/commandErrors';
import { formatRelativeTime } from '../utils/time';

import MotorActionButtons from './MotorActionButtons';
import MotorChip from './MotorChip';

import type { DriverPresence } from '../context/StatusContext';
import type { DraggedMotorInfo, Motor, MotorTelemetry } from '../types';

export interface DiscoveredNode {
    macAddress: string;
    macLabel: string;
    presence: DriverPresence;
    nodeState: string;
    motors: Motor[];
    motorTelemetry: Record<number, MotorTelemetry | undefined>;
    isNew: boolean;
    firstSeenAt: number;
    lastSeenAt: number;
    ip?: string;
    movingMotors: number;
    homedMotors: number;
    totalMotors: number;
    hasUnassigned: boolean;
    unassignedMotors: number;
    staleForMs: number;
    brokerDisconnected: boolean;
}

interface NodeMotorCardProps {
    motor: Motor;
    telemetry?: MotorTelemetry;
    disabled: boolean;
    dataTestId?: string;
}

const NodeCommandBar: React.FC<{ mac: string }> = ({ mac }) => {
    const { homeAll } = useMotorCommands();
    const feedbackApi = useCommandFeedback();

    const handleHomeAll = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        feedbackApi.begin('Homing all axes…');
        try {
            await homeAll({ macAddresses: [mac] });
            feedbackApi.succeed('Home All dispatched');
        } catch (error) {
            const details = normalizeCommandError(error);
            feedbackApi.fail(details.message, details.code);
        }
    };

    const { state, message, code } = feedbackApi.feedback;

    return (
        <div className="flex flex-col items-end gap-1 text-xs text-gray-300">
            <button
                type="button"
                onClick={handleHomeAll}
                className="rounded-md border border-emerald-600/70 bg-emerald-900/40 px-2 py-1 text-emerald-200 transition-colors hover:bg-emerald-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            >
                Home All
            </button>
            {state !== 'idle' && message && (
                <span
                    className={
                        state === 'error'
                            ? 'text-red-200'
                            : state === 'pending'
                              ? 'text-sky-200'
                              : 'text-emerald-200'
                    }
                >
                    {message}
                    {code && <span className="ml-1 text-[10px] text-gray-400">({code})</span>}
                </span>
            )}
        </div>
    );
};

const NodeMotorCard: React.FC<NodeMotorCardProps> = ({
    motor,
    telemetry,
    disabled,
    dataTestId,
}) => {
    const controller = useMotorController(motor, telemetry);

    return (
        <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 p-3">
            <div className="flex items-center justify-between gap-3">
                <MotorChip
                    motor={motor}
                    disabled={disabled}
                    label={`Motor ${motor.motorIndex}`}
                    dataTestId={dataTestId}
                    tooltip={`Node: ${motor.nodeMac.toUpperCase()}\nMotor: ${motor.motorIndex}`}
                />
            </div>
            <div className="mt-2">
                <MotorActionButtons
                    motor={motor}
                    telemetry={telemetry}
                    controller={controller}
                    dataTestIdPrefix={dataTestId}
                    compact
                />
            </div>
        </div>
    );
};

interface DiscoveredNodesProps {
    nodes: DiscoveredNode[];
    isMotorAssigned: (motor: Motor) => boolean;
    selectedNodeMac: string | null;
    onNodeSelect: (mac: string | null) => void;
    onUnassignByDrop: (dragDataString: string) => void;
    onClearNodeAssignments: (mac: string) => void;
    staleThresholdMs: number;
}

const DiscoveredNodes: React.FC<DiscoveredNodesProps> = ({
    nodes,
    isMotorAssigned,
    selectedNodeMac,
    onNodeSelect,
    onUnassignByDrop,
    onClearNodeAssignments,
    staleThresholdMs,
}) => {
    const [isDropHovering, setIsDropHovering] = useState(false);

    if (nodes.length === 0) {
        return (
            <p className="mt-8 text-center text-gray-500">
                No tile drivers discovered yet. Waiting for MQTT status snapshots…
            </p>
        );
    }

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const dragData = event.dataTransfer.getData('application/json');
        if (dragData) {
            const parsed: DraggedMotorInfo = JSON.parse(dragData);
            if (parsed.source === 'grid') {
                setIsDropHovering(true);
            }
        }
    };

    const handleDragLeave = () => {
        setIsDropHovering(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDropHovering(false);
        const dragData = event.dataTransfer.getData('application/json');
        if (dragData) {
            onUnassignByDrop(dragData);
        }
    };

    return (
        <div
            className={`space-y-6 rounded-lg transition-colors ${isDropHovering ? 'bg-red-500/20' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDropHovering && (
                <div className="py-4 text-center font-bold text-red-300">
                    Drop to Unassign Motor
                </div>
            )}
            {nodes.map((node) => {
                const motorsToShow = node.motors;
                const statusIndicatorClass =
                    node.presence === 'ready'
                        ? 'bg-emerald-400'
                        : node.presence === 'stale'
                          ? 'bg-amber-400'
                          : 'bg-red-500';
                const staleSeconds = node.staleForMs / 1_000;
                const presenceDescription = node.brokerDisconnected
                    ? 'Broker disconnected'
                    : node.presence === 'ready'
                      ? 'Online'
                      : node.presence === 'stale'
                        ? `No heartbeat for ${staleSeconds.toFixed(1)}s (threshold ${(
                              staleThresholdMs / 1_000
                          ).toFixed(1)}s)`
                        : node.nodeState === 'offline'
                          ? 'Offline (LWT received)'
                          : 'Offline';

                return (
                    <div
                        key={node.macAddress}
                        className={`rounded-lg border border-gray-700 bg-gray-900/50 p-4 transition-all ${selectedNodeMac === node.macAddress ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20' : 'hover:border-gray-500'}`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => onNodeSelect(node.macAddress)}
                                aria-pressed={selectedNodeMac === node.macAddress}
                                className="flex flex-1 items-start gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                            >
                                <span
                                    className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusIndicatorClass}`}
                                    title={`Status: ${node.presence}`}
                                ></span>
                                <div className="flex flex-col gap-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="break-all font-mono text-lg text-emerald-400">
                                            {node.macLabel}
                                        </h3>
                                        {node.isNew && (
                                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                                                New
                                            </span>
                                        )}
                                        {node.hasUnassigned && (
                                            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-semibold text-cyan-200">
                                                {node.unassignedMotors} unassigned
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-300">
                                        {presenceDescription}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                        {node.ip && <span>IP {node.ip}</span>}
                                        <span>Last seen {formatRelativeTime(node.lastSeenAt)}</span>
                                        <span>
                                            First seen {formatRelativeTime(node.firstSeenAt)}
                                        </span>
                                    </div>
                                </div>
                            </button>
                            <div className="flex flex-col items-end gap-2">
                                <NodeCommandBar mac={node.macAddress} />
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onClearNodeAssignments(node.macAddress);
                                    }}
                                    className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-red-900/50 hover:text-red-400"
                                    title="Clear all assignments for this node"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-5 w-5"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
                            <span className="rounded bg-gray-700/70 px-2 py-1">
                                Motors {node.totalMotors}
                            </span>
                            <span className="rounded bg-gray-700/70 px-2 py-1">
                                Moving {node.movingMotors}
                            </span>
                            <span className="rounded bg-gray-700/70 px-2 py-1">
                                Homed {node.homedMotors}
                            </span>
                            <span className="rounded bg-gray-700/70 px-2 py-1">
                                Assigned {node.totalMotors - node.unassignedMotors}
                            </span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {motorsToShow.map((motor) => (
                                <NodeMotorCard
                                    key={`${motor.nodeMac}-${motor.motorIndex}`}
                                    motor={motor}
                                    telemetry={node.motorTelemetry[motor.motorIndex]}
                                    disabled={isMotorAssigned(motor)}
                                    dataTestId={`node-${node.macAddress}-motor-${motor.motorIndex}`}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default DiscoveredNodes;
