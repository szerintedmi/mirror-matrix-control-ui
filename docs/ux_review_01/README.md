# Grid Configurator UX Review 01

## Executive Summary

- The current grid configurator ships core assignment logic, but its center-aligned layout and stacked action buttons obscure the broader session workflow and slow down multi-step commissioning.
- Visual hierarchy is fragmented: the always-visible MQTT panel, page-level hero headers, and card grids all compete for attention without a shared shell or status ribbon tying the experience together.
- A persistent workspace frame with left navigation, sticky status meters, and contextual detail panes will anchor the configurator, pattern editor, and simulation flows while staying inside the existing React/Tailwind stack.
- Reworked visual tokens—spacing, color accents, and surface layering—can clarify hierarchy quickly without a full redesign, preparing the UI for upcoming diagnostics and playback epics.

## Inputs Reviewed

1. Product requirements ([docs/requirements.md](../requirements.md)).
2. Source audit for epic 8.4 components (`src/pages/ConfiguratorPage.tsx`, `src/components/GridConfigurator.tsx`, `src/components/UnassignedMotorTray.tsx`, `src/components/DiscoveredNodes.tsx`).
3. Application chrome inspection through JSX/TSX markup (`src/App.tsx`, `src/components/ConnectionSettingsPanel.tsx`, `src/pages/PatternLibraryPage.tsx`) plus attempted local preview (blocked by package registry 403) to mirror live visuals.
4. Playwright e2e flow definitions in [e2e/grid-configurator.spec.ts](../../e2e/grid-configurator.spec.ts), [e2e/status-discovery.spec.ts](../../e2e/status-discovery.spec.ts), and [e2e/app-smoke.spec.ts](../../e2e/app-smoke.spec.ts) to align recommendations with scripted interactions.
5. MQTT data model and terminology from `src/types.ts` and [docs/mqtt-integration.md](../mqtt-integration.md) for consistent naming.

## Primary User Journeys

### 1. Bring the controller online

- Launch app → review broker defaults surfaced in the connection bar → enter LAN broker hostname/credentials → validate connection state.
- Confirm first tile driver discovery (LWT online) → acknowledge new hardware → inspect global status at a glance.
- **Outcome:** user trusts that the control surface can safely send commands.

### 2. Map motors to the logical grid (Epic 8.4 scope)

- Select target grid dimensions based on installation plan.
- Inspect the discovered tile driver list → filter for unassigned motors → drag/drop or quick assign into grid cells.
- Review assignment completeness counters → resolve duplicates/conflicts → persist layout to local storage.
- **Outcome:** every physical axis is mapped to a virtual tile slot with minimal manual bookkeeping.

### 3. Design and manage projection patterns

- Enter Pattern Editor with awareness of available tiles/canvas size.
- Sketch lit pixels while guardrails prevent exceeding the hardware envelope.
- Save, name, and classify the pattern; preview projected footprint and brightness distribution.
- **Outcome:** curated library of patterns ready for playback.

### 4. Validate projection geometry and run showtime operations

- Tune wall distance, incident light, and mirror pose from Simulation view.
- Preview top/side ray traces, review predicted footprint, adjust for keystone errors.
- Launch playback with pre-flight warnings (offline hardware, stale assignments, thermal warnings) and monitor completion logs.
- **Outcome:** confident playback with telemetry-driven risk reduction.

### 5. Diagnose issues during operation (upcoming epics)

- Inspect real-time motor health (homed, thermal, motion timing).
- Review command log with filters per driver and `cmd_id`.
- Trigger targeted Home/Nudge workflows.
- **Outcome:** faster recovery from drift or misalignment without leaving the UI.

## Current Visual Snapshot

### Layout frame

- The entire app sits on a centered column (`max-w-5xl`) over a dark slate background with the MQTT panel spanning full width at the top; individual pages repeat their own hero headers beneath this band.
- Navigation relies on CTA buttons inside each page header (`Configure Array`, `Go to Simulation`, `Create New Pattern`) rather than a persistent nav element, leading to repeating button groups across views.

### Configurator screen

- Connection status is handled above the fold with `MQTT Connection` heading, status text pills, and full form reveal toggled by “Show Settings.”
- The configurator canvas stacks vertically: discovery list, grid controls, and motor trays compete for vertical space; grid metrics exist in logic but are not visualized.
- Filters (`All`, `New`, `Offline`, `Unassigned`) appear as bare buttons without count badges or sticky positioning, so they scroll with the list and lack immediate feedback.
- The shrink confirmation flow is modal driven and surfaces affected coordinates but still commits the grid change before the user accepts, risking transient data loss if a cancellation occurs post-mutation.

### Pattern library

