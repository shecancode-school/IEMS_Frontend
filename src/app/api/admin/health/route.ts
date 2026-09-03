import { dbConnect } from "@/lib/db";
import { Participant, ScanLog, Ticket } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { computeUptime, lastSampleAt, recordHealth, runHealthChecks } from "@/lib/health";
import { ok, unauthorized } from "@/lib/http";

/* Admin: live status of the external services the app depends on — surfaced
   on the dashboard so an outage is obvious without reading server logs.

   The probes themselves live in lib/health, shared with `pnpm health` and with
   the cron that runs them when nobody is on the site. This route is now just
   "run them, record that it was a page view, and add the operational counters
   the dashboard shows beside them". */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  await dbConnect();

  const hourAgo = new Date(Date.now() - 3_600_000);
  const dayAgo = new Date(Date.now() - 86_400_000);

  const [services, ticketsQueued, pendingVerifications, unticketedApproved, scansLastHour, scansToday] =
    await Promise.all([
      runHealthChecks(),
      /* the async email/PDF pipeline: tickets issued but not yet marked sent */
      Ticket.countDocuments({ sentAt: null }),
      Participant.countDocuments({ status: "PENDING" }),
      Participant.countDocuments({ status: { $in: ["VERIFIED"] }, ticket: null }),
      ScanLog.countDocuments({ createdAt: { $gt: hourAgo } }),
      ScanLog.countDocuments({ createdAt: { $gt: dayAgo } }),
    ]);

  /* record this check so the uptime history keeps growing (fire-and-forget),
     tagged as a page view rather than a real measurement */
  void recordHealth(services, "web").catch(() => {});

  const [uptime, lastSample] = await Promise.all([
    computeUptime(services.map((s) => s.name)),
    lastSampleAt(),
  ]);

  /* Age is computed here, against the server's clock, rather than being left
     to the browser. Two reasons: a client clock that is off by a day would
     silently report the monitoring as dead or as fresh, and a component that
     reads Date.now() while rendering is impure. */
  const cronAgeMinutes = lastSample.cron
    ? Math.round((Date.now() - new Date(lastSample.cron).getTime()) / 60_000)
    : null;

  return ok({
    /* a dependency nobody configured is not an outage */
    ok: services.every((s) => s.ok),
    services,
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    /* When the unattended monitor last ran. Green bars with a stale cron
       timestamp mean nobody is checking, not that nothing is wrong.
       Stale past 30 minutes — twice the recommended 5-minute pinger interval,
       with slack. */
    monitor: {
      lastCronAt: lastSample.cron,
      ageMinutes: cronAgeMinutes,
      stale: cronAgeMinutes === null || cronAgeMinutes > 30,
    },
    lastSample,
    queue: {
      /* work waiting to clear — bigger numbers mean things are backing up */
      ticketEmails: ticketsQueued,
      pendingVerifications,
      awaitingTicket: unticketedApproved,
    },
    traffic: {
      scansLastHour,
      scansToday,
    },
    uptime,
  });
}
