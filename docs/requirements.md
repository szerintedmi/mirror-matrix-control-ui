# Kinetic Mirror Matrix — MVP Requirements (UI + MQTT Control)

## 0. Background & Goals

The UI provides a visual workspace for arranging mirrors, sketching patterns, and previewing light behavior while firmware on ESP32 tile drivers handles motion control (see [https://github.com/szerintedmi/kinetic-mirror-matrix-esp32](kinetic-matrix-esp32)). It bridges the React front end to the full MQTT command set so pattern playback can target live tile drivers without a serial CLI.

---

## 1. Purpose & Scope

A single-page, browser-based controller for a modular kinetic mirror array. The MVP focuses on:

- Discovering tile drivers via MQTT.
- Configuring a grid by assigning motors (two axes per tile).
- Designing and selecting simple patterns.
- Converting patterns into absolute motor positions.
- Issuing commands over MQTT and tracking status.
- Providing a physically accurate BabylonJS 3D preview plus 2D overlays based on the shared reflection solver.

Out of scope for MVP: pattern sequencing, multiple saved grid configurations, cloud backend, calibration workflows, photorealistic rendering modes beyond the BabylonJS preview.

### Ownership & Precedence

- Tile-driver-side MQTT configuration remains managed by the tile drivers' own interfaces (firmware/CLI). This UI configures only its connection to the MQTT broker (host/port/path, etc.) and must expose those settings in the UI.
- Deep diagnostics, serial command console, and networking runbooks are owned by the firmware/CLI project and linked from this UI; this app provides lightweight logging and status only.

### Users & Personas

- Technical users with with laptop

### Feature Pillars

- Configurator: tile driver discovery, drag-and-drop motor assignment, selective clearing/reset with confirmations.
- Pattern Editor: grid-based paint/erase with canvas resize and guardrails not to exceed available mirrors.
- Pattern Library: list, preview, select active, delete; show projected footprint estimates based on simulation parameters.
- Simulation: shared geometry solver feeding a BabylonJS 3D preview (array, wall, sun vector, ellipses) plus derived 2D projections and numeric readouts.
- Operational Insights: surface homing state, awake/asleep, thermal budgets, and motion timing from MQTT status.

---

## 2. Glossary

- **Tile Driver:** ESP32 controller reporting status and accepting commands; typically manages up to eight motors (about four tiles) but may handle fewer or more.
- **Motor:** Single-axis actuator; two motors form one tile (X and Y).
- **Tile:** Logical mirror unit on the grid; requires two motors (X/Y).
- **Grid:** Logical arrangement of tiles (for example, 8×8); may differ from physical wiring.
- **Canvas:** Virtual 2D coordinate space (integer rows/cols, top-left origin, often higher resolution than the tile grid) where patterns are sketched as target points; brighter regions emerge when multiple tiles are steered toward nearby canvas coordinates.
- **Pattern:** Set of active points on a 2D canvas to be projected.
- **MVP:** Minimum viable product; see feature list.

---

## 3. System Overview

- Frontend-only single-page application; runs in the browser.
- Uses MQTT over WebSockets to connect to a LAN broker.
- Stores configuration in browser `localStorage`.
- Uses existing tile-driver MQTT schemas for commands and status.
- Linear angle-to-steps mapping; absolute positions range from -1200 to +1200 steps with zero centered.

**Physical constants**

- Mirror size: 50 mm × 50 mm.
- Gap between mirrors: 3 mm.
- Center-to-center pitch: 53 mm.

---

## 4. MQTT Protocol (per existing specs)

**References (for implementers)**

- `mqtt-command-schema.md` — command definitions, topics, payloads.
- `mqtt-status-schema.md` — status payload definitions.
- Local integration overview for this UI: [MQTT Integration Guide](docs/mqtt-integration.md).

**Topics (canonical)**

- `devices/<mac>/status` — QoS 0, retain=false; includes tile-driver and motor fields. Broker Last Will publishes `{"node_state":"offline","motors":{}}` on the same topic.
- `devices/<mac>/cmd` — frontend-to-tile-driver commands.
- `devices/<mac>/cmd/resp` — acknowledgements, completion, errors; includes `cmd_id`.

**Discovery & offline**

- Tile drivers publish live snapshots at 1 Hz idle / 5 Hz during motion without retain; the UI typically sees tile drivers within a second of subscribing.
- Tile drivers set LWT; broker publishes offline payload on disconnect. The UI relies on LWT for offline marking (no additional stale-timeout).

**Commands & correlation**

- MQTT 3.x (no MQTT5 features).
- Each command may include a `cmd_id` (UUID). If omitted, the tile driver generates one and echoes it in `cmd/resp`.
- `cmd/resp` includes estimated finish time; UI may display it, but status remains the source of truth for completion.

**Granularity**

- MOVE: one message per motor.
- HOME: can be batched with `HOME:ALL` per tile driver.

**QoS**

- Commands and acknowledgements: QoS 1 (reliable).
- Status and telemetry: QoS 0 (best effort).

---

## 5. Browser ↔ Broker

- Broker exposes WebSocket endpoint (WS/WSS). MVP assumption: LAN, basic username/pass authentication.
- UI provides a simple MQTT settings panel (host, port, credentials) with defaults stored in code; persisted in `localStorage`.
- Separation of concerns:
  - Tile-driver-side MQTT configuration (broker host/creds used by tile drivers) remains configurable via tile-driver interfaces maintained in the firmware project (see https://github.com/szerintedmi/kinetic-mirror-matrix-esp32).
  - UI-side MQTT configuration (how this app connects to the broker) is configurable in this UI and persists locally.

---

## 6. Status & Telemetry (read-only)

- UI consumes `devices/<mac>/status` for:
  - Tile-driver discovery via newly spotted mac addresses.
  - Tile-driver info: IP, MAC, status URL, etc.
  - Per-motor info: id (0–7), `position`, `moving`, `awake`, `homed`, `steps_since_home`, thermal metrics (`budget_s`, `ttfc_s`), motion settings (`speed`, `accel`), and timing values (`est_ms`, `started_ms`, `actual_ms`).
- Store per-tile-driver first-seen and last-seen timestamps (derived from message arrival times) to power "New" indicators and session discovery counters.
- Treat stale telemetry as a warning: if no status update arrives for a tile driver after 2 seconds, flag the driver as "potentially offline" (yellow) while still awaiting the broker LWT. Upon receipt of the explicit offline payload, transition the marker to red.
- When the MQTT client disconnects from the broker, immediately mark all known tile drivers as offline (red) until the connection is re-established and fresh telemetry is received.
- Homing indicators:
  - Yellow when `steps_since_home` > 5,000.
  - Red when `steps_since_home` > 10,000.

Thresholds are code constants for easy tuning.

---

## 7. Configuration (persistent in browser)

Storage: `localStorage` (single active grid configuration in MVP).

### 7.1 MQTT Settings

```json
{
  "mqtt": {
    "scheme": "ws",
    "host": "192.168.1.10",
    "port": 9001,
    "path": "/mqtt",
    "username": "",
    "password": ""
  }
}
```

### 7.2 Grid Configuration (single active)

```json
{
  "grid": {
    "name": "default",
    "cols": 8,
    "rows": 8,
    "tiles": [
      {
        "row": 0,
        "col": 0,
        "motor_x": { "mac": "A1B2C3D4E5F6", "id": 0 },
        "motor_y": { "mac": "A1B2C3D4E5F6", "id": 1 }
      }
      // ... one entry per tile. Unassigned tiles may omit motor references.
    ]
  }
}
```

- Cross-pairing across tile drivers is allowed.
- A motor represents one tile axis; prevent sharing the same motor across multiple tiles.
- Unassigned tiles are permitted; playback skips them.

### 7.3 Projection Settings (persisted)

```json
{
  "projection": {
    "wall_distance_m": 2.0,
    "wall_angle_vertical_deg": 0.0,
    "wall_angle_horizontal_deg": 0.0,
    "incoming_light_vertical_deg": 0.0,
    "incoming_light_horizontal_deg": 0.0
  }
}
```

### 7.4 Pattern (example skeleton)

```json
{
  "pattern": {
    "name": "example",
    "canvas": { "width": 256, "height": 256 },
    "points": [
      { "x": 120, "y": 64 },
      { "x": 180, "y": 120 }
    ]
  }
}
```

- Canvas resolution can exceed grid bounds; the editor caps active points to the number of available tiles.
- Brighter regions are achieved by sketching multiple points that the conversion layer aligns on exactly the same wall coordinates; tiles can therefore project to distinct, partially overlapping, or perfectly overlapping targets without storing an explicit intensity per point.

---

## 8. UI — Single-Page Dashboard

Target users are technical; keep the interface clean and efficient.

### 8.1 Header Summary / Overview

- Tile-driver and motor counters (online, offline, moving, homed/not homed) with color coding.
- Pattern Library (landing dashboard) includes a compact array overview that renders the entire configured grid. Each tile shows two minimal status dots (X/Y axes) with color coding for assigned, moving, stale, offline, and placeholder states so unassigned slots remain visible.
- Global Stop button (convenience; low-risk small steppers).
- Quick indicators for warnings/errors (badge linking to log panel).
- Dedicated badge showing count of tile drivers discovered during the current session and a quick link to focus the list on them.

### 8.2 Connection & Settings Panel

- MQTT settings (host, port, path, username, password) with defaults and `localStorage` persistence.
- Connection status indicators (connected to broker and subscribed topics).
- On application launch attempt an immediate connection to the configured broker (auto-connect) so discovery begins without manual input; surface failures inline.

### 8.3 Tile-Driver List & Discovery

- Surface newly discovered tile drivers immediately and make them easy to identify until acknowledged.
- Provide clear visibility into online/offline state, last-seen timing, and which motors remain unassigned so users can triage quickly.
- Support focus or filtering mechanisms that let operators isolate new, offline, or partially assigned tile drivers without hunting.
- Per-axis nudge controls (see Section 9).

### 8.4 Grid Configurator

- Visual grid; each tile shows assigned `motor_x` and `motor_y` (by MAC and ID).
- Assign via drag-and-drop or chooser from discovered motors.
- Validation preventing a motor from being assigned to multiple tiles.
- Quick nudge on each axis to physically identify.
- Highlight tiles and tile drivers with unassigned motors, and provide a quick action to focus the discovery list on the relevant hardware.

### 8.5 Pattern Designer

- Canvas (for example, 256×256) with top-left origin.
- Place points (capped at available tiles); clustering points in one region prompts the conversion step to assign multiple tiles there, boosting brightness.
- Optional snap-to-grid: rounds point placement to the nearest whole tile coordinate so users can quickly draft grid-aligned patterns before switching back to free positioning for overlap control.
- Interactive heatmap-style canvas: users draw directly via click/drag, and cell coloration reflects how many tiles will converge on that region as points accumulate.
- Load/save single active pattern in `localStorage`.

### 8.6 Projection Parameters & Preview

- Capture every input required by [docs/reflection-calculations.md](docs/reflection-calculations.md):
  - wall distance (meters) and anchor point `p_w0`,
  - wall normal orientation (vertical + horizontal angles or direct vector entry),
  - incoming light (Sun → mirror) orientation (vertical + horizontal angles),
  - projection height offset `H` and optional pixel spacing overrides (`P_x`, `P_y`),
  - optional world-up override for non-level installs.
- Run the shared reflection solver in real time to derive per-mirror yaw/pitch, wall hit points, and ellipse descriptors; surface validation errors (grazing incidence, wall behind mirrors, bisector degeneracy).
- Render an interactive BabylonJS 3D preview that shows the mirror array, wall plane, Sun vector, outgoing rays, and ellipse footprints; provide orbit/zoom, selection highlighting, and toggles for normals/ellipses.
- Provide derived 2D overlays (top and side) plus numeric readouts (projected footprint bounds, incidence cosines, ellipse diameters) sourced from the same solver so operators can cross-check values quickly.

### 8.7 Playback Controls

- Select pattern and press Play.
- Pre-flight warning lists offline/unassigned tile axes; user may proceed (skip) or cancel.
- Live status of motors (moving/settled); overall completion via status.

### 8.8 Log Panel (rolling, non-persistent)

- Entries capture time, MAC, `cmd_id`, code, message.
- Filters by tile driver or severity.

### 8.9 Pattern Library

- List saved patterns with small previews.
- Select one as the active pattern for playback; allow delete.
- Show projected footprint estimates based on current simulation parameters.

---

## 9. Commands — Nudge & Homing

**Nudge (for identification)**

- Fixed 500 steps to one direction and back per click
- Direction of steps depending on current motor position, first moving to the direction where it's still within bounds.
- Per axis (X or Y) only.
- Tile driver enforces limits; UI is not required to throttle. If a command would exceed range, the tile driver rejects it.

**Homing**

- Home All runs concurrently across tile drivers.
- UI shows per-motor homed state and `steps_since_home` with yellow/red thresholds.

**Command timeouts & retries**

- ACK timeout: 1 second.
- No automatic retries in MVP; errors are logged and surfaced in UI.

---

## 10. Geometry Solver & Pattern → Motion Conversion

**Reference**

- [docs/reflection-calculations.md](docs/reflection-calculations.md) is the canonical math; the UI must implement the same equations so preview and playback stay in lockstep.

**Inputs**

- Mirror array geometry:
  - center-to-center spacing `s_x`, `s_y` (default 53 mm but configurable per install),
  - origin `p0` (3D) and array basis vectors `û_arr`, `v̂_arr`,
  - derived per-mirror center `p_m[i,j] = p0 + i·s_x·û_arr + j·s_y·v̂_arr`.
- Wall plane:
  - anchor point `p_w0`,
  - unit normal `ŵ`.
- Incoming light: unit vector `î` (Sun → mirror).
- Frame helpers: world up `ẑ`; wall basis vectors `v̂_wall = normalize(ẑ − (ẑ·ŵ) ŵ)` and `û_wall = normalize(v̂_wall × ŵ)` with fallback logic when `ẑ` aligns with `ŵ`.
- Projection parameters:
  - vertical offset `H`,
  - desired wall pixel spacing `P_x`, `P_y`,
  - optional overrides for Sun angular diameter and slope blur RMS `σ`.
- Pattern definition: canvas pixels `(i, j)` (still capped to available tiles) that inherit the desired wall spacing.

**Outputs (per mirror/tile)**

- Mirror yaw and pitch (in radians) where zero means mirror normal aligns with the wall normal (`n̂ = ŵ`).
- Wall hit point `p_hit`, ellipse axes (`â`, `b̂`), diameters (`D_major`, `D_minor`), and incidence cosine `c`.
- Degeneracy flags (grazing incidence, wall behind mirror, `r̂ ≈ î`).
- Derived motor step targets after mapping yaw/pitch through the MVP linear `steps_per_degree` constant (clamped to [-1200, +1200]).

**Procedure**

1. **Lock the pattern on the wall** by projecting the `(0,0)` mirror onto the wall along `ŵ`, applying the offset `H·v̂_wall`, then stepping along `{û_wall, v̂_wall}` by `i·P_x` and `j·P_y` to get desired wall points `p_t[i,j]`.
2. **Aim each mirror**: compute `r̂ = normalize(p_t − p_m)` (mirror → wall), then the specular bisector normal `n̂ = normalize(r̂ − î)`; guard `||r̂ − î|| < ε`.
3. **Convert to yaw/pitch** relative to `{û_wall, v̂_wall, ŵ}` using the exact inverse: `yaw = atan2(n_u, √(n_v² + n_w²))` and `pitch = atan2(−n_v, n_w)` where `n_u = n̂·û_wall`, etc.
4. **Compute wall intersection & ellipse** using `ray_plane` to get `p_hit`, then derive `â`, `b̂`, and diameters with the Sun angular diameter (`Θ☉ ≈ 0.53°`, or the `Θ_eff` blur-adjusted variant). Reject `|r̂·ŵ| < ε` or `t ≤ 0`.
5. **Map to motor steps** by translating yaw/pitch into degrees and multiplying by `steps_per_degree` (per axis constants, still shared globally in MVP). Document zero offsets so hardware calibration can inject per-motor corrections later.
6. **Assignment pipeline**: run a deterministic mapping (Hungarian/nearest) from pattern pixels to mirrors before invoking the solver so clustered points intentionally cause overlapping wall hits. Persist the assignment per playback to guarantee repeatability.
7. **Command emission**: package the resulting per-axis step targets into MOVE commands with `cmd_id` and reuse solver outputs for preview telemetry (no re-computation with looser math).

**Point limit enforcement**

- The editor enforces `activePoints <= availableTiles`; if future workflows need over-subscription, define a redistribution policy before implementation.
- Solver errors (degeneracy, out-of-bounds steps) block playback and surface inline so operators can adjust parameters before commands are sent.

---

## 11. Playback Completion Semantics

- A pattern is considered applied when all assigned axes report `moving = false` and their reported `position` matches the last commanded target.
- UI also shows estimated finish time from `cmd/resp` for user feedback but relies on status for ground truth.
- Apply a global timeout (for example, 15 seconds) to avoid UI hangs; mark as incomplete and log if exceeded.

---

## 12. Error Handling & Safety

- Global Stop button sends stop/abort command to all tile drivers.
- Tile drivers enforce thermal limits and may reject commands; UI surfaces rejections.
- Pre-flight warnings for offline or unassigned axes; playback proceeds while skipping unavailable axes.
- Rolling error log linked by `cmd_id`.

---

## 13. Non-Functional Requirements

- **Responsiveness:** UI updates as status messages arrive (event-driven). Header counters aggregate quickly without throttling; internal batching acceptable.
- **Scalability (initial):** Support up to roughly eight tile drivers / 64 motors smoothly (adjust based on real targets).
- **Reliability:** Commands use QoS 1; status uses QoS 0; retained status enables cold-start population.
- **Security (MVP):** LAN only, no authentication/TLS. (Future enhancement: broker auth/TLS.)

---

## 14. Out of Scope (MVP)

- Pattern sequencing and thermal-aware scheduling.
- Multiple grid configurations (single active only).
- Cloud/backend persistence.
- Per-motor calibration; nonlinear geometric correction beyond linear mapping.
- Photorealistic/ray-traced renderings or volumetric lighting beyond the BabylonJS preview.
- Aliases for tile drivers/motors; instead, show grid position if assigned, otherwise last four characters of MAC.

---

## 15. Open Items / TBD

1. WebSocket endpoint details: final scheme/port/path; confirm LAN open (no auth/TLS).
2. Apply timeout: choose final default (suggest 15 s) and determine whether to expose per-run override.
3. ACK timestamp units: define format for estimated finish time (for example, epoch milliseconds vs ISO 8601).
4. Scale targets: expected upper bounds (tile drivers/motors) to validate UI virtualization thresholds.
5. `steps_per_degree`: initial default and tuning location (settings panel?).

---

## 16. Acceptance Criteria (MVP)

- **Connect & discover:** On load, user sets broker settings (or uses defaults). UI connects, loads retained statuses, and lists tile drivers.
- **Offline handling:** Killing a tile driver triggers LWT; UI promptly marks it offline.
- **Discovery cues:** Newly spotted tile drivers surface instantly with a visible "New" badge and increment the session discovery counter until acknowledged.
- **Grid assign:** User assigns motors (X/Y) to tiles; UI prevents assigning one motor to multiple tiles.
- **Assignment visibility:** Tile drivers or tiles with unassigned motors are clearly highlighted with quick links back to the discovery list.
- **Nudge:** Clicking Nudge ± on a motor axis sends a ±500-step move and motion is visible in status.
- **Home All:** Triggers homing concurrently; homed flags update; `steps_since_home` resets.
- **Geometry solver & preview:** Adjusting wall/light inputs (distance, normals, `H`, `P_x`, `P_y`) re-runs the shared solver; BabylonJS 3D view and 2D overlays update in sync and surface yaw/pitch + ellipse metrics for a selected mirror within ±1 mm / ±0.1° of the reference calculations.
- **Pattern design:** User places active points (capped at tile count); denser clusters lead to brighter projected regions.
- **Play:** Pre-flight warning lists offline/unassigned axes; user can continue. UI issues per-axis moves, shows progress, and marks completion via status (or timeout).
- **Logging:** Command errors/denials appear with time, MAC, `cmd_id`, code, message.
- **Persistence:** MQTT settings, grid configuration, projection parameters, and the single active pattern persist in `localStorage`.
- **Pattern Library:** Library view lists saved patterns with previews; user can select the active pattern and delete entries.

---

## 17. Initial Work Breakdown (Epics → Milestones → Tasks)

**Epic A — Project Setup & Connectivity**

- A1: SPA scaffold (Vite/React or similar); state/store; UI kit.
- A2: MQTT WebSocket client wrapper (connect, subscribe, publish, auto-reconnect).
- A3: Settings panel with `localStorage` persistence.

**Epic B — Status Ingest & Discovery**

- B1: Subscribe to `devices/+/status` (retained).
- B2: Normalize tile-driver and motor models in store.
- B3: LWT/offline handling and header counters.
- B4: Session-based discovery indicators, filters, and "new tile driver" lifecycle.

**Epic C — Grid Configurator**

- C1: Grid view plus motor assignment (drag-drop/chooser).
- C2: Validation to prevent duplicate motor assignments.
- C3: Persist configuration to `localStorage`.

**Epic D — Nudge & Homing Controls**

- D1: Per-axis Nudge UI; publish ±500 moves.
- D2: Home All command; progress and homed flags.
- D3: Home a single motor
- D4: `steps_since_home` indicators (yellow/red thresholds).

- **Epic E — Pattern Designer (Minimal)**

- E1: Interactive heatmap-style canvas for point placement with tile-count guardrails.
- E2: Optional snap-to-grid toggle that rounds placement to tile centers; save/load single pattern.
- E3: Pattern Library view (list, preview, select active, delete), leveraging localStorage.

**Epic F — Geometry Panel & 3D Preview**

- F1: Parameter panel that captures wall anchor/normal, Sun vector, projection offset `H`, spacing overrides, and world-up selection with persistence and inline validation.
- F2: Reflection solver module implementing [docs/reflection-calculations.md](docs/reflection-calculations.md) with typed outputs (yaw/pitch, hits, ellipses) and surfaced error states shared by preview and conversion.
- F3: BabylonJS preview plus synchronized 2D overlays that visualize mirrors, normals, rays, wall plane, and ellipses with orbit/zoom controls, selection highlighting, and degeneracy warnings.

**Epic G — Conversion & Playback**

- G1: Deterministic pattern-to-mirror assignment leveraging the solver’s locked wall targets (Hungarian/nearest with documented tie-breaks).
- G2: Mirror yaw/pitch → motor step translation with clamp handling, zero-reference configuration, and diagnostics when physical limits block playback.
- G3: MOVE command pipeline that reuses solver outputs, emits per-axis commands with `cmd_id`, validates acknowledgements/timeouts, and logs solver validation failures before dispatch.

**Epic H — Logging & Diagnostics**

- H1: Rolling log store; log panel with filters.
- H2: Pre-flight warning dialog for offline/unassigned axes.

**Epic I — QA & Docs**

- I1: Integration tests against a mocked broker.
- I2: User guide (short) plus developer notes (schema references).

---

## 18. Developer Notes

- Mock services and shared types exist to accelerate UI work and will be replaced when wiring a live broker:
  - `services/mockApi.ts` — placeholder discovery and tile-driver data.
  - `types.ts` — shared domain types used across pages/components.
- Keep the MQTT client as a swappable layer so environments can shift between mocked, LAN broker, and future secure setups.

---

## 19. Success Signals

- Operators accomplish layout, pattern design, and projection planning entirely within this app, with MQTT commands handled transparently.
- Arrays stay production-ready as the UI surfaces live telemetry, highlights thermal constraints, and keeps assignments in sync with the hardware fleet.
