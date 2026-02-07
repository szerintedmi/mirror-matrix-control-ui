# Agent Gotchas

- 2026-02-07 [GPT-5 (Codex)] - `bun` not found when running `bun run format`; ensure Bun is installed and on PATH before running project scripts.
- 2026-02-07 [GPT-5 (Codex)] - `npm run typecheck` failed with `tsc: command not found`; install dependencies (`node_modules`) before running checks.
- 2026-02-07 [GPT-5 (Codex)] - Alignment shape analysis crashed with `roiRect.delete is not a function`; do not call `delete()` on `cv.Rect` in the OpenCV worker cleanup path.
