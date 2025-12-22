import React from 'react';

import Modal from '@/components/Modal';
import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '@/constants/control';
import type { GridPosition, Motor, MotorTelemetry } from '@/types';

import type { MirrorCellAnalysis } from './MirrorCell';


/** Render steps-since-home warning badge with value */
const StepsWarningBadge: React.FC<{ telemetry?: MotorTelemetry }> = ({ telemetry }) => {
    if (!telemetry) return <span className="text-gray-500">--</span>;
    const steps = telemetry.stepsSinceHome;

    const hasWarning = steps >= STEPS_SINCE_HOME_WARNING;
    const isCritical = steps >= STEPS_SINCE_HOME_CRITICAL;
    const colorClass = isCritical
        ? 'text-red-400'
        : hasWarning
          ? 'text-amber-400'
          : 'text-gray-300';
    const title = hasWarning
        ? `${steps.toLocaleString()} steps since last home${isCritical ? ' (critical)' : ''}`
        : `${steps.toLocaleString()} steps since last home`;

    return (
        <span className={`flex items-center gap-1 ${colorClass}`} title={title}>
            {hasWarning && (
                <svg className="size-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M10 2a1 1 0 01.894.553l6 12A1 1 0 0116 16H4a1 1 0 01-.894-1.447l6-12A1 1 0 0110 2zM10 5.618L5.764 14h8.472L10 5.618z" />
                </svg>
            )}
            <span className="font-mono">{steps.toLocaleString()}</span>
        </span>
    );
};

interface TileInfoModalProps {
    open: boolean;
    position: GridPosition | null;
    xMotor: Motor | null;
    yMotor: Motor | null;
    xTelemetry?: MotorTelemetry;
    yTelemetry?: MotorTelemetry;
    analysis: MirrorCellAnalysis | null;
    onClose: () => void;
    /** Callback to home a single motor axis */
    onHomeMotor?: (motor: Motor) => void;
    /** Callback to home the tile (both axes) */
    onHomeTile?: (position: GridPosition, motors: { x: Motor | null; y: Motor | null }) => void;
    /** Callback to nudge a single motor */
    onNudgeMotor?: (motor: Motor, currentPosition: number) => void;
}

const formatMotorId = (motor: Motor | null): string =>
    motor ? `${motor.nodeMac.slice(-5).toUpperCase()}:${motor.motorIndex}` : '--';

const TileInfoModal: React.FC<TileInfoModalProps> = ({
    open,
    position,
    xMotor,
    yMotor,
    xTelemetry,
    yTelemetry,
    analysis,
    onClose,
    onHomeMotor,
    onHomeTile,
    onNudgeMotor,
}) => {
    const tileLabel = position ? `[${position.row},${position.col}]` : 'Tile';

    if (!position) {
        return (
            <Modal open={open} onClose={onClose} title="Tile Info">
                <p className="text-sm text-gray-300">Select a tile from the grid to inspect.</p>
            </Modal>
        );
    }

    const hasMotors = Boolean(xMotor || yMotor);
    const canHome = hasMotors && Boolean(onHomeTile);

    const handleHomeTile = () => {
        if (onHomeTile && position) {
            onHomeTile(position, { x: xMotor, y: yMotor });
        }
    };

    const handleNudgeX = () => {
        if (onNudgeMotor && xMotor && xTelemetry) {
            onNudgeMotor(xMotor, xTelemetry.position);
        }
    };

    const handleNudgeY = () => {
        if (onNudgeMotor && yMotor && yTelemetry) {
            onNudgeMotor(yMotor, yTelemetry.position);
        }
    };

    const handleHomeX = () => {
        if (onHomeMotor && xMotor) {
            onHomeMotor(xMotor);
        }
    };

    const handleHomeY = () => {
        if (onHomeMotor && yMotor) {
            onHomeMotor(yMotor);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Tile ${tileLabel}`}
            contentClassName="w-auto max-w-2xl"
            bodyClassName="px-0 py-0"
        >
            <div className="px-5 py-6">
                <div className="space-y-5 text-sm text-gray-200">
                    {/* Warning badges section */}
                    {analysis && analysis.warningBadges.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {analysis.warningBadges.map((badge) => (
                                <span
                                    key={badge.label}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
                                >
                                    {badge.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Motor info - X and Y Axis */}
                    <div className="grid gap-3 sm:grid-cols-2">
                        {/* X Axis */}
                        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-200">X Axis</span>
                                <span className="font-mono text-xs text-gray-500">
                                    {formatMotorId(xMotor)}
                                </span>
                            </div>
                            <div className="mb-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Position</span>
                                    <span className="font-mono text-sm text-gray-100">
                                        {xTelemetry?.position ?? '--'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Steps since home</span>
                                    <StepsWarningBadge telemetry={xTelemetry} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {xMotor && onNudgeMotor && xTelemetry && (
                                    <button
                                        type="button"
                                        onClick={handleNudgeX}
                                        className="flex items-center gap-1.5 rounded border border-cyan-700 bg-cyan-900/40 px-2.5 py-1.5 text-sm text-cyan-200 transition hover:bg-cyan-700/40"
                                    >
                                        <svg
                                            className="size-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                                            />
                                        </svg>
                                        <span>Nudge</span>
                                    </button>
                                )}
                                {xMotor && onHomeMotor && (
                                    <button
                                        type="button"
                                        onClick={handleHomeX}
                                        className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-sm text-gray-300 transition hover:bg-gray-700/60"
                                    >
                                        <svg
                                            className="size-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                        </svg>
                                        <span>Home</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Y Axis */}
                        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-200">Y Axis</span>
                                <span className="font-mono text-xs text-gray-500">
                                    {formatMotorId(yMotor)}
                                </span>
                            </div>
                            <div className="mb-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Position</span>
                                    <span className="font-mono text-sm text-gray-100">
                                        {yTelemetry?.position ?? '--'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">Steps since home</span>
                                    <StepsWarningBadge telemetry={yTelemetry} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {yMotor && onNudgeMotor && yTelemetry && (
                                    <button
                                        type="button"
                                        onClick={handleNudgeY}
                                        className="flex items-center gap-1.5 rounded border border-cyan-700 bg-cyan-900/40 px-2.5 py-1.5 text-sm text-cyan-200 transition hover:bg-cyan-700/40"
                                    >
                                        <svg
                                            className="size-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                                            />
                                        </svg>
                                        <span>Nudge</span>
                                    </button>
                                )}
                                {yMotor && onHomeMotor && (
                                    <button
                                        type="button"
                                        onClick={handleHomeY}
                                        className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-sm text-gray-300 transition hover:bg-gray-700/60"
                                    >
                                        <svg
                                            className="size-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                        </svg>
                                        <span>Home</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tile Commands */}
                    {onHomeTile && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleHomeTile}
                                disabled={!canHome}
                                className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-200 transition hover:bg-emerald-700/40 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                </svg>
                                <span>Home Tile</span>
                            </button>
                        </div>
                    )}

                    {/* Info note when no motors assigned */}
                    {!hasMotors && (
                        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-sm text-gray-400">
                            <p>No motors assigned to this tile.</p>
                            <p className="mt-1">
                                Drag motors from the Discovered Nodes panel or the Unassigned Motor
                                Tray to assign them.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default TileInfoModal;
