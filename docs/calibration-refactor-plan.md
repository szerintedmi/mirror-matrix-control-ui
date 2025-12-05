# Calibration / Playback Refactor Plan

Consolidated proposal to simplify calibration, bounds, and pattern playback. Tasks are ordered by impact/effort (highest gain per effort first). Each phase includes a testing approach to keep regressions in check.

## Guiding principles

- One canonical coordinate space; explicit, typed conversions between spaces.
- Pure math separated from orchestration; side effects isolated behind small adapters.
- Immutable calibration snapshot shape; everything derives from it.
- Declarative flows (generator or reducer) instead of imperative async nesting.
- Tests as contracts for each boundary (coords, snapshot, planner, runner commands).

## Current Status

### Completed

- **Pure math isolation (partial)**: Created `/services/calibration/math/` module with:
  - `robustStatistics.ts` - Robust statistical functions (`computeMedian`, `computeMAD`, `detectOutliers`, `robustMax`)
  - `blueprintStrategies.ts` - Strategy pattern for tile sizing (`MaxSizingStrategy`, `RobustMaxSizingStrategy`)
  - Full test coverage for both modules

- **Outlier detection in grid blueprint**: `summaryComputation.ts` now uses `RobustMaxSizingStrategy` to:
  - Exclude statistical outliers (3 MADs from median) from tile footprint calculation
  - Return `OutlierAnalysis` with detected outlier tile keys
  - Support negative grid gap values (-50% to +5%)

- **UI feedback for outliers**:
  - Toast warning when calibration completes with outlier tiles
  - Visual highlighting of outlier tiles in `TileStatusesPanel` (amber ring + indicator)

- **Consolidated duplicate code**: `computeMedian` implementations unified in `robustStatistics.ts`

### In Progress

None currently active.

## Priority roadmap

1. **Coordinate kernel** (low-medium effort, high gain)
   - Create `coords/` module with branded types for `cameraPx`, `viewport`, `isotropic`, `centered`, `pattern`.
   - Single convert(from, to, aspect, resolution) API plus delta helpers.
   - Add a lightweight `Transformer` object that captures camera context (aspect, resolution, ROI) so call sites stay terse (`t.toViewport(pt)`).
   - Migrate scattered helpers (`centeredToView`, `isotropicDeltaToViewport`, etc.) to wrappers over this kernel.
   - Tests: conversion round-trips and known pixel/aspect fixtures.

2. **Canonical calibration snapshot** (medium effort, high gain)
   - Define `CalibrationSnapshot` type (per-tile: adjustedHome, perStep, motorReachBounds, footprintBounds, camera meta, blueprint).
   - Make `summaryComputation` return exactly this; `calibrationProfileStorage` becomes serialize/deserialize only.
   - Tests: snapshot golden fixtures; storage round-trip.

3. **Pure math isolation (remaining)** (medium effort, medium gain)
   - Move expected position, step tests, bounds math into `/calibration/math/*` with no IO.
   - Ensure functions consume/produce typed coordinate space values.
   - Tests: unit tests per function with edge cases and aspect coverage.

4. **Generator-based script + executor skeleton** (medium effort, high gain)
   - Define `CalibrationCommand` intents (MOVE, MEASURE, LOG, SAVE_TILE, PAUSE_POINT, ABORT).
   - Implement a small executor that drives a generator, handles pause/resume/abort centrally, and owns retries/delays via config (not in the script).
   - Executor exposes subscriptions (current command, progress, logs, snapshot updates) so React can consume via `useSyncExternalStore` / `useEffect`.
   - Prototype a happy-path script for one tile to validate the pattern.
   - Tests: deterministic stepper that feeds canned results into the generator and asserts emitted commands.

5. **Port runner to generator (with pose table folded in)** (higher effort, very high gain)
   - Introduce pose table early: named poses (`home`, `aside`, `inspect-x`, `inspect-y`) mapping to per-axis targets factoring rotation/staging mode.
   - Re-express sequence (home -> stage -> per-tile home/X/Y -> align) as a generator using math helpers and pose table.
   - Executor owns retries/delays; script stays pure.
   - Tests: replay existing runner scenarios with mocked motor/camera adapters; compare produced snapshot vs golden.

6. **Bounds semantics unification** (low effort, medium gain)
   - Keep two explicit kinds: `motorReachBounds` (step-based) and `footprintBounds` (blueprint).
   - Provide helper for union/intersection; remove hidden unions in storage.
   - Tests: bounds combination fixtures; ensure planner sees expected shape.

7. **Planner split and space consistency (incl. Pattern Designer validation)** (medium effort, high gain)
   - Two passes: (a) validate points vs bounds in canonical space, (b) convert to steps using snapshot.
   - Plug-in assignment strategy (greedy now, pluggable later).
   - Reuse the same validation path for Pattern Designer (invalid-point highlighting) so editor == planner.
   - Bring Animation Path editor/player onto the same validation/bounds pipeline to eliminate aspect drift between tools.
   - Tests: fixtures for point->tile assignment and step outputs across rotations/aspects; designer/animation validation mirrors planner results.

8. **Declarative overlays** (low-medium effort, medium gain)
   - Overlays described in canonical space; single renderer maps to screen via `coords` module.
   - Tests: screenshot/DOM geometry assertions in JSDOM with stubbed size.

9. **Regression safety net** (ongoing)
   - Contract tests run in CI: coord conversions, snapshot golden, planner outputs, generator command traces.
   - Add a fast "dry-run" mode for the executor that records commands without motors.
   - As pieces move, keep adapters thin and covered by integration tests that stitch math + executor + adapters with fakes.

## Testability strategy during refactor

- **Strangle, don't big-bang**: introduce new modules in parallel, validate with golden tests, then flip consumers one by one.
- **Golden fixtures**: freeze current expected runner summary, bounds, planner outputs on sample inputs; compare after each swap.
- **Deterministic fakes**: motor API fake (records moves, supports clamped ranges); camera measurement fake (scripted detections with noise options).
- **Command trace assertions**: for the generator, assert the exact sequence of intents given a scripted environment.
- **Coord contract suite**: small matrix of aspect ratios/resolutions tested across all conversions to catch regressions early.
- **CI guardrails**: run unit + contract suites on every refactor PR; keep e2e optional until orchestration stabilizes.
