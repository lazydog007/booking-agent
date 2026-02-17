import { headers } from "next/headers";

export async function getTenantIdFromHeaders() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) throw new Error("Missing x-tenant-id header");
  return tenantId;
}
