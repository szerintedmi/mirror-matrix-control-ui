# Playwright session capture notes

## Why capture with automation?

- Guarantees consistent MQTT mock data by reusing scripted flows that already drive the commissioning UI.
- Allows automated screenshot diffs across layout iterations, replacing subjective manual capture sessions.
- Provides a living checklist for designers and QA to validate that regressions do not reintroduce modal timing bugs.

## Network prerequisites

- npm access must allow downloading `@playwright/test@1.56.1`; corporate proxies need an allow-list for `registry.npmjs.org`.
- If Playwright install remains blocked, run the mock walkthrough manually in a browser while screen recording (see Manual fallback).

## Automated flow

1. `yarn install --frozen-lockfile`
2. `yarn dev --host 0.0.0.0 --port 4173`
3. In another shell execute:
  ```bash
  yarn test:e2e --project=chromium --grep "Grid configurator interactions"
  ```
4. Extend `e2e/grid-configurator.spec.ts` with:
  ```ts
  await page.screenshot({ path: 'docs/ux_review_01/playwright-artifacts/grid-configurator.png', fullPage: true });
  ```
5. Repeat for `status-discovery` and `app-smoke` flows to capture navigation and diagnostics context.

## Manual fallback (when registry blocks Playwright)

1. `yarn dev --host 0.0.0.0 --port 4173`
2. Open `http://localhost:4173` in a modern browser.
3. Toggle **Show Settings**, select the `mock` scheme, and click **Connect**.
4. Navigate via **Configure Array**.
5. Drag a motor chip into `mirror-slot-x-0-0`, confirm counts update, then capture screenshots of:
  - Connection banner showing `mock` URL and `Connected` badge.
  - Discovery panel with filter tray visible.
  - Grid with assigned/unassigned overlay.
6. Return chips to the unassigned tray to reset before sharing captures with the team.

## Artifact management

- Store raw Playwright screenshots under `docs/ux_review_01/playwright-artifacts/`.
- Keep markdown annotations or callouts in `docs/ux_review_01/playwright-annotations.md` to link findings back to requirements.
- When sharing externally, convert captures to WebP and compress to stay below Git LFS thresholds.

## Known issues

- Current container environment cannot reach npm (HTTP 403). Document commands attempted inside findings to keep the team aware of blockers.
- Drag-and-drop relies on `DataTransfer`; ensure the screenshot hook fires after `performDrag` completes to avoid empty slots.
