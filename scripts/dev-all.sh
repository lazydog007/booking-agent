#!/bin/sh

set -eu

cleanup() {
  kill "$WEB_PID" "$WORKER_PID" 2>/dev/null || true
}

pnpm --filter @booking-agent/web dev &
WEB_PID=$!

pnpm dlx tsx packages/jobs/src/run-webhook-worker.ts &
WORKER_PID=$!

trap cleanup INT TERM EXIT

wait "$WEB_PID" "$WORKER_PID"

