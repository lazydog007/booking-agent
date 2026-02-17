# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace monorepo.
- `apps/web`: Next.js App Router frontend and HTTP API routes (`app/api/**`).
- `packages/domain`: scheduling logic, policies, and domain tests.
- `packages/db`: Drizzle schema, SQL migrations, and DB client.
- `packages/agent`: OpenAI agent runtime, prompts, and tool schemas.
- `packages/integrations`: external provider integrations (e.g., WhatsApp Meta).
- `packages/shared`: shared types and utilities.
- `packages/jobs`: background job entrypoints.

Keep feature logic close to its package boundary; avoid cross-package imports that bypass public `src/index.ts` exports.

## Build, Test, and Development Commands
Run from repository root:
- `pnpm install`: install workspace dependencies.
- `pnpm dev`: start the web app locally (`@booking-agent/web`).
- `pnpm build`: type-check/build all workspaces.
- `pnpm lint`: run workspace lint checks (currently TypeScript checks + Next lint).
- `pnpm test`: run Vitest across all packages.
- `pnpm db:generate`: generate Drizzle migration files.
- `pnpm db:migrate`: apply migrations.

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode enabled via `tsconfig.base.json`).
- Indentation: 2 spaces; keep files ASCII unless existing content requires otherwise.
- Naming: `kebab-case` for files (`slot-generation.ts`), `camelCase` for variables/functions, `PascalCase` for React components.
- API routes follow Next.js conventions: `app/api/<scope>/<resource>/route.ts`.

## Testing Guidelines
- Framework: Vitest.
- Test file naming: `*.test.ts` (example: `packages/domain/test/slot-generation.test.ts`).
- Prefer unit tests for domain logic and integration-style tests for route/service boundaries.
- Run `pnpm test` before opening a PR; add tests for behavior changes and bug fixes.

## Commit & Pull Request Guidelines
Git history is not available in this workspace snapshot, so use consistent Conventional Commit style:
- `feat: add appointment reschedule validation`
- `fix: prevent overlapping busy blocks`

For PRs, include:
- clear summary and scope,
- linked issue/ticket,
- testing notes (`pnpm test`, `pnpm lint`),
- screenshots or request/response examples for UI/API changes.

## Security & Configuration Tips
- Copy `.env.example` to `.env` and never commit secrets.
- Validate all external payloads (webhooks, API input) with schema checks (`zod`).