- Hero header uses a cyan gradient title and a three-button action group; status summary lives in `MotorStatusOverview`, rendered as cards but visually detached from the hero area.
- Pattern previews render as grey grids with cyan lit cells; card frames have soft shadow/ring styling but uniform tone, making it hard to distinguish active versus archived patterns.
- Simulation parameter summary (wall distance, angles) appears in card footers with muted text, so key projection context is easy to miss when scanning.

## Experience Findings & Recommendations

### 1. Navigation & Information Architecture

**Findings**

- Top-level routes act like independent full-screen pages; connection state and hardware context disappear when navigating away from Configurator.
- Primary actions (Configure Array, Simulation, Pattern) repeat across headers, which makes it hard to identify the canonical next step and adds visual clutter.
- There is no persistent status ribbon; discovery counters reset per view and users lose track of session health.

**Recommendations**

- Adopt a persistent left rail with three sections: **Hardware** (Discovery, Grid, Diagnostics), **Content** (Patterns, Simulation), and **Operations** (Playback, Logs). Prototype shell: [workspace shell mock](mocks/app-shell-mock.html).
- Surface connection state and broker URL in a compact top app bar; include a "Reconnect" micro-interaction and offline badge that remain visible regardless of route.
- Convert per-page CTA clusters into context-aware secondary actions anchored to the workspace header for each view.

### 2. Grid Configuration Workspace

**Findings**

- Grid sizing controls sit above the canvas with minimal explanation; shrink confirmation appears after state mutation, creating undo confusion.
- Assignment metrics (axes, tiles) live in derived logic but are not visualized; technicians must mentally count completion.
- Motor trays and grid fight for vertical space; on smaller laptops the key list scrolls out of view and discovery filters exit the viewport.

**Recommendations**

- Introduce a two-column canvas: grid on the left, assignment ledger on the right showing per-tile status, driver, and quick actions. Prototype: [grid assignment mock](mocks/grid-configurator-mock.html).
- Move grid dimension controls into a "Layout" panel with inline guardrails and preview of resulting canvas/resolution before applying changes.
- Add sticky header chips for metrics (Assigned axes, Unassigned motors, Out-of-bounds tiles) with color-coded statuses.
- When shrinking the grid, show an explicit diff preview before committing (use existing `pruneAssignmentsWithinBounds` but gate behind confirmation first).
- Surface the mock/test-mode toggle and MQTT connection URL within the workspace header so technicians can confirm they are in the simulated environment before manipulating tiles.

### 3. Discovery & Hardware Health

**Findings**

- Filters (`All/New/Offline/Unassigned`) have no count badges; offline nodes visually blend with active ones due to identical card backgrounds.
- Last activity time exists but is text-only and inherits the same grey as secondary copy, so stale nodes do not visually escalate.

**Recommendations**

- Add filter pills with counts (e.g., Offline • 2). Color-code offline/new states and pin the filter row as sticky within the discovery panel.
- Introduce a right-aligned "Last heartbeat" column using `formatRelativeTime` plus warning icons when exceeding `staleThresholdMs`.
- Provide a session timeline (accordion) summarizing discovery events and acknowledgments for fast forensic review.
- Include a "Mock MQTT" status chip linked to the connection scheme so lab operators immediately see whether the discovery list is populated by fixtures or production hardware.

### 4. Pattern Creation & Library

**Findings**

- Library cards surface projected size but hide wall/light parameters; there is no quick edit from the card.
- Creating a pattern jumps away from the library without maintaining context (active pattern, last used canvas size).
- Active pattern selection lacks visual emphasis; every card uses the same grey background and border weight.

**Recommendations**

- Add inline quick actions on cards: "Set Active", "Edit", "Duplicate", "Send to Simulation".
- Persist filter chips for pattern categories (e.g., Calibration, Show) anticipating upcoming classification needs.
- Display key projection parameters directly on the card header and introduce a glowing border/state chip for the active pattern.
- Offer a floating "Create" button anchored bottom-right to maintain focus on grid metrics in the header while still providing rapid access.

### 5. Simulation & Playback Prep (future alignment)

**Findings**

- Simulation view lacks breadcrumbs to return to configuration; parameter changes have no audit trail.
- Pre-flight check for offline/unassigned axes is mentioned in requirements but absent in current UI.

**Recommendations**

- Add persistent "Session checklist" drawer accessible from any workspace. It should list readiness items (Connection, Grid complete, Patterns ready, Simulation tuned).
- Log parameter adjustments (distance, angles) with timestamp; show latest in Simulation header.
- Build a modal pre-flight summary that surfaces offline drivers, axes without assignment, and stale telemetry prior to playback. Reuse `counts` from status store.

### 6. Logging & Diagnostics (Epic H preview)

**Recommendations**

- Reserve space in the left rail for a "Diagnostics" view that pairs command logs with per-motor telemetry charts.
- Provide filter presets (Last command, Errors only, Motor 3Y) and make logs linkable from notifications.
- Introduce toast notifications for MQTT errors with quick access to expanded log panel.

### 7. Visual system & responsiveness

