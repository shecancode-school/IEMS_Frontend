import { requireAdmin } from "@/lib/auth";
import { runDailyReminders } from "@/lib/reminders";
import { ok, unauthorized } from "@/lib/http";

/* Admin "run now" trigger for the daily progress reminders — the same pass the
   Vercel cron runs, on demand from the Emails page. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const summary = await runDailyReminders();
  return ok(summary);
}
