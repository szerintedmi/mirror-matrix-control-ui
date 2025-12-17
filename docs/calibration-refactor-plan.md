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

- [x] **Item 4: Generator-based script + executor skeleton** — Command types, adapters, executor, skeleton script, and tests complete. Golden trace deferred to item 5.

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

4. [x] **Generator-based script + executor skeleton** (medium effort, high gain)

   **Goal:** Separate "what to do" (script) from "how to do it" (executor). The script becomes a pure generator yielding command intents; the executor drives it, handles IO, pause/resume/abort, and state emission.

   **Current state analysis:**
   - `CalibrationRunner` is ~1540 lines mixing IO, state management, orchestration, retries, and UI callbacks.
   - Math already isolated in `/math/` modules (good foundation).
   - React consumes via `useCalibrationController` hook which instantiates runner and passes callbacks.

   **Command taxonomy** (IO commands vs state/events for a minimal executor surface):

   ```typescript
   // IO Commands - executor calls adapters, returns results to script
   type IOCommand =
     | { type: 'HOME_ALL'; macAddresses: string[] }
     | { type: 'MOVE_AXIS'; motor: Motor; target: number }
     | { type: 'MOVE_TILE_POSE'; tile: TileAddress; pose: 'home' | 'aside' }
     | { type: 'CAPTURE'; expectedPosition?: Point; tolerance: number; label: string }
     | { type: 'DELAY'; ms: number };

   // State/Event Commands - executor applies to internal state, no adapter call
   type StateCommand =
     | { type: 'UPDATE_PHASE'; phase: CalibrationRunnerPhase }
     | { type: 'UPDATE_TILE'; key: string; patch: Partial<TileRunState> }
     | { type: 'CHECKPOINT'; step: CalibrationStepDescriptor } // pause point in step mode
     | { type: 'LOG'; hint: string; metadata?: Record<string, unknown> };

   type CalibrationCommand = IOCommand | StateCommand;
   ```

   Note: `MOVE_TILE_POSE` keeps tile+pose as the command shape so staging math (rotation handling, `computePoseTargets`) stays centralized. Reuses expectations from `calibrationRunnerDirections.test.ts`.

   **Architecture:**
   - `CalibrationScript` - Pure generator: `function* calibrationScript(config): Generator<CalibrationCommand, void, CommandResult>`
   - `CalibrationExecutor` - Drives generator, owns AbortController, handles pause/resume gate, calls adapters, emits state.
   - `CommandResult` - Union of results per command type (`BlobMeasurement | null` for CAPTURE, `void` for most others).

   **Adapter boundary** (explicit interface for testability):

   ```typescript
   interface ExecutorAdapters {
     motor: {
       homeAll(macs: string[]): Promise<void>;
       moveMotor(mac: string, motorId: number, steps: number): Promise<void>;
     };
     camera: {
       capture(params: CaptureParams): Promise<BlobMeasurement | null>;
     };
     clock: {
       delay(ms: number): Promise<void>;
       now(): number;
     };
   }
   ```

   **Executor responsibilities:**
   - Drive generator loop, passing results back via `generator.next(result)`
   - Own `AbortController` for cancellation
   - Pause/resume via single gate promise (not scattered)
   - **Retry policy (CAPTURE only):** Motor moves throw on failure; only CAPTURE commands retry (configurable `maxRetries`, `retryDelayMs`). Errors map to `onTileError` for detection failures, `onCommandError` for motor failures.
   - Delays after motor moves via `DELAY` command (script controls when, executor just waits)
   - Maintain and emit `CalibrationRunnerState` to subscribers
   - Step mode: wait at `CHECKPOINT` commands for `advance()` call

   **Deliverables for this phase:**
   1. `src/services/calibration/script/commands.ts` - Command type definitions + `ExecutorAdapters` interface
   2. `src/services/calibration/script/adapters.ts` - Real adapter implementations (wrap `motorApi`, `captureMeasurement`)
   3. `src/services/calibration/script/executor.ts` - Executor class (drives generator, pause/abort, state emission)
   4. `src/services/calibration/script/script.ts` - Skeleton script (home all + one tile happy path)
   5. `src/services/calibration/script/__tests__/script.test.ts` - Synchronous script tests (command sequence assertions)
   6. `src/services/calibration/script/__tests__/executor.test.ts` - Async executor tests (fake adapters + deterministic timers for pause/resume/abort/retry)
   7. Golden trace: record normalized trace from old runner for 1-tile scenario; assert new generator matches before flipping `useCalibrationController` _(deferred to item 5 — skeleton only handles one tile; golden trace more valuable once full sequence is ported)_

   **Testing approach:**
   - **Script tests (sync):** Step through generator with `generator.next(cannedResult)`, assert exact command sequence. No timers, no async.
   - **Executor tests (async):** Fake adapters return scripted results; use `vi.useFakeTimers()` for deterministic delay/retry testing; validate pause/resume/abort behavior.
   - **Golden trace bridge:** Run 1-tile scenario through old `CalibrationRunner`, normalize the command log to a trace format, then verify new script+executor produces equivalent trace.

   **Starting point:** [`../src/services/calibrationRunner.ts`](../src/services/calibrationRunner.ts)

   **Feedback / gaps (review):** _(addressed)_
   - ✓ Good: clear command vocabulary + explicit adapter boundary; executor is a plausible "IO kernel" for item 5.
   - ✓ `onCommandError` / `onTileError` callbacks now invoked in executor (motor failures, tile failures).
   - ✓ pause/resume, step-mode gating, and abort tests added; abort during DELAY/CAPTURE correctly transitions to `aborted` (not `error`).
   - ✓ Bug fixed: abort during DELAY now maps AbortError to ExecutorAbortError.
   - ✓ `activeTile` now derived from UPDATE_TILE patches (set when `measuring`, cleared when `completed`/`failed`/`skipped`).
   - Gap (deferred): no integration path yet (feature-flag/parallel wiring into `useCalibrationController`); skeleton exercised via unit tests only for now.

