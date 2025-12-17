/**
 * Calibration module re-exports
 */

export {
    // Types
    type StepVector,
    // Functions
    computeAxisBounds,
    computeTileBounds,
    computeLiveTileBounds,
    computeBlueprintFootprintBounds,
    // Merge helpers
    mergeBoundsIntersection,
    mergeBoundsUnion,
    mergeWithBlueprintFootprint,
} from './math/boundsComputation';

export {
    // Types
    type TileMeasurement,
    type GridEstimate,
    type ExpectedPositionConfig,
    // Functions
    transformTileToCamera,
    estimateGridFromMeasurements,
    computeFirstTileExpected,
    computeExpectedFromGrid,
    computeExpectedBlobPosition,
} from './math/expectedPosition';

export {
    // Types
    type TilePosition,
    type GridSize,
    type StagingConfig,
    type AxisTargets,
    // Functions
    clampSteps,
    roundSteps,
    computePoseTargets,
    computeNearestCornerTarget,
    computeDistributedAxisTarget,
} from './math/stagingCalculations';

export {
    // Types
    type TileCalibrationResult,
    type SummaryConfig,
    type CalibrationRunSummary,
    type OutlierAnalysis,
    // Functions
    computeGridBlueprint,
    computeCalibrationSummary,
} from './summaryComputation';

export {
    // Types
    type Axis,
    type AxisStepTestResult,
    type StepTestResults,
    // Functions
    getAxisStepDelta,
    computeAxisStepTestResult,
    computeAverageSizeDelta,
    computeAlignmentTargetSteps,
    combineStepTestResults,
} from './math/stepTestCalculations';
