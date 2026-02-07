# Visual Alignment Convergence

## Overview

After calibration, all tiles can be commanded to aim at a common point, but motor inaccuracies cause reflections to cluster together without perfectly overlapping. This feature iteratively converges each tile's reflection to a common point using live camera feedback and existing MOVE commands — no firmware changes required.

To avoid an unreadable all-at-once overlap, V1 uses a staged workflow:

1. Move every tile to a non-overlapping staging position.
2. Move one reference tile to calibrated center and lock it.
3. Bring each remaining tile in one-by-one and align it against the current reference cluster.

V1 prioritizes deterministic behavior and fast iteration:

- Sequential per-tile processing in row-major order.
- One active candidate tile at a time (reference + candidate, then accumulated cluster).
- Constant per-axis nudge step size (user-configurable).
- Rich UI tuning controls so operators can experiment without code changes.

## Goals

- Tighten the scatter of reflected light spots after calibration so they overlap as closely as possible.
- Operate entirely via existing `MOVE` commands — no new firmware messages.
- Reuse existing camera pipeline, calibration profiles, motor control, and ROI infrastructure.

## Non-goals

- Real-time continuous tracking (this is a one-time alignment pass).
- Multi-target convergence (single common point only, initially `(0,0)` in centered space).
- Firmware modifications of any kind.

---

## New Page: Alignment

A new entry in the navigation rail, separate from Calibration.

### Navigation changes

Add `'alignment'` to the `Page` union in `App.tsx`:

```ts
export type Page =
  | 'legacy-patterns'
  | 'legacy-patterns-editor'
  | 'patterns'
  | 'legacy-playback'
  | 'playback'
  | 'animation'
  | 'calibration'
  | 'configurator'
  | 'simulation'
  | 'connection'
  | 'alignment'; // new
```

Add a navigation item to `NAVIGATION_ITEMS` in `src/constants/navigation.ts` (placed after Calibration):

```ts
{ page: 'alignment', label: 'Alignment', iconKey: 'alignment' }
```

Add `'alignment'` to the `NavigationIconKey` union and choose an icon (e.g. crosshair/target).

### New page component

`src/pages/AlignmentPage.tsx` — top-level page rendered when `page === 'alignment'`.

---

## UI Layout

The Alignment page has three sections:

### 1. Camera preview (left / top)

Reuses `CalibrationPreview` with the same camera pipeline (`useCameraPipeline`). Displays the live feed with overlays showing:

- The ROI rectangle
- Detected contour outline of the active cluster (reference cluster + optional active tile)
- Centroid marker
- Principal axis direction indicator
- Shape metrics readout (area, eccentricity)

### 2. Controls panel (right sidebar)

- **Profile selector** — reuses `CalibrationContext` (`useCalibrationContext()`) to list and select a calibration profile. A simplified read-only profile picker (no CRUD — just select from `savedProfiles`).
- **ROI controls** — reuses the existing `NormalizedRoi` system, ROI drag/resize handlers, and ROI view toggle from the camera pipeline.
- **Detection settings** — adaptive threshold parameters and contour filtering:
  - Adaptive method (`GAUSSIAN` / `MEAN`)
  - Threshold polarity (`BINARY` / `BINARY_INV`)
  - Block size (odd integer)
  - C constant
  - Minimum contour area
- **Measurement stability settings** (advanced):
  - Samples per measurement (default: 3)
  - Outlier strategy (default: MAD-filter)
  - Outlier threshold (strategy-specific)
- **Convergence controls:**
  - **"Move to Staging"** button — computes and sends MOVE commands to place all eligible tiles at deterministic, non-overlapping staging targets.
  - **"Start Convergence"** button — begins staged convergence. If staging has not run yet in this session, it auto-runs "Move to Staging" first.
  - **"Stop"** button — requests halt; the controller stops after the current in-flight motor command completes. UI label remains "Stop".
  - **Step size** — initial nudge size in motor steps (default: 2 steps).
  - **Max iterations per axis** — iteration limit per tile per axis (default: 20).
  - **Area threshold** — minimum area-delta percentage (against the pre-insert baseline) to consider a nudge as having an effect (default: 1%).
  - **Improvement strategy** (advanced, experiment-friendly):
    - `any` (default): area OR eccentricity improvement qualifies
    - `weighted`: weighted score with tunable area/eccentricity weights
