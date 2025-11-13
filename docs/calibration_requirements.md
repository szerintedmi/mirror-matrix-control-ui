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

- **Firmware / hardware**
  - Mirror array is fully controllable via existing motor controller protocol.
  - Calibration runs by sending commands to home and move individual tiles.
  - **Future option:** Some or all calibration data could be pushed into firmware (per-tile corrections), turning the app into a calibration+config tool.

---

## 3. Functional Requirements

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

#### 3.4.3 Confidence / Response Threshold

- Use `KeyPoint.response` as the **confidence level**.
- Expose a **“Minimum Confidence”** slider:
  - Interpret as a threshold on `response`.
  - UI can present this as a **0–100%** slider, internally mapped to response units.
  - Default: “20%” (exact mapping to be defined during implementation).
- Only blobs with `response >= minConfidence` are:
  - Overlaid on the preview.
  - Considered in calibration.

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
  - Ensure we **never focus all mirrors to the same point** during calibration.

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
      - Restrict ROI such that its reflection is clearly visible if possible.

   3. **Measure and record**:
      - Detect blob for the target tile:
        - Blob center in the **coordinate system chosen for playback** (normalized).
        - Blob size (initially from `KeyPoint.size`; normalization TBD).
        - Possibly average over multiple frames for robustness.
      - Store:
        - **Home displacement** for that tile (`dx`, `dy` relative to some ideal grid position).
        - **Blob size** for that tile at home position.
        - **Confidence** (response) used, or at least that it passed the threshold.

   4. **Optionally perform step-to-displacement characterization** (baseline consistency):
      - After storing the home measurement, move the target tile by a known number of steps in **X and Y** (same pattern for all tiles).
      - Measure the **change in projected position** on the wall.
      - Store:
        - `stepToDisplacementX` (e.g. pixels per step or normalized units/step)
        - `stepToDisplacementY`
      - Default delta: **±400 steps** per axis with ~250 ms dwell before sampling; expose both values in an "Advanced" settings section so installers can adjust safely for different hardware envelopes.
      - This data is for:
        - Checking consistency between tiles.
        - Driving the new playback mapping.

   5. **Mark tile as “calibrated” and move it to its “side” position**:
      - Distinguish visually calibrated vs not yet calibrated tiles (e.g. in debug grid).
      - Proceed to next tile.

4. **Completion**
   - After all tiles are processed:
     - Show final calibration results in the debug grid.
     - Allow user to **save** the calibration profile (see next section).

### 3.8 Calibration Profiles (Results)

A **Calibration Profile** stores the calibration **results**, not the detection settings.

#### 3.8.1 Content

For each profile:

- Metadata:
  - **Name** (required; user-provided).
  - **Timestamp** (auto-added on save).

- Per-tile data (for every mirror tile):
  - **Home displacement** in the **normalized playback coordinate system**:
    - `dx`, `dy` from ideal target grid location.
  - **Blob size** at home position:
    - Stored as a value **normalized** to the same coordinate system used by playback (e.g., relative to projection width/height in normalized units).
  - **Step-to-displacement mapping**:
    - `stepToDisplacementX` (how many **normalized coordinate** units per step in motor X).
    - `stepToDisplacementY` (normalized units per step in motor Y).

- **Baseline consistency / step-displacement consistency** is **part of the main profile**, not a separate “advanced” concept.
- Calibration profiles **must not** embed camera device info, ROI values, CLAHE sliders, or other detection-specific data.

#### 3.8.2 Coordinate System

- Every numeric value stored in a calibration profile is normalized into the same reference frame used by:
  - The pattern editor/grid (`0–1` canvas coordinates per axis) and
  - The projection/planner math (`reflectionSolver`).
- During calibration runs, any pixel or world-space measurements must be converted into this normalized frame **before** persisting.
- The requirement is **one shared, consistent coordinate system** for:
  - Pattern pixels on the wall.
  - Measured blob positions.
  - Step-to-displacement factors.
- This guarantees that playback can swap between legacy angle mode and calibration mode without additional per-profile transforms.

#### 3.8.3 Save / Load Behavior

- Multiple calibration profiles must be supported (different rooms/setups).
- Saving:
  - After a successful calibration run, user can:
    - Enter a **name**.
    - Save the current data as a profile.
  - System auto-stamps the timestamp.
- Loading:
  - User can select any saved calibration profile.
  - Profile is loaded and becomes the **active calibration** for playback.
- Storage:
  - Use `localStorage` (separate key/namespace from detection settings).

### 3.9 Calibration Playback Integration

#### 3.9.1 Legacy Playback (existing page)

