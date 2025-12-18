# Calibration / Playback Refactor Plan - Phase 1 (COMPLETE)

**Status: All items complete. Remaining work moved to [Phase 2 Plan](./calibration-refactor-phase2-plan.md).**

Phase 1 established the core calibration architecture: coordinate kernel, canonical snapshot shape, pure math isolation, generator-based executor, and unified bounds semantics.

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

- [x] **Generator-based script + executor**: Items 4, 5, 5a complete. Full calibration migrated to generator-based architecture with `CalibrationExecutor`. Old `CalibrationRunner` deleted. Helper generators extracted (`measureHome*`, `runAxisStepTest*`, `transitionToNextTile*`, `alignTiles*`). 10 golden tests + E2E coverage.

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
   - Starting point: [`../src/services/calibration/math/expectedPosition.ts`](../src/services/calibration/math/expectedPosition.ts)
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

   **Starting point:** `src/services/calibration/script/` (old `calibrationRunner.ts` deleted)

   **Feedback / gaps (review):** _(addressed)_
   - ✓ Good: clear command vocabulary + explicit adapter boundary; executor is a plausible "IO kernel" for item 5.
   - ✓ `onCommandError` / `onTileError` callbacks now invoked in executor (motor failures, tile failures).
   - ✓ pause/resume, step-mode gating, and abort tests added; abort during DELAY/CAPTURE correctly transitions to `aborted` (not `error`).
   - ✓ Bug fixed: abort during DELAY now maps AbortError to ExecutorAbortError.
   - ✓ `activeTile` now derived from UPDATE_TILE patches (set when `measuring`, cleared when `completed`/`failed`/`skipped`).
   - Gap (deferred): no integration path yet (feature-flag/parallel wiring into `useCalibrationController`); skeleton exercised via unit tests only for now.

5. [x] **Port full calibration sequence to generator** (higher effort, very high gain)

   **Status: Complete.**

   Full calibration flow migrated to generator-based script with CalibrationExecutor.

   **Completed:**
   - Generator script (`script.ts`) yields command intents for full calibration sequence
   - Executor drives generator, handles IO via adapters, manages pause/resume/abort
   - Parallel move commands (`MOVE_TILES_BATCH`, `MOVE_AXES_BATCH`) for efficiency
   - `AWAIT_DECISION` command + `submitDecision()` for user decisions on failures:
     - `tile-failure` (home measurement): retry/skip/abort
     - `step-test-failure` (X/Y jog measurement): retry/ignore/abort — ignore keeps home data, infers step values from first tile, marks tile as `partial`
     - `command-failure` (motor commands): retry/skip/ignore/abort — options vary by context (measuring phase offers ignore, global commands only retry/abort)
   - `UPDATE_EXPECTED_POSITION` command shows expected blob position before moves
   - `UPDATE_PROGRESS` command for progress tracking
   - `useCalibrationController` uses new executor (old runner deleted)

   **Cleanup completed:**
   - Types moved to `src/services/calibration/types.ts`
   - Old `calibrationRunner.ts` deleted (~20 files updated with new imports)
   - Golden trace tests (`golden.test.ts`) - 10 tests covering single/multi-tile scenarios + rotation handling
   - E2E smoke test with mock MQTT connection
   - Decision UI in `CalibrationStatusBar.tsx` with Retry/Skip/Ignore/Abort buttons per failure kind
   - `partial` tile status for tiles with inferred step values (included in blueprint)

   **Architecture:**

   ```
   src/services/calibration/
   ├── types.ts              # All calibration types
   ├── script/
   │   ├── script.ts         # Generator yielding commands
   │   ├── executor.ts       # Runs script, handles adapters
   │   ├── commands.ts       # Command type definitions
   │   └── adapters.ts       # Motor/camera/clock adapters
   ├── math/                 # Pure calculation functions
   └── summaryComputation.ts # Blueprint/summary computation
   ```

   **Feedback / gaps (review):**
   - ✓ Good: old `CalibrationRunner` removal is complete; `useCalibrationController` + status bar decision UI + unit/golden coverage form a coherent end-to-end slice.
   - ✓ Bug fixed: added `skippedCount` to ScriptState; skip decision now increments `skippedCount` (not `failedCount`) and `updateProgress` uses correct counter.
   - ✓ Rotation coverage: added golden tests for `arrayRotation: 180` verifying step test directions and stepToDisplacement output.
   - ✓ Cleanup: removed duplicate overlay trigger from CAPTURE handler in executor; `UPDATE_EXPECTED_POSITION` is now the single pathway for overlay updates; `CAPTURE.expectedPosition` is only for blob selection validation.