- **Run control safety:**
  - Detection and ROI settings are locked while convergence is running.
  - On paused/error states, user can choose retry/skip/abort where applicable.

### 3. Progress panel (bottom or below controls)

- Per-tile convergence status table:
  - Tile key (row, col)
  - Tile aggregate status: pending / in-progress / converged / partial / max-iterations / skipped / error
  - X axis status + motor ID
  - Y axis status + motor ID
  - X correction (steps applied)
  - Y correction (steps applied)
  - Final eccentricity
- Overall metrics: tiles converged, partial, skipped, errored, average eccentricity improvement, total area reduction.
- Run outputs:
  - Export results JSON
  - Persist run summary/history (separate from calibration profile data)

---

## Existing Code Reuse

| What                        | Location                                                                                                         | Usage                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Calibration profile loading | `CalibrationContext` via `useCalibrationContext()`                                                               | Access `selectedProfile`, `savedProfiles`, `selectProfile()`                           |
| Profile persistence         | `src/services/calibrationProfileStorage.ts`                                                                      | Already loaded by CalibrationContext                                                   |
| Motor commands              | `useMotorCommands()` → `moveMotor({ mac, motorId, positionSteps })`                                              | Send MOVE commands, returns `Promise<CommandCompletionResult>`                         |
| Grid→motor mapping          | `src/types.ts` `MirrorAssignment` + grid config                                                                  | Look up `{ x: Motor, y: Motor }` per tile                                              |
| Target step computation     | Extract shared helper from `src/services/profilePlaybackPlanner.ts` (`computeAxisTarget`) into a reusable module | Compute motor steps to aim a tile at a normalized coordinate without duplicating logic |
| Space conversion            | `src/services/spaceConversion.ts` `patternToCentered()`, `getSpaceParams()`                                      | Convert `(0,0)` pattern point to centered space for the profile's rotation/aspect      |
| Camera pipeline             | `useCameraPipeline()` hook                                                                                       | Full camera stream, preprocessing, ROI, OpenCV worker interface                        |
| Camera preview UI           | `CalibrationPreview` component                                                                                   | Video feed with overlay canvases                                                       |
| ROI system                  | `NormalizedRoi` type, `useRoiOverlayInteractions`                                                                | ROI editing (drag, resize, reset)                                                      |
| Detection settings storage  | `src/services/detectionSettingsStorage.ts`                                                                       | Camera device ID, resolution, preprocessing params                                     |
| Calibration data types      | `TileCalibrationResults`, `CalibrationProfile`                                                                   | Per-tile calibration data: `adjustedHome`, `stepToDisplacement`, `axes`                |

---

## Initial Positioning: Stage All Tiles

Before convergence, all calibrated tiles are moved to non-overlapping staging targets so the camera never starts from a fully merged cluster.

`Start Convergence` must auto-run this phase if it has not been completed in the current alignment session.

### Staging target computation

For each usable tile in deterministic row-major order:

1. Assign a deterministic staging coordinate in centered space (e.g. ring or coarse grid around `(0,0)`), large enough to keep spots separated.
2. Build a centered target point for that tile: `stagingTarget[row,col] = { x, y }`.
3. Call `computeAxisTarget()` for each axis with the tile's calibration data and this staging target:
   - `normalizedTarget = stagingTarget[axis]`
   - `homeCoord = axis === 'x' ? adjustedHome.x : adjustedHome.y`
   - `homeSteps = axis === 'x' ? adjustedHome.stepsX : adjustedHome.stepsY`
   - `delta = normalizedTarget - homeCoord`
   - `deltaSteps = delta / stepToDisplacement[axis]`
   - `targetSteps = Math.round(homeSteps + deltaSteps)`
4. Send `moveMotor({ mac, motorId, positionSteps: targetSteps })` for both X and Y motors.
5. Wait for all `CommandCompletionResult` promises to resolve and apply settling delay.

### Error handling

- Skip tiles with `status !== 'completed'` or missing calibration data (`adjustedHome`, `stepToDisplacement`).
- If `computeAxisTarget` returns an error (`'missing_motor'`, `'missing_axis_calibration'`, `'target_out_of_bounds'`, `'steps_out_of_range'`), skip that axis and log the error.
- Surface per-tile staging/move errors in the progress panel.

