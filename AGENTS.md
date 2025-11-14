# Repository Guidelines

## Project Structure & Module Organization

- All application code sits in `src/`.
  - `src/App.tsx` orchestrates navigation and shared state.
  - Route-level views live in `src/pages/` (`ConfiguratorPage.tsx`, `PatternEditorPage.tsx`, `SimulationPage.tsx`, `PatternLibraryPage.tsx`).
  - Reusable UI primitives belong in `src/components/` (`MirrorGrid.tsx`, `GridConfigurator.tsx`, etc.).
- Keep API shims inside `src/services/`—`mockApi.ts` is the current placeholder.
- Shared types go in `src/types.ts`.
- Update presets in `metadata.json` when needed.
- Configuration is centralized in `vite.config.ts` and `tsconfig.json`.
- Primary framework: React. Vue can be introduced later, but is not configured yet. If/when introducing Vue makes sense suggest it.
- Install: `yarn install`

## Build, Test, and Development Commands

- Run `yarn format` / `yarn format:fix` → Prettier checks after changes in markdown files and other non code files.
- Run all these after changes in code or configuration:
  - `yarn build` → builds with Vite. A `prebuild` hook runs `tsc --noEmit` to fail on type errors.
  - `yarn test` → Vitest unit tests.
  - `yarn lint` / `yarn lint:fix` → ESLint checks and safe autofixes.
  - `yarn format` / `yarn format:fix` → Prettier checks and safe autofixes.
- Your should resolve any errors and warnings from the above pre-checks before hand-off.
- Dev server error overlay: TypeScript errors are shown in-browser via `vite-plugin-checker`.

## Working Practices

### Planning notes

- For bigger multi-step efforts, add a brief high level plan in `agent_notes/`. Use `yyyy-mm-dd-short-title-of-plan` filename format.
- Keep notes concise: list tasks, mark status.
- As you progress update the plan file with a short note about status of task progress.
- Feel free to adjust the plan as you progreess - the goal is living context not a plan in stone.

### Clarify scope / requirements

- For new features and techical decisions validate with user instead of assuming. Propose a reasonable MVP approach in a concise way for confirmation. If there are multiple questions always present it as numbered list.
- Less code is better. Suggest feature trade-offs to reduce complexity.

- Do not install new dependencies without explicit approval

### Process for significant new features/epics

#### 1. Gather requirements, understand as-is

The user might provided you requirements or pointed you to a relevant document or a section in a document. First read these documents, understand the as-is checking relevant code. If needed use web search to research further. Y

Check if a relevant document already exist agent_notes for the feature. If it does ask user for instructions how to treat it.

ou proceed to next step without user input unless you miss information to proceed.

#### 2. Clarify scope and confirm assumptions

Based on your input and research you create a document for the feature in agent_notes: `yyyy-mm-dd-short-feature-name.md`.

Add all clarifiying questions required for implementation. Include reasonalble suggestions or assumptions for confirmation for each question.

Include technical questions with proposals. If there are multiple questions always present it as numbered list.

Use a format where the user can I add their answers inline.

#### 3. Create a high level plan

Once the user has confirmed they answered your questions inline feel free to ask follow up questions if required.

If the scope and requirements are clear then proced to create a short step-by-step plan in the same document. Keep it concise. Make each task group end user testable - include a cleare acceptance criteria.

Make sure you are explicit about automated tests: both unit tests and e2e tests for each task must be implemented too

Make both the acceptance criteria and the tasks readable by using bullet points

use [ ] format so we can track progres

#### 4. Implement and validate

- Once the user has reviewed the plan follow their instructions to start the implementation.
- Try to implement as many steps as needed to achieve a feautre milestone which can be tested by the user
- Before you report you are ready always run build , format, lint, test , test:e2e commands (in this order)
- Always request elevated privileges if a command execution fails.
- Never mark a task as complete until you have successull build, format, lint, test, test:e2e runs.

#### 5. Report your progress

