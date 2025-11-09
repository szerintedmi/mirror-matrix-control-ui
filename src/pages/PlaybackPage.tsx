import React from 'react';

import LogConsole from '../components/LogConsole';
import Modal from '../components/Modal';
import MotorStatusOverview from '../components/MotorStatusOverview';
import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import { useLogStore } from '../context/LogContext';
import { useStatusStore } from '../context/StatusContext';
import { useMotorCommands } from '../hooks/useMotorCommands';
import { planPlayback } from '../services/playbackPlanner';
import { buildAxisTargets } from '../services/playbackTargets';
import { normalizeCommandError } from '../utils/commandErrors';
import { computeDirectOverlaps } from '../utils/tileOverlap';

import type { MirrorConfig, Pattern, PlaybackPlanResult, ProjectionSettings } from '../types';

interface PlaybackPageProps {
    patterns: Pattern[];
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    projectionSettings: ProjectionSettings;
    activePatternId: string | null;
    onSelectPattern: (patternId: string | null) => void;
}

const PatternThumbnail: React.FC<{
    pattern: Pattern;
    isActive: boolean;
    onActivate: (patternId: string) => void;
}> = ({ pattern, isActive, onActivate }) => {
    const canvasWidth = Math.max(pattern.canvas.width, TILE_PLACEMENT_UNIT);
    const canvasHeight = Math.max(pattern.canvas.height, TILE_PLACEMENT_UNIT);
    const aspectRatio = canvasWidth / canvasHeight;
    const containerStyle: React.CSSProperties = {
        paddingBottom: `${(1 / aspectRatio) * 100}%`,
        position: 'relative',
    };

    const rows = Math.max(1, Math.round(pattern.canvas.height / TILE_PLACEMENT_UNIT));
    const cols = Math.max(1, Math.round(pattern.canvas.width / TILE_PLACEMENT_UNIT));
    const footprints = React.useMemo(
        () =>
            pattern.tiles.map((tile) => ({
                id: tile.id,
                centerX: tile.center.x,
                centerY: tile.center.y,
                width: tile.size.width,
                height: tile.size.height,
            })),
        [pattern.tiles],
    );
    const overlaps = React.useMemo(() => computeDirectOverlaps(footprints), [footprints]);
    const tileMap = React.useMemo(
        () => new Map(footprints.map((tile) => [tile.id, tile])),
        [footprints],
    );
    const maxCount = React.useMemo(
        () => overlaps.reduce((max, record) => Math.max(max, record.count), 1),
        [overlaps],
    );

    return (
        <button
            type="button"
            onClick={() => onActivate(pattern.id)}
            className={`flex flex-col gap-2 rounded-lg border p-2 text-left transition ${
                isActive
                    ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.4)]'
                    : 'border-gray-700 bg-gray-900/60 hover:border-emerald-400'
            }`}
        >
            <div style={containerStyle}>
                <svg
                    viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="absolute left-0 top-0 h-full w-full rounded-md bg-gray-800"
                >
                    <rect
                        x={0}
                        y={0}
                        width={canvasWidth}
                        height={canvasHeight}
                        fill="rgba(17, 24, 39, 0.65)"
                    />
                    {overlaps.map((entry) => {
                        const tile = tileMap.get(entry.id);
                        if (!tile) {
                            return null;
                        }
                        const opacity = maxCount > 0 ? 1 / maxCount : 1;
                        return (
                            <g key={`preview-${entry.id}`} pointerEvents="none">
                                <circle
                                    cx={tile.centerX}
                                    cy={tile.centerY}
                                    r={TILE_PLACEMENT_UNIT / 2}
                                    fill="#f8fafc"
                                    fillOpacity={opacity}
                                />
                                {entry.count > 1 && (
                                    <text
                                        x={tile.centerX}
                                        y={tile.centerY + TILE_PLACEMENT_UNIT * 0.1}
                                        textAnchor="middle"
                                        fontSize={Math.max(TILE_PLACEMENT_UNIT * 0.32, 4)}
                                        fill="rgba(15, 23, 42, 0.55)"
                                        fontWeight={500}
                                    >
                                        {entry.count}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>
            <div className="flex flex-col gap-1">
                <span className="font-semibold text-gray-100">{pattern.name}</span>
                <span className="text-xs text-gray-400">
                    {pattern.tiles.length} mirrors • {rows} x {cols} cells
                </span>
            </div>
        </button>
    );
};

interface PlannerState {
    status: 'idle' | 'planning' | 'ready' | 'error';
    plan: PlaybackPlanResult | null;
    message: string | null;
}

const createInitialPlannerState = (): PlannerState => ({
    status: 'idle',
    plan: null,
    message: null,
});

interface PlaybackRunState {
    status: 'idle' | 'running' | 'success' | 'error' | 'cancelled';
    progress: number;
    error?: string;
}

const formatTileLabel = (row: number, col: number): string => `Tile ${row + 1},${col + 1}`;
const normalizeMac = (mac: string): string => mac.trim().toUpperCase();

const PlaybackPage: React.FC<PlaybackPageProps> = ({
    patterns,
    gridSize,
    mirrorConfig,
    projectionSettings,
    activePatternId,
    onSelectPattern,
}) => {
    const { drivers } = useStatusStore();
    const { moveMotor } = useMotorCommands();
    const { logInfo, logWarning, logError } = useLogStore();
    const [plannerState, setPlannerState] = React.useState<PlannerState>(createInitialPlannerState);
    const [runState, setRunState] = React.useState<PlaybackRunState>({
        status: 'idle',
        progress: 0,
    });
    const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
    const [cancelRequested, setCancelRequested] = React.useState(false);
    const cancelRequestedRef = React.useRef(false);

    const activePattern = React.useMemo(() => {
        if (!activePatternId) {
            return null;
        }
        return patterns.find((pattern) => pattern.id === activePatternId) ?? null;
    }, [activePatternId, patterns]);

    const isPlanning = plannerState.status === 'planning';
    const isRunning = runState.status === 'running';

    const axisPlan = React.useMemo(() => {
        if (!plannerState.plan) {
            return null;
        }
        return buildAxisTargets({ plan: plannerState.plan });
    }, [plannerState.plan]);

    React.useEffect(() => {
        if (!axisPlan && isPreviewOpen && plannerState.status !== 'planning') {
            setIsPreviewOpen(false);
        }
    }, [axisPlan, isPreviewOpen, plannerState.status]);

    const sortedAxisEntries = React.useMemo(() => {
        if (!axisPlan) {
            return [];
        }
        return [...axisPlan.axes].sort((a, b) => {
            if (a.row !== b.row) {
                return a.row - b.row;
            }
            if (a.col !== b.col) {
                return a.col - b.col;
            }
            if (a.axis !== b.axis) {
                return a.axis === 'x' ? -1 : 1;
            }
            return a.motor.motorIndex - b.motor.motorIndex;
        });
    }, [axisPlan]);

    const previewSkipped = axisPlan?.skipped ?? [];

    const driverPresenceMap = React.useMemo(() => {
        const map = new Map<string, (typeof drivers)[number]>();
        drivers.forEach((driver) => {
            map.set(normalizeMac(driver.snapshot.topicMac), driver);
        });
        return map;
    }, [drivers]);

    const planSummary = React.useMemo(() => {
        if (!plannerState.plan) {
            return null;
        }
        const targetedMirrors = plannerState.plan.mirrors.filter(
            (mirror) => mirror.patternId !== null,
        );
        const clampedAxisCount = axisPlan ? axisPlan.axes.filter((axis) => axis.clamped).length : 0;
        const skippedAxisCount = axisPlan ? axisPlan.skipped.length : 0;
        return {
            targetedMirrorCount: targetedMirrors.length,
            axisCommandCount: axisPlan ? axisPlan.axes.length : 0,
            clampedAxisCount,
            skippedAxisCount,
        };
    }, [axisPlan, plannerState.plan]);

    const computePlan = React.useCallback((): PlaybackPlanResult | null => {
        if (!activePattern) {
            setPlannerState({
                status: 'error',
                plan: null,
                message: 'Select a pattern before planning playback.',
            });
            return null;
        }
        setPlannerState({
            status: 'planning',
            plan: null,
            message: null,
        });
        try {
            const plan = planPlayback({
                gridSize,
                mirrorConfig,
                projectionSettings,
                pattern: activePattern,
            });
            const hasErrors = plan.errors.length > 0;
            setPlannerState({
                status: hasErrors ? 'error' : 'ready',
                plan,
                message: hasErrors
                    ? `${plan.errors.length} solver error${plan.errors.length === 1 ? '' : 's'} detected.`
                    : 'Playback plan is ready.',
            });
            return plan;
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'An unexpected error occurred while planning playback.';
            setPlannerState({
                status: 'error',
                plan: null,
                message,
            });
            return null;
        }
    }, [activePattern, gridSize, mirrorConfig, projectionSettings]);

    const handlePlanPlayback = () => {
        computePlan();
    };

    const handlePreviewCommands = () => {
        if (isPlanning || isRunning) {
            return;
        }
        const plan =
            plannerState.plan && plannerState.status !== 'planning'
                ? plannerState.plan
                : computePlan();
        if (!plan) {
            return;
        }
        if (plan.errors.length > 0) {
            logWarning(
                'playback',
                `Cannot preview commands until ${plan.errors.length} solver error${plan.errors.length === 1 ? '' : 's'} are resolved.`,
                { errorCount: plan.errors.length },
            );
            return;
        }
        setIsPreviewOpen(true);
    };

    const handleCancelRun = () => {
        if (runState.status !== 'running' || cancelRequestedRef.current) {
            return;
        }
        cancelRequestedRef.current = true;
        setCancelRequested(true);
        logWarning('playback', 'Playback cancellation requested by operator.');
    };

    const handlePlaybackStart = React.useCallback(async () => {
        if (isPlanning || runState.status === 'running') {
            return;
        }
        const plan = computePlan();
        if (!plan) {
            return;
        }
        if (plan.errors.length > 0) {
            logWarning(
                'playback',
                `Playback blocked due to ${plan.errors.length} solver error${plan.errors.length === 1 ? '' : 's'}.`,
                { errorCount: plan.errors.length },
            );
            return;
        }
        cancelRequestedRef.current = false;
        setCancelRequested(false);
        const localAxisPlan = buildAxisTargets({ plan });
        localAxisPlan.axes
            .filter((axis) => axis.clamped)
            .forEach((axis) => {
                logWarning(
                    'playback',
                    `${formatTileLabel(axis.row, axis.col)} axis ${axis.axis.toUpperCase()} clamped to ${axis.targetSteps.toFixed(0)} steps.`,
                    {
                        axis,
                    },
                );
            });
        localAxisPlan.skipped.forEach((skip) => {
            logWarning(
                'playback',
                `${formatTileLabel(skip.row, skip.col)} axis ${skip.axis.toUpperCase()} skipped (${skip.reason.replace('-', ' ')}).`,
                { skip },
            );
        });

        const runnableAxes = localAxisPlan.axes.filter((axis) => {
            const driver = driverPresenceMap.get(normalizeMac(axis.motor.nodeMac));
            if (!driver || driver.presence === 'offline') {
                logWarning(
                    'playback',
                    `${formatTileLabel(axis.row, axis.col)} axis ${axis.axis.toUpperCase()} skipped (driver offline).`,
                    { axis },
                );
                return false;
            }
            if (driver.presence === 'stale') {
                logWarning(
                    'playback',
                    `${formatTileLabel(axis.row, axis.col)} axis ${axis.axis.toUpperCase()} driver telemetry is stale; moving anyway.`,
                    { axis },
                );
            }
            return true;
        });

        if (runnableAxes.length === 0) {
            setRunState({ status: 'error', progress: 0, error: 'No eligible axes to command.' });
            logWarning('playback', 'Playback aborted: no eligible axes to command.', {
                skippedCount: localAxisPlan.skipped.length,
            });
            cancelRequestedRef.current = false;
            setCancelRequested(false);
            return;
        }

        setRunState({ status: 'running', progress: 0 });
        logInfo(
            'playback',
            `Dispatching ${runnableAxes.length} MOVE command${runnableAxes.length === 1 ? '' : 's'}.`,
        );
        for (let index = 0; index < runnableAxes.length; index += 1) {
            if (cancelRequestedRef.current) {
                setRunState({ status: 'cancelled', progress: index / runnableAxes.length });
                cancelRequestedRef.current = false;
                setCancelRequested(false);
                logInfo('playback', 'Playback run cancelled.');
                return;
            }
            const axis = runnableAxes[index];
            try {
                await moveMotor({
                    mac: axis.motor.nodeMac,
                    motorId: axis.motor.motorIndex,
                    positionSteps: Math.round(axis.targetSteps),
                });
                setRunState({
                    status: 'running',
                    progress: (index + 1) / runnableAxes.length,
                });
            } catch (error) {
                const normalized = normalizeCommandError(error);
                setRunState({
                    status: 'error',
                    progress: (index + 1) / runnableAxes.length,
                    error: normalized.message,
                });
                cancelRequestedRef.current = false;
                setCancelRequested(false);
                logError(
                    'playback',
                    `MOVE failed on ${formatTileLabel(axis.row, axis.col)} axis ${axis.axis.toUpperCase()}: ${normalized.message}`,
                    {
                        axis,
                        code: normalized.code,
                    },
                );
                return;
            }
        }
        setRunState({ status: 'success', progress: 1 });
        cancelRequestedRef.current = false;
        setCancelRequested(false);
        logInfo('playback', 'Playback commands completed successfully.', {
            axisCount: runnableAxes.length,
        });
    }, [
        computePlan,
        driverPresenceMap,
        isPlanning,
        logError,
        logInfo,
        logWarning,
        moveMotor,
        runState.status,
    ]);

    const previewDisabled = isPlanning || isRunning || !activePattern;

    return (
        <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 shadow-inner">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-100">Playback Controls</h2>
                        <p className="text-sm text-gray-400">
                            {activePattern
                                ? `Active pattern: ${activePattern.name}`
                                : 'Select a pattern in the library to begin planning playback.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={handlePlanPlayback}
                            disabled={!activePattern || isPlanning || isRunning}
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                                !activePattern || isPlanning || isRunning
                                    ? 'cursor-not-allowed bg-gray-700 text-gray-400'
                                    : 'bg-emerald-500 text-gray-900 hover:bg-emerald-400'
                            }`}
                        >
                            {isPlanning ? 'Planning…' : 'Plan Playback'}
                        </button>
                        <button
                            type="button"
                            onClick={handlePreviewCommands}
                            disabled={previewDisabled}
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                                previewDisabled
                                    ? 'cursor-not-allowed bg-gray-700 text-gray-400'
                                    : 'bg-indigo-500 text-gray-50 hover:bg-indigo-400'
                            }`}
                        >
                            Preview Commands
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void handlePlaybackStart();
                            }}
                            disabled={!activePattern || isPlanning || isRunning}
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                                !activePattern || isPlanning || isRunning
                                    ? 'cursor-not-allowed bg-gray-800 text-gray-500'
                                    : 'bg-sky-500 text-gray-900 hover:bg-sky-400'
                            }`}
                        >
                            {isRunning ? 'Playing…' : 'Play'}
                        </button>
                        {isRunning && (
                            <button
                                type="button"
                                onClick={handleCancelRun}
                                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                    {runState.status !== 'idle' && (
                        <p
                            className={`text-sm ${
                                runState.status === 'error'
                                    ? 'text-red-300'
                                    : runState.status === 'success'
                                      ? 'text-emerald-300'
                                      : 'text-gray-400'
                            }`}
                        >
                            {runState.status === 'running'
                                ? cancelRequested
                                    ? 'Canceling…'
                                    : `Dispatching commands (${Math.round(runState.progress * 100)}%)…`
                                : runState.status === 'success'
                                  ? 'Playback commands completed.'
                                  : runState.status === 'cancelled'
                                    ? 'Playback run cancelled.'
                                    : (runState.error ?? 'Playback failed.')}
                        </p>
                    )}
                </div>
                {plannerState.message && (
                    <div
                        className={`mt-4 rounded-md border p-3 text-sm ${
                            plannerState.status === 'error'
                                ? 'border-red-500/40 bg-red-500/10 text-red-100'
                                : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                        }`}
                    >
                        {plannerState.message}
                    </div>
                )}
                {planSummary && (
                    <div className="mt-4 grid gap-4 md:grid-cols-4">
                        <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                            <p className="text-gray-400">Targeted mirrors</p>
                            <p className="text-2xl font-semibold text-gray-50">
                                {planSummary.targetedMirrorCount}
                            </p>
                        </div>
                        <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                            <p className="text-gray-400">Axis commands ready</p>
                            <p className="text-2xl font-semibold text-gray-50">
                                {planSummary.axisCommandCount}
                            </p>
                        </div>
                        <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                            <p className="text-gray-400">Clamped axes</p>
                            <p
                                className={`text-2xl font-semibold ${
                                    planSummary.clampedAxisCount > 0
                                        ? 'text-amber-300'
                                        : 'text-emerald-300'
                                }`}
                            >
                                {planSummary.clampedAxisCount}
                            </p>
                        </div>
                        <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                            <p className="text-gray-400">Skipped axes</p>
                            <p
                                className={`text-2xl font-semibold ${
                                    planSummary.skippedAxisCount > 0
                                        ? 'text-amber-300'
                                        : 'text-emerald-300'
                                }`}
                            >
                                {planSummary.skippedAxisCount}
                            </p>
                        </div>
                    </div>
                )}
                {axisPlan && axisPlan.axes.some((axis) => axis.clamped) && (
                    <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-50">
                        <p className="mb-2 font-semibold">Clamp warnings</p>
                        <ul className="space-y-1">
                            {axisPlan.axes
                                .filter((axis) => axis.clamped)
                                .slice(0, 5)
                                .map((axis) => (
                                    <li key={`clamp-${axis.key}`}>
                                        {formatTileLabel(axis.row, axis.col)} axis{' '}
                                        {axis.axis.toUpperCase()} clamped to{' '}
                                        {axis.targetSteps.toFixed(0)} steps (requested{' '}
                                        {axis.requestedSteps.toFixed(0)}).
                                    </li>
                                ))}
                        </ul>
                        {axisPlan.axes.filter((axis) => axis.clamped).length > 5 && (
                            <p className="mt-2 text-xs text-amber-100/80">
                                Additional clamped axes omitted for brevity.
                            </p>
                        )}
                    </div>
                )}
                {axisPlan && axisPlan.skipped.length > 0 && (
                    <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-400/5 p-3 text-sm text-amber-100">
                        <p className="mb-2 font-semibold">Skipped axes</p>
                        <ul className="space-y-1">
                            {axisPlan.skipped.slice(0, 5).map((skip, index) => (
                                <li key={`skip-${skip.mirrorId}-${skip.axis}-${index}`}>
                                    {formatTileLabel(skip.row, skip.col)} axis{' '}
                                    {skip.axis.toUpperCase()} skipped (
                                    {skip.reason.replace('-', ' ')}).
                                </li>
                            ))}
                        </ul>
                        {axisPlan.skipped.length > 5 && (
                            <p className="mt-2 text-xs text-amber-100/80">
                                Additional skipped axes omitted for brevity.
                            </p>
                        )}
                    </div>
                )}
                {plannerState.plan && plannerState.plan.errors.length > 0 && (
                    <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-100">
                        <p className="mb-2 font-semibold">Solver issues</p>
                        <ul className="space-y-1">
                            {plannerState.plan.errors.map((error, index) => (
                                <li key={`${error.code}-${index}`}>
                                    <span className="font-medium">{error.code}:</span>{' '}
                                    {error.message}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 shadow-inner">
                <h2 className="mb-4 text-lg font-semibold text-gray-100">Array Overview</h2>
                <MotorStatusOverview
                    rows={gridSize.rows}
                    cols={gridSize.cols}
                    mirrorConfig={mirrorConfig}
                    drivers={drivers}
                />
            </section>

            <section className="rounded-lg bg-gray-800/50 p-4 shadow-lg ring-1 ring-white/10">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-100">Playback Queue</h2>
                    <span className="text-xs uppercase tracking-wide text-gray-500">
                        {patterns.length} pattern{patterns.length === 1 ? '' : 's'}
                    </span>
                </div>
                {patterns.length === 0 ? (
                    <div className="rounded-md border border-gray-700 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
                        No patterns available for playback yet.
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                        {patterns.map((pattern) => (
                            <PatternThumbnail
                                key={pattern.id}
                                pattern={pattern}
                                isActive={pattern.id === activePatternId}
                                onActivate={(patternId) => onSelectPattern(patternId)}
                            />
                        ))}
                    </div>
                )}
            </section>

            <LogConsole scope="playback" title="Playback Log" />

            <Modal
                open={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                title="Command Preview"
            >
                {plannerState.status === 'planning' ? (
                    <p className="text-sm text-gray-300">Generating playback plan…</p>
                ) : !axisPlan || sortedAxisEntries.length === 0 ? (
                    <p className="text-sm text-gray-300">
                        No command plan is available yet. Plan playback before previewing commands.
                    </p>
                ) : (
                    <div className="space-y-4">
                        <div className="text-sm text-gray-300">
                            {sortedAxisEntries.length} MOVE command
                            {sortedAxisEntries.length === 1 ? '' : 's'} ready for dispatch.
                        </div>
                        <div className="overflow-x-auto rounded-md border border-gray-800">
                            <table className="min-w-full divide-y divide-gray-800 text-sm">
                                <thead className="bg-gray-800/60 text-xs uppercase tracking-wide text-gray-400">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Tile</th>
                                        <th className="px-3 py-2 text-left">Axis</th>
                                        <th className="px-3 py-2 text-left">Motor</th>
                                        <th className="px-3 py-2 text-right">Target (steps)</th>
                                        <th className="px-3 py-2 text-right">Requested</th>
                                        <th className="px-3 py-2 text-left">Clamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800 text-gray-200">
                                    {sortedAxisEntries.map((axis) => (
                                        <tr key={axis.key}>
                                            <td className="px-3 py-2">
                                                {formatTileLabel(axis.row, axis.col)}
                                            </td>
                                            <td className="px-3 py-2 uppercase">{axis.axis}</td>
                                            <td className="px-3 py-2 text-xs text-gray-400">
                                                {normalizeMac(axis.motor.nodeMac)}:
                                                {axis.motor.motorIndex}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold">
                                                {Math.round(axis.targetSteps)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-400">
                                                {Math.round(axis.requestedSteps)}
                                            </td>
                                            <td className="px-3 py-2">
                                                {axis.clamped ? (
                                                    <span className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-200">
                                                        Clamped
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-500">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {previewSkipped.length > 0 && (
                            <div className="rounded-md border border-amber-400/30 bg-amber-500/5 p-3 text-sm text-amber-100">
                                <p className="mb-2 font-semibold">
                                    Skipped axes ({previewSkipped.length})
                                </p>
                                <ul className="space-y-1 text-xs">
                                    {previewSkipped.slice(0, 8).map((skip, index) => (
                                        <li key={`${skip.mirrorId}-${skip.axis}-${index}`}>
                                            {formatTileLabel(skip.row, skip.col)} axis{' '}
                                            {skip.axis.toUpperCase()} —{' '}
                                            {skip.reason.replace('-', ' ')}
                                        </li>
                                    ))}
                                    {previewSkipped.length > 8 && (
                                        <li>… {previewSkipped.length - 8} more skipped entries</li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default PlaybackPage;
