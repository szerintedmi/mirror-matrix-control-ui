# Mirror Matrix Control UI

React single-page workspace for arranging the kinetic mirror grid, authoring light patterns, and driving [ESP32 mirror nodes](https://github.com/szerintedmi/kinetic-mirror-matrix-esp32) over MQTT. The app focuses on the configurator, pattern editor, simulation preview, and library workflows needed for the MVP.

## Prerequisites

- Node.js `>=22.21.0 <23`
- Yarn 4 (Corepack users can run `corepack enable`)

## Setup

1. Install dependencies: `yarn install`
2. Start the development server: `yarn dev`

## Verification

- Type check: `yarn typecheck`
- Lint: `yarn lint` (auto-fix with `yarn lint:fix`)
- Format: `yarn format` (write fixes with `yarn format:fix`)
- Unit tests: `yarn test` (watch mode `yarn test:watch`)
- Production build: `yarn build`

## End-to-End Tests

1. Install Playwright browsers (one-time): `yarn dlx playwright install --with-deps`
2. Run the suite: `yarn test:e2e`
3. Explore failures in UI mode: `yarn test:e2e:ui`
