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

## Architecture

### App Structure

- `src/App.tsx` - Root component with page routing and global state (grid config, patterns, projection settings)
- `src/pages/` - Page components for each major feature area
- `src/context/` - React contexts providing global services

### Key Contexts (nested in App.tsx)

- **MqttProvider** - MQTT connection management, subscribe/publish API
- **StatusProvider** - Aggregates driver status from MQTT, tracks motor telemetry
- **LogProvider** - Command/response logging
- **CalibrationProvider** - Calibration profile state
- **PatternProvider** - Pattern storage and selection

### MQTT Communication

- `src/services/mqttClient.ts` - `MirrorMqttClient` class handles connection, reconnection, subscriptions
- Supports `ws://`, `wss://`, and `mock://` schemes (mock for testing without hardware)
- Topic pattern: `devices/{mac}/status` for driver telemetry, `devices/{mac}/cmd` for commands
- `src/services/statusParser.ts` - Parses incoming status messages

### Motor Control

- `src/services/motorControl.ts` - Motor position calculations
- `src/hooks/useMotorCommands.ts` - Hook for sending motor commands
- Motors identified by `{nodeMac, motorIndex}`, assigned to grid positions with X/Y axes

### Storage Services

- `src/services/gridStorage.ts` - Grid configuration snapshots
- `src/services/patternStorage.ts` - Pattern definitions
- `src/services/calibrationProfileStorage.ts` - Calibration profiles
- All use localStorage with JSON serialization

### Types

- `src/types.ts` - Core domain types (Motor, Pattern, CalibrationProfile, etc.)
- `src/types/patternEditor.ts` - Pattern editor specific types

### Path Alias

- `@/` maps to `src/` (configured in vite.config.ts)

## Testing

- Unit tests colocated in `__tests__/` directories adjacent to source
- Vitest with jsdom environment
- E2E tests in `e2e/` directory using Playwright
