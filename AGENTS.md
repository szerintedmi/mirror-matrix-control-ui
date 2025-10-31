# Repository Guidelines

## Project Structure & Module Organization

This React 19 + TypeScript app is bootstrapped with Vite. `App.tsx` orchestrates navigation and shared state. Route-level views live under `pages/` (`ConfiguratorPage.tsx`, `PatternEditorPage.tsx`, `SimulationPage.tsx`, `PatternLibraryPage.tsx`), while reusable UI primitives sit in `components/` (`MirrorGrid.tsx`, `GridConfigurator.tsx`, etc.). Keep API shims in `services/`—`services/mockApi.ts` currently supplies placeholder data and should be replaced or extended when wiring real endpoints. Shared types belong in `types.ts`, and preset metadata updates go in `metadata.json`. Configuration is centralized in `vite.config.ts` and `tsconfig.json`.

## Build, Test, and Development Commands

Install dependencies once with `yarn install` using Node `>=22.21.0 <23`. `yarn dev` launches the Vite dev server at `http://localhost:5173`. `yarn build` emits the production bundle into `dist/`; run it before opening a pull request to catch TypeScript or bundling issues. `yarn preview` serves the built assets—append `--host` when validating on another device. Create `.env.local` and set `GEMINI_API_KEY=your-key`; keep the file untracked.
`yarn lint` runs ESLint across React TypeScript and Vue files, while `yarn lint:fix` applies safe autofixes. `yarn format` checks Prettier formatting and `yarn format:fix` writes the canonical style—run these before committing. Always follow the configured linting and formatting rules; after making changes, run both lint and format checks and resolve any reported issues before handing work off.

## Coding Style & Naming Conventions

Write strict TypeScript with React function components; use PascalCase for component file names (`components/MirrorCell.tsx`). Match the existing four-space indentation and prefer named exports. Group imports by external modules → absolute paths → relative paths, optimizing for clarity. Co-locate page-level state in `App.tsx` until a shared store is introduced, and favor descriptive prop names over abbreviations. Styling relies on Tailwind-style utility classes already present (`bg-gray-900`, `text-gray-200`); keep styles inline unless a pattern justifies extraction.

## Testing Guidelines

Automated tests are not configured yet. When adding them, adopt Vitest plus React Testing Library (`yarn add -D vitest @testing-library/react`) and expose `yarn test`. Place specs beside the code (`components/__tests__/MirrorGrid.test.tsx`) and aim for ≥80% statement coverage. For now, validate flows manually via `yarn dev`, using the fixtures in `services/mockApi.ts`, and record the exercised scenarios in the pull request description.

## Commit & Pull Request Guidelines

Keep commit subjects short and imperative (`Add mirror alignment helpers`), mirroring the concise history (`projection size estimate`). Limit each commit to one logical change and add context in the body when behavior shifts. Pull requests must explain motivation, summarize functional changes, reference related issues (`Linked Issue: #123`), and attach screenshots or screen captures for UI updates. Before requesting review, confirm `yarn build` succeeds, note outstanding follow-ups in a checklist, and ensure reviewers can reproduce your verification steps.
