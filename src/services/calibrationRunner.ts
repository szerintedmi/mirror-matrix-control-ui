import {
    DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    type CalibrationRunnerSettings,
} from '@/constants/calibration';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { MotorCommandApi } from '@/hooks/useMotorCommands';
import type {
    ArrayRotation,
    BlobMeasurement,
    CalibrationGridBlueprint,
    CalibrationProfileBounds,
    MirrorAssignment,
    MirrorConfig,
    Motor,
} from '@/types';
import { getStepTestJogDirection } from '@/utils/arrayRotation';

type Axis = 'x' | 'y';

export interface TileAddress {
    row: number;
    col: number;
    key: string;
}

interface TileDescriptor extends TileAddress {
    assignment: MirrorAssignment;
    calibratable: boolean;
}

interface AxisDescriptor {
    key: string;
    motor: Motor;
}

const formatMotorLabel = (motor: Motor): string => {
    const compact = motor.nodeMac.replace(/:/g, '').toLowerCase();
    const suffix = compact.slice(-6) || compact;
    return `${suffix}:${motor.motorIndex}`;
};

const formatMacSuffix = (mac: string): string => {
    const compact = mac.replace(/:/g, '').toLowerCase();
    return compact.slice(-6) || compact;
};

export type CaptureBlobMeasurement = (params: {
    timeoutMs: number;
    signal?: AbortSignal;
}) => Promise<BlobMeasurement | null>;

export type CalibrationRunnerPhase =
    | 'idle'
    | 'homing'
    | 'staging'
    | 'measuring'
    | 'aligning'
    | 'paused'
    | 'aborted'
    | 'completed'
    | 'error';

export interface TileCalibrationMetrics {
    home?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number } | null;
    adjustedHome?: { x: number; y: number } | null;
    stepToDisplacement?: {
        x: number | null;
        y: number | null;
    };
    sizeDeltaAtStepTest?: number | null;
}

export interface TileRunState {
    tile: TileAddress;
    status: 'pending' | 'staged' | 'measuring' | 'completed' | 'failed' | 'skipped';
    error?: string;
    metrics?: TileCalibrationMetrics;
    assignment: MirrorAssignment;
}

export interface TileCalibrationResult {
    tile: TileAddress;
    status: 'measuring' | 'completed' | 'failed' | 'skipped';
    error?: string;
    homeMeasurement?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number };
    adjustedHome?: { x: number; y: number };
    stepToDisplacement?: { x: number | null; y: number | null };
    sizeDeltaAtStepTest?: number | null;
    inferredBounds?: CalibrationProfileBounds | null;
    stepScale?: { x: number | null; y: number | null };
}

export interface CalibrationRunSummary {
    gridBlueprint: CalibrationGridBlueprint | null;
    stepTestSettings: {
        deltaSteps: number;
    };
    tiles: Record<string, TileCalibrationResult>;
}

export interface CalibrationRunnerState {
    phase: CalibrationRunnerPhase;
    tiles: Record<string, TileRunState>;
    progress: {
        total: number;
        completed: number;
        failed: number;
        skipped: number;
    };
    activeTile: TileAddress | null;
    summary?: CalibrationRunSummary;
    error: string | null;
}

export type CalibrationRunnerMode = 'auto' | 'step';

export type CalibrationStepKind = 'home-all' | 'stage-all' | 'measure-tile' | 'align-grid';

export interface CalibrationStepDescriptor {
    kind: CalibrationStepKind;
    label: string;
    tile?: TileAddress | null;
}

export type CalibrationStepStatus = 'waiting' | 'running' | 'completed' | 'skipped' | 'error';

export interface CalibrationStepState {
    step: CalibrationStepDescriptor;
    status: CalibrationStepStatus;
    error?: string;
}

export interface CalibrationCommandLogEntry {
    id: string;
    hint: string;
    phase: CalibrationRunnerPhase;
    tile?: TileAddress | null;
    timestamp: number;
    sequence: number;
    group?: string;
    metadata?: Record<string, unknown>;
}

export interface CalibrationRunnerParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    motorApi: MotorCommandApi;
    captureMeasurement: CaptureBlobMeasurement;
    settings?: Partial<CalibrationRunnerSettings>;
    /**
     * Physical array rotation (clockwise from camera view).
     * Affects step test jog directions to match expected visual movement.
     */
    arrayRotation?: ArrayRotation;
    onStateChange?: (state: CalibrationRunnerState) => void;
    mode?: CalibrationRunnerMode;
    onStepStateChange?: (state: CalibrationStepState) => void;
    onCommandLog?: (entry: CalibrationCommandLogEntry) => void;
}

