# Mirror Array Calibration – Requirements

## 1. Goal & Scope

Build a **camera-based calibration feature** for the mirror array using **OpenCV.js + SimpleBlobDetector** to:

- Detect reflected light spots (“blobs”) from each mirror tile on a wall.
- Measure and store:
  - The **home projection position** of each tile.
  - The **blob size** per tile.
  - The **relationship between motor steps and projection displacement**.
- Use this calibration to drive a **new playback mode** that does **not** rely on the old angle-based model, while still keeping the old model available as an option.

All of this lives in a new **“Calibration”** page/menu in the existing app.

---

## 2. High-Level Architecture

- **Frontend (browser)**
  - UI: Calibration page (camera view, controls, debug views, calibration runner, profile management).
  - Camera: `getUserMedia` on the **main thread**.
  - Processing: OpenCV.js (initially on main thread; future: move heavy work to a worker).
  - Persistence: `localStorage` (separate namespaces for **detection settings** vs **calibration profiles**).
  - Data model separation:
    - **Detection settings** (camera, ROI, processing, blob params) are persisted independently and never embedded into calibration profiles.
    - **Calibration profiles** contain only normalized, geometry-aware measurements that align with the shared playback coordinate system.

### 2.1 Frontend implementation snapshot (Nov 14, 2025)

Recent refactors split the legacy `CalibrationPage` blob into composable building blocks so future work (playback alignment, profile presets, CLAHE tuning) can iterate safely:

- `src/hooks/useDetectionSettingsController.ts` owns all persisted camera/detection state and profile CRUD helpers.
- `src/hooks/useCameraPipeline.ts` encapsulates camera streams, OpenCV worker messaging, and exposes a `captureBlobMeasurement` callback that the runner consumes.
- `src/hooks/useRoiOverlayInteractions.ts` keeps ROI pointer/overlay behavior isolated so preview UI stays declarative while the pipeline reuses the same handlers.
- `src/hooks/useCalibrationRunnerController.ts` wraps `CalibrationRunner` orchestration and feeds status into the UI.
- Presentational components live under `src/components/calibration/` (`CalibrationPreview`, `DetectionSettingsPanel`, `DetectionProfileManager`, `CalibrationRunnerPanel`) and accept typed props only.

If you need to extend the UI, prefer adding props/hooks instead of re-expanding `CalibrationPage`. When new state spans panels, lift it into a hook just like the structures above.

- **Firmware / hardware**
  - Mirror array is fully controllable via existing motor controller protocol.
  - Calibration runs by sending commands to home and move individual tiles.
  - **Future option:** Some or all calibration data could be pushed into firmware (per-tile corrections), turning the app into a calibration+config tool.

## 3. Functional Requirements

Throughout this section:

- **Home measurement** refers to the normalized blob reading captured at a tile's mechanical home position (center, size, capture timestamp, stability stats).
- **Adjusted home** is the normalized coordinate where that tile should land once aligned to the synthesized grid derived from the largest captured footprint plus configured gaps; stored per tile as `adjustedHome`.
- **Home offset** (`homeOffset = homeMeasurement - adjustedHome`) is the signed delta we remove when aligning the array and later use for drift checks.
- UI and profile schemas treat raw captures (home.\*, blob stats, `deltaSteps`, `Δnorm` inputs) as measurements and place derived values (homeOffset, `adjustedHome`, per-step factors, alignment steps) in separate groups so operators know the provenance of each number.

### 3.1 Calibration Page – Camera & Preview

1. **New “Calibration” menu/page** in the app.
2. On this page, user can:
   - Select **camera device**.
   - Select **resolution** (list available resolutions from the camera where feasible).
3. Show a **live preview**:
   - Default view: **raw camera feed**.
   - Provide a **toggle**:
     - **Raw view** (higher FPS, e.g. up to 30 FPS).
     - **Processed view** (image after pipeline + blob overlays).
4. Show **FPS** for processed view (for debugging / performance awareness).

### 3.2 Image Processing Pipeline (OpenCV.js)

All processing happens on the captured frames (initially on main thread):

