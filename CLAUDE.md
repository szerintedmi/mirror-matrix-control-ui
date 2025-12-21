# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React SPA for controlling a kinetic mirror grid. Communicates with ESP32 mirror nodes over MQTT to configure the array, author light patterns, run calibration, and drive playback. Built with Vite, React 19, TypeScript, and Tailwind CSS 4.

## Commands

```bash
yarn dev              # Start dev server on port 3000
yarn build            # Type-check then production build
yarn typecheck        # TypeScript type checking
yarn lint             # ESLint (use yarn lint:fix for auto-fix)
yarn format           # Prettier check (use yarn format:fix to write)
yarn test             # Unit tests with Vitest
yarn test:watch       # Vitest watch mode
yarn test:e2e         # Playwright E2E tests
yarn test:e2e:ui      # Playwright UI mode for debugging
```

First-time E2E setup: `yarn dlx playwright install --with-deps`

## Directory Map

```
src/
├── App.tsx                    # Root component: page routing, global state, context providers
├── main.tsx                   # React entry point
├── index.css                  # Global styles (Tailwind)
├── types.ts                   # Core domain types (Motor, Pattern, CalibrationProfile, etc.)
│
├── pages/                     # Top-level page components
│   ├── CalibrationPage.tsx    # Camera-based motor calibration workflow
│   ├── ConfiguratorPage.tsx   # Grid layout and motor assignment
│   ├── AnimationPage.tsx      # Animation path authoring and playback
│   ├── PatternDesignerPage.tsx # Visual pattern designer with transforms
│   ├── PlaybackPage.tsx       # Pattern sequence playback control
│   ├── PatternEditorPage.tsx  # Single pattern editing
│   ├── PatternLibraryPage.tsx # Pattern management and library
│   ├── SimulationPage.tsx     # 3D BabylonJS visualization (lazy loaded)
│   └── LegacyPlaybackPage.tsx # Original playback interface
│
├── components/
│   ├── calibration/           # Calibration UI components
│   │   ├── CalibrationPreview.tsx        # Live camera feed with overlay
│   │   ├── CalibrationRunnerPanel.tsx    # Run/stop calibration controls
│   │   ├── CalibrationSettingsPanel.tsx  # Calibration parameter config
│   │   ├── CalibrationStatusBar.tsx      # Progress and status display
│   │   ├── CalibrationProfileManager.tsx # Save/load calibration profiles
│   │   ├── CalibrationCommandLog.tsx     # Motor command history
│   │   ├── DetectionSettingsPanel.tsx    # OpenCV blob detection tuning
│   │   ├── TileStatusesPanel.tsx         # Per-tile calibration state
│   │   └── TileDebugModal.tsx            # Detailed tile diagnostics
│   │
│   ├── animation/             # Animation authoring components
│   │   ├── AnimationPathEditor.tsx       # Path keyframe editor
│   │   ├── AnimationPathLibrary.tsx      # Saved path management
│   │   ├── AnimationPlaybackControls.tsx # Play/pause/timeline
│   │   └── AnimationTimeline.tsx         # Timeline visualization
│   │
│   ├── playback/              # Playback sequence components
│   │   └── PlaybackSequenceManager.tsx   # Sequence ordering and config
│   │
│   ├── patternDesigner/       # Pattern designer components
│   │   ├── PatternDesignerToolbar.tsx    # Transform and tool controls
│   │   └── PatternDesignerDebugPanel.tsx # Debug visualization
│   │
│   ├── common/                # Shared UI components
│   │   ├── CollapsibleSection.tsx
│   │   ├── DropdownMenu.tsx
│   │   ├── StyledToast.tsx
│   │   └── TransformToolbar.tsx
│   │
│   ├── MirrorGrid.tsx         # Grid visualization component
│   ├── MirrorCell.tsx         # Individual mirror tile
│   ├── DiscoveredNodes.tsx    # MQTT node discovery list
│   ├── NavigationRail.tsx     # Side navigation menu
│   └── Modal.tsx              # Modal dialog component
│
├── context/                   # React contexts for global state
│   ├── MqttContext.tsx        # MQTT connection management
│   ├── StatusContext.tsx      # Motor telemetry aggregation
│   ├── CalibrationContext.tsx # Active calibration profile
│   ├── AnimationContext.tsx   # Animation playback state
│   ├── PatternContext.tsx     # Pattern storage and selection
│   ├── CommandTrackerContext.tsx # Pending command tracking
│   └── LogContext.tsx         # Command/response logging
│
├── services/
│   ├── calibration/           # Calibration logic (post-refactor)
│   │   ├── index.ts           # Public API exports
│   │   ├── types.ts           # Calibration-specific types
│   │   ├── summaryComputation.ts # Aggregate calibration metrics
│   │   ├── script/            # Calibration script execution
│   │   │   ├── script.ts      # Script definition and state machine
│   │   │   ├── executor.ts    # Step-by-step script runner
│   │   │   ├── commands.ts    # Motor command generation
│   │   │   └── adapters.ts    # Hardware abstraction
│   │   └── math/              # Calibration calculations
│   │       ├── boundsComputation.ts    # Motor range detection
│   │       ├── expectedPosition.ts     # Position prediction
│   │       ├── gridBlueprintMath.ts    # Grid geometry math
│   │       ├── stagingCalculations.ts  # Pre-calibration setup
│   │       └── stepTestCalculations.ts # Step response analysis
│   │
│   ├── mqttClient.ts          # MirrorMqttClient: connection, pub/sub
│   ├── statusParser.ts        # MQTT status message parsing
│   ├── motorControl.ts        # Motor position calculations
│   ├── animationPlanner.ts    # Animation path interpolation
│   ├── profilePlaybackPlanner.ts # Profile-based playback planning
│   ├── spaceConversion.ts     # Coordinate space transforms
│   ├── boundsValidation.ts    # Motor bounds validation
│   │
│   ├── *Storage.ts            # LocalStorage persistence services
│   │   ├── gridStorage.ts             # Grid configuration snapshots
│   │   ├── patternStorage.ts          # Pattern definitions
│   │   ├── calibrationProfileStorage.ts # Calibration profiles
│   │   ├── animationStorage.ts        # Animation paths
│   │   ├── projectionStorage.ts       # Projection settings
│   │   └── detectionSettingsStorage.ts # OpenCV detection params
│   │
│   ├── opencvWorkerClient.ts  # OpenCV web worker interface
│   └── mockTransport.ts       # Mock MQTT for testing
│
├── hooks/                     # React hooks
│   ├── useCalibrationController.ts     # Calibration workflow orchestration
│   ├── useCalibrationProfilesController.ts # Profile CRUD operations
│   ├── useCameraPipeline.ts            # OpenCV camera processing
│   ├── useStableBlobMeasurement.ts     # Blob detection stabilization
│   ├── useRoiOverlayInteractions.ts    # ROI drag/resize handling
│   ├── useAnimationPlayback.ts         # Animation timeline control
│   ├── useMotorCommands.ts             # Motor command dispatch
│   ├── useMotorController.ts           # Motor state management
│   ├── usePlaybackDispatch.ts          # Playback sequence control
│   ├── useGridPersistence.ts           # Grid save/load logic
│   ├── useDetectionSettingsController.ts # Detection param management
│   └── usePatternEditorInteractions.ts # Pattern editor interactions
│
├── coords/                    # Coordinate system utilities
│   └── index.ts               # Space transformations (grid, camera, motor)
│
├── overlays/                  # Canvas overlay rendering
│   ├── index.ts               # Overlay API
│   ├── types.ts               # Overlay type definitions
│   ├── builders.ts            # Overlay shape builders
│   ├── renderer.ts            # Canvas rendering logic
│   └── projection.ts          # Coordinate projection
│
├── utils/                     # Pure utility functions
│   ├── coordinates.ts         # Coordinate math
│   ├── normalization.ts       # Value normalization
│   ├── tileCalibrationCalculations.ts # Per-tile calibration math
│   ├── projectionGeometry.ts  # Projection geometry utilities
│   ├── reflectionSolver.ts    # Light reflection calculations
│   ├── patternIntensity.ts    # Pattern value interpolation
│   └── orientation.ts         # Mirror orientation helpers
│
├── constants/                 # App-wide constants
│   ├── calibration.ts         # Calibration defaults and limits
│   ├── calibrationUiThemes.ts # Calibration UI color themes
│   ├── control.ts             # Motor control constants
│   ├── navigation.ts          # Navigation menu config
│   ├── pattern.ts             # Built-in patterns
│   └── projection.ts          # Projection defaults
│
└── types/                     # Additional TypeScript types
    ├── animation.ts           # Animation-specific types
    ├── commandError.ts        # Command error types
    ├── patternEditor.ts       # Pattern editor types
    └── persistence.ts         # Storage types

docs/                          # Documentation
├── mqtt-command-schema.md     # MQTT command format spec
├── mqtt-status-schema.md      # MQTT status message spec
├── mqtt-payload-examples.md   # Example MQTT payloads
└── archive/                   # Historical docs

e2e/                           # Playwright E2E tests
├── calibration.spec.ts
├── grid-configurator.spec.ts
├── mqtt-connection.spec.ts
└── pattern-designer-transforms.spec.ts
```

