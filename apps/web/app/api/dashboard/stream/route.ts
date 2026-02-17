import { and, eq, gt, lt, max } from "drizzle-orm";
import { appointments, busyBlocks, db } from "@booking-agent/db";
import { requireDashboardSession } from "../../_lib/authz";

async function getLatestVersion(tenantId: string, resourceId: string | null, from: Date, to: Date) {
  const appointmentFilters = [
    eq(appointments.tenantId, tenantId),
    lt(appointments.startAt, to),
    gt(appointments.endAt, from)
  ];
  if (resourceId) appointmentFilters.push(eq(appointments.resourceId, resourceId));

  const busyFilters = [eq(busyBlocks.tenantId, tenantId), lt(busyBlocks.startAt, to), gt(busyBlocks.endAt, from)];
  if (resourceId) busyFilters.push(eq(busyBlocks.resourceId, resourceId));

  const [a] = await db.select({ updatedAt: max(appointments.updatedAt) }).from(appointments).where(and(...appointmentFilters));
  const [b] = await db.select({ updatedAt: max(busyBlocks.updatedAt) }).from(busyBlocks).where(and(...busyFilters));
  return `${a?.updatedAt ? new Date(a.updatedAt).toISOString() : "none"}|${b?.updatedAt ? new Date(b.updatedAt).toISOString() : "none"}`;
}

export async function GET(req: Request) {
  const auth = await requireDashboardSession();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const resourceId = url.searchParams.get("resource_id");

  if (!from || !to) {
    return new Response("from and to are required", { status: 400 });
  }

  const tenantId = auth.session.user.tenant_id;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send("connected", { at: new Date().toISOString() });
      let lastVersion = "";

      const tick = async () => {
        if (closed) return;
        try {
          const version = await getLatestVersion(tenantId, resourceId, new Date(from), new Date(to));
          if (version !== lastVersion) {
            lastVersion = version;
            send("refresh", { version, at: new Date().toISOString() });
          } else {
            send("heartbeat", { at: new Date().toISOString() });
          }
        } catch {
          send("error", { at: new Date().toISOString() });
        }
      };

      const interval = setInterval(tick, 5000);
      void tick();

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      req.signal.addEventListener("abort", close);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
