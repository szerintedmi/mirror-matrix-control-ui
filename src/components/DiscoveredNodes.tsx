import React from 'react';

import { useCommandFeedback } from '../hooks/useCommandFeedback';
import { useMotorCommands } from '../hooks/useMotorCommands';
import { extractCommandErrorDetail } from '../utils/commandErrors';

import { showSingleCommandErrorToast } from './common/StyledToast';
import MotorChip from './MotorChip';

import type { DriverPresence } from '../context/StatusContext';
import type { Motor, MotorTelemetry } from '../types';

export interface DiscoveredNode {
    macAddress: string;
    macLabel: string;
    presence: DriverPresence;
    nodeState: string;
    motors: Motor[];
    motorTelemetry: Record<number, MotorTelemetry | undefined>;
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
            const details = extractCommandErrorDetail(error, { controller: mac });
            feedbackApi.fail(details.errorMessage ?? 'Command failed', details.errorCode);
            showSingleCommandErrorToast('Home all', details);
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

interface DiscoveredNodesProps {
    nodes: DiscoveredNode[];
    isMotorAssigned: (motor: Motor) => boolean;
    selectedNodeMac: string | null;
    onNodeSelect: (mac: string | null) => void;
    onClearNodeAssignments: (mac: string) => void;
    onNudgeMotor?: (motor: Motor, currentPosition: number) => void;
    emptyMessage?: string;
}

const DiscoveredNodes: React.FC<DiscoveredNodesProps> = ({
    nodes,
    isMotorAssigned,
    selectedNodeMac,
    onNodeSelect,
    onClearNodeAssignments,
    onNudgeMotor,
    emptyMessage = 'No nodes match the current filter',
}) => {
    if (nodes.length === 0) {
        return <p className="py-8 text-center text-sm text-gray-500">{emptyMessage}</p>;
    }

    return (
        <div className="space-y-2">
            {nodes.map((node) => {
                const statusIndicatorClass =
                    node.presence === 'ready'
                        ? 'bg-emerald-400'
                        : node.presence === 'stale'
                          ? 'bg-amber-400'
                          : 'bg-red-500';

                const assignedCount = node.totalMotors - node.unassignedMotors;
                const isSelected = selectedNodeMac === node.macAddress;

                return (
                    <div
                        key={node.macAddress}
                        role="button"
                        tabIndex={0}
                        onClick={() => onNodeSelect(node.macAddress)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onNodeSelect(node.macAddress);
                            }
                        }}
                        className={`cursor-pointer rounded-md border border-gray-700 bg-gray-900/60 px-2 py-1.5 transition-all hover:border-gray-600 ${isSelected ? 'shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]' : ''}`}
                    >
                        {/* Compact header */}
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <span
                                    className={`size-2 flex-shrink-0 rounded-full ${statusIndicatorClass}`}
                                    title={node.presence}
                                />
                                <span className="font-mono text-sm font-semibold text-gray-300">
                                    {node.macLabel.slice(-5)}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                <span>
                                    {assignedCount}/{node.totalMotors}
                                </span>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onClearNodeAssignments(node.macAddress);
                                    }}
                                    className="rounded p-0.5 text-gray-500 transition-colors hover:bg-red-900/50 hover:text-red-400"
                                    title="Clear all assignments"
                                >
                                    <svg
                                        className="size-3.5"
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
                                <NodeCommandBar mac={node.macAddress} />
                            </div>
                        </div>
                        {/* Motor slots - multi-column grid */}
                        <div className="grid auto-cols-fr grid-flow-col gap-1">
                            {node.motors.map((motor) => (
                                <MotorChip
                                    key={`${motor.nodeMac}-${motor.motorIndex}`}
                                    motor={motor}
                                    telemetry={node.motorTelemetry[motor.motorIndex]}
                                    disabled={isMotorAssigned(motor)}
                                    dataTestId={`node-${node.macAddress}-motor-${motor.motorIndex}`}
                                    onNudge={onNudgeMotor}
                                    onClick={() => onNodeSelect(motor.nodeMac)}
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
