import { NextResponse } from "next/server";
import { getAuthSession } from "../../_lib/session";

export async function GET() {
  try {
    const session = await getAuthSession({ mutateCookies: true });
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    return NextResponse.json({
      user: session.user,
      tenant: session.tenant
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