const clampSteps = (value: number): number =>
    Math.min(MOTOR_MAX_POSITION_STEPS, Math.max(MOTOR_MIN_POSITION_STEPS, value));

const roundSteps = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round(value);
};

const getAxisStepDelta = (
    axis: Axis,
    deltaSteps: number,
    arrayRotation: ArrayRotation,
): number | null => {
    if (deltaSteps <= 0) {
        return null;
    }
    const jogDirection = getStepTestJogDirection(axis, arrayRotation);
    return clampSteps(deltaSteps * jogDirection);
};

class RunnerAbortError extends Error {
    constructor(message = 'Calibration run aborted') {
        super(message);
        this.name = 'RunnerAbortError';
    }
}

const waitWithSignal = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new RunnerAbortError());
            return;
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(new RunnerAbortError());
        };
        signal.addEventListener('abort', onAbort);
    });

const buildTileDescriptors = (
    gridSize: { rows: number; cols: number },
    mirrorConfig: MirrorConfig,
): TileDescriptor[] => {
    const descriptors: TileDescriptor[] = [];
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const key = `${row}-${col}`;
            const assignmentSource = mirrorConfig.get(key);
            const assignment: MirrorAssignment = assignmentSource
                ? {
                      x: assignmentSource.x,
                      y: assignmentSource.y,
                  }
                : { x: null, y: null };
            const calibratable = Boolean(assignment.x && assignment.y);
            descriptors.push({
                row,
                col,
                key,
                assignment,
                calibratable,
            });
        }
    }
    return descriptors;
};

export const createBaselineRunnerState = (
    gridSize: { rows: number; cols: number },
    mirrorConfig: MirrorConfig,
): CalibrationRunnerState => {
    const descriptors = buildTileDescriptors(gridSize, mirrorConfig);
    const tiles: Record<string, TileRunState> = {};
    let total = 0;
    let skipped = 0;
    for (const descriptor of descriptors) {
        const status: TileRunState['status'] = descriptor.calibratable ? 'pending' : 'skipped';
        if (descriptor.calibratable) {
            total += 1;
        } else {
            skipped += 1;
        }
        tiles[descriptor.key] = {
            tile: {
                row: descriptor.row,
                col: descriptor.col,
                key: descriptor.key,
            },
            assignment: descriptor.assignment,
            status,
        };
    }
    return {
        phase: 'idle',
        tiles,
        progress: {
            total,
            completed: 0,
            failed: 0,
            skipped,
        },
        activeTile: null,
        summary: undefined,
        error: null,
    };
};

export class CalibrationRunner {
    private readonly gridSize: { rows: number; cols: number };

    private readonly motorApi: MotorCommandApi;

    private readonly captureMeasurement: CaptureBlobMeasurement;

    private readonly settings: CalibrationRunnerSettings;

    private readonly arrayRotation: ArrayRotation;

    private readonly descriptors: TileDescriptor[];

    private readonly calibratableTiles: TileDescriptor[];

    private readonly axisDescriptors: AxisDescriptor[];

    private readonly onStateChange?: (state: CalibrationRunnerState) => void;

    private readonly mode: CalibrationRunnerMode;

    private readonly onStepStateChange?: (state: CalibrationStepState) => void;

    private readonly onCommandLog?: (entry: CalibrationCommandLogEntry) => void;

    private state: CalibrationRunnerState;

    private runPromise: Promise<void> | null = null;

    private readonly abortController = new AbortController();

    private paused = false;

    private aborted = false;

    private readonly pauseResolvers = new Set<() => void>();

    private previousPhase: CalibrationRunnerPhase | null = null;

    private readonly axisPositions = new Map<string, number>();

    private readonly tileResults = new Map<string, TileCalibrationResult>();

    private stepGateResolver: (() => void) | null = null;

    private stepGateReject: ((reason?: unknown) => void) | null = null;

    private activeStep: CalibrationStepState | null = null;

    private commandLogCounter = 0;

