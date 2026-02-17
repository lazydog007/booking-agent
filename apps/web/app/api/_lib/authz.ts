import { NextResponse } from "next/server";
import { getAuthSession } from "./session";

export type DashboardRole = "owner" | "admin" | "staff" | "viewer";

export function canModify(role: DashboardRole) {
  return role === "owner" || role === "admin" || role === "staff";
}

export async function requireDashboardSession() {
  const session = await getAuthSession();
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 })
    };
  }

  return { ok: true as const, session };
}

export async function requireModifySession() {
  const auth = await requireDashboardSession();
  if (!auth.ok) return auth;

  if (!canModify(auth.session.user.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "forbidden: admin/staff role required" }, { status: 403 })
    };
  }

  return auth;
}
