import { processWebhookEventsBatch } from "./process-webhook-events";

export async function runWebhookWorkerOnce() {
  return processWebhookEventsBatch(Number(process.env.WEBHOOK_WORKER_BATCH_SIZE ?? 20));
}

export async function runWebhookWorkerLoop() {
  const intervalMs = Number(process.env.WEBHOOK_WORKER_INTERVAL_MS ?? 2000);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runWebhookWorkerOnce();
    } catch {
      // Worker keeps polling; failures are persisted per event row.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.env.NODE_ENV !== "test") {
  const shouldLoop = process.env.WEBHOOK_WORKER_LOOP !== "false";
  if (shouldLoop) {
    void runWebhookWorkerLoop();
  } else {
    void runWebhookWorkerOnce();
  }
}