1. **Grayscale conversion**
   - Always convert to grayscale as the base for further processing.
   - No extra user parameter for grayscale itself.

2. **Brightness / Contrast**
   - Implemented in OpenCV, **not** via MediaTrackConstraints.
   - Expose sliders (e.g. brightness offset, contrast scaling).
   - Applied before CLAHE.

3. **CLAHE Normalization**
   - Use OpenCV CLAHE to make blobs more distinguishable under different lighting.
   - Expose at least:
     - `clipLimit`
     - `tileGridSize` (tile size)
   - Both adjustable in the UI (these are critical for tuning to the environment).

4. **(Optional / future) Morphological ops**
   - Note: not required for MVP but pipeline should allow adding operations like blur, open/close later without breaking the UI model.

5. **Processed View**
   - The **processed preview** must show the image after the full pipeline (brightness/contrast + CLAHE + any future ops).
   - This is the image that blob detection runs on.

Target processing rate: **~10–15 FPS** for processed preview is acceptable.

### 3.3 Region of Interest (ROI) / Zoom

1. User can define a **Region of Interest**:
   - Used as the **processing window** for blob detection.
   - Helps focus only on the part of the wall where the array projects.

2. UI behavior:
   - Ability to **pan/zoom** into ROI:
     - A **zoomed view**: show only the ROI area enlarged.
     - A **full-frame view** with an overlaid **rectangle** marking the ROI.
   - ROI can be edited (drag/resize rectangle, numeric inputs, etc.).

3. Blob detection:
   - Runs **only within ROI** for performance and to avoid irrelevant blobs.

### 3.4 Blob Detection (SimpleBlobDetector)

We assume **SimpleBlobDetector is available in OpenCV.js**. If it is not, the entire approach has to be reconsidered.

#### 3.4.1 Availability Check

- As part of the **OpenCV integration milestone**:
  - Implement a **small throwaway test** (dev-only or hidden debug feature):
    - Create a SimpleBlobDetector instance.
    - Run it on a static or uploaded image.
    - Confirm it works (no runtime error, blobs detected).
  - If detector is unavailable or unusable, flag this as a **hard blocker** and revisit design.

#### 3.4.2 Basic Parameters (UI “Basic” section)

Exposed, with reasonable defaults:

- **filterByColor**: `true`
  - We look for **bright** blobs.
  - Blob color (bright vs dark) is set accordingly.

- **minThreshold**:
  - Exposed in the **basic** UI (slider).
  - Default around **30**.
- **maxThreshold**:
  - Default **255**.
  - Exposed in **advanced** settings, but can be adjusted if needed.

- **minArea**:
  - Default: ~**1500** (pixels).
  - Represents smallest blob allowed.
  - Overrideable in advanced settings.
- **maxArea**:
  - Default: ~**15000** (pixels).
  - Overrideable in advanced settings.

- **minConvexity**:
  - Have a reasonable default (e.g. moderate value).
  - Exposed in **advanced**.

- **minInertiaRatio**:
  - Default: ~**0.6**.
  - Exposed in **advanced**.

#### 3.4.4 Advanced Parameters

- Provide an **“Advanced” section** that exposes **all** SimpleBlobDetector parameters:
  - E.g. thresholdStep, minDistBetweenBlobs, filterByCircularity, filterByInertia, filterByConvexity, etc.
- Defaults should be sane; user can tweak if needed.

### 3.5 Live Overlay & Debug View

#### 3.5.1 Live Overlay on Preview

In **processed view**:

- Draw a **circle overlay** for each detected blob:
  - Center at `(x, y)` of `KeyPoint`.
  - Radius/diameter derived from `KeyPoint.size`.
- The overlay must reflect:
  - Current preprocessing parameters.
  - Current blob detector parameters.
- Show optional textual info on hover/tooltip (e.g. size, confidence).

The **initial homed state** may have overlapping blobs and ambiguous assignments. This is OK; show them anyway for visual feedback but do **not** rely on this state for calibration mapping.

#### 3.5.2 Calibration Debug Panel

