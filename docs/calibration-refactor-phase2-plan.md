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

**Current state (`useCameraPipeline.ts`, 1754 lines):**

| Overlay Type      | Source Space    | Draw Functions                                 | Lines |
| ----------------- | --------------- | ---------------------------------------------- | ----- |
| Detected blobs    | Camera pixels   | `drawBlobsCanvas()`, `drawBlobsCv()`           | ~80   |
| Expected position | Viewport [0,1]  | `drawExpectedBlobPositionCanvas()`             | ~60   |
| Alignment grid    | Centered [-1,1] | `drawAlignmentCanvas()`, `drawAlignmentCv()`   | ~180  |
| Tile bounds       | Centered [-1,1] | `drawTileBoundsCanvas()`, `drawTileBoundsCv()` | ~120  |

**Problems:**

1. Coordinate conversions scattered across each draw function
2. Dual rendering paths (Canvas 2D + OpenCV.js) with ~200 lines duplicated
3. Hard to test — geometry tied to canvas context
4. ROI + rotation transform math duplicated between `CalibrationPreview.tsx` and `useRoiOverlayInteractions.ts`

**Implementation steps:**

1. **Remove OpenCV.js overlay path** (isolated change, ~-200 lines)
   - Remove `draw*Cv()` functions and OpenCV runtime detection
   - Remove `overlayCvRef` and main-thread `/opencv_js.js` script injection (lines 292-329)
   - Keep Canvas 2D path only — no accuracy or performance benefit for lightweight geometry
   - Worker OpenCV for blob detection unchanged
   - **Testing checkpoint:** Manual verification of all 4 overlay types + rotation

2. **Create overlay descriptor types** (`src/overlays/types.ts`)
   - Use branded `CenteredCoord` from coords kernel — all overlays normalized to centered [-1,1]
   - Add `sizing: 'isotropic' | 'per-axis'` to styles:
     - Alignment grid / blobs = isotropic (preserve squares/circles)
     - Tile bounds = per-axis (show actual rectangular motor reach)

   ```typescript
   import type { CenteredCoord } from '@/coords';

   type CenteredPoint = { x: CenteredCoord; y: CenteredCoord };

   type Overlay =
     | { type: 'point'; position: CenteredPoint; radius: number; style: PointStyle }
     | { type: 'circle'; center: CenteredPoint; radius: number; style: CircleStyle }
     | { type: 'rect'; bounds: CenteredBounds; style: RectStyle }
     | { type: 'grid'; origin: CenteredPoint; tileSize: number; gap: number; tiles: TileEntry[]; style: GridStyle };

   interface PointStyle { color: string; sizing: 'isotropic' | 'per-axis'; crosshair?: boolean; dashed?: boolean; label?: string; }
   interface RectStyle { strokeColor: string; sizing: 'isotropic' | 'per-axis'; fillColor?: string; label?: string; }
   ```

3. **Create overlay renderer** (`src/overlays/renderer.ts`)
   - Pure function `renderOverlays(ctx, overlays, projection)`
   - Single coordinate conversion pipeline via `OverlayProjection`
   - `OverlayProjection` includes: `canvasSize`, `captureSize`, `letterbox`, `rotation`, optional `cropRect` for ROI

4. **Create builder functions** (`src/overlays/builders.ts`)
   - Convert domain types → overlay descriptors at boundary
   - Handle coordinate space normalization (viewport/pixels → centered)
   - Preserve ROI overlay optimization: render full-frame once, reuse for ROI crop

5. **Migrate `useCameraPipeline`**
   - Replace inline `draw*Canvas()` with builder + render calls
   - **Testing checkpoint:** Visual comparison, all overlays identical

6. **Consolidate ROI + rotation transforms** (`src/overlays/projection.ts`)
   - Move duplicated transform math from `CalibrationPreview.tsx` and `useRoiOverlayInteractions.ts`
   - Single `OverlayProjection` handles letterbox, rotation, and ROI cropping
   - Both components import shared projection logic

7. **Add tests** (`src/overlays/__tests__/`)
   - Unit tests for builders (coordinate conversion, branded type enforcement)
   - Unit tests for renderer (canvas geometry assertions)
   - Unit tests for projection (ROI + rotation transforms)

**Estimated scope:**

- Step 1: -200 lines (OpenCV removal)
- Steps 2-7: +350 new, -250 inline = net -100 lines
- Tests: ~200 lines

**Files:**

| File | Change |
| ---- | ------ |
| `src/hooks/useCameraPipeline.ts` | Remove OpenCV overlay path, then migrate to new system |
| `src/overlays/types.ts` | NEW — Overlay descriptor types with branded coords |
| `src/overlays/renderer.ts` | NEW — Canvas rendering function |
| `src/overlays/builders.ts` | NEW — Domain → overlay conversion |
| `src/overlays/projection.ts` | NEW — Consolidated ROI + rotation transforms |
| `src/overlays/index.ts` | NEW — Module exports |
| `src/components/calibration/CalibrationPreview.tsx` | Use shared projection |
| `src/hooks/useRoiOverlayInteractions.ts` | Use shared projection |

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
