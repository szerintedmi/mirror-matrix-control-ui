# Calibration / Playback Refactor Plan

Consolidated proposal to simplify calibration, bounds, and pattern playback. Tasks are ordered by impact/effort (highest gain per effort first). Each phase includes a testing approach to keep regressions in check.

## Guiding principles

- One canonical coordinate space; explicit, typed conversions between spaces.
- Pure math separated from orchestration; side effects isolated behind small adapters.
- Immutable calibration snapshot shape; everything derives from it.
- Declarative flows (generator or reducer) instead of imperative async nesting.
- Tests as contracts for each boundary (coords, snapshot, planner, runner commands).
- Ignore legacy playback and simulation code for this refactor to avoid scope creep.

## Current Status

### Completed

- [x] **Pure math isolation (partial)**: Created `/services/calibration/math/` module with:
  - `robustStatistics.ts` - Robust statistical functions (`computeMedian`, `computeMAD`, `detectOutliers`, `robustMax`)
  - `blueprintStrategies.ts` - Strategy pattern for tile sizing (`MaxSizingStrategy`, `RobustMaxSizingStrategy`)
  - Full test coverage for both modules

- [x] **Outlier detection in grid blueprint**: `summaryComputation.ts` now uses `RobustMaxSizingStrategy` to:
  - Exclude statistical outliers (3 MADs from median) from tile footprint calculation
  - Return `OutlierAnalysis` with detected outlier tile keys
  - Support negative grid gap values (-50% to +5%)

- [x] **UI feedback for outliers**:
  - Toast warning when calibration completes with outlier tiles
  - Visual highlighting of outlier tiles in `TileStatusesPanel` (amber ring + indicator)

- [x] **Consolidated duplicate code**: `computeMedian` implementations unified in `robustStatistics.ts`

- [x] **Canonical calibration snapshot**: `CalibrationSnapshot` type defined, `summaryComputation` returns it, golden fixture and round-trip tests in place. Bug fixes: pitch uses axis-specific deltas, origin uses separate halfTileX/halfTileY.

### In Progress

- [ ] No active work; next item will move here when pulled from roadmap.

## Priority roadmap

1. [x] **Coordinate kernel** (low-medium effort, high gain)

- Create `coords/` module with branded types for `cameraPx`, `viewport`, `isotropic`, `centered`, `pattern`.
- Single convert(from, to, aspect, resolution) API plus delta helpers.
- Add a lightweight `Transformer` object that captures camera context (aspect, resolution, ROI) so call sites stay terse (`t.toViewport(pt)`).
- Migrate scattered helpers (`centeredToView`, `isotropicDeltaToViewport`, etc.) to wrappers over this kernel.
- Tests: conversion round-trips and known pixel/aspect fixtures.
- Starting point: [`../src/utils/coordinates.ts`](../src/utils/coordinates.ts)
- Progress: Kernel in place (`src/coords/index.ts`) with convert/Transformer/delta helpers, wrapped legacy helpers in [`src/utils/coordinates.ts`](../src/utils/coordinates.ts), removed `src/utils/centeredCoordinates.ts`, and migrated call sites to the wrapper; call-site cleanup to adopt `Transformer` directly still pending.
- **Review (post-migration)**:
  - Kernel (`src/coords/index.ts`) is solid: hub-and-spoke via viewport, branded types, `Transformer` class, and comprehensive tests (394 tests pass).
  - `centeredCoordinates.ts` deleted; all legacy scalar helpers (`viewToCentered`, `centeredToView`, etc.) moved into `coordinates.ts` wrapper.
  - `useStableBlobMeasurement` now uses `createTransformer` and `convert`/`convertDelta` directly—good adoption of new API.
  - Component and page imports updated to use `@/utils/coordinates` (no more `centeredCoordinates`).
  - Remaining items and decisions:
    - **`roi` field removed**: Dropped unused ROI plumbing; reintroduce explicitly if/when scoped.
    - **`normalization.ts` overlap**: Action item to migrate or wrap `normalizeIsotropic`/`viewportToIsotropic`/`viewportToPixels` through the kernel so `useCameraPipeline` and overlays share the same math.
    - **Legacy scalar helpers**: Intend to mark `viewToCentered`, `centeredToView`, etc. as `@deprecated` after the remaining call sites move to branded coords/`Transformer`; they stay temporarily for ease of incremental migration.
    - **Delta averaging heuristic**: Accept the current average-based `viewportDeltaToIsotropic`/`isotropicDeltaToViewport` for square-ish deltas; plan to add axis-specific variants to avoid ambiguity and document the trade-off.
    - **Clamping semantics**: Only viewport→isotropic conversion clamps to [0,1]; document this behaviour in the kernel comments to make the intent explicit.