- A **secondary debug view/panel** (toggle show/hide) that displays calibration results as a **grid view** representing the mirror array:
  - One cell per mirror tile.
  - Each cell contains, in compact form:
    - Home position displacement (e.g. `dx`, `dy`) in the **normalized coordinate system**.
    - Stored **blob size** for that tile at its home position (normalized or raw, to be defined).
    - Any additional per-tile metrics (e.g. step-to-displacement factors).
- The panel should **live-update** during auto-calibration and show final values when done.

### 3.6 Settings Persistence (Detection Settings)

This covers **camera + processing + blob detection** parameters.

- All detection-relevant settings are stored as **one structure**:
  - Camera:
    - selected device ID
    - resolution
  - ROI:
    - coordinates/dimensions
    - Stored as normalized ratios (`0–1` per axis) plus the last-known capture resolution for reference so tweaks survive camera resolution changes (implementation must verify cameras that crop per-resolution still behave as expected).
  - Processing:
    - brightness / contrast
    - CLAHE clipLimit, tileGridSize
  - Blob detector:
    - all parameters & thresholds (basic + advanced)

- Persistence:
  - Use `localStorage` (dedicated key/namespace).
  - On calibration page load:
    - Read stored settings if present.
    - Apply them to UI and pipeline.
  - On any change:
    - Save the updated structure back to `localStorage`.
- Detection settings are **never** copied into calibration profiles; profiles reference their own normalized measurements only.
- Changing detection settings must not mutate previously saved calibration profiles (and vice versa).

For now, **one active settings profile** is enough (no multi-profile for detection parameters).

### 3.7 Auto-Calibration Workflow

The goal of auto-calibration:  
For each mirror tile, measure how its reflection behaves and store that as calibration data.

#### 3.7.1 General Behavior

- Calibration is **automatic**, with controls:
  - **Start**
  - **Pause**
  - **Abort/Cancel**

- **Pause** semantics:
  - Do **not** attempt to interrupt currently running motor commands.
  - Allow the current command to complete and process the response.
  - Stop issuing any **new** motor commands until user resumes.

- **Abort/Cancel** semantics:
  - Stop issuing new calibration commands.
  - Return application to a **safe state** (e.g. UI state reset; optional safe reposition command after current action).
  - Do not rely on partial calibration result (implementation can choose to discard or explicitly mark as incomplete).

- Light safety:
  - We deal with **non-laser reflected light spots**.
  - Aim to avoid **focusing all mirrors to the same point** during calibration but no extreme pre-caution is required as calibration will be always supervised.

#### 3.7.2 Calibration Steps (Per Run)

1. **Precondition**:
   - User has tuned detection parameters (camera + processing + blob settings) to reliably detect blobs for the current environment.
   - These detection settings are saved.

2. **Home All Mirrors**
   - Issue a command to home all mirror tiles to their mechanical zero.
   - Show any blobs detected in this state (can overlap; not used for mapping).

3. **Calibrate One Tile at a Time**

   For each tile in a deterministic order (e.g. row-major, starting from top-left):
   1. **Move all non-target mirrors “to the side”**:
      - Do **not** send them all to the same convergence point.
      - Use a **deterministic, evenly staggered pattern** along one side (e.g. right side of the projection):
        - Tiles distributed in rows/columns to reduce concentration of light.
      - Implementation details:
        - Moves defined in steps (fixed offsets) rather than angles.
        - Pattern must be reproducible independent of tile count.

   2. **Keep the target tile at its “home” position**:
      - This is its mechanical home position (but optically it may be misaligned).

   3. **Measure and record**:
      - Detect blob for the target tile and store:
        - The "uncalibrated" Blob center in the **coordinate system chosen for playback** (normalized).
        - **Blob size** for that tile at home position. (initially from `KeyPoint.size`; normalization TBD).

   4. **Perform step-to-displacement characterization** (baseline consistency):
      - After storing the home measurement, move the target tile by a known number of steps in **X and Y** . (same pattern for all tiles).
      - Measure the **change in projected position** on the wall and the size at the new position.
      - Store:
        - `stepToDisplacementX` (e.g. pixels per step or normalized units/step)
        - `stepToDisplacementY`
        - `sizeDeltaAtStepTest`: +/- compared to the home size so installers can audit hotspotting
      - Default delta: **±400 steps** per axis; expose it in an "Advanced" settings section so installers can adjust safely for different hardware envelopes.
      - This data is for:
        - Checking consistency between tiles.
        - Driving the new playback mapping.

   5. **Mark tile as “measured”**
      - Move it to the left edge , distributed the same way as the "uncalibrated" mirror layed out earlier, just the other side
      - Distinguish visually calibrated vs not yet calibrated tiles on a new calibration array overview component (it should be a compact visual overview similar to the existing array overview conponent).
      - Keep the results updated in the overview component
      - Proceed to next tile.