---

## New Processing Pipeline: Adaptive Threshold + Contour Moments

The existing blob detection pipeline (SimpleBlobDetector) is optimized for finding individual spots. For alignment convergence, we need to analyze the merged reflection cluster as a single shape. This requires a new processing mode.

### OpenCV worker extension

Add a new message type to the OpenCV worker protocol:

**Outbound (client → worker):**

```ts
interface AnalyzeShapeParams {
  type: 'ANALYZE_SHAPE';
  requestId: number;
  frame: ImageBitmap; // preprocessed frame (brightness/contrast/CLAHE applied)
  width: number;
  height: number;
  roi: NormalizedRoi;
  adaptiveThreshold: {
    method: 'GAUSSIAN' | 'MEAN'; // default: 'GAUSSIAN'
    thresholdType: 'BINARY' | 'BINARY_INV'; // default: 'BINARY'
    blockSize: number; // must be odd, default: 51
    C: number; // constant subtracted from mean, default: 10
  };
  minContourArea: number; // minimum area to consider, default: 100 px²
}
```

**Inbound (worker → client):**

```ts
interface ShapeAnalysisResult {
  type: 'SHAPE_RESULT';
  requestId: number;
  coordinateSpace: 'frame-px'; // all returned coordinates are in full-frame processed pixels
  frameSize: { width: number; height: number };
  roiRect: { x: number; y: number; width: number; height: number } | null; // ROI in frame-px
  detected: boolean;
  contour: {
    // only present if detected === true
    area: number; // m00 — pixel area of the largest contour
    centroid: {
      // (m10/m00, m01/m00) in frame-px
      x: number;
      y: number;
    };
    eigenvalue1: number; // larger eigenvalue from second-order central moments
    eigenvalue2: number; // smaller eigenvalue
    eccentricity: number; // eigenvalue1 / eigenvalue2 (1.0 = circular)
    principalAngle: number; // radians, direction of elongation
    boundingRect: { x: number; y: number; width: number; height: number };
  } | null;
  // Debug/visualization data
  contourPoints?: Array<{ x: number; y: number }>; // frame-px, for overlay rendering
}
```

### Coordinate system contract

To prevent coordinate-space ambiguity:

- `ShapeAnalysisResult` coordinates are **always** returned in `frame-px` (full processed frame).
- ROI-relative values are not exposed in public result types.
- Overlay renderers consume `frame-px` only and project from that single source.

### Processing steps (inside worker)

Given a preprocessed frame (after brightness/contrast/CLAHE, cropped to ROI):

Alignment shape analysis does not apply any additional rotation transform in V1. It uses the camera pipeline orientation as-is.

**Step 1 — Convert to grayscale** (if not already):

```
cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
```

**Step 2 — Adaptive threshold (UI-configurable):**

```
cv.adaptiveThreshold(
    gray, binary, 255,
    adaptiveMethod,
    thresholdType,
    blockSize,  // neighborhood size (odd integer, e.g. 51)
    C           // constant subtracted from weighted mean (e.g. 10)
)
```

This produces a binary image robust to uneven lighting — essential for natural-light environments where global thresholds fail.

**Step 3 — Find contours:**

```
cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
```

**Step 4 — Select largest contour** by area. Filter out contours below `minContourArea`. If no contours remain, return `{ detected: false, contour: null }`.

V1 explicitly uses largest contour only (simplest robust behavior). Detached secondary contours are ignored in this version.

**Step 5 — Compute moments:**

```
const M = cv.moments(largestContour)
```

Extract:

- `area = M.m00`
- `centroidX = M.m10 / M.m00`
- `centroidY = M.m01 / M.m00`
- `mu20 = M.mu20`, `mu02 = M.mu02`, `mu11 = M.mu11`

**Step 6 — Derive shape metrics:**

```
discriminant = sqrt(4 * mu11² + (mu20 - mu02)²)
eigenvalue1  = 0.5 * (mu20 + mu02) + 0.5 * discriminant   // larger
eigenvalue2  = 0.5 * (mu20 + mu02) - 0.5 * discriminant   // smaller
eccentricity = eigenvalue1 / eigenvalue2                    // 1.0 = circular
principalAngle = 0.5 * atan2(2 * mu11, mu20 - mu02)        // radians
```

