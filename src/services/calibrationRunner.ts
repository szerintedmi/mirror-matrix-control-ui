import {
    DEFAULT_CALIBRATION_RUNNER_SETTINGS,
    DEFAULT_ROI,
    type CalibrationRunnerSettings,
} from '@/constants/calibration';
import type { MotorCommandApi } from '@/hooks/useMotorCommands';
import {
    computeExpectedBlobPosition as computeExpectedBlobPositionFn,
    computePoseTargets,
    computeCalibrationSummary,
    clampSteps,
    roundSteps,
    getAxisStepDelta,
    computeAxisStepTestResult,
    combineStepTestResults,
    computeAlignmentTargetSteps,
    type Axis,
    type TileMeasurement,
    type StagingConfig,
    type TileCalibrationResult as TileCalibrationResultFromModule,
    type AxisStepTestResult,
} from '@/services/calibration';
import { type CommandFailure } from '@/services/pendingCommandTracker';
import type {
    ArrayRotation,
    BlobMeasurement,
    CalibrationGridBlueprint,
    CalibrationProfileBounds,
    MirrorAssignment,
    MirrorConfig,
    Motor,
    NormalizedRoi,
    StagingPosition,
} from '@/types';
import type { CommandErrorContext } from '@/types/commandError';
import { centeredToView } from '@/utils/centeredCoordinates';
import { extractCommandErrorDetail } from '@/utils/commandErrors';
import { asCentered, rawCoords } from '@/utils/coordinates';

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

export interface CaptureBlobMeasurementParams {
    timeoutMs: number;
    signal?: AbortSignal;
    /** Expected blob position in viewport coordinates (0 to 1). If provided, selects closest blob. */
    expectedPosition?: { x: number; y: number };
    /** Maximum distance from expected position to accept a blob (viewport units). */
    maxDistance?: number;
}

export type CaptureBlobMeasurement = (
    params: CaptureBlobMeasurementParams,
) => Promise<BlobMeasurement | null>;

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
    /** Non-fatal warnings (e.g., step test failures) */
    warnings?: string[];
    metrics?: TileCalibrationMetrics;
    assignment: MirrorAssignment;
}

export interface TileCalibrationResult {
    tile: TileAddress;
    status: 'measuring' | 'completed' | 'failed' | 'skipped';
    error?: string;
    /** Non-fatal warnings (e.g., step test failures) */
    warnings?: string[];
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

export type CalibrationStepKind =
    | 'home-all'
    | 'stage-all'
    | 'measure-home'
    | 'step-test-x'
    | 'step-test-y'
    | 'align-grid';

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
    /**
     * Position where tiles are moved during staging phase.
     * - 'corner': All tiles to bottom-left corner (default)
     * - 'bottom': Tiles distributed horizontally along bottom edge
     * - 'left': Tiles distributed vertically along left edge
     */
    stagingPosition?: StagingPosition;
    /**
     * Camera aspect ratio (width / height). Used to compute expected blob positions
     * that account for isotropic coordinate space limitations.
     * Defaults to 16/9 (1.778) if not specified.
     */
    cameraAspectRatio?: number;
    /**
     * ROI (Region of Interest) settings. Used to compute expected blob position
     * for the first tile when no prior measurements exist.
     */
    roi?: NormalizedRoi;
    onStateChange?: (state: CalibrationRunnerState) => void;
    mode?: CalibrationRunnerMode;
    onStepStateChange?: (state: CalibrationStepState) => void;
    onCommandLog?: (entry: CalibrationCommandLogEntry) => void;
    /** Callback for motor command errors with structured error details for toast display */
    onCommandError?: (context: CommandErrorContext) => void;
    /** Callback for tile-level errors (detection failures, calibration errors) */
    onTileError?: (row: number, col: number, message: string) => void;
}

class RunnerAbortError extends Error {
    constructor(message = 'Calibration run aborted') {
        super(message);
        this.name = 'RunnerAbortError';
    }
}