4. **Completion after all tiles are measured**
   - Use the largest captured tile footprint to calculate the aligned ("adjusted home") grid so every tile has a deterministic normalized destination. Keep storing the blueprint under `adjustedTileFootprint`/`tileGap` for continuity, but describe this grid to users as the adjusted home layout.
   - Ensure tiles in this adjusted grid never cross (tile `0,0` must map to the top-left cell, mirrored columns accounted for) and respect installer-defined gaps.
   - Calculate each tile's **home offset**: `homeOffset = homeMeasurement - adjustedHome`. These `dx`/`dy` deltas explain how far mechanical home is from the aligned target before we issue corrective moves.
   - Show the final calibration results in the array overview/debug modal with the new grouping: left column for measurements (home.\*, detection stability, step measurement deltas) and right column for derived values (homeOffset, `adjustedHome`, per-step factors, alignment steps, informational blob metrics). Highlight outliers per category, especially:
     - `homeOffset.dx|dy` magnitudes required to sit on the aligned grid.
     - Blob size spread between tiles.
     - `stepToDisplacement` variance that might impact targeting accuracy.
   - Move all tiles to their adjusted home positions by applying `-homeOffset` through `stepToDisplacement` so the array physically matches the synthesized grid at the end of the run.
   - Allow user to **save** the calibration profile (see next section).

### 3.8 Calibration Profiles (Results)

A **Calibration Profile** stores the calibration **results**, not the detection settings.

#### 3.8.1 Content

For each profile:

- Metadata:
  - **Name** (required; user-provided).
  - **Timestamp** (auto-added on save).
  - **Grid blueprint** derived from the completion step in §3.7:
    - `adjustedTileFootprint`: normalized width/height computed from the **largest** captured tile at home. The name stays for backward compatibility, but it now represents the adjusted home footprint.
    - `tileGap`: normalized space between tile footprints, stored per axis (`x`, `y`) so we can translate installer intent across aspect ratios.
    - `gridOrigin`: normalized offset applied when pushing tiles to the aligned grid (defaults to `(0, 0)` but stored so future firmware uploads stay deterministic).
  - **Step-test settings** actually used during the run (so advanced overrides persist with the data):
    - `deltaSteps` per axis (default ±400 from §3.7.2.3.4).

- Per-tile data (for every mirror tile):
  - **Adjusted home target** in the **normalized playback coordinate system**:
    - stored as `adjustedHome.{x,y}` so playback can refer to the aligned grid center directly.
  - **Home offset** in the same coordinate system:
    - stored as `homeOffset.{dx,dy} = homeMeasurement - adjustedHome` (zero once the array has been aligned but retained for drift inspection and re-alignment).
  - **Blob size** at home position:
    - Stored as a value **normalized** to the same coordinate system used by playback (e.g., relative to projection width/height in normalized units).
  - **Step-to-displacement mapping**:
    - `stepToDisplacementX` (how many **normalized coordinate** units per step in motor X).
    - `stepToDisplacementY` (normalized units per step in motor Y).
  - **Size delta at displacement**:
    - `sizeDeltaAtStepTest` captures how blob size changed during the ±step characterization so installers can spot hotspotting or clipping issues later.