5a. [x] **Script generator refactor** (low effort, medium gain)

- Extract helper generators: `measureHome*`, `runAxisStepTest*`, `transitionToNextTile*`, `alignTiles*`
- DRY X/Y step test logic (~150 lines consolidated)
- Use `yield*` delegation, keep in single file
- Tests: existing golden tests (no new tests needed)
- Starting point: [`../src/services/calibration/script/script.ts`](../src/services/calibration/script/script.ts)
- **Status: Complete.** All 4 helper generators extracted. Main orchestrator uses `yield*` delegation. X/Y step test logic unified in `runAxisStepTest*`. All 468 tests pass.

6. [x] **Bounds semantics unification** (low effort, medium gain)

   **Status: Complete.**

   **Completed:**
   1. ✓ Moved merge helpers (`mergeBoundsIntersection`, `mergeBoundsUnion`, `mergeWithBlueprintFootprint`) to `boundsComputation.ts` with JSDoc documenting centered [-1,1] coordinate space.
   2. ✓ Removed `globalBounds` from `CalibrationProfileCalibrationSpace` type, deleted `computeGlobalBoundsFromTiles()`, removed overlay code from `useCameraPipeline.ts`.
   3. ✓ Renamed `inferredBounds` → `combinedBounds` across ~40 locations. Added backward-compatible fallback in deserialization.
   4. ✓ Added 14 tests for merge helpers (intersection, union, null handling, blueprint footprint).

   **Files modified:**
   - `src/types.ts` — removed `globalBounds`, renamed `inferredBounds` → `combinedBounds`
   - `src/services/calibration/types.ts` — renamed `inferredBounds` → `combinedBounds`
   - `src/services/calibration/math/boundsComputation.ts` — added merge helpers with JSDoc
   - `src/services/calibrationProfileStorage.ts` — removed local merge helpers, globalBounds computation, added backward compat
   - `src/hooks/useCameraPipeline.ts` — removed globalBounds overlay code
   - `src/utils/tileCalibrationCalculations.ts` — renamed `InferredBounds` → `CombinedBounds`
   - Pages/components (~10 files) — mechanical rename
   - Tests/fixtures (~6 files) — updated to use `combinedBounds`

   **Verification:** All 482 tests pass, typecheck/lint/build clean.

   **Feedback addressed:**
   - ✓ Semantics: Fixed `combinedBounds` flow—`summaryComputation.ts` no longer sets `combinedBounds` (computed in `buildProfileTiles` via `mergeWithBlueprintFootprint`). `buildTileEntry` sets `combinedBounds: null` as placeholder.
   - ✓ Consistency: Consolidated footprint to single source—removed local halfTile math from `summaryComputation.ts`, now uses `computeBlueprintFootprintBounds` everywhere.
   - ✓ Docs: Updated `docs/requirements.md` to reference `combinedBounds` and removed `globalBounds`/`inferredBounds` mentions.
   - ✓ Cleanup: Removed `inferredBounds` fallback in `calibrationProfileStorage.ts` (calibrations will be rerun).

---

## Phase 1 Complete

All 6 items finished. See [Phase 2 Plan](./calibration-refactor-phase2-plan.md) for remaining work:

- Planner split and space consistency
- Declarative overlays
- Regression safety net
