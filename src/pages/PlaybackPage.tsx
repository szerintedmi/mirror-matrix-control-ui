import React from 'react';

import LogConsole from '../components/LogConsole';
import Modal from '../components/Modal';
import MotorStatusOverview from '../components/MotorStatusOverview';
import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import {
    MAX_PROJECTION_OFFSET_M,
    MAX_WALL_DISTANCE_M,
    MIN_PROJECTION_OFFSET_M,
    MIN_WALL_DISTANCE_M,
} from '../constants/projection';
import { useLogStore } from '../context/LogContext';
import { useStatusStore } from '../context/StatusContext';
import { useMotorCommands } from '../hooks/useMotorCommands';
import { planPlayback } from '../services/playbackPlanner';
import { buildAxisTargets } from '../services/playbackTargets';
import { normalizeCommandError } from '../utils/commandErrors';
import { withOrientationAngles } from '../utils/orientation';
import { computeDirectOverlaps } from '../utils/tileOverlap';

import type {
    MirrorAssignment,
    MirrorConfig,
    Pattern,
    PlaybackPlanResult,
    ProjectionSettings,
} from '../types';

interface PlaybackPageProps {
    patterns: Pattern[];
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    projectionSettings: ProjectionSettings;
    onUpdateProjection: (patch: Partial<ProjectionSettings>) => void;
    activePatternId: string | null;
    onSelectPattern: (patternId: string | null) => void;
    onNavigateSimulation?: () => void;
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
    signature: string | null;
}

const createInitialPlannerState = (): PlannerState => ({
    status: 'idle',
    plan: null,
    message: null,
    signature: null,
});

interface PlaybackRunState {
    status: 'idle' | 'running' | 'success' | 'error' | 'cancelled';
    progress: number;
    error?: string;
}

const formatTileLabel = (row: number, col: number): string => `Tile ${row + 1},${col + 1}`;
const normalizeMac = (mac: string): string => mac.trim().toUpperCase();

const axisAssignmentSignature = (
    assignment: MirrorAssignment['x'] | MirrorAssignment['y'],
): string => {
    if (!assignment) {
        return 'none';
    }
    return `${normalizeMac(assignment.nodeMac)}-${assignment.motorIndex}`;
};

const createPlannerInputSignature = ({
    patternId,
    gridSize,
    mirrorConfig,
    projectionSettings,
}: {
    patternId: string | null;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    projectionSettings: ProjectionSettings;
}): string => {
    const assignmentFragments: string[] = [];
    mirrorConfig.forEach((assignment, key) => {
        assignmentFragments.push(
            `${key}:${axisAssignmentSignature(assignment.x)}:${axisAssignmentSignature(assignment.y)}`,
        );
    });
    assignmentFragments.sort();
    const projectionFragment = [
        projectionSettings.wallDistance.toFixed(3),
        projectionSettings.projectionOffset.toFixed(3),
        projectionSettings.wallOrientation.yaw.toFixed(3),
        projectionSettings.wallOrientation.pitch.toFixed(3),
        projectionSettings.sunOrientation.yaw.toFixed(3),
        projectionSettings.sunOrientation.pitch.toFixed(3),
    ].join('|');
    return [
        patternId ?? 'none',
        `${gridSize.rows}x${gridSize.cols}`,
        projectionFragment,
        assignmentFragments.join(','),
    ].join('::');
};

