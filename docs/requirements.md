# Kinetic Mirror Matrix — MVP Requirements (UI + MQTT Control)

## 0. Background & Goals

The UI provides a visual workspace for arranging mirrors, sketching patterns, and previewing light behavior while firmware on ESP32 nodes handles motion control (see [https://github.com/szerintedmi/kinetic-mirror-matrix-esp32](kinetic-matrix-esp32)). It bridges the React front end to the full MQTT command set so pattern playback can target live nodes without a serial CLI.

---

## 1. Purpose & Scope

A single-page, browser-based controller for a modular kinetic mirror array. The MVP focuses on:

- Discovering mirror nodes via MQTT.
- Configuring a grid by assigning motors (two axes per pixel).
- Designing and selecting simple patterns.
- Converting patterns into absolute motor positions.
- Issuing commands over MQTT and tracking status.
- Providing a minimal 2D geometry preview for projection parameters.

Out of scope for MVP: pattern sequencing, multiple saved grid configurations, cloud backend, calibration workflows, advanced visualizations.

### Ownership & Precedence

- Node-side MQTT configuration remains managed by the nodes' own interfaces (firmware/CLI). This UI configures only its connection to the MQTT broker (host/port/path, etc.) and must expose those settings in the UI.
- Deep diagnostics, serial command console, and networking runbooks are owned by the firmware/CLI project and linked from this UI; this app provides lightweight logging and status only.

### Users & Personas

- Technical users with with laptop

### Feature Pillars

- Configurator: node discovery, drag-and-drop motor assignment, selective clearing/reset with confirmations.
- Pattern Editor: grid-based paint/erase with canvas resize and guardrails not to exceed available mirrors.
- Pattern Library: list, preview, select active, delete; show projected footprint estimates based on simulation parameters.
- Simulation: dual-view SVG preview (top and side) of incident/reflected rays with wall/light angle controls and distance.
- Operational Insights: surface homing state, awake/asleep, thermal budgets, and motion timing from MQTT status.

---

## 2. Glossary

- **Node:** ESP32 controller reporting status and accepting commands; one node may host up to eight motors.
- **Motor:** Single-axis actuator; two motors form one pixel (X and Y).
- **Pixel:** Logical mirror unit on the grid; requires two motors (X/Y).
- **Grid:** Logical arrangement of pixels (for example, 8×8); may differ from physical wiring.
- **Pattern:** Set of active points on a 2D canvas to be projected.
- **MVP:** Minimum viable product; see feature list.

---

## 3. System Overview

- Frontend-only single-page application; runs in the browser.
- Uses MQTT over WebSockets to connect to a LAN broker.
- Stores configuration in browser `localStorage`.
- Uses existing node MQTT schemas for commands and status.
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

- `devices/<mac>/status` — QoS 0, retain=false; includes node and motor fields. Broker Last Will publishes `{"node_state":"offline","motors":{}}` on the same topic.
- `devices/<mac>/cmd` — frontend-to-node commands.
- `devices/<mac>/cmd/resp` — acknowledgements, completion, errors; includes `cmd_id`.

**Discovery & offline**

- Nodes publish live snapshots at 1 Hz idle / 5 Hz during motion without retain; the UI typically sees nodes within a second of subscribing.
- Nodes set LWT; broker publishes offline payload on disconnect. The UI relies on LWT for offline marking (no additional stale-timeout).

**Commands & correlation**

- MQTT 3.x (no MQTT5 features).
- Each command may include a `cmd_id` (UUID). If omitted, the node generates one and echoes it in `cmd/resp`.
- `cmd/resp` includes estimated finish time; UI may display it, but status remains the source of truth for completion.

**Granularity**

- MOVE: one message per motor.
- HOME: can be batched with `HOME:ALL` per node.

**QoS**

- Commands and acknowledgements: QoS 1 (reliable).
- Status and telemetry: QoS 0 (best effort).

---

## 5. Browser ↔ Broker

- Broker exposes WebSocket endpoint (WS/WSS). MVP assumption: LAN, basic username/pass authentication.
- UI provides a simple MQTT settings panel (host, port, credentials) with defaults stored in code; persisted in `localStorage`.
- Separation of concerns:
  - Node-side MQTT configuration (broker host/creds used by nodes) remains configurable via node interfaces maintained in the firmware project (see https://github.com/szerintedmi/kinetic-mirror-matrix-esp32).
  - UI-side MQTT configuration (how this app connects to the broker) is configurable in this UI and persists locally.

---

## 6. Status & Telemetry (read-only)

- UI consumes `devices/<mac>/status` for:
  - Node discovery via newly spotted mac addresses.
  - Node info: IP, MAC, status URL, etc.
  - Per-motor info: id (0–7), homed, moving, `abs_steps`, `target_steps` (if available), fault state, `thermal_budget`, `steps_since_home`.
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
    "path": "/mqtt"
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
    "pixels": [
      {
        "row": 0,
        "col": 0,
        "motor_x": { "mac": "A1B2C3D4E5F6", "id": 0 },
        "motor_y": { "mac": "A1B2C3D4E5F6", "id": 1 }
      }
      // ... one entry per pixel. Unassigned pixels may omit motor references.
    ]
  }
}
```

- Cross-pairing across nodes is allowed.
- A motor represents one pixel axis; prevent sharing the same motor across multiple pixels.
- Unassigned pixels are permitted; playback skips them.

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
    "canvas": { "width": 256, "height": 256, "origin": "top-left" },
    "pixels": [
      { "x": 120, "y": 64, "intensity": 3 },
      { "x": 180, "y": 120, "intensity": 1 }
    ]
  }
}
```

- Canvas can exceed grid bounds; only active pixels matter.
- Intensity is an integer representing overlap/brightness taps (not a normalized float).
- More active pixels than mirrors is allowed; see mapping policy (Section 10).

---

## 8. UI — Single-Page Dashboard

Target users are technical; keep the interface clean and efficient.

### 8.1 Header Summary

- Node and motor counters (online, offline, moving, homed/not homed) with color coding.
- Global Stop button (convenience; low-risk small steppers).
- Quick indicators for warnings/errors (badge linking to log panel).

### 8.2 Connection & Settings Panel

- MQTT settings (host, port, path) with defaults and `localStorage` persistence.
- Connection status indicators (connected to broker and subscribed topics).

### 8.3 Node List & Discovery

- Card per node showing:
  - MAC (display last four characters if alias absent).
  - Status URL (clickable).
  - Online/offline state via retained/LWT.
  - Up to eight motors with status chips (homed/moving/fault).
- Per-axis nudge controls (see Section 9).

### 8.4 Grid Configurator

- Visual grid; each pixel shows assigned `motor_x` and `motor_y` (by MAC and ID).
- Assign via drag-and-drop or chooser from discovered motors.
- Validation preventing a motor from being assigned to multiple pixels.
- Quick nudge on each axis to physically identify.

### 8.5 Pattern Designer (MVP minimal)

- Canvas (for example, 256×256) with top-left origin.
- Place points with integer intensity; optional snap-to-grid.
- Load/save single active pattern in `localStorage`.

### 8.6 Projection Parameters & Preview

- Inputs: wall distance (meters), wall angles (vertical/horizontal), incoming light angles (vertical/horizontal).
- 2D preview (top view and side view): mirror plane, wall plane, incoming and reflected rays, derived projected canvas size.

### 8.7 Playback Controls

- Select pattern and press Play.
- Pre-flight warning lists offline/unassigned pixel axes; user may proceed (skip) or cancel.
- Live status of motors (moving/settled); overall completion via status.

### 8.8 Log Panel (rolling, non-persistent)

- Entries capture time, MAC, `cmd_id`, code, message.
- Filters by node or severity.

### 8.9 Pattern Library

- List saved patterns with small previews.
- Select one as the active pattern for playback; allow delete.
- Show projected footprint estimates based on current simulation parameters.

---

## 9. Commands — Nudge & Homing

**Nudge (for identification)**

- Fixed ±500 steps per click.
- Per axis (X or Y) only.
- Node enforces limits; UI is not required to throttle. If a command would exceed range, node rejects it.

**Homing**

- Home All runs concurrently across nodes.
- UI shows per-motor homed state and `steps_since_home` with yellow/red thresholds.

**Command timeouts & retries**

- ACK timeout: 1 second.
- No automatic retries in MVP; errors are logged and surfaced in UI.

---

## 10. Pattern → Motion Conversion

**Inputs**

- Pattern pixels `(x, y, intensity)` on canvas.
- Grid geometry (pitch 53 mm; grid dimensions; pixel locations).
- Projection settings (wall distance, wall and light angles).

**Outputs**

- Absolute step targets for each assigned axis (range -1200 to +1200, integers).

**Assumptions**

- Linear mapping angle-to-steps via a global constant `steps_per_degree` per axis. No per-motor calibration in MVP.
- Zero steps represents centered position.

**Algorithm (MVP sketch)**

1. Map canvas points to physical wall coordinates using canvas size, wall distance, and wall angles.
2. For each grid pixel (mirror center), compute desired reflection angles based on target wall point and incoming light vector.
3. Convert required mirror tilt angles (horizontal/vertical) to motor absolute steps using the linear constant; clamp to [-1200, +1200].
4. Emit per-motor MOVE commands with `cmd_id`; rely on status to track completion.

**Over-subscription policy (more active points than mirrors)**

- MVP default: nearest-neighbor mapping of active points to mirror centers. On conflicts:
  1. Choose the higher-intensity point.
  2. Tie-break deterministically (top-to-bottom, left-to-right).
- Unmapped active points are ignored; emit warning in pre-flight list and log.

---

## 11. Playback Completion Semantics

- A pattern is considered applied when all assigned axes report `moving = false` and `abs_steps` approximately equals `target_steps` (if target is reported) in status messages.
- UI also shows estimated finish time from `cmd/resp` for user feedback but relies on status for ground truth.
- Apply a global timeout (for example, 15 seconds) to avoid UI hangs; mark as incomplete and log if exceeded.

---

## 12. Error Handling & Safety

- Global Stop button sends stop/abort command to all nodes.
- Nodes enforce thermal limits and may reject commands; UI surfaces rejections.
- Pre-flight warnings for offline or unassigned axes; playback proceeds while skipping unavailable axes.
- Rolling error log linked by `cmd_id`.

---

## 13. Non-Functional Requirements

- **Responsiveness:** UI updates as status messages arrive (event-driven). Header counters aggregate quickly without throttling; internal batching acceptable.
- **Scalability (initial):** Support up to roughly eight nodes / 64 motors smoothly (adjust based on real targets).
- **Reliability:** Commands use QoS 1; status uses QoS 0; retained status enables cold-start population.
- **Security (MVP):** LAN only, no authentication/TLS. (Future enhancement: broker auth/TLS.)

---

## 14. Out of Scope (MVP)

- Pattern sequencing and thermal-aware scheduling.
- Multiple grid configurations (single active only).
- Cloud/backend persistence.
- Per-motor calibration; nonlinear geometric correction beyond linear mapping.
- Full 3D simulation or advanced renderings.
- Aliases for nodes/motors; instead, show grid position if assigned, otherwise last four characters of MAC.

---

## 15. Open Items / TBD

1. WebSocket endpoint details: final scheme/port/path; confirm LAN open (no auth/TLS).
2. Apply timeout: choose final default (suggest 15 s) and determine whether to expose per-run override.
3. ACK timestamp units: define format for estimated finish time (for example, epoch milliseconds vs ISO 8601).
4. Scale targets: expected upper bounds (nodes/motors) to validate UI virtualization thresholds.
5. `steps_per_degree`: initial default and tuning location (settings panel?).

---

## 16. Acceptance Criteria (MVP)

- **Connect & discover:** On load, user sets broker settings (or uses defaults). UI connects, loads retained statuses, and lists nodes.
- **Offline handling:** Killing a node triggers LWT; UI promptly marks it offline.
- **Grid assign:** User assigns motors (X/Y) to pixels; UI prevents assigning one motor to multiple pixels.
- **Nudge:** Clicking Nudge ± on a motor axis sends a ±500-step move and motion is visible in status.
- **Home All:** Triggers homing concurrently; homed flags update; `steps_since_home` resets.
- **Projection params:** User sets wall distance/angles and incoming light; preview updates (top and side views) and shows derived size.
- **Pattern design:** User places active points; intensity stored as integer.
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
- B2: Normalize node and motor models in store.
- B3: LWT/offline handling and header counters.

**Epic C — Grid Configurator**

- C1: Grid view plus motor assignment (drag-drop/chooser).
- C2: Validation to prevent duplicate motor assignments.
- C3: Persist configuration to `localStorage`.

**Epic D — Nudge & Homing Controls**

- D1: Per-axis Nudge UI; publish ±500 moves.
- D2: Home All command; progress and homed flags.
- D3: `steps_since_home` indicators (yellow/red thresholds).

**Epic E — Pattern Designer (Minimal)**

- E1: Canvas with point placement and integer intensity.
- E2: Optional snap-to-grid; save/load single pattern.
- E3: Pattern Library view (list, preview, select active, delete), leveraging localStorage.

**Epic F — Geometry Panel & 2D Preview**

- F1: Inputs for wall and light angles plus distance.
- F2: Top and side 2D preview; derived projected size display.

**Epic G — Conversion & Playback**

- G1: Shared conversion utility (pattern → angles → steps, linear mapping).
- G2: Mapping policy (nearest-neighbor with intensity and deterministic tie-breaks).
- G3: Per-motor MOVE dispatch; `cmd/resp` tracking; status-based completion with global timeout.

**Epic H — Logging & Diagnostics**

- H1: Rolling log store; log panel with filters.
- H2: Pre-flight warning dialog for offline/unassigned axes.

**Epic I — QA & Docs**

- I1: Integration tests against a mocked broker.
- I2: User guide (short) plus developer notes (schema references).

---

## 18. Developer Notes

- Mock services and shared types exist to accelerate UI work and will be replaced when wiring a live broker:
  - `services/mockApi.ts` — placeholder discovery and node data.
  - `types.ts` — shared domain types used across pages/components.
- Keep the MQTT client as a swappable layer so environments can shift between mocked, LAN broker, and future secure setups.

---

## 19. Success Signals

- Operators accomplish layout, pattern design, and projection planning entirely within this app, with MQTT commands handled transparently.
- Arrays stay production-ready as the UI surfaces live telemetry, highlights thermal constraints, and keeps assignments in sync with the hardware fleet.
