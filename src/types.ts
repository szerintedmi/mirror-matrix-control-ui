export interface Motor {
    nodeMac: string;
    motorIndex: number;
}

export interface MotorTelemetry {
    id: number;
    position: number;
    moving: boolean;
    awake: boolean;
    homed: boolean;
    stepsSinceHome: number;
}

export interface Node {
    macAddress: string;
    status: 'ready' | 'offline';
    motors: Motor[];
}

export interface GridPosition {
    row: number;
    col: number;
}

export interface MirrorAssignment {
    x: Motor | null;
    y: Motor | null;
}

// Map key is a string: `${row}-${col}`
export type MirrorConfig = Map<string, MirrorAssignment>;

export type Axis = 'x' | 'y';

export type DragSource = 'list' | 'grid';

export interface DraggedMotorInfo {
    source: DragSource;
    motor: Motor;
    // Optional: only if source is 'grid'
    position?: GridPosition;
    axis?: Axis;
}

export interface LegacyPatternCanvas {
    width: number;
    height: number;
}

export interface LegacyPatternTile {
    id: string;
    center: {
        x: number;
        y: number;
    };
    size: {
        width: number;
        height: number;
    };
}

export interface LegacyPattern {
    id: string;
    name: string;
    canvas: LegacyPatternCanvas;
    tiles: LegacyPatternTile[];
    createdAt: string;
    updatedAt: string;
}

export interface PatternPoint {
    id: string;
    x: number; // centered normalized [-1, 1]
    y: number; // centered normalized [-1, 1]
}

export interface Pattern {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    points: PatternPoint[];
}

export type DriverPresenceSummary = 'ready' | 'stale' | 'offline';

export interface DriverStatusSnapshot {
    presence: DriverPresenceSummary;
    staleForMs: number;
    brokerDisconnected: boolean;
    motors: Record<number, MotorTelemetry>;
}

export type OrientationInputMode = 'angles' | 'vector';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface OrientationState {
    mode: OrientationInputMode;
    yaw: number;
    pitch: number;
    vector: Vec3;
}

export interface ProjectionSettings {
    wallDistance: number;
    wallOrientation: OrientationState;
    sunOrientation: OrientationState;
    worldUpOrientation: OrientationState;
    projectionOffset: number;
    pixelSpacing: {
        x: number;
        y: number;
    };
    sunAngularDiameterDeg: number;
    slopeBlurSigmaDeg: number;
}

export interface ProjectedSpot {
    id: string;
    normalizedX: number;
    normalizedY: number;
    wallX: number | null;
    wallY: number | null;
    world: Vec3;
}

export interface ProjectionFootprint {
    projectedWidth: number | null;
    projectedHeight: number | null;
    spots: ProjectedSpot[];
    arrayWidth: number;
    arrayHeight: number;
}

export type ReflectionSolverErrorCode =
    | 'pattern_exceeds_mirrors'
    | 'invalid_wall_basis'
    | 'degenerate_assignment'
    | 'degenerate_bisector'
    | 'incoming_alignment'
    | 'grazing_incidence'
    | 'wall_behind_mirror'
    | 'invalid_target';

export interface ReflectionSolverError {
    code: ReflectionSolverErrorCode;
    message: string;
    mirrorId?: string;
    patternId?: string;
}

export interface ReflectionEllipse {
    majorDiameter: number;
    minorDiameter: number;
    majorAxis: Vec3;
    minorAxis: Vec3;
    incidenceCosine: number;
}

export interface MirrorReflectionSolution {
    mirrorId: string;
    row: number;
    col: number;
    center: Vec3;
    patternId: string | null;
    targetPoint?: Vec3;
    yaw?: number;
    pitch?: number;
    normal?: Vec3;
    wallHit?: Vec3;
    ellipse?: ReflectionEllipse;
    errors: ReflectionSolverError[];
}

export interface ReflectionAssignment {
    mirrorId: string;
    patternId: string;
}

export interface ReflectionSolverResult {
    mirrors: MirrorReflectionSolution[];
    assignments: ReflectionAssignment[];
    errors: ReflectionSolverError[];
}

export interface PlaybackMirrorPlan {
    mirrorId: string;
    row: number;
    col: number;
    patternId: string | null;
    yawDeg: number | null;
    pitchDeg: number | null;
    assignment: MirrorAssignment;
    errors: ReflectionSolverError[];
}

export interface PlaybackPlanResult {
    patternId: string | null;
    mirrors: PlaybackMirrorPlan[];
    assignments: ReflectionAssignment[];
    errors: ReflectionSolverError[];
}

export interface PlaybackAxisTarget {
    key: string;
    mirrorId: string;
    axis: Axis;
    patternId: string | null;
    motor: Motor;
    row: number;
    col: number;
    angleDeg: number;
    requestedSteps: number;
    targetSteps: number;
    clamped: boolean;
}

export type PlaybackAxisSkipReason = 'missing-motor' | 'missing-angle';

export interface PlaybackAxisSkip {
    mirrorId: string;
    row: number;
    col: number;
    axis: Axis;
    reason: PlaybackAxisSkipReason;
}

export interface PlaybackAxisPlan {
    axes: PlaybackAxisTarget[];
    skipped: PlaybackAxisSkip[];
}

export interface NormalizedRoi {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CalibrationGridBlueprint {
    adjustedTileFootprint: { width: number; height: number };
    tileGap: { x: number; y: number };
    gridOrigin: { x: number; y: number };
}

export interface BlobMeasurementStats {
    sampleCount: number;
    thresholds: {
        minSamples: number;
        maxMedianDeviationPt: number;
    };
    median: {
        x: number;
        y: number;
        size: number;
    };
    medianAbsoluteDeviation: {
        x: number;
        y: number;
        size: number;
    };
    passed: boolean;
}

export interface BlobMeasurement {
    x: number;
    y: number;
    size: number;
    response: number;
    capturedAt: number;
    sourceWidth?: number;
    sourceHeight?: number;
    stats?: BlobMeasurementStats;
}

export type CalibrationTileStatus =
    | 'pending'
    | 'staged'
    | 'measuring'
    | 'completed'
    | 'failed'
    | 'skipped';

export interface CalibrationProfileTile {
    key: string;
    row: number;
    col: number;
    status: CalibrationTileStatus;
    error?: string | null;
    adjustedHome: { x: number; y: number } | null;
    homeOffset: { dx: number; dy: number } | null;
    homeMeasurement: BlobMeasurement | null;
    stepToDisplacement: {
        x: number | null;
        y: number | null;
    };
    sizeDeltaAtStepTest: number | null;
    blobSize: number | null;
}

export interface CalibrationProfileMetrics {
    totalTiles: number;
    completedTiles: number;
    failedTiles: number;
    skippedTiles: number;
}

export interface CalibrationProfile {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    gridSize: { rows: number; cols: number };
    gridBlueprint: CalibrationGridBlueprint | null;
    stepTestSettings: { deltaSteps: number };
    gridStateFingerprint: string;
    tiles: Record<string, CalibrationProfileTile>;
    metrics: CalibrationProfileMetrics;
}