- **Baseline consistency / step-displacement consistency** is **part of the main profile**, not a separate “advanced” concept.
- Calibration profiles **must not** embed camera device info, ROI values, CLAHE sliders, or other detection-specific data.

#### 3.8.2 Coordinate System

- Every numeric value stored in a calibration profile is normalized into the same reference frame used by:
  - The pattern editor/grid (`0–1` canvas coordinates per axis) and
  - The projection/planner math (`reflectionSolver`).
- This includes both `adjustedHome` coordinates and the associated `homeOffset` deltas so alignment math never mixes coordinate systems.
- During calibration runs, any pixel or world-space measurements must be converted into this normalized frame **before** persisting.
- `gridBlueprint.tileGap.{x,y}` and `adjustedTileFootprint` live in this normalized frame as well so playback and previews can reconstruct the aligned layout without recomputing Section 3.7 math client-side.
- The requirement is **one shared, consistent coordinate system** for:
  - Pattern pixels on the wall.
  - Measured blob positions.
  - Step-to-displacement factors.
  - Grid blueprint metadata (tile footprint, gap, origin).
- This guarantees that playback can swap between legacy angle mode and calibration mode without additional per-profile transforms.
- The **calibration-native pattern designer** (see §3.9.5) uses this same normalized playback frame, treated as a fixed **1:1 canvas** where both axes span `[0, 1]`.

#### 3.8.3 Save / Load Behavior

- Multiple calibration profiles must be supported (different rooms/setups).
- Saving:
  - After a successful calibration run, user can:
    - Enter a **name**.
    - Save the current data as a profile.
  - System auto-stamps the timestamp.
  - Partial runs can still be saved, but tiles that never completed auto-cal remain explicitly flagged (e.g., `null` tile entries) so playback can warn/block.
- Loading:
  - User can select any saved calibration profile.
  - Profile is loaded and becomes the **active calibration** for playback.
- Storage:
  - Use `localStorage` (separate key/namespace from detection settings).

### 3.9 Calibration Playback Integration

#### 3.9.1 Legacy Playback (existing page)

- Remains angle-based and continues to use `reflectionSolver` → `planPlayback` → `buildAxisTargets`.
- Surfaced in the UI as **Playback (legacy)** together with the existing pattern tooling shown as **Patterns (legacy)**; this path remains available for backward compatibility and testing while the calibration-native pipeline matures.
- Legacy pattern and projection storage (localStorage keys, etc.) does **not** need to be preserved for the calibration-native flow; it may be cleared or migrated independently as long as angle-based playback continues to function.

#### 3.9.2 Calibration Playback Route (new)

- Add a **new navigation entry/page** (labelled **Playback**) dedicated to calibration-based playback so it can evolve independently from **Playback (legacy)**.
- Requirements for this route:
  - User must pick a **Calibration Profile** (validated grid size + coordinate system) before playback controls unlock.
  - Use a **new calibration-native pattern library** as the sole source of target points; the legacy pattern library is _not_ reused in this mode.
  - Provide its own preview/status UI that does **not** depend on the legacy solver (preview parity can arrive post-MVP).
  - Surface the profile's **grid blueprint** (tile footprint + gap + origin) so installers can confirm the aligned grid computed in §3.7; treat profiles missing this metadata as invalid.
- Implement a **fresh playback solver** that:
  - Works purely from normalized calibration data plus pattern targets.
  - Bypasses `reflectionSolver` entirely—no intermediate angle math.
  - Converts normalized targets to motor steps using `adjustedHome` + `stepToDisplacement` per tile, and optionally performs a pre-flight `homeOffset` correction if the array is not already aligned.
  - Can optionally leverage `sizeDeltaAtStepTest` to warn if a requested displacement risks shrinking/growing blobs beyond the characterized envelope (roadmap-level warning, but solver API should expose the metric).
  - Emits command plans compatible with the existing MQTT/motor command pipeline (skipped-axis reporting, clamping flags, etc.).

#### 3.9.3 Mapping Logic (Calibration Route)

For each mirror tile:

