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

export interface PlaybackSequence {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    patternIds: string[];
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

export interface LegacyPlaybackMirrorPlan {
    mirrorId: string;
    row: number;
    col: number;
    patternId: string | null;
    yawDeg: number | null;
    pitchDeg: number | null;
    assignment: MirrorAssignment;
    errors: ReflectionSolverError[];
}

export interface LegacyPlaybackPlanResult {
    patternId: string | null;
    mirrors: LegacyPlaybackMirrorPlan[];
    assignments: ReflectionAssignment[];
    errors: ReflectionSolverError[];
}

export interface LegacyPlaybackAxisTarget {
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

export type LegacyPlaybackAxisSkipReason = 'missing-motor' | 'missing-angle';

export interface LegacyPlaybackAxisSkip {
    mirrorId: string;
    row: number;
    col: number;
    axis: Axis;
    reason: LegacyPlaybackAxisSkipReason;
}

export interface LegacyPlaybackAxisPlan {
    axes: LegacyPlaybackAxisTarget[];
    skipped: LegacyPlaybackAxisSkip[];
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
    cameraOriginOffset: { x: number; y: number };
    /** Camera dimensions for isotropic spacing calculations */
    sourceWidth?: number;
    sourceHeight?: number;
}

export interface CalibrationSnapshotCameraMeta {
    sourceWidth: number;
    sourceHeight: number;
}

export interface CalibrationSnapshotTile {
    tile: { row: number; col: number; key: string };
    status: 'measuring' | 'completed' | 'failed' | 'skipped';
    error?: string;
    warnings?: string[];
    homeMeasurement?: BlobMeasurement;
    homeOffset?: { dx: number; dy: number };
    adjustedHome?: { x: number; y: number };
    stepToDisplacement?: { x: number | null; y: number | null };
    sizeDeltaAtStepTest?: number | null;
    motorReachBounds?: CalibrationProfileBounds | null;
    /**
     * Legacy alias kept for compatibility while migrating to explicit motorReachBounds.
     * Prefer reading motorReachBounds going forward.
     */
    inferredBounds?: CalibrationProfileBounds | null;
    footprintBounds?: CalibrationProfileBounds | null;
    stepScale?: { x: number | null; y: number | null };
}

export interface CalibrationSnapshot {
    gridBlueprint: CalibrationGridBlueprint | null;
    camera?: CalibrationSnapshotCameraMeta | null;
    stepTestSettings: { deltaSteps: number };
    tiles: Record<string, CalibrationSnapshotTile>;
    outlierAnalysis?: {
        enabled: boolean;
        outlierTileKeys: string[];
        outlierCount: number;
        median: number;
        mad: number;
        nMad: number;
        upperThreshold: number;
        computedTileSize: number;
    };
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
    nMad: {
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

export interface CalibrationCameraResolution {
    width: number;
    height: number;
}

export type CalibrationTileStatus =
    | 'pending'
    | 'staged'
    | 'measuring'
    | 'completed'
    | 'failed'
    | 'skipped';

export interface CalibrationProfileBlobStats {
    minDiameter: number;
    medianDiameter: number;
    maxDiameter: number;
    nMad: number;
    sampleCount: number;
}

export interface CalibrationProfileBoundsAxis {
    min: number;
    max: number;
}

export interface CalibrationProfileBounds {
    x: CalibrationProfileBoundsAxis;
    y: CalibrationProfileBoundsAxis;
}

export interface TileAxisCalibration {
    stepRange: { minSteps: number; maxSteps: number } | null;
    stepScale: number | null;
}

export interface CalibrationTileOffset {
    dx: number;
    dy: number;
    stepsX: number | null;
    stepsY: number | null;
}

export interface CalibrationTilePosition {
    x: number;
    y: number;
    stepsX: number | null;
    stepsY: number | null;
}

export interface TileCalibrationResults {
    key: string;
    row: number;
    col: number;
    status: CalibrationTileStatus;
    error?: string | null;
    adjustedHome: CalibrationTilePosition | null;
    homeOffset: CalibrationTileOffset | null;
    homeMeasurement: BlobMeasurement | null;
    stepToDisplacement: {
        x: number | null;
        y: number | null;
    };
    sizeDeltaAtStepTest: number | null;
    motorReachBounds?: CalibrationProfileBounds | null;
    footprintBounds?: CalibrationProfileBounds | null;
    stepScale?: { x: number | null; y: number | null };
    axes: {
        x: TileAxisCalibration;
        y: TileAxisCalibration;
    };
    inferredBounds: CalibrationProfileBounds | null;
}

export interface CalibrationProfileMetrics {
    totalTiles: number;
    completedTiles: number;
    failedTiles: number;
    skippedTiles: number;
}

export interface CalibrationProfileFingerprint {
    hash: string;
    snapshot: {
        version: number;
        gridSize: { rows: number; cols: number };
        assignments: Record<string, { x: Motor | null; y: Motor | null }>;
    };
}

export interface CalibrationProfileCalibrationSpace {
    blobStats: CalibrationProfileBlobStats | null;
    globalBounds: CalibrationProfileBounds | null;
}

/**
 * Supported array rotation angles (clockwise from camera view).
 * - 0°: Normal orientation (row 0, col 0 at top-left)
 * - 90°: Rotated 90° clockwise
 * - 180°: Rotated 180°
 * - 270°: Rotated 270° clockwise (= 90° counter-clockwise)
 */
export type ArrayRotation = 0 | 90 | 180 | 270;

/**
 * Position where tiles are moved during calibration staging phase.
 * - 'nearest-corner': Each tile moves to its nearest corner based on grid quadrant (default)
 * - 'corner': All tiles move to bottom-left corner (same position)
 * - 'bottom': Tiles distributed horizontally along bottom edge
 * - 'left': Tiles distributed vertically along left edge
 */
export type StagingPosition = 'nearest-corner' | 'corner' | 'bottom' | 'left';

export interface CalibrationProfile {
    id: string;
    schemaVersion: number;
    name: string;
    createdAt: string;
    updatedAt: string;
    /**
     * Physical array rotation applied during calibration (clockwise from camera view).
     * This affects motor axis interpretation and pattern coordinate mapping.
     */
    arrayRotation: ArrayRotation;
    gridSize: { rows: number; cols: number };
    gridBlueprint: CalibrationGridBlueprint | null;
    stepTestSettings: { deltaSteps: number };
    gridStateFingerprint: CalibrationProfileFingerprint;
    calibrationCameraAspect?: number | null;
    calibrationCameraResolution?: CalibrationCameraResolution | null;
    calibrationSpace: CalibrationProfileCalibrationSpace;
    tiles: Record<string, TileCalibrationResults>;
    metrics: CalibrationProfileMetrics;
}