The eccentricity metric (eigenvalue ratio) tells us how elongated the merged cluster is. When all reflections overlap perfectly, the cluster is circular (eccentricity ≈ 1). When one tile is offset, the cluster stretches in that direction (eccentricity > 1).

### OpenCvWorkerClient extension

Add a new public method to `OpenCvWorkerClient`:

```ts
analyzeShape(params: Omit<AnalyzeShapeParams, 'type' | 'requestId'>): Promise<ShapeAnalysisResult>
```

This mirrors the existing `processFrame()` method pattern — assigns a request ID, posts the message with `ImageBitmap` transfer, and resolves the promise when the worker responds with a matching `SHAPE_RESULT`.

---

## Convergence Algorithm

### Overview

The algorithm operates in four phases. The user may trigger Phase 1 explicitly with "Move to Staging", but "Start Convergence" auto-runs Phase 1 first if needed. Phase 4 runs automatically at the end.

### Phase 1: Stage all tiles

1. Load the selected calibration profile.
2. Validate profile compatibility with current grid using partial/subset matching (full exact match not required).
3. Build convergence tile list in deterministic row-major order (`row asc`, then `col asc`), including only tiles with usable assignment+calibration.
4. Move every usable tile to its deterministic staging target (see "Initial Positioning: Stage All Tiles").
5. Wait for all motors to report arrival.
6. Allow a settling delay (e.g. 500ms).

### Phase 2: Reference setup

1. Select the first usable tile in row-major order as the **reference tile**.
2. Move only this reference tile from staging to calibrated center `(0,0)`.
3. Capture stable reference metrics from camera (call `analyzeShape()` N times and average):
   - `referenceArea`
   - `referenceEccentricity`
   - `referencePrincipalAngle`
4. Keep the reference tile fixed for the rest of the run.

### Phase 3: Incremental per-tile convergence (sequential)

Process remaining tiles one at a time in row-major order. For each candidate tile:

1. Measure a stable **pre-insert baseline** while candidate remains in staging.
2. Move candidate tile from staging to nominal center `(0,0)`.
3. Converge candidate tile axes (`x` then `y`) while all previously aligned tiles remain fixed.
4. Persist corrections and continue with next candidate.

```
referenceTile = first tile (already centered)
alignedTiles = [referenceTile]

for each candidateTile in remainingTiles(rowMajor):
    preInsertBaseline = measureShape() // cluster without candidate
    move candidateTile to nominal center
    for each axis in [x, y]:
        convergeAxis(candidateTile, axis, preInsertBaseline)
    alignedTiles.push(candidateTile)
```

#### `convergeAxis(tile, axis, preInsertBaseline)` algorithm

```
stepSize = initialStepSize  (e.g. 2 steps)
direction = +1
iteration = 0
bestMetrics = measureShape() // after candidate inserted
bestDelta = delta(bestMetrics, preInsertBaseline)

while iteration < maxIterations:
    iteration++

    currentPosition = tile.currentSteps[axis]
    trialPosition = currentPosition + (direction * stepSize)

    if trialPosition is outside calibrated axis range:
        mark axis as error('steps_out_of_range')
        break

    moveMotor(tile.motor[axis], trialPosition)
    waitForArrival()
    settlingDelay(200ms)

    trialMetrics = measureShape()
    trialDelta = delta(trialMetrics, preInsertBaseline)

    if improved(trialDelta, bestDelta):
        bestMetrics = trialMetrics
        bestDelta = trialDelta
        tile.currentSteps[axis] = trialPosition
        tile.correction[axis] += direction * stepSize

        if converged(trialDelta):
            break
    else:
        moveMotor(tile.motor[axis], currentPosition) // undo trial
        waitForArrival()
        settlingDelay(200ms)

        if iteration == 1:
            direction = -direction
        else:
            break
```

#### `delta(current, baseline)` definition

- `areaDeltaPct = abs(current.area - baseline.area) / max(1, baseline.area)`
- `eccDelta = abs(current.eccentricity - baseline.eccentricity)`

