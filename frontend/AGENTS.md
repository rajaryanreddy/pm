# Frontend agent notes

This folder contains the Next.js MVP for the project management app.

## Purpose
- Render the Kanban board UI for a single signed-in user.
- Handle the frontend-only login screen using the hardcoded credentials `user` / `password`.
- Keep the experience lightweight and focused on the core MVP requirements.

## Structure
- `src/app/` – app entry points and global styling.
- `src/components/` – the Kanban UI, board columns, cards, and login form.
- `src/lib/` – shared board logic such as card movement and initial board data.
- `tests/` and `src/**/*.test.tsx` – UI and logic tests.

## Current implementation
- The app is a single-board Kanban interface with renamable columns.
- Cards can be added, removed, and moved between columns.
- The login gate is intentionally frontend-only for this MVP.
- Styling follows the project color palette in AGENTS.md.

## Validation
- Run `npm test` from this directory to verify the Kanban and auth behaviors.
- Run `npm run build` when validating the production build.