const isCommandFailure = (error: unknown): error is CommandFailure =>
    error !== null &&
    typeof error === 'object' &&
    'kind' in error &&
    'command' in error &&
    typeof (error as CommandFailure).kind === 'string';

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

    private readonly stagingPosition: StagingPosition;

    private readonly cameraAspectRatio: number;

    private readonly roi: NormalizedRoi;

    private readonly descriptors: TileDescriptor[];

    private readonly calibratableTiles: TileDescriptor[];

    private readonly axisDescriptors: AxisDescriptor[];

    private readonly onStateChange?: (state: CalibrationRunnerState) => void;

    private readonly mode: CalibrationRunnerMode;

    private readonly onStepStateChange?: (state: CalibrationStepState) => void;

    private readonly onCommandLog?: (entry: CalibrationCommandLogEntry) => void;

    private readonly onCommandError?: (context: CommandErrorContext) => void;

    private readonly onTileError?: (row: number, col: number, message: string) => void;

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
        this.stagingPosition = params.stagingPosition ?? 'corner';
        this.cameraAspectRatio = params.cameraAspectRatio ?? 16 / 9;
        this.roi = params.roi ?? DEFAULT_ROI;
        this.onStateChange = params.onStateChange;
        this.mode = params.mode ?? 'auto';
        this.onStepStateChange = params.onStepStateChange;
        this.onCommandLog = params.onCommandLog;
        this.onCommandError = params.onCommandError;
        this.onTileError = params.onTileError;

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
            await this.completeStep('error', errorMessage);
            this.updateState({
                phase: 'error',
                activeTile: null,
                error: errorMessage,
            });

            // Emit structured error for toast display if it's a motor command failure
            if (this.onCommandError && isCommandFailure(error)) {
                const detail = extractCommandErrorDetail(error);
                this.onCommandError({
                    title: 'Calibration',
                    totalCount: 1,
                    errors: [detail],
                });
            }
        }
    }

    private beginStep(step: CalibrationStepDescriptor): void {
        // Just emit "running" state - no waiting here
        // Waiting happens in completeStep() after action is done
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

    private async completeStep(status: CalibrationStepStatus, error?: string): Promise<void> {
        if (!this.activeStep) {
            return;
        }
        const completed: CalibrationStepState = {
            ...this.activeStep,
            status,
            error,
        };
        this.activeStep = completed;
        this.emitStepState(completed);

        // In step mode, wait for user to advance after viewing results
        if (this.mode === 'step' && status === 'completed') {
            // Emit 'waiting' status so UI knows to enable "Next" button
            const waiting: CalibrationStepState = {
                ...this.activeStep,
                status: 'waiting',
            };
            this.activeStep = waiting;
            this.emitStepState(waiting);

            await this.waitForNextStep();
        }
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
        // === HOME ALL ===
        this.updateState({ phase: 'homing', error: null });
        this.beginStep({ kind: 'home-all', label: 'Home all tiles' });
        await this.homeAllMotors();
        await this.completeStep('completed'); // PAUSE - user sees homing complete
        await this.checkContinue();

        // === STAGE ALL ===
        this.updateState({ phase: 'staging' });
        this.beginStep({ kind: 'stage-all', label: 'Move tiles aside' });
        await this.stageAllTilesToSide();
        await this.completeStep('completed'); // PAUSE - user sees all tiles staged
        await this.checkContinue();

        // === MEASURE TILES ===
        this.updateState({ phase: 'measuring' });
        for (const tile of this.calibratableTiles) {
            await this.checkContinue();
            // measureTile manages its own steps internally (measure-home, step-test-x, step-test-y)
            await this.measureTile(tile);
        }

        // === ALIGN ===
        const summary = this.computeSummary();
        this.applySummaryMetrics(summary);
        this.updateState({
            phase: summary.gridBlueprint ? 'aligning' : 'completed',
            activeTile: null,
            summary,
        });
        if (summary.gridBlueprint) {
            this.beginStep({
                kind: 'align-grid',
                label: 'Align tiles to inferred grid',
            });
            await this.alignTilesToIdealGrid(summary);
            await this.completeStep('completed');
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

        // === HOME MEASUREMENT ===
        // Step starts immediately, does work, then pauses at completeStep for user to see results
        this.beginStep({
            kind: 'measure-home',
            label: `Home measurement R${tile.row}C${tile.col}`,
            tile: tileAddress,
        });

        // Calculate expected position (will be displayed during capture)
        const completedMeasurements = this.getCompletedTileMeasurements();
        const isFirstTile = completedMeasurements.length === 0;
        const expectedPositionCoord = computeExpectedBlobPositionFn(
            tile.row,
            tile.col,
            completedMeasurements,
            {
                gridSize: this.gridSize,
                arrayRotation: this.arrayRotation,
                roi: this.roi,
            },
        );
        const expectedPosition = rawCoords(expectedPositionCoord);
        const homeTolerance = isFirstTile
            ? this.settings.firstTileTolerance
            : this.settings.maxBlobDistanceThreshold;

        // Move tile to home position
        await this.moveTileToPose(tile, 'home', measureGroup);

        // Capture measurement (expected circle is shown via captureMeasurement callback)
        console.log('[CalibrationRunner] Home expected position (view 0-1):', expectedPosition);
        const homeResult = await this.captureMeasurementWithRetries(
            expectedPosition,
            homeTolerance,
        );

        if (!homeResult.measurement) {
            const errorMessage = homeResult.error ?? 'Unable to detect blob at home position';
            await this.completeStep('error', errorMessage);
            this.markTileFailed(tile, errorMessage);
            await this.moveTileToPose(tile, 'aside', measureGroup);
            return;
        }
        const homeMeasurement = homeResult.measurement;

        this.logCommand(
            'Captured home measurement',
            {
                response: homeMeasurement.response,
                size: homeMeasurement.size,
            },
            tileAddress,
            measureGroup,
        );

        // Update state with results (visible on UI while paused)
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

        // PAUSE - User sees: expected circle + home measurement result + grid calculation
        await this.completeStep('completed');

        // === X STEP TEST ===
        const xMotor = tile.assignment.x;
        const yMotor = tile.assignment.y;
        const xDelta = xMotor
            ? getAxisStepDelta('x', this.settings.deltaSteps, this.arrayRotation)
            : null;
        const yDelta = yMotor
            ? getAxisStepDelta('y', this.settings.deltaSteps, this.arrayRotation)
            : null;
        const stepTestWarnings: string[] = [];
        let xStepResult: AxisStepTestResult | null = null;
        let yStepResult: AxisStepTestResult | null = null;

        if (xMotor && xDelta !== null) {
            this.beginStep({
                kind: 'step-test-x',
                label: `X step test R${tile.row}C${tile.col}`,
                tile: tileAddress,
            });

            // Move to X jog position
            this.logCommand(
                'Jogging X axis for step test',
                { deltaSteps: xDelta },
                tileAddress,
                measureGroup,
            );
            await this.moveAxisToPosition(xMotor, xDelta, measureGroup);

            // Capture X measurement (expected circle shown near home position)
            const xExpected = {
                x: centeredToView(homeMeasurement.x),
                y: centeredToView(homeMeasurement.y),
            };
            console.log(
                '[CalibrationRunner] X step test expected (view 0-1):',
                xExpected,
                'from home (centered):',
                { x: homeMeasurement.x, y: homeMeasurement.y },
            );
            const xCaptureResult = await this.captureMeasurementWithRetries(xExpected);

            if (xCaptureResult.measurement) {
                xStepResult = computeAxisStepTestResult(
                    homeMeasurement,
                    xCaptureResult.measurement,
                    'x',
                    xDelta,
                );
                this.logCommand(
                    'Captured X step test measurement',
                    {
                        displacement: xStepResult.displacement,
                        perStep: xStepResult.perStep,
                        size: xCaptureResult.measurement.size,
                    },
                    tileAddress,
                    measureGroup,
                );
            } else if (xCaptureResult.error) {
                const warning = `X step test: ${xCaptureResult.error}`;
                stepTestWarnings.push(warning);
                this.onTileError?.(tile.row, tile.col, warning);
            }

            // Move X back to home position
            await this.moveAxisToPosition(xMotor, 0, measureGroup);

            // PAUSE - User sees X result
            await this.completeStep('completed');
        }

        // === Y STEP TEST ===
        if (yMotor && yDelta !== null) {
            this.beginStep({
                kind: 'step-test-y',
                label: `Y step test R${tile.row}C${tile.col}`,
                tile: tileAddress,
            });

            // Move to Y jog position
            this.logCommand(
                'Jogging Y axis for step test',
                { deltaSteps: yDelta },
                tileAddress,
                measureGroup,
            );
            await this.moveAxisToPosition(yMotor, yDelta, measureGroup);

            // Capture Y measurement
            const yExpected = {
                x: centeredToView(homeMeasurement.x),
                y: centeredToView(homeMeasurement.y),
            };
            console.log('[CalibrationRunner] Y step test expected (view 0-1):', yExpected);
            const yCaptureResult = await this.captureMeasurementWithRetries(yExpected);

            if (yCaptureResult.measurement) {
                yStepResult = computeAxisStepTestResult(
                    homeMeasurement,
                    yCaptureResult.measurement,
                    'y',
                    yDelta,
                );
                this.logCommand(
                    'Captured Y step test measurement',
                    {
                        displacement: yStepResult.displacement,
                        perStep: yStepResult.perStep,
                        size: yCaptureResult.measurement.size,
                    },
                    tileAddress,
                    measureGroup,
                );
            } else if (yCaptureResult.error) {
                const warning = `Y step test: ${yCaptureResult.error}`;
                stepTestWarnings.push(warning);
                this.onTileError?.(tile.row, tile.col, warning);
            }

            // PAUSE - User sees Y result
            await this.completeStep('completed');
        }

        // === FINALIZE TILE ===
        const { stepToDisplacement, sizeDeltaAtStepTest } = combineStepTestResults(
            xStepResult,
            yStepResult,
        );

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
            warnings: stepTestWarnings.length > 0 ? stepTestWarnings : undefined,
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
            warnings: stepTestWarnings.length > 0 ? stepTestWarnings : undefined,
        });
        this.publishSummarySnapshot();
        this.bumpProgress('completed');

        // Move tile back to staging (no pause after - continues to next tile)
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
        const stagingConfig: StagingConfig = {
            gridSize: this.gridSize,
            arrayRotation: this.arrayRotation,
            stagingPosition: this.stagingPosition,
        };
        const targets = computePoseTargets(tile, pose, stagingConfig);
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

    private async captureMeasurementWithRetries(
        expectedPosition?: { x: number; y: number },
        maxDistanceOverride?: number,
    ): Promise<{
        measurement: BlobMeasurement | null;
        error?: string;
    }> {
        const maxDistance = maxDistanceOverride ?? this.settings.maxBlobDistanceThreshold;
        let lastError: string | undefined;
        for (let attempt = 0; attempt < this.settings.maxDetectionRetries; attempt += 1) {
            await this.checkContinue();
            try {
                const measurement = await this.captureMeasurement({
                    timeoutMs: this.settings.sampleTimeoutMs,
                    signal: this.abortController.signal,
                    expectedPosition,
                    maxDistance,
                });
                if (measurement) {
                    return { measurement };
                }
                lastError = expectedPosition
                    ? `No blob detected within ${maxDistance.toFixed(2)} of expected position`
                    : 'No blob detected';
            } catch (error) {
                // Capture error message (e.g., "Blob measurement unstable: ...")
                lastError = error instanceof Error ? error.message : String(error);
                // Re-throw abort errors
                if (error instanceof RunnerAbortError) {
                    throw error;
                }
                if (error instanceof Error && error.message.includes('aborted')) {
                    throw error;
                }
            }
            await waitWithSignal(this.settings.retryDelayMs, this.abortController.signal);
        }
        return { measurement: null, error: lastError };
    }

    /**
     * Get all tiles that have completed home measurements.
     * Returns measurements in centered coordinates as required by expectedPosition module.
     */
    private getCompletedTileMeasurements(): TileMeasurement[] {
        const measurements: TileMeasurement[] = [];

        for (const [key, tileState] of Object.entries(this.state.tiles)) {
            if (tileState.status === 'completed' && tileState.metrics?.home) {
                const [rowStr, colStr] = key.split('-');
                measurements.push({
                    row: parseInt(rowStr, 10),
                    col: parseInt(colStr, 10),
                    // Home measurements are already in centered coords (-1 to 1)
                    position: asCentered(tileState.metrics.home.x, tileState.metrics.home.y),
                });
            }
        }

        return measurements;
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
            const targetX = computeAlignmentTargetSteps(
                -result.homeOffset.dx,
                result.stepToDisplacement?.x ?? null,
            );
            const targetY = computeAlignmentTargetSteps(
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

        // Emit tile error for toast display
        this.onTileError?.(tile.row, tile.col, message);
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
        // Convert local TileCalibrationResult to module type
        const moduleResults = new Map<string, TileCalibrationResultFromModule>();
        for (const [key, result] of this.tileResults.entries()) {
            moduleResults.set(key, result as TileCalibrationResultFromModule);
        }

        const summaryConfig = {
            gridSize: this.gridSize,
            gridGapNormalized: this.settings.gridGapNormalized,
            deltaSteps: this.settings.deltaSteps,
        };

        return computeCalibrationSummary(moduleResults, summaryConfig);
    }

    private publishSummarySnapshot(): void {
        const summary = this.computeSummary();
        this.updateState({ summary });
    }
}