Lower deltas are better; perfect overlap of candidate into existing cluster trends toward minimal deltas.

#### `improved(trialDelta, bestDelta)` criteria (strategy-driven)

Default strategy (`any`):

- `trial.areaDeltaPct < best.areaDeltaPct * (1 - areaThreshold)` OR
- `trial.eccDelta < best.eccDelta * 0.98`

Alternative strategy (`weighted`, advanced):

- `score = areaWeight * areaDeltaPct + eccentricityWeight * eccDelta`
- Improvement if `trialScore < bestScore * (1 - scoreThreshold)`

#### `converged(delta)` criteria

Convergence is reached when **all** of the following hold:

- `areaDeltaPct <= areaThreshold`
- `eccDelta <= eccentricityThreshold` (default target equivalent to near-circular behavior, e.g. `~0.05`)
- Area is stable (last 3 readings within 2% of each other)

Notes:

- V1 still prioritizes deterministic axis-wise nudging and does **not** require centroid target locking.

#### `measureShape()` — stable measurement

To reduce noise, each measurement uses configurable stability settings:

1. Calls `analyzeShape()` `samplesPerMeasurement` times (default: 3) with ~100ms intervals.
2. Applies selected outlier strategy (default: MAD-filter).
3. Returns averaged `{ area, eccentricity, principalAngle }`.

### Phase 4: Final measurement

After all tiles have been processed:

1. Take a final stable shape measurement.
2. Record per-tile corrections:
   - Tile key, X steps correction, Y steps correction
   - Individual axis status and tile aggregate status
3. Compute summary:
   - Area delta vs reference baseline and run-start baseline
   - Eccentricity trend across incremental insertions
   - Number of tiles converged vs total
4. Display results in the progress panel.
5. Persist run summary/history and offer JSON export.

### Saving corrections

Convergence corrections are **not** written back to the calibration profile. They are ephemeral — the motor positions are adjusted in place.

However, run artifacts are persisted/exportable:

- Save run summary/history (baseline/final metrics, per-axis corrections/status, timestamps, settings used).
- Export run result as JSON.

Rationale:

- Calibration data represents measured physical properties (step-to-displacement ratios, home positions). Convergence adjustments are empirical nudges that compensate for aggregate error.
- Users can re-run convergence any time from the same calibration profile.
- Future enhancement: optionally apply saved offsets as a separate "alignment offset" layer linked to the profile.

---

## State Management

### New hook: `useAlignmentController`

`src/hooks/useAlignmentController.ts`

Orchestrates the alignment workflow. Internal state:

```ts
interface AlignmentState {
  phase: 'idle' | 'positioning' | 'measuring-baseline' | 'converging' | 'paused' | 'complete';
  baselineMetrics: ShapeMetrics | null;
  currentMetrics: ShapeMetrics | null;
  tileStates: Record<string, TileAlignmentState>;
  activeTile: string | null; // key of the tile currently being converged
  activeAxis: Axis | null;
  positioningComplete: boolean;
  settingsLocked: boolean;
  error: string | null;
}

interface TileAlignmentState {
  key: string;
  row: number;
  col: number;
  status:
    | 'pending'
    | 'in-progress'
    | 'converged'
    | 'partial'
    | 'max-iterations'
    | 'skipped'
    | 'error';
  initialSteps: { x: number; y: number };
  currentSteps: { x: number; y: number };
  correction: { x: number; y: number };
  iterations: { x: number; y: number };
  axes: {
    x: AxisAlignmentState;
    y: AxisAlignmentState;
  };
  finalEccentricity: number | null;
  error: string | null;
}

interface AxisAlignmentState {
  axis: Axis;
  motor: { nodeMac: string; motorId: number } | null;
  status: 'pending' | 'in-progress' | 'converged' | 'max-iterations' | 'skipped' | 'error';
  correctionSteps: number;
  iterations: number;
  error: string | null;
}

interface ShapeMetrics {
  area: number;
  eccentricity: number;
  principalAngle: number;
  centroid: { x: number; y: number };
}
```

### Dependencies

The hook consumes:

- `useCalibrationContext()` — selected profile
- `useMotorCommands()` — `moveMotor()`
- `OpenCvWorkerClient` — `analyzeShape()` (via the camera pipeline or directly)
- Grid configuration from `App.tsx` state (motor assignments)

