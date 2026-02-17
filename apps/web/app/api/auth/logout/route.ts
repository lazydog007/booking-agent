import { NextResponse } from "next/server";
import { clearUserSession } from "../../_lib/session";

export async function POST() {
  try {
    await clearUserSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
