# Mirror Matrix Control UI

React single-page workspace for arranging the kinetic mirror grid, authoring light patterns, and driving [ESP32 mirror nodes](https://github.com/szerintedmi/kinetic-mirror-matrix-esp32) over MQTT. The app focuses on the configurator, pattern editor, simulation preview, and library workflows needed for the MVP.

## Prerequisites

- Node.js `>=22.21.0 <23`
- [Bun](https://bun.sh/)

## Setup

1. Install dependencies: `bun install`
2. Start the development server: `bun dev`

## Verification

- Type check: `bun run typecheck`
- Lint: `bun run lint` (auto-fix with `bun run lint:fix`)
- Format: `bun run format` (write fixes with `bun run format:fix`)
- Unit tests: `bun run test` (watch mode `bun run test:watch`)
- Production build: `bun run build`

## End-to-End Tests

1. Install Playwright browsers (one-time): `bunx playwright install --with-deps`
2. Run the suite: `bun run test:e2e`
3. Explore failures in UI mode: `bun run test:e2e:ui`