**Findings**

- The existing palette leans heavily on dark slate backgrounds with minimal depth; cards and trays share similar tones, flattening hierarchy.
- `max-w-5xl` shell leaves large gutter space on desktops while forcing excessive vertical scrolling on laptops.
- Button groups wrap awkwardly on smaller breakpoints, especially in Pattern Library and connection toolbar.

**Recommendations**

- Establish three surface tiers (background, panel, card) with subtle elevation cues (blur, 1px border, 4px radius) to signal hierarchy.
- Replace the centered layout with a fluid workspace width plus responsive side rails to better utilize horizontal space.
- Refactor button groups into responsive toolbars with overflow menus at `md` breakpoint to avoid wrapping.

## Actionable Backlog (Ready for Dev Grooming)

| Priority | Area | Recommendation | Suggested Implementation Notes |
| --- | --- | --- | --- |
| P0 | Navigation shell | Implement persistent layout with left rail and top status bar. | Create `AppShell` component wrapping existing pages; migrate navigation to context; reuse Tailwind utilities. |
| P0 | Grid metrics | Surface assignment counters and unassigned list in UI. | Extend `GridConfigurator` props to accept computed metrics; render status chips using existing color tokens. |
| P0 | Discovery filters | Add count badges and sticky positioning for filter pills. | Update `DiscoveredNodes` filter bar with counts from `drivers`; apply `sticky top-0 bg-gray-900` styling. |
| P1 | Shrink confirmation | Gate grid shrink behind explicit diff preview. | Use modal state to preview tiles to unassign before calling `onGridSizeChange`. |
| P1 | Pattern quick actions | Add card-level controls for edit, duplicate, activate. | Extend `PatternLibraryPage` to accept `onSelectActive` and `onDuplicate` callbacks; highlight active card state. |
| P1 | Active pattern styling | Emphasize currently active pattern visually. | Apply accent border/glow using `ring-2 ring-cyan-400` when card matches active ID. |
| P1 | Mock/test clarity | Add visible indicator when mock MQTT scheme is active. | Mirror `settings.scheme` to a workspace chip; provide tooltip linking to lab docs. |
| P2 | Session checklist | Create global readiness checklist component. | New component reading from `StatusContext`; display warnings and deep links. |
| P2 | Timeline log | Add discovery timeline and MQTT heartbeat log. | Leverage timestamps in store; render collapsible list in Configurator sidebar. |
| P2 | Responsive toolbar | Refactor page-level button groups into adaptive toolbar. | Build `PageToolbar` component with overflow menu for small screens. |

## Playwright-driven workspace capture (mock MQTT)

The e2e suite already scripts a realistic commissioning flow that switches the connection scheme to `mock`, populates discovery data, and exercises drag-and-drop. Leveraging that automation for visual QA will anchor future UI refinements in real control states.

### Local capture checklist

1. Install dependencies with `yarn install --frozen-lockfile` (requires registry access) and launch the dev server using `yarn dev --host 0.0.0.0 --port 4173`.
2. In a second terminal run `yarn test:e2e --project=chromium --grep "Grid configurator interactions" --update-snapshots` to execute the scripted flow that selects the `mock` scheme, connects, and populates tray data.
3. Extend the spec or create a derivative visual spec to call `page.screenshot` after assignments are made; store artifacts under `docs/ux_review_01/playwright-artifacts/` for design reviews.
4. When running manually in a browser, open the connection settings, switch the scheme to `mock`, and confirm the discovery list updates before manipulating the grid. This matches the scripted flow in [e2e/grid-configurator.spec.ts](../../e2e/grid-configurator.spec.ts).

> _Note:_ Package installation currently fails inside this container because the registry blocks the `@playwright/test` download (HTTP 403). The flow above succeeds on networks with standard npm access; see [playwright-session notes](playwright-session.md) for workaround guidance and manual capture instructions.

## Supporting Artifacts

- [Workspace shell mock](mocks/app-shell-mock.html) — static prototype for persistent navigation and status bar.
- [Grid configurator mock](mocks/grid-configurator-mock.html) — clickable layout prototype for assignment workspace.
- [Navigation blueprint](mocks/navigation-blueprint.mmd) — Mermaid diagram of proposed IA.
- [Session readiness wireframe](mocks/session-checklist.mmd) — Mermaid sequence for pre-flight checklist.
- [Playwright session notes](playwright-session.md) — setup + fallback workflows for capturing mock MQTT visuals.

## Next Steps

1. Align with engineering on feasibility of persistent layout and shared context; scope story for `AppShell` refactor.
2. Validate grid mock with two technicians to confirm ledger-driven workflow meets expectations.
3. Schedule UI pairing to spike session checklist component leveraging `StatusContext` data and discovery timeline.
4. Update product roadmap to slot diagnostic enhancements alongside Epic H and ensure responsive toolbar work lands before public demos.