2. [x] **Canonical calibration snapshot** (medium effort, high gain)

- Define `CalibrationSnapshot` type (per-tile: adjustedHome, perStep, motorReachBounds, footprintBounds, camera meta, blueprint).
- Make `summaryComputation` return exactly this; `calibrationProfileStorage` becomes serialize/deserialize only.
- Tests: snapshot golden fixtures; storage round-trip.
- Starting point: [`../src/services/calibration/summaryComputation.ts`](../src/services/calibration/summaryComputation.ts)
- **Status: Complete.**
  - `CalibrationSnapshot` type in `types.ts` with `CalibrationSnapshotCameraMeta`, `CalibrationSnapshotTile`, grid blueprint, step settings, outlier analysis.
  - `CalibrationRunSummary` is a type alias to `CalibrationSnapshot`—single source of truth.
  - `summaryComputation.ts` returns snapshot shape; `profileToRunSummary` maps stored profile to snapshot.
  - Golden fixture test (`snapshotGolden.test.ts`) and storage round-trip tests in place.
  - `normalization.ts` delegates to coords kernel so overlays share math.
- **Bug fixes applied:**
  - Pitch calculation now uses axis-specific deltas (`Math.abs(dx)` / `Math.abs(dy)`) instead of Euclidean distance—prevents ~10-15% inflation when tiles are slightly misaligned.
  - Origin computation uses separate `halfTileX` / `halfTileY` values instead of single `halfTile = tileWidth/2` for both axes—fixes systematic Y-axis offset when width ≠ height.

3. [x] **Pure math isolation (remaining)** (medium effort, medium gain)
   - Move expected position, step tests, bounds math into `/calibration/math/*` with no IO.
   - Ensure functions consume/produce typed coordinate space values.
   - Tests: unit tests per function with edge cases and aspect coverage.
   - Starting point: [`../src/services/calibration/expectedPosition.ts`](../src/services/calibration/expectedPosition.ts)
   - **Status: Complete.**
     - Moved 4 modules to `/math/`: `boundsComputation.ts`, `stagingCalculations.ts`, `stepTestCalculations.ts`, `expectedPosition.ts`
     - Moved corresponding test files to `/math/__tests__/`
     - Extracted grid blueprint math from `summaryComputation.ts` into new `gridBlueprintMath.ts`:
       - `computeStepScaleFromDisplacement`, `buildStepScale` - step scale conversion
       - `computeAxisPitch` - median of axis deltas
       - `computeImpliedOrigin`, `computeGridOrigin`, `computeCameraOriginOffset` - grid origin calculation
       - `computeHomeOffset`, `computeAdjustedCenter` - home offset and adjusted position
     - Internal math functions stay with plain `number`/`Point` for simplicity. Boundary functions now use branded types. Added module-level coordinate space contract to `gridBlueprintMath.ts` documenting that all `CenteredPoint` values are in Centered Coordinates [-1, 1]. Boundary functions (`computeImpliedOrigin`, `computeHomeOffset`) accept `CenteredPoint` (alias for `CenteredCoord`) to catch coordinate space mixing at compile time.
     - core calibration math is now IO-free under `src/services/calibration/math/`, with tests colocated.
     - All tests pass (29 tests for gridBlueprintMath after cleanup)

