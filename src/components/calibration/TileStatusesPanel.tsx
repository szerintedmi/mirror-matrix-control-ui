import React, { useCallback, useMemo, useState } from 'react';

import TileDebugModal from '@/components/calibration/TileDebugModal';
import TileRecalibrationMenu from '@/components/calibration/TileRecalibrationMenu';
import CollapsibleSection from '@/components/common/CollapsibleSection';
import {
    getTileStatusClasses,
    getTileErrorTextClass,
    TILE_WARNING_TEXT_CLASS,
    type TileDisplayStatus,
} from '@/constants/calibrationUiThemes';
import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '@/constants/control';
import type { DriverView } from '@/context/StatusContext';
import type { TileAddress } from '@/services/calibration/types';
import type { CalibrationRunSummary, TileRunState } from '@/services/calibration/types';
import type { Motor, MotorTelemetry } from '@/types';

const gridViewOptions = [
    {
        id: 'mirror' as const,
        label: 'Mirror view',
        helper: 'Physical mirror layout • [0,0] is top-right when you face the array.',
    },
    {
        id: 'projection' as const,
        label: 'Projection view',
        helper: 'Wall projection layout • [0,0] is top-left when you face the wall.',
    },
];

/** Render steps-since-home warning icon if motor has drifted */
const StepsWarningIcon: React.FC<{ telemetry?: MotorTelemetry; className?: string }> = ({
    telemetry,
    className = '',
}) => {
    if (!telemetry) return null;
    const steps = telemetry.stepsSinceHome;
    if (steps < STEPS_SINCE_HOME_WARNING) return null;

    const isCritical = steps >= STEPS_SINCE_HOME_CRITICAL;
    const colorClass = isCritical ? 'text-red-400' : 'text-amber-400';
    const title = `${steps.toLocaleString()} steps since last home${isCritical ? ' (critical)' : ''}`;

    return (
        <span title={title} className={`${colorClass} ${className}`.trim()}>
            <svg className="size-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M10 2a1 1 0 01.894.553l6 12A1 1 0 0116 16H4a1 1 0 01-.894-1.447l6-12A1 1 0 0110 2zM10 5.618L5.764 14h8.472L10 5.618z" />
            </svg>
        </span>
    );
};

interface TileStatusesPanelProps {
    tileEntries: TileRunState[];
    drivers: DriverView[];
    runnerSummary: CalibrationRunSummary | null;
    deltaSteps: number;
    /** Keys of tiles identified as outliers (unusually large measurements) */
    outlierTileKeys?: Set<string>;
    /** Whether calibration is currently active (disables tile actions) */
    isCalibrationActive?: boolean;
    /** Callback to nudge a single motor */
    onNudgeMotor?: (motor: Motor, currentPosition: number) => void;
    /** Callback to home a single motor */
    onHomeMotor?: (motor: Motor) => void;
    /** Callback to home a tile (both axes) */
    onHomeTile?: (tile: TileAddress, motors: { x: Motor | null; y: Motor | null }) => void;
    /** Callback to move tile to staging position */
    onMoveToStage?: (tile: TileAddress, motors: { x: Motor | null; y: Motor | null }) => void;
    /** Callback to start single-tile recalibration */
    onRecalibrateTile?: (tile: TileAddress) => void;
}

