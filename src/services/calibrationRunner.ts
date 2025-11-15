import {
    DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    type CalibrationRunnerSettings,
} from '@/constants/calibration';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { MotorCommandApi } from '@/hooks/useMotorCommands';
import type { MirrorAssignment, MirrorConfig, Motor } from '@/types';

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

export interface BlobMeasurement {
    x: number;
    y: number;
    size: number;
    response: number;
    capturedAt: number;
    sourceWidth?: number;
    sourceHeight?: number;
}

export type CaptureBlobMeasurement = (params: {
    timeoutMs: number;
    signal?: AbortSignal;
    expectedPosition?: { x: number; y: number };
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
    idealTarget?: { x: number; y: number } | null;
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

export interface CalibrationGridBlueprint {
    idealTileFootprint: { width: number; height: number };
    tileGap: { x: number; y: number };
    gridOrigin: { x: number; y: number };
}

export interface TileCalibrationResult {
    tile: TileAddress;
    status: 'completed' | 'failed' | 'skipped';
    error?: string;
    homeMeasurement?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number };
    idealTarget?: { x: number; y: number };
    stepToDisplacement?: { x: number | null; y: number | null };
    sizeDeltaAtStepTest?: number | null;
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

export interface CalibrationRunnerParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    motorApi: MotorCommandApi;
    captureMeasurement: CaptureBlobMeasurement;
    settings?: Partial<CalibrationRunnerSettings>;
    onStateChange?: (state: CalibrationRunnerState) => void;
}

const clampSteps = (value: number): number =>
    Math.min(MOTOR_MAX_POSITION_STEPS, Math.max(MOTOR_MIN_POSITION_STEPS, value));

const roundSteps = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round(value);
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

    private readonly descriptors: TileDescriptor[];

    private readonly calibratableTiles: TileDescriptor[];

    private readonly axisDescriptors: AxisDescriptor[];

    private readonly onStateChange?: (state: CalibrationRunnerState) => void;

    private state: CalibrationRunnerState;

    private runPromise: Promise<void> | null = null;

    private readonly abortController = new AbortController();

    private paused = false;

    private aborted = false;

    private readonly pauseResolvers = new Set<() => void>();

    private previousPhase: CalibrationRunnerPhase | null = null;

    private readonly axisPositions = new Map<string, number>();

    private readonly tileResults = new Map<string, TileCalibrationResult>();

    constructor(params: CalibrationRunnerParams) {
        this.gridSize = params.gridSize;
        this.motorApi = params.motorApi;
        this.captureMeasurement = params.captureMeasurement;
        this.settings = { ...DEFAULT_CALIBRATION_RUNNER_SETTINGS, ...params.settings };
        this.onStateChange = params.onStateChange;

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

    public abort(): void {
        if (this.aborted) {
            return;
        }
        this.aborted = true;
        this.abortController.abort();
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
            this.updateState({
                phase: 'error',
                activeTile: null,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async runInternal(): Promise<void> {
        this.updateState({ phase: 'homing', error: null });
        await this.homeAllMotors();
        await this.checkContinue();

        this.updateState({ phase: 'staging' });
        await this.stageAllTilesToSide();
        await this.checkContinue();

        this.updateState({ phase: 'measuring' });
        for (const tile of this.calibratableTiles) {
            await this.checkContinue();
            await this.measureTile(tile);
        }

        const summary = this.computeSummary();
        this.applySummaryMetrics(summary);
        this.updateState({
            phase: summary.gridBlueprint ? 'aligning' : 'completed',
            activeTile: null,
            summary,
        });
        if (summary.gridBlueprint) {
            await this.alignTilesToIdealGrid(summary);
        }
        this.updateState({
            phase: 'completed',
            activeTile: null,
        });
    }

    private async measureTile(tile: TileDescriptor): Promise<void> {
        const tileAddress: TileAddress = { row: tile.row, col: tile.col, key: tile.key };
        this.setTileState(tile.key, { status: 'measuring' });
        this.updateState({ activeTile: tileAddress });

        await this.moveTileToPose(tile, 'home');

        const previousResult = this.tileResults.get(tile.key);
        const priorMeasurement = previousResult?.homeMeasurement ?? null;
        const homeMeasurement = await this.captureMeasurementWithRetries(priorMeasurement);
        if (!homeMeasurement) {
            const errorMessage = 'Unable to detect blob at home position';
            this.markTileFailed(tile, errorMessage);
            await this.moveTileToPose(tile, 'measured');
            return;
        }

        const stepX = await this.runStepCharacterization(tile, 'x', homeMeasurement);
        const stepY = await this.runStepCharacterization(tile, 'y', homeMeasurement);

        const sizeDeltas = [stepX?.sizeDelta, stepY?.sizeDelta].filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value),
        );
        const sizeDeltaAtStepTest =
            sizeDeltas.length > 0
                ? sizeDeltas.reduce((sum, value) => sum + value, 0) / sizeDeltas.length
                : null;

        const metrics: TileCalibrationMetrics = {
            home: homeMeasurement,
            homeOffset: null,
            idealTarget: null,
            stepToDisplacement: {
                x: stepX?.perStep ?? null,
                y: stepY?.perStep ?? null,
            },
            sizeDeltaAtStepTest,
        };
        this.setTileState(tile.key, {
            status: 'completed',
            metrics,
            error: undefined,
        });
        this.tileResults.set(tile.key, {
            tile: tileAddress,
            status: 'completed',
            homeMeasurement,
            stepToDisplacement: metrics.stepToDisplacement,
            sizeDeltaAtStepTest,
        });
        this.publishSummarySnapshot();
        this.bumpProgress('completed');

        await this.moveTileToPose(tile, 'measured');
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
                await this.moveTileToPose(tile, 'aside');
                this.setTileState(tile.key, { status: 'staged' });
            }),
        );
    }

    private async moveTileToPose(
        tile: TileDescriptor,
        pose: 'home' | 'aside' | 'measured',
    ): Promise<void> {
        const targets = this.computePoseTargets(tile, pose);
        await Promise.all([
            this.moveAxisToPosition(tile.assignment.x, targets.x),
            this.moveAxisToPosition(tile.assignment.y, targets.y),
        ]);
    }

    private computePoseTargets(
        tile: TileDescriptor,
        pose: 'home' | 'aside' | 'measured',
    ): {
        x: number;
        y: number;
    } {
        if (pose === 'home') {
            return { x: 0, y: 0 };
        }
        const direction = pose === 'aside' ? 1 : -1;
        const base = this.settings.moveAsideBaseSteps;
        const xOffset = clampSteps(
            direction * (base + tile.row * this.settings.moveAsideRowSpreadSteps),
        );
        const centeredCol = tile.col - (this.gridSize.cols - 1) / 2;
        const yOffset = clampSteps(centeredCol * this.settings.moveAsideColSpreadSteps);
        return {
            x: xOffset,
            y: yOffset,
        };
    }

    private async moveAxisToPosition(motor: Motor | null, target: number): Promise<void> {
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
        await this.motorApi.moveMotor({
            mac: motor.nodeMac,
            motorId: motor.motorIndex,
            positionSteps: clamped,
        });
        this.axisPositions.set(axisKey, clamped);
    }

    private async captureMeasurementWithRetries(
        expectedPosition?: { x: number; y: number } | null,
    ): Promise<BlobMeasurement | null> {
        for (let attempt = 0; attempt < this.settings.maxDetectionRetries; attempt += 1) {
            await this.checkContinue();
            const measurement = await this.captureMeasurement({
                timeoutMs: this.settings.sampleTimeoutMs,
                signal: this.abortController.signal,
                expectedPosition: expectedPosition ?? undefined,
            });
            if (measurement) {
                return measurement;
            }
            await waitWithSignal(this.settings.retryDelayMs, this.abortController.signal);
        }
        return null;
    }

    private async runStepCharacterization(
        tile: TileDescriptor,
        axis: Axis,
        referenceMeasurement: BlobMeasurement,
    ): Promise<{ perStep: number; sizeDelta: number } | null> {
        const motor = tile.assignment[axis];
        if (!motor) {
            return null;
        }
        if (this.settings.deltaSteps <= 0) {
            return null;
        }
        const delta = clampSteps(this.settings.deltaSteps);
        await this.moveAxisToPosition(motor, delta);
        const measurement = await this.captureMeasurementWithRetries(referenceMeasurement);
        await this.moveAxisToPosition(motor, 0);
        if (!measurement) {
            return null;
        }
        const displacement =
            axis === 'x'
                ? measurement.x - referenceMeasurement.x
                : measurement.y - referenceMeasurement.y;
        const perStep = displacement / this.settings.deltaSteps;
        const sizeDelta = measurement.size - referenceMeasurement.size;
        return { perStep, sizeDelta };
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
            const idealTarget =
                homeMeasurement && homeOffset
                    ? {
                          x: homeMeasurement.x - homeOffset.dx,
                          y: homeMeasurement.y - homeOffset.dy,
                      }
                    : (previousMetrics.idealTarget ?? null);
            const metrics: TileCalibrationMetrics = {
                ...previousMetrics,
                home: homeMeasurement,
                homeOffset,
                idealTarget,
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
        for (const tile of this.calibratableTiles) {
            await this.checkContinue();
            const result = summary.tiles[tile.key];
            if (!result || result.status !== 'completed' || !result.homeOffset) {
                continue;
            }
            const targetX = this.computeAlignmentTargetSteps(
                -result.homeOffset.dx,
                result.stepToDisplacement?.x ?? null,
            );
            const targetY = this.computeAlignmentTargetSteps(
                -result.homeOffset.dy,
                result.stepToDisplacement?.y ?? null,
            );
            if (targetX !== null) {
                await this.moveAxisToPosition(tile.assignment.x, targetX);
            }
            if (targetY !== null) {
                await this.moveAxisToPosition(tile.assignment.y, targetY);
            }
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
        this.setTileState(tile.key, {
            status: 'failed',
            error: message,
        });
        this.tileResults.set(tile.key, {
            tile: { row: tile.row, col: tile.col, key: tile.key },
            status: 'failed',
            error: message,
        });
        this.publishSummarySnapshot();
        this.bumpProgress('failed');
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
        const completedTiles = Array.from(this.tileResults.values()).filter(
            (entry) => entry.status === 'completed' && entry.homeMeasurement,
        );
        let gridBlueprint: CalibrationGridBlueprint | null = null;
        if (completedTiles.length > 0) {
            const largestSize = completedTiles.reduce((max, entry) => {
                const size = entry.homeMeasurement?.size ?? 0;
                return size > max ? size : max;
            }, 0);
            const referenceMeasurement =
                completedTiles.find((entry) => entry.homeMeasurement)?.homeMeasurement ?? null;
            const referenceWidth = referenceMeasurement?.sourceWidth ?? 1;
            const referenceHeight = referenceMeasurement?.sourceHeight ?? 1;
            const dominantDimension = Math.max(referenceWidth, referenceHeight, 1);
            const normalizeX = referenceWidth > 0 ? dominantDimension / referenceWidth : 1;
            const normalizeY = referenceHeight > 0 ? dominantDimension / referenceHeight : 1;
            const baseGap = Math.max(0, Math.min(1, this.settings.gridGapNormalized));
            let tileWidth = largestSize * normalizeX;
            let tileHeight = largestSize * normalizeY;
            let gapX = baseGap * normalizeX;
            let gapY = baseGap * normalizeY;
            let spacingX = tileWidth + gapX;
            let spacingY = tileHeight + gapY;
            const totalWidth = this.gridSize.cols * tileWidth + (this.gridSize.cols - 1) * gapX;
            const totalHeight = this.gridSize.rows * tileHeight + (this.gridSize.rows - 1) * gapY;
            if (totalWidth > 1 || totalHeight > 1) {
                const scale = 1 / Math.max(totalWidth, totalHeight);
                tileWidth *= scale;
                tileHeight *= scale;
                gapX *= scale;
                gapY *= scale;
                spacingX = tileWidth + gapX;
                spacingY = tileHeight + gapY;
            }
            let originX = 0;
            let originY = 0;
            let minOriginX = Number.POSITIVE_INFINITY;
            let minOriginY = Number.POSITIVE_INFINITY;
            completedTiles.forEach((entry) => {
                const measurement = entry.homeMeasurement;
                if (!measurement) {
                    return;
                }
                const mirroredCol = this.gridSize.cols - 1 - entry.tile.col;
                const candidateX = measurement.x - (mirroredCol * spacingX + tileWidth / 2);
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
            gridBlueprint = {
                idealTileFootprint: {
                    width: tileWidth,
                    height: tileHeight,
                },
                tileGap: { x: gapX, y: gapY },
                gridOrigin: { x: originX, y: originY },
            };
        }

        const spacingX = gridBlueprint
            ? gridBlueprint.idealTileFootprint.width + gridBlueprint.tileGap.x
            : 0;
        const spacingY = gridBlueprint
            ? gridBlueprint.idealTileFootprint.height + gridBlueprint.tileGap.y
            : 0;

        const summaryTiles: Record<string, TileCalibrationResult> = {};
        for (const [key, result] of this.tileResults.entries()) {
            if (result.status !== 'completed' || !result.homeMeasurement || !gridBlueprint) {
                summaryTiles[key] = result;
                continue;
            }
            const tile = result.tile;
            const mirroredCol = this.gridSize.cols - 1 - tile.col;
            const idealCenterX =
                gridBlueprint.gridOrigin.x +
                mirroredCol * spacingX +
                gridBlueprint.idealTileFootprint.width / 2;
            const idealCenterY =
                gridBlueprint.gridOrigin.y +
                tile.row * spacingY +
                gridBlueprint.idealTileFootprint.height / 2;
            const dx = result.homeMeasurement.x - idealCenterX;
            const dy = result.homeMeasurement.y - idealCenterY;
            summaryTiles[key] = {
                ...result,
                homeOffset: { dx, dy },
                idealTarget: { x: idealCenterX, y: idealCenterY },
            };
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