    constructor(params: CalibrationRunnerParams) {
        this.gridSize = params.gridSize;
        this.motorApi = params.motorApi;
        this.captureMeasurement = params.captureMeasurement;
        this.settings = { ...DEFAULT_CALIBRATION_RUNNER_SETTINGS, ...params.settings };
        this.arrayRotation = params.arrayRotation ?? 0;
        this.onStateChange = params.onStateChange;
        this.mode = params.mode ?? 'auto';
        this.onStepStateChange = params.onStepStateChange;
        this.onCommandLog = params.onCommandLog;

        this.descriptors = buildTileDescriptors(params.gridSize, params.mirrorConfig);
        this.calibratableTiles = this.descriptors.filter((descriptor) => descriptor.calibratable);
        const axisMap = new Map<string, Motor>();
        for (const descriptor of this.descriptors) {
            (['x', 'y'] as Axis[]).forEach((axis) => {
                const motor = descriptor.assignment[axis];
                if (!motor) {
                    return;
                }
                const key = `${motor.nodeMac}:${motor.motorIndex}`;
                if (!axisMap.has(key)) {
                    axisMap.set(key, motor);
                }
            });
            if (!descriptor.calibratable) {
                this.tileResults.set(descriptor.key, {
                    tile: {
                        row: descriptor.row,
                        col: descriptor.col,
                        key: descriptor.key,
                    },
                    status: 'skipped',
                    error: 'Tile is missing X/Y motor assignments',
                });
            }
        }
        this.axisDescriptors = Array.from(axisMap.entries()).map(([key, motor]) => ({
            key,
            motor,
        }));
        this.state = createBaselineRunnerState(params.gridSize, params.mirrorConfig);
    }

    public getState(): CalibrationRunnerState {
        return this.state;
    }

    public start(): void {
        if (this.runPromise) {
            throw new Error('Calibration runner already in progress');
        }
        if (this.calibratableTiles.length === 0) {
            this.updateState({
                phase: 'error',
                error: 'No tiles with both X/Y motors assigned. Configure the grid before running calibration.',
                activeTile: null,
            });
            return;
        }
        this.runPromise = this.execute().finally(() => {
            this.runPromise = null;
        });
    }

    public pause(): void {
        if (this.paused || this.aborted) {
            return;
        }
        this.paused = true;
    }

    public resume(): void {
        if (!this.paused) {
            return;
        }
        this.paused = false;
        for (const resolver of Array.from(this.pauseResolvers)) {
            resolver();
        }
        this.pauseResolvers.clear();
    }

    public advanceStep(): void {
        if (this.stepGateResolver) {
            this.stepGateResolver();
            this.stepGateResolver = null;
            this.stepGateReject = null;
        }
    }

    public abort(): void {
        if (this.aborted) {
            return;
        }
        this.aborted = true;
        this.abortController.abort();
        this.clearStepGate(new RunnerAbortError());
        this.resume();
    }

    public dispose(): void {
        this.abort();
    }