const PlaybackPage: React.FC<PlaybackPageProps> = ({
    patterns,
    gridSize,
    mirrorConfig,
    projectionSettings,
    onUpdateProjection,
    activePatternId,
    onSelectPattern,
    onNavigateSimulation,
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

    const plannerInputsSignature = React.useMemo(
        () =>
            createPlannerInputSignature({
                patternId: activePattern?.id ?? null,
                gridSize,
                mirrorConfig,
                projectionSettings,
            }),
        [activePattern?.id, gridSize, mirrorConfig, projectionSettings],
    );

    const isPlanning = plannerState.status === 'planning';
    const isRunning = runState.status === 'running';

    const currentPlan = React.useMemo(() => {
        if (!plannerState.plan) {
            return null;
        }
        if (plannerState.signature !== plannerInputsSignature) {
            return null;
        }
        if (plannerState.status !== 'ready') {
            return null;
        }
        return plannerState.plan;
    }, [plannerInputsSignature, plannerState.plan, plannerState.signature, plannerState.status]);

    const liveAxisPlan = React.useMemo(() => {
        if (!currentPlan) {
            return null;
        }
        return buildAxisTargets({ plan: currentPlan });
    }, [currentPlan]);

    const [displayPlan, setDisplayPlan] = React.useState<PlaybackPlanResult | null>(null);
    React.useEffect(() => {
        if (currentPlan) {
            setDisplayPlan(currentPlan);
        }
    }, [currentPlan]);
    const displayAxisPlan = React.useMemo(() => {
        if (!displayPlan) {
            return null;
        }
        if (displayPlan === currentPlan && liveAxisPlan) {
            return liveAxisPlan;
        }
        return buildAxisTargets({ plan: displayPlan });
    }, [currentPlan, displayPlan, liveAxisPlan]);

    React.useEffect(() => {
        if (!displayAxisPlan && isPreviewOpen && plannerState.status !== 'planning') {
            setIsPreviewOpen(false);
        }
    }, [displayAxisPlan, isPreviewOpen, plannerState.status]);

    const sortedAxisEntries = React.useMemo(() => {
        if (!displayAxisPlan) {
            return [];
        }
        return [...displayAxisPlan.axes].sort((a, b) => {
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
    }, [displayAxisPlan]);

    const previewSkipped = displayAxisPlan?.skipped ?? [];

    const clampValue = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));

    const handleProjectionField =
        (key: 'wallDistance' | 'projectionOffset', min: number, max: number) => (value: number) => {
            if (Number.isNaN(value)) {
                return;
            }
            const clamped = clampValue(value, min, max);
            onUpdateProjection({ [key]: clamped });
        };

    const handleOrientationAngleChange =
        (key: 'wallOrientation' | 'sunOrientation', field: 'yaw' | 'pitch') => (value: number) => {
            if (Number.isNaN(value)) {
                return;
            }
            const clamped = clampValue(value, -90, 90);
            const orientation = projectionSettings[key];
            const next = withOrientationAngles(
                { ...orientation, mode: 'angles' },
                field === 'yaw' ? clamped : orientation.yaw,
                field === 'pitch' ? clamped : orientation.pitch,
                'forward',
            );
            onUpdateProjection({ [key]: next });
        };

    const wallDistanceInput = handleProjectionField(
        'wallDistance',
        MIN_WALL_DISTANCE_M,
        MAX_WALL_DISTANCE_M,
    );
    const projectionOffsetInput = handleProjectionField(
        'projectionOffset',
        MIN_PROJECTION_OFFSET_M,
        MAX_PROJECTION_OFFSET_M,
    );
    const wallYawInput = handleOrientationAngleChange('wallOrientation', 'yaw');
    const wallPitchInput = handleOrientationAngleChange('wallOrientation', 'pitch');
    const sunYawInput = handleOrientationAngleChange('sunOrientation', 'yaw');
    const sunPitchInput = handleOrientationAngleChange('sunOrientation', 'pitch');
    const createNumberChangeHandler =
        (handler: (value: number) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
            handler(Number(event.target.value));
        };
    const driverPresenceMap = React.useMemo(() => {
        const map = new Map<string, (typeof drivers)[number]>();
        drivers.forEach((driver) => {
            map.set(normalizeMac(driver.snapshot.topicMac), driver);
        });
        return map;
    }, [drivers]);

    const planSummary = React.useMemo(() => {
        if (!displayPlan) {
            return null;
        }
        const targetedMirrors = displayPlan.mirrors.filter((mirror) => mirror.patternId !== null);
        const clampedAxisCount = displayAxisPlan
            ? displayAxisPlan.axes.filter((axis) => axis.clamped).length
            : 0;
        const skippedAxisCount = displayAxisPlan ? displayAxisPlan.skipped.length : 0;
        return {
            targetedMirrorCount: targetedMirrors.length,
            axisCommandCount: displayAxisPlan ? displayAxisPlan.axes.length : 0,
            clampedAxisCount,
            skippedAxisCount,
        };
    }, [displayAxisPlan, displayPlan]);

    const blockingIssues = React.useMemo(() => {
        const issues: string[] = [];
        if (!activePattern) {
            issues.push('Select a pattern in the library to configure playback.');
        }
        if (
            plannerState.status === 'error' &&
            plannerState.message &&
            plannerState.signature === plannerInputsSignature
        ) {
            issues.push(plannerState.message);
        }
        return issues;
    }, [
        activePattern,
        plannerInputsSignature,
        plannerState.message,
        plannerState.signature,
        plannerState.status,
    ]);

    const computePlan = React.useCallback(
        (options?: { silentSuccess?: boolean }): PlaybackPlanResult | null => {
            if (!activePattern) {
                setPlannerState({
                    status: 'error',
                    plan: null,
                    message: 'Select a pattern before running playback.',
                    signature: null,
                });
                return null;
            }
            setPlannerState((prev) => ({
                status: 'planning',
                plan: prev.plan,
                message: null,
                signature: prev.signature === plannerInputsSignature ? prev.signature : null,
            }));
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
                        : null,
                    signature: plannerInputsSignature,
                });
                if (!hasErrors && options?.silentSuccess) {
                    return plan;
                }
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
                    signature: null,
                });
                return null;
            }
        },
        [activePattern, gridSize, mirrorConfig, plannerInputsSignature, projectionSettings],
    );

    React.useEffect(() => {
        if (!activePattern) {
            setPlannerState({
                status: 'error',
                plan: null,
                message: 'Select a pattern before running playback.',
                signature: null,
            });
            return;
        }
        const timer = window.setTimeout(() => {
            computePlan({ silentSuccess: true });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [activePattern, computePlan, plannerInputsSignature]);

    const requireFreshPlan = React.useCallback(
        (options?: { silentSuccess?: boolean }) => {
            if (
                plannerState.plan &&
                plannerState.signature === plannerInputsSignature &&
                plannerState.status === 'ready'
            ) {
                return plannerState.plan;
            }
            return computePlan(options);
        },
        [
            computePlan,
            plannerInputsSignature,
            plannerState.plan,
            plannerState.signature,
            plannerState.status,
        ],
    );

    const handleNavigateToSimulation = () => {
        setIsPreviewOpen(false);
        if (onNavigateSimulation) {
            onNavigateSimulation();
        }
    };

    const handlePreviewCommands = () => {
        if (isPlanning || isRunning) {
            return;
        }
        const plan = requireFreshPlan({ silentSuccess: true });
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
        const plan = requireFreshPlan();
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
        driverPresenceMap,
        isPlanning,
        logError,
        logInfo,
        logWarning,
        moveMotor,
        requireFreshPlan,
        runState.status,
    ]);

    const previewDisabled = isPlanning || isRunning || blockingIssues.length > 0;
    const playDisabled = isPlanning || isRunning || blockingIssues.length > 0;
    const isPlanRefreshing = plannerState.status === 'planning';
    const isPlanStale = !currentPlan && !!displayPlan;
    const planSummaryValues = {
        targetedMirrorCount: planSummary?.targetedMirrorCount ?? '—',
        axisCommandCount: planSummary?.axisCommandCount ?? '—',
        clampedAxisCount: planSummary?.clampedAxisCount ?? '—',
        skippedAxisCount: planSummary?.skippedAxisCount ?? '—',
    };

    return (
        <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 shadow-inner">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold text-gray-100">Playback Controls</h2>
                        <p className="text-sm text-gray-400">
                            {activePattern
                                ? `Active pattern: ${activePattern.name}`
                                : 'Select a pattern in the library to begin playback.'}
                        </p>
                        {blockingIssues.length > 0 ? (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-300">
                                {blockingIssues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                            </ul>
                        ) : displayAxisPlan ? (
                            <p
                                className={`mt-2 text-xs font-medium uppercase tracking-wide ${
                                    isPlanStale ? 'text-emerald-200 opacity-60' : 'text-emerald-300'
                                }`}
                            >
                                {displayAxisPlan.axes.length} axis command
                                {displayAxisPlan.axes.length === 1 ? '' : 's'} ready
                                {isPlanRefreshing && (
                                    <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-gray-400">
                                        Updating…
                                    </span>
                                )}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3">
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
                            {isPlanning ? 'Calculating…' : 'Preview Commands'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void handlePlaybackStart();
                            }}
                            disabled={playDisabled}
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                                playDisabled
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
                <div
                    className={`mt-4 grid gap-4 md:grid-cols-4 ${
                        isPlanStale ? 'opacity-70 transition' : 'opacity-100'
                    }`}
                >
                    <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                        <div className="flex items-center justify-between">
                            <p className="text-gray-400">Targeted mirrors</p>
                            {isPlanRefreshing && (
                                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                                    Updating…
                                </span>
                            )}
                        </div>
                        <p className="text-2xl font-semibold text-gray-50">
                            {planSummaryValues.targetedMirrorCount}
                        </p>
                    </div>
                    <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                        <p className="text-gray-400">Axis commands ready</p>
                        <p className="text-2xl font-semibold text-gray-50">
                            {planSummaryValues.axisCommandCount}
                        </p>
                    </div>
                    <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                        <p className="text-gray-400">Clamped axes</p>
                        <p
                            className={`text-2xl font-semibold ${
                                typeof planSummaryValues.clampedAxisCount === 'number' &&
                                planSummaryValues.clampedAxisCount > 0
                                    ? 'text-amber-300'
                                    : 'text-emerald-300'
                            }`}
                        >
                            {planSummaryValues.clampedAxisCount}
                        </p>
                    </div>
                    <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm">
                        <p className="text-gray-400">Skipped axes</p>
                        <p
                            className={`text-2xl font-semibold ${
                                typeof planSummaryValues.skippedAxisCount === 'number' &&
                                planSummaryValues.skippedAxisCount > 0
                                    ? 'text-amber-300'
                                    : 'text-emerald-300'
                            }`}
                        >
                            {planSummaryValues.skippedAxisCount}
                        </p>
                    </div>
                </div>
                {displayAxisPlan && displayAxisPlan.axes.some((axis) => axis.clamped) && (
                    <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-50">
                        <p className="mb-2 font-semibold">
                            Clamp warnings
                            {isPlanRefreshing && (
                                <span className="ml-2 text-xs font-normal text-amber-200/80">
                                    Updating…
                                </span>
                            )}
                        </p>
                        <ul className="space-y-1">
                            {displayAxisPlan.axes
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
                        {displayAxisPlan.axes.filter((axis) => axis.clamped).length > 5 && (
                            <p className="mt-2 text-xs text-amber-100/80">
                                Additional clamped axes omitted for brevity.
                            </p>
                        )}
                    </div>
                )}
                {displayAxisPlan && displayAxisPlan.skipped.length > 0 && (
                    <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-400/5 p-3 text-sm text-amber-100">
                        <p className="mb-2 font-semibold">
                            Skipped axes
                            {isPlanRefreshing && (
                                <span className="ml-2 text-xs font-normal text-amber-100/70">
                                    Updating…
                                </span>
                            )}
                        </p>
                        <ul className="space-y-1">
                            {displayAxisPlan.skipped.slice(0, 5).map((skip, index) => (
                                <li key={`skip-${skip.mirrorId}-${skip.axis}-${index}`}>
                                    {formatTileLabel(skip.row, skip.col)} axis{' '}
                                    {skip.axis.toUpperCase()} skipped (
                                    {skip.reason.replace('-', ' ')}).
                                </li>
                            ))}
                        </ul>
                        {displayAxisPlan.skipped.length > 5 && (
                            <p className="mt-2 text-xs text-amber-100/80">
                                Additional skipped axes omitted for brevity.
                            </p>
                        )}
                    </div>
                )}
                {plannerState.plan &&
                    plannerState.signature === plannerInputsSignature &&
                    plannerState.plan.errors.length > 0 && (
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

            <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 shadow-inner space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-lg font-semibold text-gray-100">Projection Setup</h2>
                    {onNavigateSimulation && (
                        <button
                            type="button"
                            onClick={handleNavigateToSimulation}
                            aria-label="Open projection setup"
                            className="inline-flex items-center justify-center rounded-md border border-cyan-400 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/10"
                        >
                            <span aria-hidden="true">Simulation</span>
                        </button>
                    )}
                </div>
                <div className="rounded-md border border-gray-800/80 bg-gray-900/40 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1 text-sm text-gray-300">
                                <span>Wall Distance (m)</span>
                                <input
                                    type="number"
                                    min={MIN_WALL_DISTANCE_M}
                                    max={MAX_WALL_DISTANCE_M}
                                    step={0.1}
                                    value={projectionSettings.wallDistance}
                                    onChange={createNumberChangeHandler(wallDistanceInput)}
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-gray-300">
                                <span>Projection Height (m)</span>
                                <input
                                    type="number"
                                    min={MIN_PROJECTION_OFFSET_M}
                                    max={MAX_PROJECTION_OFFSET_M}
                                    step={0.05}
                                    value={projectionSettings.projectionOffset}
                                    onChange={createNumberChangeHandler(projectionOffsetInput)}
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </label>
                        </div>
                        <div className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1 text-sm text-gray-300">
                                <span>Wall Yaw (°)</span>
                                <input
                                    type="number"
                                    min={-90}
                                    max={90}
                                    step={0.1}
                                    value={projectionSettings.wallOrientation.yaw}
                                    onChange={createNumberChangeHandler(wallYawInput)}
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-gray-300">
                                <span>Wall Pitch (°)</span>
                                <input
                                    type="number"
                                    min={-90}
                                    max={90}
                                    step={0.1}
                                    value={projectionSettings.wallOrientation.pitch}
                                    onChange={createNumberChangeHandler(wallPitchInput)}
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </label>
                        </div>
                        <div className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1 text-sm text-gray-300">
                                <span>Light Yaw (°)</span>
                                <input
                                    type="number"
                                    min={-90}
                                    max={90}
                                    step={0.1}
                                    value={projectionSettings.sunOrientation.yaw}
                                    onChange={createNumberChangeHandler(sunYawInput)}
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-gray-300">
                                <span>Light Pitch (°)</span>
                                <input
                                    type="number"
                                    min={-90}
                                    max={90}
                                    step={0.1}
                                    value={projectionSettings.sunOrientation.pitch}
                                    onChange={createNumberChangeHandler(sunPitchInput)}
                                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </label>
                        </div>
                    </div>
                </div>
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
                ) : !displayAxisPlan || sortedAxisEntries.length === 0 ? (
                    <p className="text-sm text-gray-300">
                        Command preview is unavailable until the current validation issues are
                        resolved.
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