1. Define the desired projection point `(targetX, targetY)` based on the active pattern (shared normalized coordinate system).
2. Retrieve calibration data for the tile:
   - `adjustedHome.x`, `adjustedHome.y`
   - `homeOffset.dx`, `homeOffset.dy` (used for a preparatory "move to grid" if the tile hasn't been aligned since calibration).
   - `stepToDisplacement.x`, `stepToDisplacement.y`
3. If needed, schedule an alignment move:

```
alignmentX = -homeOffset.dx
alignmentY = -homeOffset.dy
```

Convert those values to steps with the per-axis `stepToDisplacement` values and enqueue them before any pattern moves. Once applied, treat `homeOffset` as zero for that tile. 4. Compute displacement relative to the adjusted home grid:

```
ΔX = targetX - adjustedHome.x
ΔY = targetY - adjustedHome.y
```

5. Convert to motor steps:

```
stepsX = ΔX / stepToDisplacement.x
stepsY = ΔY / stepToDisplacement.y
```

6. Issue commands to move the tile accordingly.

- The calibration solver owns this end-to-end pipeline, reuses the profile's grid blueprint to ensure the requested points respect the stored gap/origin, and can later power a dedicated preview/diagnostics overlay without touching the legacy solver.

#### 3.9.4 Future Firmware Option

- Architecture should not prevent a later change where:
  - Calibration profiles (or a reduced form) are pushed to firmware.
  - Firmware then exposes higher-level positioning commands based on that data.

#### 3.9.5 Calibration-Native Pattern Designer (New)

The calibration-based playback path uses a **new pattern designer and library** that are independent from the legacy system.

- **Separation from legacy tools**
  - Existing angle-based tools are surfaced as **Patterns (legacy)** / **Playback (legacy)** and keep their current behavior and storage.
  - The new calibration-native designer is exposed as **Patterns** and feeds only the calibration-based **Playback** page.
  - Calibration-native patterns do **not** depend on legacy pattern or projection storage; legacy entries can be removed without affecting the new flow.

- **Canvas and alignment**
  - The calibration-native pattern canvas has a fixed **1:1 aspect ratio**, representing the normalized playback coordinate system where both axes span `[0, 1]`.
  - For MVP, only a simple **center alignment** is supported: patterns are authored directly in this normalized frame and interpreted identically for all calibration profiles.

- **Pattern semantics**
  - Each pattern is a set of **normalized target points**; patterns are **profile-agnostic** and never store calibration profile identifiers.
  - Overlapping points are fully allowed: multiple pattern points may share identical normalized coordinates, as long as the total point count does not exceed the number of available mirrors.
  - The designer must preserve the existing **overlap shading** behavior from the current pattern editor (overlay counts and max-brightness logic) so authors can visualize concentration of points when they overlap.

- **Calibration-aware overlays (optional helper)**
  - While editing, the user may optionally select an **active Calibration Profile**.
  - When a profile is selected, the designer displays a helper overlay that visualizes:
    - The **measured reachable canvas** for that profile, derived from `stepToDisplacement` and configured motor step limits to show where tiles can be steered safely in normalized coordinates.
    - Per-tile blob footprints sized to the profile’s **maximum measured blob size** (normalized), so authors can see approximate projected spot size.
  - These overlays are informational only; they do not change the stored pattern coordinates.

- **Behavior without a selected calibration profile**
  - When no calibration profile is selected, the designer uses reasonable defaults for:
    - The effective canvas bounds (still `[0, 1] × [0, 1]`, but with default virtual grid density / framing).
    - Default blob size used for visualization.
  - These defaults are driven by shared constants and may be user-adjustable in the UI, but they are not persisted into calibration profiles.

- **Preview (lower priority)**
  - A future enhancement can add a simplified preview for calibration-based playback that:
    - Renders pattern points, mirror tile assignments, and target positions in the normalized calibrated space.
    - Does **not** model sun position, wall distance, or wall angle; it only needs calibration data plus the normalized pattern.
  - This preview is lower priority than the core calibration, pattern, and playback flows.

---

## 4. Non-Functional Requirements

1. **Performance**
   - Processed view target: **10–15 FPS**.
   - Raw preview can be higher (e.g. up to **30 FPS**).
   - Calibration processing must not make the UI feel frozen.
   - For MVP, camera capture and OpenCV run on the **main thread**, but:
     - Code should be structured so that image processing can be moved to a **Web Worker + OffscreenCanvas** later if needed.

2. **Responsiveness**
   - UI remains responsive while:
     - Camera is streaming.
     - Blob detection is running.
     - Calibration is issuing motor commands and receiving responses.

3. **Safety**
   - Never focus all mirrors on one small spot during calibration.
   - Use a **spread-out side pattern** for non-target mirrors.
   - Provide **Pause** and **Abort** for the calibration process.

4. **Reliability**
   - Calibration runs should:
     - Handle transient detection failures gracefully (e.g. temporarily missing blobs).
     - Not corrupt existing calibration profiles.
   - Partial calibrations:
     - Retry each tile a configurable number of times before marking it **uncalibrated**.
     - Allow the user to save partial profiles (with explicit warnings highlighting missing tiles) or rerun the process.

5. **Browser Compatibility**
   - Rely on features broadly available in modern browsers (Chrome, Firefox, Edge, Safari).
   - No hard requirement for OffscreenCanvas/worker in MVP, but nice-to-have path later.

---

## 5. Data Structures (Conceptual)

These are **conceptual** and can be adjusted in implementation, but they show expected fields.

### 5.1 Detection Settings (single active profile)

```ts
type DetectionSettings = {
  camera: {
    deviceId: string | null;
    resolution: { width: number; height: number } | null;
  };
  roi: {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  processing: {
    brightness: number;
    contrast: number;
    claheClipLimit: number;
    claheTileSize: number;
  };
  blobParams: {
    filterByColor: boolean;
    blobColorBright: boolean; // true = bright blobs
    minThreshold: number;
    maxThreshold: number;
    minArea: number;
    maxArea: number;
    minConvexity: number;
    minInertiaRatio: number;
    minConfidence: number; // interpreted as %
    // plus all SimpleBlobDetector params as needed
  };
};
```

### 5.2 Calibration Profile

```ts
type TileCalibration = {
  adjustedHome: { x: number; y: number }; // normalized aligned-grid coordinate
  homeOffset: { dx: number; dy: number }; // normalized delta = homeMeasurement - adjustedHome
  blobSize: number; // normalized to the same reference frame
  sizeDeltaAtStepTest: number; // normalized delta captured during ±step characterization
  stepToDisplacement: {
    x: number; // normalized units per step X
    y: number; // normalized units per step Y
  };
};

type CalibrationProfile = {
  id: string; // internal
  name: string; // user-provided
  timestamp: string; // ISO string
  tiles: TileCalibration[][]; // 2D grid [row][col]
  coordinateSystem: 'normalized-playback'; // explicit reference frame tag
  gridBlueprint: {
    adjustedTileFootprint: { width: number; height: number }; // normalized dims derived from largest tile (adjusted home footprint)
    tileGap: { x: number; y: number }; // normalized spacing between footprints per axis
    gridOrigin: { x: number; y: number }; // normalized offset applied after calibration (usually 0,0)
  };
  stepTestSettings: {
    deltaSteps: number; // absolute steps used during measurement (default 400)
  };
  // optional additional metadata if needed
};
```

## Milestone 6 – Playback Integration

The final milestone integrates the calibration results into the actual pattern playback system. The new playback logic runs **alongside** the existing angle-based system, without removing or modifying the old behavior.

### 6.1 Two Playback Modes

The playback system must support switching between:

1. **Legacy Angle-Based Playback**
   - Uses the existing math: pattern → desired angles → motor steps.
   - Remains available for backward compatibility and testing, surfaced in the UI as **Playback (legacy)** together with **Patterns (legacy)**.

2. **Calibration-Based Playback (New)**
   - Does **not** compute or use mirror angles.
   - Uses only calibration data together with **calibration-native patterns**:
     - Per-tile **adjusted home** coordinates plus `homeOffset` deltas in the normalized playback coordinate system.
     - Per-tile **step-to-displacement mappings** (units per step in X and Y).
     - Normalized **blob size** if needed for wall-space scaling checks.
     - Profile-level **grid blueprint** metadata (tile footprint, gap, origin) so solver/previews can honor the aligned grid computed during calibration.
   - Maps normalized pattern coordinates directly to required step movements without any dependency on the legacy projection settings.

### 6.2 Mapping Logic (Calibration-Based Mode)

For each mirror tile:

1. Define the desired projection point `(targetX, targetY)` based on the pattern (normalized coordinate system shared with calibration).
2. Retrieve calibration data for the tile:
   - `adjustedHome.x`, `adjustedHome.y`
   - `homeOffset.dx`, `homeOffset.dy`
   - `stepToDisplacement.x`, `stepToDisplacement.y`
3. If the tile has not been aligned yet, enqueue an alignment move using `alignmentX = -homeOffset.dx` / `alignmentY = -homeOffset.dy` converted through the per-step factors.
4. Compute required displacement relative to the adjusted home grid:

```
ΔX = targetX - adjustedHome.x
ΔY = targetY - adjustedHome.y
```

5. Convert displacement to motor steps using calibration:

```
stepsX = ΔX / stepToDisplacement.x
stepsY = ΔY / stepToDisplacement.y
```

6. Issue commands to move the tile accordingly.

This fully bypasses the angle/geometry math used in the legacy model.

### 6.3 UI Integration

- Expose **two distinct navigation entries** for playback:
  - **Playback (legacy)** → existing angle-based playback page using the legacy pattern library.
  - **Playback** → new calibration-based playback page driven by calibration profiles and the calibration-native pattern library.
- Expose **two distinct navigation entries** for pattern authoring:
  - **Patterns (legacy)** → existing angle-based pattern designer and library.
  - **Patterns** → new calibration-native pattern designer described in §3.9.5.
- Within the calibration-based **Playback** page:
  - Require the user to select an **active calibration profile** before playback controls unlock.
  - Require the user to select a **calibration-native pattern** from the new library.
  - Provide a **calibration profile selection dropdown** and clearly display which profile is currently active.
  - Optionally (lower priority) include a simple 2D preview that shows pattern points, mirror assignments, and target positions in normalized calibrated space without modeling wall/sun geometry.

### 6.4 Behavior & Constraints

- Calibration-based playback must use the exact same coordinate system that:
  - The calibration measurements were normalized into.
  - The calibration-native pattern designer/rendering uses (fixed 1:1 normalized canvas).
- Calibration-native patterns are **profile-agnostic**; a single pattern can be played against any calibration profile that meets the constraints below.
- Playback is only permitted when:
  - A valid **calibration profile** is selected.
  - The number of pattern points does **not** exceed the number of available mirror tiles; if there are fewer tiles than points, playback is rejected (no partial runs).
  - Every requested target for each assigned tile lies within that tile’s **calibrated reachable region** (derived from `adjustedHome`, `stepToDisplacement`, and configured motor step limits); if any requested target is out of bounds, playback is rejected rather than clamped.
- Overlapping pattern points are allowed:
  - Multiple pattern points may share identical normalized coordinates.
  - The solver still assigns each point to a mirror tile (subject to the capacity constraint above), and different mirrors may be commanded to the same normalized location.
- The UI must surface clear validation errors (e.g. insufficient mirrors, out-of-bounds targets, missing profile) before any motor commands are sent.
- Firmware changes are **not** required for MVP, but the architecture must allow a future step where per-tile calibration data is pushed into firmware and the array becomes alignment-aware internally.

### 6.5 Summary

Milestone 6 introduces a **fully step-based, calibration-driven playback pipeline** backed by a new calibration-native pattern designer, exposes it via dedicated **Playback** / **Patterns** navigation entries, and ensures it runs in parallel with the old angle-based system (**Playback (legacy)** / **Patterns (legacy)**) without breaking existing behavior.
