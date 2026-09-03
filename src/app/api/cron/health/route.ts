import { recordHealth, runHealthChecks } from "@/lib/health";
import { ok, unauthorized } from "@/lib/http";

/* Health, measured when nobody is looking.

   Until now a sample was written only while an administrator had the status
   page open, which means the uptime history recorded attendance rather than
   availability: the platform was "up" for exactly the hours somebody was
   watching it, and an outage at 3am left no trace at all.

   Two things drive this endpoint, and the second is the important one:

     - Vercel Cron (vercel.json), same `Bearer $CRON_SECRET` guard as the
       reminders job. On Hobby that fires once a day, which is a heartbeat
       rather than monitoring.
     - An external pinger — UptimeRobot, cron-job.org, a box you own — every
       ~5 minutes, with the same header. This is the half that actually
       monitors, because a cron running INSIDE the app cannot record the app
       being down. The pinger failing to reach this endpoint is itself the
       outage signal, and it is the only signal that survives the app being
       gone.

   It writes samples and returns the result; it changes nothing else, so it is
   safe to call as often as the pinger allows. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) return unauthorized();

  const services = await runHealthChecks();
  /* unlike the admin route this is NOT fire-and-forget: recording the sample
     is the entire point of the call, so a write failure has to be visible to
     whatever is pinging us */
  await recordHealth(services, "cron");

  const down = services.filter((s) => !s.ok);
  return ok(
    {
      ok: down.length === 0,
      checkedAt: new Date().toISOString(),
      services: services.map((s) => ({
        name: s.name,
        ok: s.ok,
        status: s.status,
        ms: s.ms,
        detail: s.detail,
      })),
    },
    /* a non-200 is what an uptime monitor alerts on, so a real dependency
       failure has to come back as one rather than as a cheerful 200 with a
       false flag buried in the body */
    down.length ? 503 : 200
  );
}
