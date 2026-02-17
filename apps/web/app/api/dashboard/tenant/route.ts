import { NextResponse } from "next/server";
import { requireDashboardSession } from "../../_lib/authz";

export async function GET() {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;
    return NextResponse.json({ tenant: auth.session.tenant }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