- Remains angle-based and continues to use `reflectionSolver` → `planPlayback` → `buildAxisTargets`.
- Only navigation updates (to expose the new route) are needed for MVP; legacy UX stays untouched.

#### 3.9.2 Calibration Playback Route (new)

- Add a **new navigation entry/page** dedicated to calibration-based playback so it can evolve independently from the legacy flow.
- Requirements for this route:
  - User must pick a **Calibration Profile** (validated grid size + coordinate system) before playback controls unlock.
  - For MVP, reuse the existing pattern library to supply target points; roadmap item: add "ad hoc coordinate" tooling driven solely by calibration data.
  - Provide its own preview/status UI that does **not** depend on the legacy solver (preview parity can arrive post-MVP).
- Implement a **fresh playback solver** that:
  - Works purely from normalized calibration data plus pattern targets.
  - Bypasses `reflectionSolver` entirely—no intermediate angle math.
  - Converts normalized targets to motor steps via `homeOffset` and `stepToDisplacement` per tile.
  - Emits command plans compatible with the existing MQTT/motor command pipeline (skipped-axis reporting, clamping flags, etc.).

#### 3.9.3 Mapping Logic (Calibration Route)

For each mirror tile:

1. Define the desired projection point `(targetX, targetY)` based on the active pattern (shared normalized coordinate system).
2. Retrieve calibration data for the tile:
   - `homeOffset.dx`, `homeOffset.dy`
   - `stepToDisplacement.x`, `stepToDisplacement.y`
3. Compute displacement relative to home:

```
ΔX = targetX - homeOffset.dx
ΔY = targetY - homeOffset.dy
```

4. Convert to motor steps:

```
stepsX = ΔX / stepToDisplacement.x
stepsY = ΔY / stepToDisplacement.y
```

5. Issue commands to move the tile accordingly.

- The calibration solver owns this end-to-end pipeline and can later power a dedicated preview/diagnostics overlay without touching the legacy solver.

#### 3.9.4 Future Firmware Option

- Architecture should not prevent a later change where:
  - Calibration profiles (or a reduced form) are pushed to firmware.
  - Firmware then exposes higher-level positioning commands based on that data.

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
  homeOffset: { dx: number; dy: number }; // normalized 0–1 playback coords
  blobSize: number; // normalized to the same reference frame
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
  // optional additional metadata if needed
};
```

## Milestone 6 – Playback Integration

The final milestone integrates the calibration results into the actual pattern playback system. The new playback logic runs **alongside** the existing angle-based system, without removing or modifying the old behavior.

### 6.1 Two Playback Modes

The playback system must support switching between:

1. **Legacy Angle-Based Playback**
   - Uses the existing math: pattern → desired angles → motor steps.
   - Remains available for backward compatibility and testing.

2. **Calibration-Based Playback (New)**
   - Does **not** compute or use mirror angles.
   - Uses only calibration data:
     - Per-tile **home displacement** offsets (dx, dy) in the normalized playback coordinate system.
     - Per-tile **step-to-displacement mappings** (units per step in X and Y).
     - Normalized **blob size** if needed for wall-space scaling checks.
   - Maps pattern coordinates directly to required step movements.

### 6.2 Mapping Logic (Calibration-Based Mode)

For each mirror tile:

1. Define the desired projection point `(targetX, targetY)` based on the pattern (in the shared coordinate system).
2. Retrieve calibration data for the tile:
   - `homeOffset.dx`, `homeOffset.dy`
   - `stepToDisplacement.x`, `stepToDisplacement.y`
3. Compute required displacement relative to home:

```
ΔX = targetX - homeOffset.dx
ΔY = targetY - homeOffset.dy
```

4. Convert displacement to motor steps using calibration:

```
stepsX = ΔX / stepToDisplacement.x
stepsY = ΔY / stepToDisplacement.y
```

5. Issue commands to move the tile accordingly.

This fully bypasses the angle/geometry math used in the legacy model.

### 6.3 UI Integration

- Add a **playback mode selector**:
- **Angle-based playback**
- **Calibration-based playback**
- Add a **calibration profile selection dropdown** (enabled only in calibration mode).
- Show which profile is currently active.

### 6.4 Behavior & Constraints

- Calibration-based playback must use the exact same coordinate system that:
- The calibration measurements were normalized into.
- The pattern editor/rendering uses.
- Switching profiles should immediately update the mapping logic used for subsequent playback commands.
- Firmware changes are **not required** for MVP, but:
- Architecture must allow a future step where per-tile calibration data is pushed into firmware and the array becomes alignment-aware internally.

### 6.5 Summary

Milestone 6 introduces a **fully step-based, calibration-driven playback pipeline**, makes it selectable in the UI, and ensures it runs in parallel with the old angle-based system without breaking existing behavior.
