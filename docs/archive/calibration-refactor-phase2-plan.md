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
- 589 unit tests covering math, executor, storage round-trips, overlays
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

### 2. [x] **Declarative overlays** ✓ DONE

**Goal:** Overlays (expected position, bounds, grid) defined in canonical space with single renderer.

**Completed:**

- `src/overlays/types.ts` (172 lines) — Overlay descriptor types with branded `CenteredCoord`
  - `SizingMode`: `'isotropic' | 'per-axis' | 'per-axis-average'`
  - Discriminated union: `PointOverlay | CircleOverlay | RectOverlay | GridOverlay`
  - `OverlayProjection` type for coordinate conversion pipeline

- `src/overlays/renderer.ts` (454 lines) — Pure Canvas 2D renderer
  - `renderOverlays(ctx, overlays, projection)` — Main render function
  - `projectPoint()` / `projectDelta()` — Coordinate conversion with sizing modes
  - Handles letterbox, ROI cropping, and counter-rotation for labels

- `src/overlays/builders.ts` (359 lines) — Domain → overlay conversion
  - `buildBlobOverlays()` — Detected blobs (camera pixels → centered)
  - `buildExpectedPositionOverlay()` — Expected position indicator (viewport → centered)
  - `buildAlignmentGridOverlay()` — Calibration grid from `CalibrationRunSummary`
  - `buildTileBoundsOverlays()` — Tile bounds rectangles
  - `buildAllOverlays()` — Combined builder for all overlay types

- `src/overlays/projection.ts` (242 lines) — Consolidated ROI + rotation transforms
  - `transformRoi()` — ROI coordinate transform (toScreen/toSource)
  - `buildOverlayProjection()` — Create projection from component params
  - `createPointRotator()` — Point rotation factory for blob rendering

- `src/hooks/useCameraPipeline.ts` — Migrated to new overlay system
  - Reduced from ~1754 to 1147 lines (-607 lines)
  - Removed all OpenCV.js overlay paths (`draw*Cv()` functions)
  - Uses `buildAllOverlays()` + `renderOverlays()` for all overlay types

- `src/components/calibration/CalibrationPreview.tsx` — Uses shared `transformRoi()`
- `src/hooks/useRoiOverlayInteractions.ts` — Uses shared `transformRoi()`

**Tests:** 45 tests across 3 files (650 lines total)

- `builders.test.ts` (238 lines) — Coordinate conversion, rotation, grid construction
- `renderer.test.ts` (186 lines) — Point/delta projection, sizing modes, gap=0 fix
- `projection.test.ts` (211 lines) — ROI transforms, letterbox, point rotation

**Review feedback (2025-12-20):** All addressed.

- ~~`OverlayProjection.rotationRadians` unused~~ → Removed field; rotation handled via `counterRotationRadians` and `rotatePoint` functions.
- ~~`buildOverlayProjection()` letterbox with ROI~~ → Added doc comment noting limitation; function unused in practice (inline projection in `useCameraPipeline.ts` handles correctly).
- ~~`transformRoi()` 90° enforcement~~ → Added guard that throws for non-90° multiples; 2 new tests.
- ~~Grid overlay naming~~ → Added JSDoc block explaining `style.sizing` (spacing) vs `tileSizing` (render) semantics.

**Actual scope:**

| Metric                      | Planned | Actual |
| --------------------------- | ------- | ------ |
| useCameraPipeline reduction | -300    | -607   |
| New overlay module          | +350    | +1288  |
| Net source change           | -100    | +681   |
| Tests                       | ~200    | 635    |

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
| Overlays | `src/hooks/useCameraPipeline.ts`, `src/overlays/*`  |
| Types    | `src/types.ts`, `src/services/calibration/types.ts` |