5. [ ] **Port full calibration sequence to generator** (higher effort, very high gain)

   **Goal:** Migrate the complete calibration flow from imperative `CalibrationRunner` methods to the generator script built in phase 4.

   **Sequence to port:**
   1. `homeAllMotors()` → yield `HOME_ALL`
   2. `stageAllTilesToSide()` → yield `MOVE_TILE_POSE(aside)` per tile (parallel in executor)
   3. Per-tile measurement loop (`measureTile()`):
      - `MOVE_TILE_POSE(home)` + `CAPTURE(home)` + `CHECKPOINT`
      - Interim step test (first tile): `MOVE_AXIS` + `CAPTURE` + `CHECKPOINT`
      - Full step test X: `MOVE_AXIS` + `CAPTURE` + `CHECKPOINT`
      - Full step test Y: `MOVE_AXIS` + `CAPTURE` + `UPDATE_TILE` + `CHECKPOINT`
      - `MOVE_TILE_POSE(aside)` to clear for next tile
   4. Compute summary (pure math, no command)
   5. `alignTilesToIdealGrid()` → yield `MOVE_AXIS` per tile axis based on `homeOffset`

   **Pose handling:**
   - Reuse `computePoseTargets(tile, pose, config)` from `stagingCalculations.ts`
   - Step test positions computed inline using `getAxisStepDelta()` from `stepTestCalculations.ts`
   - Executor calls `computePoseTargets` when handling `MOVE_TILE_POSE`

   **Migration strategy:**
   - Keep old `CalibrationRunner` functional during migration (strangle pattern)
   - Extend skeleton script from phase 4 incrementally (one phase at a time)
   - Golden trace assertions at each phase boundary
   - Flip `useCalibrationController` to new executor once all phases pass

   **Tests:**
   - Replay existing `calibrationRunnerDirections.test.ts` scenarios with new script
   - Compare produced `CalibrationSnapshot` vs golden fixtures from old runner
   - Full command trace assertions for deterministic verification

   **Starting point:** [`../src/services/calibrationRunner.ts`](../src/services/calibrationRunner.ts)

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