const TileStatusesPanel: React.FC<TileStatusesPanelProps> = ({
    tileEntries,
    drivers,
    runnerSummary,
    deltaSteps,
    outlierTileKeys,
    isCalibrationActive = false,
    onNudgeMotor,
    onHomeMotor,
    onHomeTile,
    onMoveToStage,
    onRecalibrateTile,
}) => {
    const [debugTileKey, setDebugTileKey] = useState<string | null>(null);
    const [hoveredTileKey, setHoveredTileKey] = useState<string | null>(null);
    const [gridViewMode, setGridViewMode] = useState<'mirror' | 'projection'>('projection');

    const debugTileEntry = useMemo(() => {
        if (!debugTileKey) {
            return null;
        }
        return tileEntries.find((entry) => entry.tile.key === debugTileKey) ?? null;
    }, [debugTileKey, tileEntries]);

    const debugTileSummary = useMemo(() => {
        if (!debugTileKey || !runnerSummary) {
            return null;
        }
        return runnerSummary.tiles[debugTileKey] ?? null;
    }, [runnerSummary, debugTileKey]);

    const stepTestSnapshot = runnerSummary?.stepTestSettings ?? ({ deltaSteps } as const);

    const handleInspectTile = useCallback((tileKey: string) => {
        setDebugTileKey(tileKey);
    }, []);

    const closeDebugModal = useCallback(() => {
        setDebugTileKey(null);
    }, []);
    const telemetryMap = useMemo(() => {
        const map = new Map<string, MotorTelemetry>();
        drivers.forEach((driver) => {
            const topicMac = driver.snapshot.topicMac;
            Object.values(driver.snapshot.motors).forEach((motor) => {
                map.set(`${topicMac}-${motor.id}`, {
                    id: motor.id,
                    position: motor.position,
                    moving: motor.moving,
                    awake: motor.awake,
                    homed: motor.homed,
                    stepsSinceHome: motor.stepsSinceHome,
                });
            });
        });
        return map;
    }, [drivers]);

    const getTelemetryForMotor = useCallback(
        (motor: Motor | null): MotorTelemetry | undefined => {
            if (!motor) {
                return undefined;
            }
            return telemetryMap.get(`${motor.nodeMac}-${motor.motorIndex}`);
        },
        [telemetryMap],
    );

    /**
     * Compute display status for a tile.
     * When not actively calibrating and a profile is loaded, show "calibrated" instead of "pending"
     * if the tile has calibration data in the summary.
     */
    const getDisplayStatus = useCallback(
        (entry: TileRunState): TileDisplayStatus => {
            // If calibration is active or status is not pending, use the actual status
            if (isCalibrationActive || entry.status !== 'pending') {
                return entry.status;
            }
            // If we have a loaded profile with data for this tile, show as calibrated
            if (runnerSummary?.tiles?.[entry.tile.key]) {
                return 'calibrated';
            }
            return entry.status;
        },
        [isCalibrationActive, runnerSummary],
    );

    const handleTileCardClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>, tileKey: string) => {
            const target = event.target as HTMLElement | null;
            const interactiveAncestor = target?.closest(
                'button, a, input, textarea, select, [role="button"]',
            );
            if (interactiveAncestor && interactiveAncestor !== event.currentTarget) {
                return;
            }
            handleInspectTile(tileKey);
        },
        [handleInspectTile],
    );

    const handleTileCardKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>, tileKey: string) => {
            if (event.currentTarget !== event.target) {
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleInspectTile(tileKey);
            }
        },
        [handleInspectTile],
    );

    const gridColumnCount =
        tileEntries.reduce((max, entry) => (entry.tile.col > max ? entry.tile.col : max), 0) + 1;

    // Count tiles by display status for header summary
    const statusCounts = useMemo(() => {
        const counts: Record<TileRunState['status'] | 'calibrated', number> = {
            pending: 0,
            staged: 0,
            measuring: 0,
            completed: 0,
            partial: 0,
            failed: 0,
            skipped: 0,
            calibrated: 0,
        };
        tileEntries.forEach((entry) => {
            const displayStatus = getDisplayStatus(entry);
            counts[displayStatus]++;
        });
        return counts;
    }, [tileEntries, getDisplayStatus]);

    // Build collapsed summary showing only non-zero counts
    const collapsedSummary = useMemo(() => {
        const parts: string[] = [];
        if (statusCounts.calibrated > 0) parts.push(`${statusCounts.calibrated} calibrated`);
        if (statusCounts.completed > 0) parts.push(`${statusCounts.completed} done`);
        if (statusCounts.partial > 0) parts.push(`${statusCounts.partial} partial`);
        if (statusCounts.failed > 0) parts.push(`${statusCounts.failed} failed`);
        if (statusCounts.measuring > 0) parts.push(`${statusCounts.measuring} measuring`);
        if (statusCounts.staged > 0) parts.push(`${statusCounts.staged} staged`);
        if (statusCounts.pending > 0) parts.push(`${statusCounts.pending} pending`);
        if (statusCounts.skipped > 0) parts.push(`${statusCounts.skipped} skipped`);
        return parts.join(' · ') || 'No tiles';
    }, [statusCounts]);

    return (
        <>
            <CollapsibleSection
                title="Tile Statuses"
                defaultExpanded={false}
                collapsedSummary={collapsedSummary}
                icon={
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                        />
                    </svg>
                }
            >
                {/* View mode switcher */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-gray-400">
                    <p>{gridViewOptions.find((option) => option.id === gridViewMode)?.helper}</p>
                    <div className="inline-flex rounded-full border border-gray-700 bg-gray-900/60 p-1 text-sm">
                        {gridViewOptions.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setGridViewMode(option.id)}
                                className={`rounded-full px-3 py-1 font-medium transition-colors ${gridViewMode === option.id ? 'bg-emerald-500/30 text-emerald-200' : 'text-gray-300 hover:text-gray-100'}`}
                                aria-pressed={gridViewMode === option.id}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div
                    className="grid gap-2"
                    style={{
                        gridTemplateColumns: `repeat(${Math.max(gridColumnCount, 1)}, minmax(0, 1fr))`,
                        direction: gridViewMode === 'mirror' ? 'rtl' : 'ltr',
                    }}
                >
                    {tileEntries.map((entry) => {
                        const isOutlier = outlierTileKeys?.has(entry.tile.key) ?? false;
                        const isHovered = hoveredTileKey === entry.tile.key;
                        const showMenu = isHovered && onHomeTile && onRecalibrateTile;
                        const displayStatus = getDisplayStatus(entry);
                        const formatMotorId = (motor: Motor | null) =>
                            motor ? `${motor.nodeMac.slice(-5)}:${motor.motorIndex}` : null;
                        return (
                            <div
                                key={entry.tile.key}
                                role="button"
                                tabIndex={0}
                                dir="ltr"
                                aria-label={`Inspect calibration metrics for tile [${entry.tile.row},${entry.tile.col}]${isOutlier ? ' (outlier)' : ''}`}
                                onClick={(event) => handleTileCardClick(event, entry.tile.key)}
                                onKeyDown={(event) => handleTileCardKeyDown(event, entry.tile.key)}
                                onMouseEnter={() => setHoveredTileKey(entry.tile.key)}
                                onMouseLeave={() => setHoveredTileKey(null)}
                                className={`relative rounded-md border px-2 py-1.5 text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${getTileStatusClasses(displayStatus)} ${displayStatus === 'completed' || displayStatus === 'calibrated' ? 'cursor-pointer' : 'cursor-help'} ${isOutlier ? 'ring-2 ring-amber-500/60 ring-offset-1 ring-offset-gray-950' : ''}`}
                            >
                                {/* Menu in top right corner */}
                                {showMenu && (
                                    <div className="absolute top-1.5 right-1.5">
                                        <TileRecalibrationMenu
                                            tile={entry.tile}
                                            xMotor={entry.assignment.x}
                                            yMotor={entry.assignment.y}
                                            hasProfile={Boolean(runnerSummary)}
                                            isCalibrationActive={isCalibrationActive}
                                            onHomeMotor={onHomeMotor}
                                            onHomeTile={onHomeTile}
                                            onMoveToStage={onMoveToStage}
                                            onRecalibrateTile={onRecalibrateTile}
                                        />
                                    </div>
                                )}
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-semibold">
                                    <span className="font-mono">
                                        [{entry.tile.row},{entry.tile.col}]
                                        {isOutlier && (
                                            <span
                                                className="ml-1 text-amber-400"
                                                title="Outlier: unusually large measurement, excluded from grid sizing"
                                            >
                                                !
                                            </span>
                                        )}
                                    </span>
                                    {/* Only show status for non-calibrated tiles */}
                                    {displayStatus !== 'calibrated' &&
                                        displayStatus !== 'completed' && (
                                            <span className="text-xs font-medium capitalize">
                                                {displayStatus}
                                            </span>
                                        )}
                                </div>
                                {entry.error && (
                                    <div
                                        className={`mt-1 text-[10px] leading-tight ${getTileErrorTextClass(entry.status)}`}
                                    >
                                        {entry.error}
                                    </div>
                                )}
                                {entry.warnings && entry.warnings.length > 0 && (
                                    <div
                                        className={`mt-1 text-[10px] leading-tight ${TILE_WARNING_TEXT_CLASS}`}
                                    >
                                        {entry.warnings.map((warning: string, idx: number) => (
                                            <div key={idx}>{warning}</div>
                                        ))}
                                    </div>
                                )}
                                {isOutlier && (
                                    <div
                                        className={`mt-1 text-[10px] leading-tight ${TILE_WARNING_TEXT_CLASS}`}
                                    >
                                        Outlier size - excluded from grid sizing
                                    </div>
                                )}
                                {(entry.assignment.x || entry.assignment.y) && (
                                    <div className="mt-2 space-y-1.5 rounded-md border border-gray-800/70 bg-gray-950/60 p-2 text-gray-200">
                                        {/* X axis row */}
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-1 font-mono text-sm text-gray-300">
                                                X{' '}
                                                <span className="text-cyan-300">
                                                    {formatMotorId(entry.assignment.x) ?? '--'}
                                                </span>
                                                <StepsWarningIcon
                                                    telemetry={getTelemetryForMotor(
                                                        entry.assignment.x,
                                                    )}
                                                />
                                            </span>
                                            {entry.assignment.x &&
                                                onNudgeMotor &&
                                                (() => {
                                                    const telemetry = getTelemetryForMotor(
                                                        entry.assignment.x,
                                                    );
                                                    const position = telemetry?.position ?? 0;
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onNudgeMotor(
                                                                    entry.assignment.x!,
                                                                    position,
                                                                );
                                                            }}
                                                            className="flex size-6 items-center justify-center rounded border border-cyan-700 bg-cyan-900/40 text-cyan-200 transition hover:bg-cyan-700/40"
                                                            title={`Nudge X motor (${formatMotorId(entry.assignment.x)})`}
                                                        >
                                                            {/* Finger tap / poke icon */}
                                                            <svg
                                                                className="size-3.5"
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
                                                        </button>
                                                    );
                                                })()}
                                        </div>
                                        {/* Y axis row */}
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-1 font-mono text-sm text-gray-300">
                                                Y{' '}
                                                <span className="text-cyan-300">
                                                    {formatMotorId(entry.assignment.y) ?? '--'}
                                                </span>
                                                <StepsWarningIcon
                                                    telemetry={getTelemetryForMotor(
                                                        entry.assignment.y,
                                                    )}
                                                />
                                            </span>
                                            {entry.assignment.y &&
                                                onNudgeMotor &&
                                                (() => {
                                                    const telemetry = getTelemetryForMotor(
                                                        entry.assignment.y,
                                                    );
                                                    const position = telemetry?.position ?? 0;
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onNudgeMotor(
                                                                    entry.assignment.y!,
                                                                    position,
                                                                );
                                                            }}
                                                            className="flex size-6 items-center justify-center rounded border border-cyan-700 bg-cyan-900/40 text-cyan-200 transition hover:bg-cyan-700/40"
                                                            title={`Nudge Y motor (${formatMotorId(entry.assignment.y)})`}
                                                        >
                                                            {/* Finger tap / poke icon */}
                                                            <svg
                                                                className="size-3.5"
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
                                                        </button>
                                                    );
                                                })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {/* Color legend - synced with TILE_STATUS_CLASSES (only shows during calibration) */}
                {isCalibrationActive && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800 pt-3 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm border border-gray-700 bg-gray-900/60" />
                            Pending
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm border border-amber-500/60 bg-amber-500/10" />
                            Staged
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm border border-sky-500/60 bg-sky-500/10" />
                            Measuring
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm border border-emerald-600/60 bg-emerald-500/10" />
                            Completed
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm border border-rose-600/60 bg-rose-500/10" />
                            Failed
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm border border-gray-800 bg-gray-900" />
                            Skipped
                        </span>
                    </div>
                )}
            </CollapsibleSection>
            <TileDebugModal
                open={Boolean(debugTileKey)}
                entry={debugTileEntry}
                summaryTile={debugTileSummary}
                displayStatus={debugTileEntry ? getDisplayStatus(debugTileEntry) : undefined}
                onClose={closeDebugModal}
                stepTestSettings={stepTestSnapshot}
                getTelemetryForMotor={getTelemetryForMotor}
                isCalibrationActive={isCalibrationActive}
                onHomeMotor={onHomeMotor}
                onHomeTile={onHomeTile}
                onMoveToStage={onMoveToStage}
                onNudgeMotor={onNudgeMotor}
                onRecalibrateTile={onRecalibrateTile}
            />
        </>
    );
};

export default TileStatusesPanel;
