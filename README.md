# Booking Agent

Multi-tenant WhatsApp booking platform with an AI agent and a first-party calendar.

## Tech Stack

- Next.js App Router + TypeScript
- PostgreSQL + Drizzle ORM
- OpenAI Responses API (agent tooling/runtime)
- Meta Cloud API (WhatsApp integration)
- `pnpm` workspace monorepo

## Monorepo Structure

- `apps/web`: Next.js UI + HTTP API routes (`app/api/**`)
- `packages/domain`: scheduling logic and policies
- `packages/db`: Drizzle schema, migrations, and DB client
- `packages/agent`: agent runtime, prompts, and tool schemas
- `packages/integrations`: provider integrations (Meta/WhatsApp)
- `packages/shared`: shared types/utilities
- `packages/jobs`: background workers/entrypoints

## Prerequisites

- Node.js 20+
- `pnpm` 9+
- PostgreSQL 15+ (or Docker)

## Local Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Run database migrations:
```bash
pnpm db:migrate
```

4. Start the web app:
```bash
pnpm dev
```

5. Open `http://localhost:3000`.

## Environment Variables

Required in `.env`:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `OPENAI_API_KEY`

Optional/common:

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `META_VERIFY_TOKEN`
- `META_APP_SECRET`

## Workspace Commands

Run from repository root:

- `pnpm dev`: start web app (`@booking-agent/web`)
- `pnpm dev:all`: start web app + webhook worker
- `pnpm build`: type-check/build all workspaces
- `pnpm lint`: lint/type-check all workspaces
- `pnpm test`: run Vitest across all workspaces
- `pnpm db:generate`: generate Drizzle migrations
- `pnpm db:migrate`: apply migrations

## Webhook Worker

Incoming webhook events are persisted and processed asynchronously.

- Local worker loop:
```bash
pnpm dlx tsx packages/jobs/src/run-webhook-worker.ts
```
- Or run both app and worker together:
```bash
pnpm dev:all
```

## Docker (Optional)

Start web + worker using compose:

```bash
docker compose up --build
```

Services:
- `web`: runs migrations, then starts Next.js server on port `3000`
- `worker`: runs webhook event processor loop