4. [ ] **Generator-based script + executor skeleton** (medium effort, high gain)
   - Define `CalibrationCommand` intents (MOVE, MEASURE, LOG, SAVE_TILE, PAUSE_POINT, ABORT).
   - Implement a small executor that drives a generator, handles pause/resume/abort centrally, and owns retries/delays via config (not in the script).
   - Executor exposes subscriptions (current command, progress, logs, snapshot updates) so React can consume via `useSyncExternalStore` / `useEffect`.
   - Prototype a happy-path script for one tile to validate the pattern.
   - Tests: deterministic stepper that feeds canned results into the generator and asserts emitted commands.
   - Starting point: [`../src/services/calibrationRunner.ts`](../src/services/calibrationRunner.ts)

5. [ ] **Port runner to generator (with pose table folded in)** (higher effort, very high gain)
   - Introduce pose table early: named poses (`home`, `aside`, `inspect-x`, `inspect-y`) mapping to per-axis targets factoring rotation/staging mode.
   - Re-express sequence (home -> stage -> per-tile home/X/Y -> align) as a generator using math helpers and pose table.
   - Executor owns retries/delays; script stays pure.
   - Tests: replay existing runner scenarios with mocked motor/camera adapters; compare produced snapshot vs golden.
   - Starting point: [`../src/services/calibrationRunner.ts`](../src/services/calibrationRunner.ts)

6. [ ] **Bounds semantics unification** (low effort, medium gain)
   - Keep two explicit kinds: `motorReachBounds` (step-based) and `footprintBounds` (blueprint).
   - Provide helper for union/intersection; remove hidden unions in storage.
   - Tests: bounds combination fixtures; ensure planner sees expected shape.
   - Starting point: [`../src/services/calibration/boundsComputation.ts`](../src/services/calibration/boundsComputation.ts)

7. [ ] **Planner split and space consistency (incl. Pattern Designer validation)** (medium effort, high gain)
   - Two passes: (a) validate points vs bounds in canonical space, (b) convert to steps using snapshot.
   - Plug-in assignment strategy (greedy now, pluggable later).
   - Reuse the same validation path for Pattern Designer (invalid-point highlighting) so editor == planner.
   - Bring Animation Path editor/player onto the same validation/bounds pipeline to eliminate aspect drift between tools.
   - Tests: fixtures for point->tile assignment and step outputs across rotations/aspects; designer/animation validation mirrors planner results.
   - Starting point: [`../src/services/profilePlaybackPlanner.ts`](../src/services/profilePlaybackPlanner.ts)

8. [ ] **Declarative overlays** (low-medium effort, medium gain)
   - Overlays described in canonical space; single renderer maps to screen via `coords` module.
   - Tests: screenshot/DOM geometry assertions in JSDOM with stubbed size.
   - Starting point: [`../src/hooks/useCameraPipeline.ts`](../src/hooks/useCameraPipeline.ts)

9. [ ] **Regression safety net** (ongoing)
   - Contract tests run in CI: coord conversions, snapshot golden, planner outputs, generator command traces.
   - Add a fast "dry-run" mode for the executor that records commands without motors.
   - As pieces move, keep adapters thin and covered by integration tests that stitch math + executor + adapters with fakes.
   - Starting point: [`../src/services/calibration/__tests__/summaryComputation.test.ts`](../src/services/calibration/__tests__/summaryComputation.test.ts)

## Testability strategy during refactor

- **Strangle, don't big-bang**: introduce new modules in parallel, validate with golden tests, then flip consumers one by one.
- **Golden fixtures**: freeze current expected runner summary, bounds, planner outputs on sample inputs; compare after each swap.
- **Deterministic fakes**: motor API fake (records moves, supports clamped ranges); camera measurement fake (scripted detections with noise options).
- **Command trace assertions**: for the generator, assert the exact sequence of intents given a scripted environment.
- **Coord contract suite**: small matrix of aspect ratios/resolutions tested across all conversions to catch regressions early.
- **CI guardrails**: run unit + contract suites on every refactor PR; keep e2e optional until orchestration stabilizes.
