# Vitest Upgrade Notes

## Summary

- Vitest was upgraded from 2.1.4 to 4.0.8, bringing the now-stable Browser Mode, modern reporter defaults, scoped fixtures, annotation APIs, and built-in visual regression helpers.
- Browser Mode now has documented provider packages, dedicated `test.browser.*` configuration, and DOM helpers such as `toBeInViewport`; `projects` replaced `workspace`, and new assertion helpers (`expect.schemaMatching`, annotation helpers) plus watch/coverage features require configuration adjustments.

## Tasks

1. [ ] Restructure `vite.config.ts` `test` config into named `test.projects` (e.g., `unit-jsdom`, `browser-visual`) so future workspace/project changes are scoped per suite.
2. [ ] Enable Browser Mode with the Playwright provider and sample DOM-focused assertions (`expect.element()`/`toBeInViewport`) to catch layout regressions early.
3. [ ] Add a visual regression project that uses `toMatchScreenshot` baselines (e.g., under `tests/visual/`) and integrates with Playwright tracing when run in CI.
4. [ ] Adopt the new Expect/annotation APIs (`expect.schemaMatching`, `test.annotate` with attachments) for critical MQTT and simulator state tests so failures give richer context.
5. [ ] Configure `watchTriggerPatterns` for globbed fixtures/metadata so edits outside JS/TS rerun the appropriate tests, and enable `coverage.experimentalAstAwareRemapping` ahead of the default change.
6. [ ] Review CI/test scripts for deprecated CLI flags (like `--reporter basic`) and define `browser.instances` (Chromium/Firefox) if multi-engine coverage seems warranted.

## Notes

- Plan each change in a lightweight doc when work touches multiple files or requires follow-up discussion; use the existing `agent_notes` process if the scope grows.
- Run `bun run build`, `bun run test`, `bun run lint`, and `bun run format` after implementing the above changes to ensure the pre-checks remain green.
