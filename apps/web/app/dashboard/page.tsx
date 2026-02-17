import "./dashboard.css";
import { redirect } from "next/navigation";
import CalendarDashboard from "./CalendarDashboard";
import { getAuthSession } from "../api/_lib/session";

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  return <CalendarDashboard initialSession={session} />;
}