---

## Overlay Rendering

### New overlay layer on camera preview

When the alignment page is active, render on the detection overlay canvas:

1. **Contour outline** — draw the detected contour polygon (from `contourPoints` in `ShapeAnalysisResult`) in a semi-transparent color.
2. **Centroid marker** — crosshair at the centroid position.
3. **Principal axis** — line through centroid in the principal angle direction, length proportional to eccentricity.
4. **Metrics readout** — text overlay showing:
   - `Area: {area} px²`
   - `Eccentricity: {eccentricity:.2f}`
   - `Angle: {degrees:.1f}°`

All overlay geometry uses `frame-px` coordinates from `ShapeAnalysisResult` and is projected once into canvas space.

### Color coding

- Eccentricity > 1.5: red (highly elongated, poor convergence)
- Eccentricity 1.1–1.5: yellow (making progress)
- Eccentricity < 1.1: green (near-circular, good convergence)

---

## Error Handling

| Scenario                                         | Handling                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| No calibration profile selected                  | Disable "Move to Staging" and "Start Convergence" buttons. Show prompt to select a profile.                                          |
| Tile missing calibration data                    | Skip tile, mark as `'skipped'` in progress panel.                                                                                    |
| Motor command timeout                            | Retry once. If second attempt fails, mark tile as `'error'`, log details, continue to next tile.                                     |
| Trial move exceeds calibrated axis range         | Mark axis `'error'` with `steps_out_of_range`, continue with remaining axis/tile processing policy.                                  |
| No contour detected (camera blocked, ROI wrong)  | Pause convergence and present actions: **Retry**, **Skip tile**, **Abort run**.                                                      |
| Shape analysis returns wildly different readings | Increase settling delay, retry measurement. If still unstable after 5 attempts, pause and warn user.                                 |
| Camera disconnected                              | Pause convergence and present actions: **Retry when camera is back**, **Skip tile**, **Abort run**.                                  |
| User clicks "Stop"                               | Stop after the in-flight motor command completes. Leave all motors at their current positions. Tile states reflect partial progress. |

---

## File Inventory

### New files

| File                                                  | Purpose                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `src/pages/AlignmentPage.tsx`                         | Top-level alignment page                        |
| `src/hooks/useAlignmentController.ts`                 | Convergence algorithm orchestration             |
| `src/services/alignmentRunStorage.ts`                 | Persist/export alignment run summaries          |
| `src/services/alignmentAxisTarget.ts`                 | Shared extracted axis-target computation helper |
| `src/components/alignment/AlignmentControlPanel.tsx`  | Convergence settings and controls               |
| `src/components/alignment/AlignmentProgressPanel.tsx` | Per-tile status table and summary               |
| `src/components/alignment/AlignmentShapeOverlay.tsx`  | Contour/metrics overlay rendering               |

### Modified files

| File                                     | Change                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/App.tsx`                            | Add `'alignment'` to `Page` union, render `AlignmentPage`, wire into context providers |
| `src/constants/navigation.ts`            | Add alignment nav item, add `'alignment'` to `NavigationIconKey`                       |
| `src/services/opencvWorkerClient.ts`     | Add `analyzeShape()` method, `AnalyzeShapeParams` / `ShapeAnalysisResult` types        |
| `src/services/profilePlaybackPlanner.ts` | Extract `computeAxisTarget()` logic into shared helper used by playback + alignment    |
| `public/opencv-classic-worker.js`        | Add `ANALYZE_SHAPE` message handler with adaptive threshold + moments pipeline         |
| `src/components/NavigationRail.tsx`      | Add icon for alignment page (if icon mapping needs updating)                           |

---

## Future Enhancements

These are explicitly out of scope for the initial implementation but worth noting:

- **Multi-target convergence** — aim subsets of tiles at different points.
- **Parallel tile processing** — nudge multiple tiles simultaneously when they're far enough apart to distinguish.
- **Persistent alignment offsets** — save per-tile step corrections as a separate record linked to the calibration profile.
- **Auto-ROI** — automatically detect and set the ROI around the reflection cluster.
- **Convergence speed optimization** — binary search step sizes, or use principal axis direction to choose which axis to nudge first.