After each task finished mark the relevant task if complete and add instructions on how user can test the acceptence criteria if it's not obvious.

## Coding Style & Naming Conventions

- Use strict TypeScript with React function components.
- File naming: PascalCase for components (e.g., `src/components/MirrorCell.tsx`).
- Linter and Prettier configuration is source of truth. Follow the surrounding code stlye but check `eslint.config.js` and `prettier.config.cjs` for new files or when you are unsure.
  - Code: spaces, four-space indentation (Prettier `tabWidth: 4`, `useTabs: false`).
  - Markdown: lists use 2-space indentation (Prettier override for `*.md`/`*.mdx`, aligns with markdownlint MD007).
  - Run `yarn lint` and `yarn format` to check. Feel free to use `yarn lint:fix` and `yarn format:fix` as first attempt to fix errors/warnings then re-run the checks.
- Imports: external → absolute (`@/*`) → relative; enforced via `import/order`.
- State: keep page-level state in `App.tsx` until a shared store exists.
- Props: prefer descriptive names over abbreviations.
- Styling: default to inline Tailwind-style utility classes (`bg-gray-900`, `text-gray-200`); extract styles only when patterns emerge.

## Code commenting best practices

- **Self-Documenting Code**: Write code that explains itself through clear structure and naming
- **Comment intentionally**: Let names carry intent; add brief comments only when behavior would surprise a reader. When complexity requires add high level concise overview to explain large sections of code logic.
- **Don't comment changes or fixes**: Do not leave code comments that speak to recent or temporary changes or fixes. Comments should be evergreen informational texts that are relevant far into the future.

## Markdown formatting best practices

- When referencing files in this repo use markdown relative links. E.g: `[docs/requirements.md](docs/requirements.md)` or `[src/App.tsx](src/App.tsx)`
- Make sure to strictly adhere to markdown formatting rules defined in prettier.config.cjs
- Especially pay attenttion to the following:
  - Headings should be surrounded by blank lines
  - Lists should be surrounded by blank lines

## Mermaid diagrams

- Always validate diagrams you generate using the validate-mermaid command. Syntax: `validate-mermaid <(printf 'graph TD\nA-->B\n')`
- If you include a mermaid diagram in a file inline (eg. markdown) you still must use the above validator but only with the diagram contents.

## Testing Guidelines

- Tooling: Vitest + JSDOM.
- Commands:
  - `yarn test` → single run.
  - `yarn test:watch` → watch mode during development.
- Requirements:
  - Run the full suite before every commit or review request.
  - Document test results in hand-off notes.
  - Add/adjust specs for every new feature or change to existing behavior.
- Structure: place tests alongside their implementation (`App.test.tsx` next to `App.tsx`); avoid shared `__tests__` folders or repo-root specs.
- Coverage: keep trending toward ≥80%.

## OpenCV / Blob Detection

- The calibration worker (`public/opencv-classic-worker.js`) always runs the same pre-processing pipeline (RGBA → grayscale → CLAHE) and then tries to use OpenCV’s `SimpleBlobDetector`. If the native WASM detector is missing or fails we fall back to the JS implementation in `public/simple-blob-detector.js`.
- We host both `public/opencv.js` (from `@techstark/opencv-js`) and a custom `public/opencv_js.wasm` build that actually contains `SimpleBlobDetector`. The worker prefers the WASM detector whenever `cv.SimpleBlobDetector` exists; otherwise it sticks to the JS fallback, so keep both assets in sync when touching blob detection logic.

## Commit & Pull Request Guidelines

- Commits:
  - Write short, imperative subjects (e.g., `Add mirror alignment helpers`).
  - Keep each commit focused on one logical change.
  - Add a brief body when behavior shifts or context is non-obvious.
- Pull requests:
  - Explain the motivation and summarize functional changes.
  - Reference related issues (`Linked Issue: #123`).
  - Attach screenshots or recordings for UI updates.
  - List verification steps and ensure `yarn build` passes before requesting review.
