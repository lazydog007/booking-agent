import { redirect } from "next/navigation";
import { getAuthSession } from "./api/_lib/session";

export default async function HomePage() {
  const session = await getAuthSession();
  redirect(session ? "/dashboard" : "/login");
}
