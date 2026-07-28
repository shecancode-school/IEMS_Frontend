import { runDailyReminders } from "@/lib/reminders";
import { ok, unauthorized } from "@/lib/http";

/* Daily reminder job, driven by Vercel Cron (see vercel.json). Vercel sends
   `Authorization: Bearer $CRON_SECRET`; we reject anything else so the endpoint
   can't be triggered by the public. Also runnable by an admin via
   /api/admin/reminders/run. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) return unauthorized();

  const summary = await runDailyReminders();
  return ok(summary);
}
