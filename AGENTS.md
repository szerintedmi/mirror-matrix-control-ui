# Repository Guidelines

## Project Structure & Module Organization

This React 19 + TypeScript app is bootstrapped with Vite. All application code lives under `src/`. `src/App.tsx` orchestrates navigation and shared state. Route-level views live under `src/pages/` (`ConfiguratorPage.tsx`, `PatternEditorPage.tsx`, `SimulationPage.tsx`, `PatternLibraryPage.tsx`), while reusable UI primitives sit in `src/components/` (`MirrorGrid.tsx`, `GridConfigurator.tsx`, etc.). Keep API shims in `src/services/`—`mockApi.ts` currently supplies placeholder data and should be replaced or extended when wiring real endpoints. Shared types belong in `src/types.ts`, and preset metadata updates go in `metadata.json`. Configuration is centralized in `vite.config.ts` and `tsconfig.json`.

## Build, Test, and Development Commands

Install dependencies once with `yarn install` using Node `>=22.21.0 <23`. `yarn dev` launches the Vite dev server at `http://localhost:5173`. `yarn build` emits the production bundle into `dist/`; run it before opening a pull request to catch TypeScript or bundling issues. `yarn preview` serves the built assets—append `--host` when validating on another device. Create `.env.local` and set `GEMINI_API_KEY=your-key`; keep the file untracked.
`yarn lint` runs ESLint across React TypeScript and Vue files, while `yarn lint:fix` applies safe autofixes. `yarn format` checks Prettier formatting and `yarn format:fix` writes the canonical style—run these before committing. Always follow the configured linting and formatting rules; after making changes, run both lint and format checks and resolve any reported issues before handing work off.

## Working Practices

For larger efforts that require planning, create a markdown note inside `agent_notes/` outlining the tasks you expect to complete. Keep the list concise, mark each item’s status clearly, and record quick updates as you finish steps. Restructuring the plan mid-stream is fine—the goal is to capture real progress and decisions as the work evolves.

## Coding Style & Naming Conventions

Write strict TypeScript with React function components; use PascalCase for component file names (`components/MirrorCell.tsx`). Match the existing four-space indentation and prefer named exports. Group imports by external modules → absolute paths → relative paths, optimizing for clarity. Co-locate page-level state in `App.tsx` until a shared store is introduced, and favor descriptive prop names over abbreviations. Styling relies on Tailwind-style utility classes already present (`bg-gray-900`, `text-gray-200`); keep styles inline unless a pattern justifies extraction.

## Testing Guidelines

Automated tests run with Vitest using JSDOM and React’s test utilities. Use `yarn test` for a single run and `yarn test:watch` while developing. Always run the full test suite before committing or requesting review, and document the results in your hand-off notes. Tests are mandatory whenever you ship a new feature or extend existing functionality—add or update specs beside the relevant code (e.g., keep `App.test.tsx` next to `App.tsx`). Store specs in the same directory as their implementation (no shared `__tests__` folders or repo-root dumps) and keep coverage trending toward ≥80%. Continue validating flows manually via `yarn dev`, using the fixtures in `services/mockApi.ts`, and record the exercised scenarios in the pull request description.

## Commit & Pull Request Guidelines

Keep commit subjects short and imperative (`Add mirror alignment helpers`), mirroring the concise history (`projection size estimate`). Limit each commit to one logical change and add context in the body when behavior shifts. Pull requests must explain motivation, summarize functional changes, reference related issues (`Linked Issue: #123`), and attach screenshots or screen captures for UI updates. Before requesting review, confirm `yarn build` succeeds, note outstanding follow-ups in a checklist, and ensure reviewers can reproduce your verification steps.