## Architecture

### Key Concepts

- **Grid**: 2D array of mirror tiles, each tile has X and Y axis motors
- **Motor**: Identified by `{nodeMac, motorIndex}`, assigned to grid positions
- **Node**: ESP32 device controlling 1-4 motors, discovered via MQTT
- **Pattern**: Target motor positions for the grid (static or animated)
- **Calibration Profile**: Per-axis motor calibration data (bounds, offsets)

### Page Routing

App.tsx manages page state via `useState<Page>`. No router library used - pages render conditionally based on current page state.

### Context Provider Hierarchy (in App.tsx)

```
MqttProvider          → MQTT connection, subscribe/publish
  StatusProvider      → Aggregated motor telemetry from MQTT
    CommandTrackerProvider → Pending command tracking
      CalibrationProvider  → Active calibration profile
        AnimationProvider  → Animation playback state
          PatternProvider  → Pattern storage and selection
            LogProvider    → Command/response logging
```

### MQTT Communication

- `MirrorMqttClient` class handles connection, reconnection, subscriptions
- Supports `ws://`, `wss://`, and `mock://` schemes (mock for testing)
- Topic pattern: `devices/{mac}/status` for telemetry, `devices/{mac}/cmd` for commands
- Status messages parsed by `statusParser.ts`

### Calibration System

The calibration system uses a script-based approach:
1. **Script** (`services/calibration/script/script.ts`): Defines calibration steps as a state machine
2. **Executor** (`executor.ts`): Runs scripts step-by-step with camera feedback
3. **Math** (`math/`): Pure functions for bounds computation, position prediction, etc.
4. **Controller Hook** (`useCalibrationController.ts`): Orchestrates UI and script execution

### Storage

All storage services use localStorage with JSON serialization. Key services:
- `gridStorage.ts` - Named grid configuration snapshots
- `calibrationProfileStorage.ts` - Calibration profiles per grid position
- `patternStorage.ts` - User-created patterns
- `animationStorage.ts` - Animation path definitions

### Path Alias

- `@/` maps to `src/` (configured in vite.config.ts and tsconfig.json)

## Testing

- Unit tests colocated in `__tests__/` directories adjacent to source
- Vitest with jsdom environment
- E2E tests in `e2e/` directory using Playwright

## Pre-Completion Checklist

Before reporting work as complete, run in this order: `yarn build`, `yarn format:fix`, `yarn lint:fix`, `yarn test`

E2E tests (`yarn test:e2e`) are slow - run once at the end of a session after all other checks pass.