    private async execute(): Promise<void> {
        try {
            await this.runInternal();
        } catch (error) {
            if (error instanceof RunnerAbortError) {
                this.updateState({
                    phase: 'aborted',
                    activeTile: null,
                    error: null,
                });
                return;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.completeStep('error', errorMessage);
            this.updateState({
                phase: 'error',
                activeTile: null,
                error: errorMessage,
            });
        }
    }

    private async beginStep(step: CalibrationStepDescriptor): Promise<void> {
        const waiting: CalibrationStepState = {
            step,
            status: 'waiting',
        };
        this.activeStep = waiting;
        this.emitStepState(waiting);
        if (this.mode === 'step') {
            await this.waitForNextStep();
        }
        const running: CalibrationStepState = {
            step,
            status: 'running',
        };
        this.activeStep = running;
        this.emitStepState(running);
    }

    private waitForNextStep(): Promise<void> {
        if (this.aborted) {
            throw new RunnerAbortError();
        }
        return new Promise<void>((resolve, reject) => {
            this.stepGateResolver = () => {
                this.stepGateResolver = null;
                this.stepGateReject = null;
                resolve();
            };
            this.stepGateReject = (reason) => {
                this.stepGateResolver = null;
                this.stepGateReject = null;
                reject(reason);
            };
        });
    }

    private completeStep(status: CalibrationStepStatus, error?: string): void {
        if (!this.activeStep) {
            return;
        }
        const next: CalibrationStepState = {
            ...this.activeStep,
            status,
            error,
        };
        this.activeStep = next;
        this.emitStepState(next);
    }

    private emitStepState(state: CalibrationStepState): void {
        if (this.onStepStateChange) {
            this.onStepStateChange(state);
        }
    }

    private clearStepGate(error?: unknown): void {
        if (this.stepGateReject) {
            this.stepGateReject(error ?? new RunnerAbortError());
        } else if (this.stepGateResolver) {
            this.stepGateResolver();
        }
        this.stepGateReject = null;
        this.stepGateResolver = null;
    }

    private logCommand(
        hint: string,
        metadata?: Record<string, unknown>,
        tile: TileAddress | null = this.state.activeTile,
        group?: string,
    ): void {
        if (!this.onCommandLog) {
            return;
        }
        this.commandLogCounter += 1;
        const sequence = this.commandLogCounter;
        this.onCommandLog({
            id: `cmd-${Date.now()}-${sequence}`,
            hint,
            phase: this.state.phase,
            tile,
            timestamp: Date.now(),
            sequence,
            group,
            metadata,
        });
    }

    private async runInternal(): Promise<void> {
        this.updateState({ phase: 'homing', error: null });
        await this.beginStep({ kind: 'home-all', label: 'Home all tiles' });
        await this.homeAllMotors();
        this.completeStep('completed');
        await this.checkContinue();

        this.updateState({ phase: 'staging' });
        await this.beginStep({ kind: 'stage-all', label: 'Move tiles aside' });
        await this.stageAllTilesToSide();
        this.completeStep('completed');
        await this.checkContinue();

        this.updateState({ phase: 'measuring' });
        for (const tile of this.calibratableTiles) {
            const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
            await this.beginStep({
                kind: 'measure-tile',
                label: `Measure tile R${tile.row}C${tile.col}`,
                tile: tileAddress,
            });
            await this.checkContinue();
            await this.measureTile(tile);
            const tileState = this.state.tiles[tile.key];
            const status: CalibrationStepStatus =
                tileState?.status === 'failed' ? 'error' : 'completed';
            this.completeStep(status, tileState?.error);
        }

        const summary = this.computeSummary();
        this.applySummaryMetrics(summary);
        this.updateState({
            phase: summary.gridBlueprint ? 'aligning' : 'completed',
            activeTile: null,
            summary,
        });
        if (summary.gridBlueprint) {
            await this.beginStep({
                kind: 'align-grid',
                label: 'Align tiles to inferred grid',
            });
            await this.alignTilesToIdealGrid(summary);
            this.completeStep('completed');
        }
        this.updateState({
            phase: 'completed',
            activeTile: null,
        });
    }

    private async measureTile(tile: TileDescriptor): Promise<void> {
        const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
        const measureGroup = `measure-${tile.key}`;
        this.setTileState(tile.key, { status: 'measuring' });
        this.updateState({ activeTile: tileAddress });

        await this.moveTileToPose(tile, 'home', measureGroup);

        const homeMeasurement = await this.captureMeasurementWithRetries();
        if (!homeMeasurement) {
            const errorMessage = 'Unable to detect blob at home position';
            this.markTileFailed(tile, errorMessage);
            await this.moveTileToPose(tile, 'aside', measureGroup);
            return;
        }

        this.logCommand(
            'Captured home measurement',
            {
                response: homeMeasurement.response,
                size: homeMeasurement.size,
            },
            tileAddress,
            measureGroup,
        );

        const existingMetrics = this.state.tiles[tile.key]?.metrics ?? {};
        const initialMetrics: TileCalibrationMetrics = {
            ...existingMetrics,
            home: homeMeasurement,
            homeOffset: existingMetrics.homeOffset ?? null,
            adjustedHome: existingMetrics.adjustedHome ?? null,
            stepToDisplacement: existingMetrics.stepToDisplacement ?? { x: null, y: null },
            sizeDeltaAtStepTest: existingMetrics.sizeDeltaAtStepTest ?? null,
        };
        this.setTileState(tile.key, {
            metrics: initialMetrics,
            error: undefined,
        });
        this.tileResults.set(tile.key, {
            tile: tileAddress,
            status: 'measuring',
            homeMeasurement,
        });
        this.publishSummarySnapshot();

        const xMotor = tile.assignment.x;
        const yMotor = tile.assignment.y;
        const xDelta = xMotor
            ? getAxisStepDelta('x', this.settings.deltaSteps, this.arrayRotation)
            : null;
        const yDelta = yMotor
            ? getAxisStepDelta('y', this.settings.deltaSteps, this.arrayRotation)
            : null;
        const sizeDeltas: number[] = [];
        const stepToDisplacement: { x: number | null; y: number | null } = {
            x: null,
            y: null,
        };
        let positionedForYMeasurementInParallel = false;

        if (xMotor && xDelta !== null) {
            this.logCommand(
                'Jogging X axis for step test',
                { deltaSteps: xDelta },
                tileAddress,
                measureGroup,
            );
            await this.moveAxisToPosition(xMotor, xDelta, measureGroup);
            const measurement = await this.captureMeasurementWithRetries();
            if (measurement) {
                const displacement = measurement.x - homeMeasurement.x;
                const perStep = displacement / xDelta;
                if (Number.isFinite(perStep)) {
                    stepToDisplacement.x = perStep;
                }
                const sizeDelta = measurement.size - homeMeasurement.size;
                if (Number.isFinite(sizeDelta)) {
                    sizeDeltas.push(sizeDelta);
                }
                this.logCommand(
                    'Captured X step test measurement',
                    {
                        displacement,
                        perStep,
                        size: measurement.size,
                    },
                    tileAddress,
                    measureGroup,
                );
            }
            if (yMotor && yDelta !== null) {
                await this.moveTileAxesToPositions(tile, { x: 0, y: yDelta }, measureGroup);
                positionedForYMeasurementInParallel = true;
            } else {
                await this.moveAxisToPosition(xMotor, 0, measureGroup);
            }
        }

        if (yMotor && yDelta !== null) {
            if (!positionedForYMeasurementInParallel) {
                this.logCommand(
                    'Jogging Y axis for step test',
                    { deltaSteps: yDelta },
                    tileAddress,
                    measureGroup,
                );
                await this.moveAxisToPosition(yMotor, yDelta, measureGroup);
            }
            const measurement = await this.captureMeasurementWithRetries();
            if (measurement) {
                const displacement = measurement.y - homeMeasurement.y;
                const perStep = displacement / yDelta;
                if (Number.isFinite(perStep)) {
                    stepToDisplacement.y = perStep;
                }
                const sizeDelta = measurement.size - homeMeasurement.size;
                if (Number.isFinite(sizeDelta)) {
                    sizeDeltas.push(sizeDelta);
                }
                this.logCommand(
                    'Captured Y step test measurement',
                    {
                        displacement,
                        perStep,
                        size: measurement.size,
                    },
                    tileAddress,
                    measureGroup,
                );
            }
        }

        const sizeDeltaAtStepTest =
            sizeDeltas.length > 0
                ? sizeDeltas.reduce((sum, value) => sum + value, 0) / sizeDeltas.length
                : null;

        const metrics: TileCalibrationMetrics = {
            home: homeMeasurement,
            homeOffset: null,
            adjustedHome: null,
            stepToDisplacement,
            sizeDeltaAtStepTest,
        };
        this.setTileState(tile.key, {
            status: 'completed',
            metrics,
            error: undefined,
        });
        const previousResult = this.tileResults.get(tile.key);
        this.tileResults.set(tile.key, {
            tile: tileAddress,
            status: 'completed',
            homeMeasurement,
            stepToDisplacement: metrics.stepToDisplacement,
            sizeDeltaAtStepTest,
            homeOffset: previousResult?.homeOffset,
            adjustedHome: previousResult?.adjustedHome ?? undefined,
        });
        this.publishSummarySnapshot();
        this.bumpProgress('completed');

        await this.moveTileToPose(tile, 'aside', measureGroup);
    }

    private async homeAllMotors(): Promise<void> {
        const macAddresses = Array.from(
            new Set(
                this.calibratableTiles.flatMap((descriptor) => {
                    const axes = [] as Motor[];
                    if (descriptor.assignment.x) {
                        axes.push(descriptor.assignment.x);
                    }
                    if (descriptor.assignment.y) {
                        axes.push(descriptor.assignment.y);
                    }
                    return axes.map((motor) => motor.nodeMac);
                }),
            ),
        );
        if (macAddresses.length === 0) {
            throw new Error('No motor controllers available for calibration');
        }
        macAddresses.forEach((mac) => {
            this.logCommand(
                `HOME ALL ${formatMacSuffix(mac)}`,
                {
                    mac,
                    action: 'home',
                    targetIds: 'ALL',
                },
                null,
                'homing',
            );
        });
        await this.motorApi.homeAll({ macAddresses });
        this.axisPositions.clear();
        for (const axis of this.axisDescriptors) {
            this.axisPositions.set(axis.key, 0);
        }
    }

    private async stageAllTilesToSide(): Promise<void> {
        await Promise.all(
            this.calibratableTiles.map(async (tile) => {
                await this.checkContinue();
                await this.moveTileToPose(tile, 'aside', 'staging');
                this.setTileState(tile.key, { status: 'staged' });
            }),
        );
    }

    private async moveTileToPose(
        tile: TileDescriptor,
        pose: 'home' | 'aside',
        group?: string,
    ): Promise<void> {
        const targets = this.computePoseTargets(tile, pose);
        const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
        this.logCommand(
            pose === 'home' ? 'Moving tile to home' : 'Moving tile aside',
            {
                pose,
                targets,
            },
            tileAddress,
            group,
        );
        await Promise.all([
            this.moveAxisToPosition(tile.assignment.x, targets.x, group),
            this.moveAxisToPosition(tile.assignment.y, targets.y, group),
        ]);
    }

    private async moveTileAxesToPositions(
        tile: TileDescriptor,
        targets: Partial<Record<Axis, number>>,
        group?: string,
    ): Promise<void> {
        const tasks: Promise<void>[] = [];
        (['x', 'y'] as Axis[]).forEach((axis) => {
            const target = targets[axis];
            if (typeof target !== 'number' || !Number.isFinite(target)) {
                return;
            }
            const motor = tile.assignment[axis];
            if (!motor) {
                return;
            }
            tasks.push(this.moveAxisToPosition(motor, target, group));
        });
        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
    }

    private computePoseTargets(
        tile: TileDescriptor,
        pose: 'home' | 'aside',
    ): {
        x: number;
        y: number;
    } {
        if (pose === 'home') {
            return { x: 0, y: 0 };
        }
        // Compute aside position accounting for array rotation.
        // Goal: move tiles to a consistent visual position (left side from camera view).
        // Baseline: +X = LEFT, so MAX (+1200) = LEFT.
        // At 0° and 90°: X_MAX moves left, at 180° and 270°: X_MIN moves left (inverted).
        const asideX =
            this.arrayRotation === 0 || this.arrayRotation === 90
                ? MOTOR_MAX_POSITION_STEPS
                : MOTOR_MIN_POSITION_STEPS;
        return {
            x: asideX,
            y: this.computeAsideYTarget(tile.col),
        };
    }

    private computeAsideYTarget(column: number): number {
        const totalCols = Math.max(1, this.gridSize.cols);
        if (totalCols === 1) {
            return clampSteps((MOTOR_MAX_POSITION_STEPS + MOTOR_MIN_POSITION_STEPS) / 2);
        }
        const normalizedColumn = column / (totalCols - 1);
        const span = MOTOR_MAX_POSITION_STEPS - MOTOR_MIN_POSITION_STEPS;
        const rawTarget = MOTOR_MIN_POSITION_STEPS + normalizedColumn * span;
        return clampSteps(rawTarget);
    }

    private async moveAxisToPosition(
        motor: Motor | null,
        target: number,
        group?: string,
    ): Promise<void> {
        if (!motor) {
            return;
        }
        const roundedTarget = roundSteps(target);
        const clamped = clampSteps(roundedTarget);
        const axisKey = `${motor.nodeMac}:${motor.motorIndex}`;
        const current = this.axisPositions.get(axisKey);
        if (current === clamped) {
            return;
        }
        const label = formatMotorLabel(motor);
        this.logCommand(
            `MOVE ${label} -> ${clamped}`,
            {
                mac: motor.nodeMac,
                motorId: motor.motorIndex,
                target: clamped,
                previous: current ?? 0,
            },
            null,
            group ?? 'move',
        );
        await this.motorApi.moveMotor({
            mac: motor.nodeMac,
            motorId: motor.motorIndex,
            positionSteps: clamped,
        });
        this.axisPositions.set(axisKey, clamped);
    }

    private async captureMeasurementWithRetries(): Promise<BlobMeasurement | null> {
        for (let attempt = 0; attempt < this.settings.maxDetectionRetries; attempt += 1) {
            await this.checkContinue();
            const measurement = await this.captureMeasurement({
                timeoutMs: this.settings.sampleTimeoutMs,
                signal: this.abortController.signal,
            });
            if (measurement) {
                return measurement;
            }
            await waitWithSignal(this.settings.retryDelayMs, this.abortController.signal);
        }
        return null;
    }

    private applySummaryMetrics(summary: CalibrationRunSummary): void {
        Object.entries(summary.tiles).forEach(([key, result]) => {
            const tileState = this.state.tiles[key];
            if (!tileState || tileState.status !== 'completed') {
                return;
            }
            const previousMetrics = tileState.metrics ?? {};
            const homeMeasurement = previousMetrics.home ?? result.homeMeasurement;
            const homeOffset = result.homeOffset ?? null;
            const adjustedHome =
                homeMeasurement && homeOffset
                    ? {
                          x: homeMeasurement.x - homeOffset.dx,
                          y: homeMeasurement.y - homeOffset.dy,
                      }
                    : (previousMetrics.adjustedHome ?? null);
            const metrics: TileCalibrationMetrics = {
                ...previousMetrics,
                home: homeMeasurement,
                homeOffset,
                adjustedHome,
                stepToDisplacement: result.stepToDisplacement ?? previousMetrics.stepToDisplacement,
                sizeDeltaAtStepTest:
                    result.sizeDeltaAtStepTest !== undefined
                        ? result.sizeDeltaAtStepTest
                        : (previousMetrics.sizeDeltaAtStepTest ?? null),
            };
            this.setTileState(key, { metrics });
        });
    }

    private async alignTilesToIdealGrid(summary: CalibrationRunSummary): Promise<void> {
        if (!summary.gridBlueprint) {
            return;
        }
        const moveTasks: Promise<void>[] = [];
        for (const tile of this.calibratableTiles) {
            await this.checkContinue();
            const result = summary.tiles[tile.key];
            if (!result || result.status !== 'completed' || !result.homeOffset) {
                continue;
            }
            const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
            const targetX = this.computeAlignmentTargetSteps(
                -result.homeOffset.dx,
                result.stepToDisplacement?.x ?? null,
            );
            const targetY = this.computeAlignmentTargetSteps(
                -result.homeOffset.dy,
                result.stepToDisplacement?.y ?? null,
            );
            if (targetX !== null || targetY !== null) {
                this.logCommand(
                    'Aligning tile to inferred grid',
                    { targetX, targetY },
                    tileAddress,
                    `tile-${tile.key}`,
                );
            }
            if (targetX !== null) {
                moveTasks.push(
                    this.moveAxisToPosition(tile.assignment.x, targetX, `tile-${tile.key}`),
                );
            }
            if (targetY !== null) {
                moveTasks.push(
                    this.moveAxisToPosition(tile.assignment.y, targetY, `tile-${tile.key}`),
                );
            }
        }
        if (moveTasks.length > 0) {
            await Promise.all(moveTasks);
        }
    }

    private computeAlignmentTargetSteps(
        displacement: number,
        perStep: number | null,
    ): number | null {
        if (
            perStep === null ||
            perStep === 0 ||
            !Number.isFinite(perStep) ||
            Math.abs(perStep) < 1e-6
        ) {
            return null;
        }
        const rawSteps = displacement / perStep;
        if (!Number.isFinite(rawSteps) || Math.abs(rawSteps) > MOTOR_MAX_POSITION_STEPS) {
            return null;
        }
        return clampSteps(Math.round(rawSteps));
    }

    private async checkContinue(): Promise<void> {
        if (this.aborted) {
            throw new RunnerAbortError();
        }
        if (!this.paused) {
            return;
        }
        if (this.state.phase !== 'paused') {
            this.previousPhase = this.state.phase;
            this.updateState({ phase: 'paused' });
        }
        await new Promise<void>((resolve) => {
            const resolver = () => {
                this.pauseResolvers.delete(resolver);
                resolve();
            };
            this.pauseResolvers.add(resolver);
        });
        if (this.previousPhase) {
            const phase = this.previousPhase;
            this.previousPhase = null;
            this.updateState({ phase });
        }
        if (this.aborted) {
            throw new RunnerAbortError();
        }
    }

    private markTileFailed(tile: TileDescriptor, message: string): void {
        const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
        this.setTileState(tile.key, {
            status: 'failed',
            error: message,
        });
        this.tileResults.set(tile.key, {
            tile: tileAddress,
            status: 'failed',
            error: message,
        });
        this.publishSummarySnapshot();
        this.bumpProgress('failed');
        this.logCommand('Tile calibration failed', { message }, tileAddress);
    }

    private bumpProgress(kind: 'completed' | 'failed'): void {
        this.state = {
            ...this.state,
            progress: {
                ...this.state.progress,
                [kind]: this.state.progress[kind] + 1,
            },
        };
        this.emitState();
    }

    private setTileState(key: string, patch: Partial<TileRunState>): void {
        const current = this.state.tiles[key];
        if (!current) {
            return;
        }
        const next: TileRunState = {
            ...current,
            ...patch,
            tile: current.tile,
        };
        this.state = {
            ...this.state,
            tiles: {
                ...this.state.tiles,
                [key]: next,
            },
        };
        this.emitState();
    }

    private updateState(patch: Partial<CalibrationRunnerState>): void {
        this.state = {
            ...this.state,
            ...patch,
            tiles: patch.tiles ?? this.state.tiles,
            progress: patch.progress ?? this.state.progress,
        };
        this.emitState();
    }

    private emitState(): void {
        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    private computeSummary(): CalibrationRunSummary {
        const measuredTiles = Array.from(this.tileResults.values()).filter(
            (entry) =>
                (entry.status === 'completed' || entry.status === 'measuring') &&
                entry.homeMeasurement,
        );
        let gridBlueprint: CalibrationGridBlueprint | null = null;
        if (measuredTiles.length > 0) {
            const largestSize = measuredTiles.reduce((max, entry) => {
                const size = entry.homeMeasurement?.size ?? 0;
                return size > max ? size : max;
            }, 0);
            const tileWidth = largestSize;
            const tileHeight = largestSize;
            const normalizedGap = Math.max(0, Math.min(1, this.settings.gridGapNormalized)) * 2;
            const gapX = normalizedGap;
            const gapY = normalizedGap;
            let spacingX = tileWidth + gapX;
            let spacingY = tileHeight + gapY;
            let totalWidth = this.gridSize.cols * tileWidth + (this.gridSize.cols - 1) * gapX;
            let totalHeight = this.gridSize.rows * tileHeight + (this.gridSize.rows - 1) * gapY;
            if (totalWidth > 2 || totalHeight > 2) {
                // Scaling logic removed to preserve isotropic aspect ratio.
                // If the grid is too large, it will simply extend beyond the [-1, 1] bounds,
                // which is acceptable for the coordinate system (it just means it's larger than the view).
            }
            let originX = 0;
            let originY = 0;
            let minOriginX = Number.POSITIVE_INFINITY;
            let minOriginY = Number.POSITIVE_INFINITY;
            measuredTiles.forEach((entry) => {
                const measurement = entry.homeMeasurement;
                if (!measurement) {
                    return;
                }
                const candidateX = measurement.x - (entry.tile.col * spacingX + tileWidth / 2);
                const candidateY = measurement.y - (entry.tile.row * spacingY + tileHeight / 2);
                if (candidateX < minOriginX) {
                    minOriginX = candidateX;
                }
                if (candidateY < minOriginY) {
                    minOriginY = candidateY;
                }
            });
            if (Number.isFinite(minOriginX)) {
                originX = minOriginX;
            }
            if (Number.isFinite(minOriginY)) {
                originY = minOriginY;
            }
            const cameraOriginOffset = {
                x: originX + totalWidth / 2,
                y: originY + totalHeight / 2,
            };
            originX -= cameraOriginOffset.x;
            originY -= cameraOriginOffset.y;
            gridBlueprint = {
                adjustedTileFootprint: {
                    width: tileWidth,
                    height: tileHeight,
                },
                tileGap: { x: gapX, y: gapY },
                gridOrigin: { x: originX, y: originY },
                cameraOriginOffset,
            };
        }

        const spacingX = gridBlueprint
            ? gridBlueprint.adjustedTileFootprint.width + gridBlueprint.tileGap.x
            : 0;
        const spacingY = gridBlueprint
            ? gridBlueprint.adjustedTileFootprint.height + gridBlueprint.tileGap.y
            : 0;

        const recenterMeasurement = gridBlueprint
            ? (measurement: BlobMeasurement): BlobMeasurement => {
                  const recenteredStats = measurement.stats
                      ? {
                            ...measurement.stats,
                            median: {
                                ...measurement.stats.median,
                                x: measurement.stats.median.x - gridBlueprint.cameraOriginOffset.x,
                                y: measurement.stats.median.y - gridBlueprint.cameraOriginOffset.y,
                            },
                        }
                      : undefined;
                  return {
                      ...measurement,
                      x: measurement.x - gridBlueprint.cameraOriginOffset.x,
                      y: measurement.y - gridBlueprint.cameraOriginOffset.y,
                      stats: recenteredStats,
                  };
              }
            : null;

        const summaryTiles: Record<string, TileCalibrationResult> = {};
        for (const [key, result] of this.tileResults.entries()) {
            const normalizedMeasurement =
                recenterMeasurement && result.homeMeasurement
                    ? recenterMeasurement(result.homeMeasurement)
                    : (result.homeMeasurement ?? null);
            let tileSummary: TileCalibrationResult = normalizedMeasurement
                ? { ...result, homeMeasurement: normalizedMeasurement }
                : result;
            if (result.status !== 'completed' || !normalizedMeasurement || !gridBlueprint) {
                summaryTiles[key] = tileSummary;
                continue;
            }
            const tile = result.tile;
            const adjustedCenterX =
                gridBlueprint.gridOrigin.x +
                tile.col * spacingX +
                gridBlueprint.adjustedTileFootprint.width / 2;
            const adjustedCenterY =
                gridBlueprint.gridOrigin.y +
                tile.row * spacingY +
                gridBlueprint.adjustedTileFootprint.height / 2;
            const dx = normalizedMeasurement.x - adjustedCenterX;
            const dy = normalizedMeasurement.y - adjustedCenterY;
            tileSummary = {
                ...tileSummary,
                homeOffset: { dx, dy },
                adjustedHome: { x: adjustedCenterX, y: adjustedCenterY },
            };
            summaryTiles[key] = tileSummary;
        }
        return {
            gridBlueprint,
            stepTestSettings: {
                deltaSteps: this.settings.deltaSteps,
            },
            tiles: summaryTiles,
        };
    }

    private publishSummarySnapshot(): void {
        const summary = this.computeSummary();
        this.updateState({ summary });
    }
}
