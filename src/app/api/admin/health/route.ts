import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { HealthSample, Participant, ScanLog, Ticket } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { pingCloudinary } from "@/lib/cloudinary";
import { verifyMailer } from "@/lib/mailer";
import { ok, unauthorized } from "@/lib/http";

type Service = { name: string; ok: boolean; detail: string; ms: number };

const UPTIME_DAYS = 90;
type DayStatus = "ok" | "partial" | "none";
type Uptime = { pct: number | null; days: { day: string; status: DayStatus }[] };

/* Roll recorded samples into a per-service uptime %, and a bar per day for the
   last 90 days (green = clean, amber = a blip, grey = no data yet). */
async function computeUptime(names: string[]): Promise<Record<string, Uptime>> {
  const since = new Date(Date.now() - UPTIME_DAYS * 86_400_000);
  const rows = await HealthSample.aggregate<{
    _id: { service: string; day: string };
    total: number;
    ok: number;
  }>([
    { $match: { at: { $gte: since } } },
    {
      $group: {
        _id: { service: "$service", day: { $dateToString: { format: "%Y-%m-%d", date: "$at" } } },
        total: { $sum: 1 },
        ok: { $sum: { $cond: ["$ok", 1, 0] } },
      },
    },
  ]);

  const byService = new Map<string, Map<string, { total: number; ok: number }>>();
  for (const r of rows) {
    if (!byService.has(r._id.service)) byService.set(r._id.service, new Map());
    byService.get(r._id.service)!.set(r._id.day, { total: r.total, ok: r.ok });
  }

  const dayKeys = Array.from({ length: UPTIME_DAYS }, (_, i) => {
    const d = new Date(Date.now() - (UPTIME_DAYS - 1 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });

  const result: Record<string, Uptime> = {};
  for (const name of names) {
    const days = byService.get(name) ?? new Map();
    let total = 0;
    let okTotal = 0;
    const series = dayKeys.map((day) => {
      const d = days.get(day);
      if (!d) return { day, status: "none" as DayStatus };
      total += d.total;
      okTotal += d.ok;
      return { day, status: (d.ok === d.total ? "ok" : "partial") as DayStatus };
    });
    result[name] = { pct: total ? Math.round((okTotal / total) * 1000) / 10 : null, days: series };
  }
  return result;
}

async function timed(name: string, run: () => Promise<string>): Promise<Service> {
  const start = Date.now();
  try {
    const detail = await run();
    return { name, ok: true, detail, ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : "unreachable",
      ms: Date.now() - start,
    };
  }
}

/* Admin: live status of the external services the app depends on — surfaced
   on the dashboard so an outage is obvious without reading server logs. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  await dbConnect();

  const hourAgo = new Date(Date.now() - 3_600_000);
  const dayAgo = new Date(Date.now() - 86_400_000);

  const [services, ticketsQueued, pendingVerifications, unticketedApproved, scansLastHour, scansToday] =
    await Promise.all([
      Promise.all([
        timed("Database", async () => {
          await mongoose.connection.db!.admin().ping();
          return mongoose.connection.host || "connected";
        }),
        timed("Cloudinary", async () => {
          const res = await pingCloudinary();
          return `status: ${res.status}`;
        }),
        timed("Email (SMTP)", async () => {
          await verifyMailer();
          return "verified";
        }),
      ]),
      /* the async email/PDF pipeline: tickets issued but not yet marked sent */
      Ticket.countDocuments({ sentAt: null }),
      Participant.countDocuments({ status: "PENDING" }),
      Participant.countDocuments({ status: { $in: ["VERIFIED"] }, ticket: null }),
      ScanLog.countDocuments({ createdAt: { $gt: hourAgo } }),
      ScanLog.countDocuments({ createdAt: { $gt: dayAgo } }),
    ]);

  /* record this check so the uptime history keeps growing (fire-and-forget) */
  void HealthSample.insertMany(
    services.map((s) => ({ service: s.name, ok: s.ok, ms: s.ms })),
    { ordered: false }
  ).catch(() => {});

  const uptime = await computeUptime(services.map((s) => s.name));

  return ok({
    ok: services.every((s) => s.ok),
    services,
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
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
