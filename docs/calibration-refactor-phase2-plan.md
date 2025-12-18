# Calibration / Playback Refactor - Phase 2 Plan

Continuation of calibration system improvements. Phase 1 (items 1-6) completed the core calibration architecture. Phase 2 focuses on planner consistency, declarative overlays, and regression safety.

## Context from Phase 1

**Architecture established:**

- `src/coords/` - Coordinate kernel with branded types and `Transformer` class
- `src/services/calibration/math/` - Pure math functions (bounds, statistics, blueprint)
- `src/services/calibration/script/` - Generator-based calibration executor
- `src/services/calibration/summaryComputation.ts` - Canonical `CalibrationSnapshot` shape
- `src/services/calibrationProfileStorage.ts` - Profile persistence

**Key types:**

- `CalibrationSnapshot` / `CalibrationRunSummary` - Immutable calibration data
- `combinedBounds` - Union of motorReachBounds + footprintBounds per tile
- Centered coordinates [-1, 1] - Canonical space for all bounds/positions

**Testing foundation:**

- Golden fixtures for calibration profiles and command traces
- 482 unit tests covering math, executor, storage round-trips
- E2E smoke tests with mock MQTT

## Phase 2 Roadmap

### 1. [x] **Planner split and space consistency** ✓ DONE

**Goal:** Unify pattern validation across Pattern Designer, Animation Path, and Playback.

**Completed:**

- `src/services/spaceConversion.ts` - Space transform helpers (`patternToCentered`, `centeredToPattern`, `getSpaceParams`)
- `src/services/boundsValidation.ts` - Shared validation (`validatePatternInProfile`, `validateWaypointsInProfile`)
- `profilePlaybackPlanner.ts` refactored to use shared modules + deterministic assignment
- `PatternDesignerPage.tsx` simplified to use `validatePatternInProfile`
- `animationPlanner.ts` now applies aspect/rotation + validates waypoints
- `AnimationPathEditor.tsx` highlights invalid waypoints (red stroke)
- New error code `no_valid_tile_for_point` for clearer taxonomy
- 61 new tests (47 space conversion, 14 bounds validation)

---

### 2. [ ] **Declarative overlays** (low-medium effort, medium gain)

**Goal:** Overlays (expected position, bounds, grid) defined in canonical space with single renderer.

**Current state:**

- `useCameraPipeline.ts` has multiple overlay drawing functions
- Coordinate conversions scattered across drawing code
- Difficult to test overlay geometry

**Deliverables:**

1. Overlay descriptor types in canonical space:

   ```typescript
   type Overlay =
     | { type: 'point'; position: CenteredPoint; style: PointStyle }
     | { type: 'rect'; bounds: Bounds; style: RectStyle }
     | { type: 'grid'; blueprint: GridBlueprint; style: GridStyle };
   ```

2. Single renderer maps overlays to screen via `coords` module
3. Overlay composition (multiple overlays in one render pass)

**Tests:**

- DOM geometry assertions in JSDOM with stubbed canvas size
- Coordinate conversion verification

**Starting point:** `src/hooks/useCameraPipeline.ts`

---

### 3. [ ] **Regression safety net** (ongoing)

**Goal:** CI-enforced contracts prevent regressions during ongoing development.

**Deliverables:**

1. Contract test suite in CI:
   - Coordinate conversions (round-trip, aspect ratio matrix)
   - Snapshot golden (profile shape stability)
   - Planner outputs (assignment, step conversion)
   - Generator command traces (executor behavior)
2. Dry-run executor mode for command recording without motors
3. Integration tests stitching math + executor + adapters with fakes

**Starting point:** `src/services/calibration/__tests__/summaryComputation.test.ts`

---

## Testing Strategy

- **Golden fixtures:** Freeze expected outputs; compare after changes
- **Deterministic fakes:** Motor API fake, camera measurement fake with scripted results
- **Contract tests:** Run in CI on every PR
- **E2E smoke tests:** Keep optional until orchestration stabilizes

## Key Files Reference

| Area     | Files                                               |
| -------- | --------------------------------------------------- |
| Coords   | `src/coords/index.ts`, `src/utils/coordinates.ts`   |
| Math     | `src/services/calibration/math/*.ts`                |
| Executor | `src/services/calibration/script/*.ts`              |
| Summary  | `src/services/calibration/summaryComputation.ts`    |
| Storage  | `src/services/calibrationProfileStorage.ts`         |
| Planner  | `src/services/profilePlaybackPlanner.ts`            |
| Overlays | `src/hooks/useCameraPipeline.ts`                    |
| Types    | `src/types.ts`, `src/services/calibration/types.ts` |
