# Booking Agent (WhatsApp + Internal Calendar)

Multi-tenant SaaS scaffold for AI-assisted WhatsApp booking with a first-party calendar for any appointment-based business.

## Stack

- Next.js App Router + TypeScript
- Postgres + Drizzle ORM
- OpenAI Responses API (tool-calling agent)
- Meta Cloud API (WhatsApp)
- pnpm workspace monorepo

## Quick Start

1. Install deps
```bash
pnpm install
```
2. Configure env
```bash
cp .env.example .env
```
3. Run app
```bash
pnpm dev
```

## Auth (Session-based)

- Visit `/login`.
- First run: use **First-time Setup** to create your business workspace + owner account (available only when no users exist).
- After setup, sign in with email/password.
- Dashboard and dashboard APIs are session-protected.
- Workspace (`tenant`) + role are inferred from server-side session (no client-provided tenant id).

## Important API Endpoints

- `POST /api/auth/bootstrap`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/webhooks/whatsapp/meta`
- `GET /api/dashboard/whatsapp/integrations`
- `POST /api/dashboard/whatsapp/integrations`
- `GET /api/dashboard/whatsapp/channels`
- `POST /api/dashboard/whatsapp/channels`
- `PATCH /api/dashboard/whatsapp/channels/:id`
- `POST /api/dashboard/whatsapp/channels/:id/verify`
- `POST /api/availability/query`
- `POST /api/appointments/book`
- `POST /api/appointments/:id/cancel`
- `POST /api/appointments/:id/reschedule`
- `GET /api/dashboard/appointments`
- `POST /api/dashboard/busy-blocks`

## Notes

- External calendar providers are intentionally not used in MVP.
- Overlap prevention is enforced at DB level using exclusion constraints.
- WhatsApp webhook intake writes to `webhook_events_inbox`; run `processWebhookEventsBatch` from `@booking-agent/jobs` in a worker loop.
# booking-agent
