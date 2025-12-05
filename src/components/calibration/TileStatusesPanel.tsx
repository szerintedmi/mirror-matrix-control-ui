import React, { useCallback, useMemo, useState } from 'react';

import TileAxisAction from '@/components/calibration/TileAxisAction';
import TileDebugModal from '@/components/calibration/TileDebugModal';
import CollapsibleSection from '@/components/common/CollapsibleSection';
import {
    getTileStatusClasses,
    getTileErrorTextClass,
    TILE_WARNING_TEXT_CLASS,
} from '@/constants/calibrationUiThemes';
import type { DriverView } from '@/context/StatusContext';
import type { CalibrationRunSummary, TileRunState } from '@/services/calibrationRunner';
import type { Motor, MotorTelemetry } from '@/types';

interface TileStatusesPanelProps {
    tileEntries: TileRunState[];
    drivers: DriverView[];
    runnerSummary: CalibrationRunSummary | null;
    deltaSteps: number;
    /** Keys of tiles identified as outliers (unusually large measurements) */
    outlierTileKeys?: Set<string>;
}

const TileStatusesPanel: React.FC<TileStatusesPanelProps> = ({
    tileEntries,
    drivers,
    runnerSummary,
    deltaSteps,
    outlierTileKeys,
}) => {
    const [debugTileKey, setDebugTileKey] = useState<string | null>(null);

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

    // Count tiles by status for header summary
    const statusCounts = useMemo(() => {
        const counts: Record<TileRunState['status'], number> = {
            pending: 0,
            staged: 0,
            measuring: 0,
            completed: 0,
            failed: 0,
            skipped: 0,
        };
        tileEntries.forEach((entry) => {
            counts[entry.status]++;
        });
        return counts;
    }, [tileEntries]);

    // Build collapsed summary showing only non-zero counts
    const collapsedSummary = useMemo(() => {
        const parts: string[] = [];
        if (statusCounts.completed > 0) parts.push(`${statusCounts.completed} done`);
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
                <div
                    className="grid gap-2"
                    style={{
                        gridTemplateColumns: `repeat(${Math.max(gridColumnCount, 1)}, minmax(0, 1fr))`,
                    }}
                >
                    {tileEntries.map((entry) => {
                        const isOutlier = outlierTileKeys?.has(entry.tile.key) ?? false;
                        return (
                            <div
                                key={entry.tile.key}
                                role="button"
                                tabIndex={0}
                                aria-label={`Inspect calibration metrics for tile [${entry.tile.row},${entry.tile.col}]${isOutlier ? ' (outlier)' : ''}`}
                                onClick={(event) => handleTileCardClick(event, entry.tile.key)}
                                onKeyDown={(event) => handleTileCardKeyDown(event, entry.tile.key)}
                                className={`rounded-md border px-2 py-1.5 text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${getTileStatusClasses(entry.status)} ${entry.status === 'completed' ? 'cursor-pointer' : 'cursor-help'} ${isOutlier ? 'ring-2 ring-amber-500/60 ring-offset-1 ring-offset-gray-950' : ''}`}
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] font-semibold">
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
                                    <span className="text-xs capitalize font-medium">
                                        {entry.status}
                                    </span>
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
                                    <div className="mt-2 rounded-md border border-gray-800/70 bg-gray-950/60 p-1.5 text-[10px] text-gray-200">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <TileAxisAction
                                                axis="x"
                                                motor={entry.assignment.x}
                                                telemetry={getTelemetryForMotor(entry.assignment.x)}
                                                layout="inline"
                                                className="flex-1 min-w-[120px]"
                                                showHomeButton
                                            />
                                            <TileAxisAction
                                                axis="y"
                                                motor={entry.assignment.y}
                                                telemetry={getTelemetryForMotor(entry.assignment.y)}
                                                layout="inline"
                                                className="flex-1 min-w-[120px]"
                                                showHomeButton
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {/* Color legend - synced with TILE_STATUS_CLASSES */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800 pt-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm border border-gray-700 bg-gray-900/60" />
                        Pending
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm border border-amber-500/60 bg-amber-500/10" />
                        Staged
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm border border-sky-500/60 bg-sky-500/10" />
                        Measuring
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm border border-emerald-600/60 bg-emerald-500/10" />
                        Completed
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm border border-rose-600/60 bg-rose-500/10" />
                        Failed
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm border border-gray-800 bg-gray-900" />
                        Skipped
                    </span>
                </div>
            </CollapsibleSection>
            <TileDebugModal
                open={Boolean(debugTileKey)}
                entry={debugTileEntry}
                summaryTile={debugTileSummary}
                onClose={closeDebugModal}
                stepTestSettings={stepTestSnapshot}
                getTelemetryForMotor={getTelemetryForMotor}
            />
        </>
    );
};

export default TileStatusesPanel;
