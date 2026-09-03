import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { GoogleAccount, HealthSample } from "@/models";
import { pingCloudinary } from "@/lib/cloudinary";
import { googleConfigured } from "@/lib/google/config";
import { verifyMailer, mailerConfig } from "@/lib/mailer";

/* What "is the platform up" actually means, in one place.

   These probes used to exist twice — inline in /api/admin/health and again in
   scripts/healthcheck.ts — with different names for the same services, so the
   CLI and the status page could disagree about whether SMTP was healthy and
   nothing would notice. There is now one list, and the route, the CLI and the
   cron all read it.

   Every probe is a real round trip to the dependency. None of them touch app
   data or send anything: a ping, an account resolve, an SMTP handshake. */

export type HealthStatus = "ok" | "down" | "not_configured";

export type Service = {
  name: string;
  /* false only for a real failure. A dependency that was never set up on this
     deployment is "not configured", which is a fact rather than an outage —
     counting it as down would make every self-hosted install look broken. */
  ok: boolean;
  status: HealthStatus;
  detail: string;
  ms: number;
};

/* Where a sample came from. Without this you cannot tell real uptime from "an
   administrator happened to have the status page open" — a service can only
   look green for the hours somebody was watching it. */
export type HealthSource = "web" | "cron" | "cli";

async function timed(
  name: string,
  run: () => Promise<string | { skipped: string }>
): Promise<Service> {
  const start = Date.now();
  try {
    const detail = await run();
    if (typeof detail === "object") {
      return { name, ok: true, status: "not_configured", detail: detail.skipped, ms: Date.now() - start };
    }
    return { name, ok: true, status: "ok", detail, ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      ok: false,
      status: "down",
      detail: err instanceof Error ? err.message : "unreachable",
      ms: Date.now() - start,
    };
  }
}

/* The canonical names. Anything that renders an icon or reads a history keys
   off these strings, so they are not free to change casually — a rename
   orphans the samples already recorded under the old name. */
export const SERVICE_NAMES = ["Database", "Cloudinary", "Email (SMTP)", "Google Calendar"] as const;

export async function runHealthChecks(): Promise<Service[]> {
  await dbConnect();

  return Promise.all([
    timed("Database", async () => {
      await mongoose.connection.db!.admin().ping();
      return mongoose.connection.host || "connected";
    }),
    timed("Cloudinary", async () => {
      const res = await pingCloudinary();
      return `status: ${res.status}`;
    }),
    timed("Email (SMTP)", async () => {
      const cfg = mailerConfig();
      if (!cfg.accounts.length) {
        throw new Error("No sending account — set MAIL_ACCOUNTS or GMAIL_USER/GMAIL_APP_PASSWORD");
      }
      /* verifies EVERY configured account, so a broken app password on the
         second sender is caught here rather than at send time */
      await verifyMailer();
      /* naming the transport and the accounts makes a misconfigured sender
         obvious on the status page instead of a bare "verified" */
      return `${cfg.host}:${cfg.port} ${cfg.encryption} · ${cfg.accounts.length} account${
        cfg.accounts.length === 1 ? "" : "s"
      }`;
    }),
    /* Google was not checked at all before this, which is how the calendar
       could be silently returning nothing for days.

       It is checked without calling Google: an outage of theirs is not ours to
       report, and a probe that burned a token refresh every five minutes would
       be worse than the problem. What this reports is the state we own — the
       connections staff have made and whether any of them have gone bad. */
    timed("Google Calendar", async () => {
      if (!googleConfigured()) return { skipped: "not configured on this deployment" };

      const [connected, broken] = await Promise.all([
        GoogleAccount.countDocuments({ status: "CONNECTED" }),
        GoogleAccount.find({ status: { $ne: "CONNECTED" } })
          .select("email status lastError")
          .limit(3),
      ]);

      if (broken.length) {
        throw new Error(
          `${broken.length} account${broken.length === 1 ? "" : "s"} need reconnecting: ` +
            broken.map((a) => `${a.email} (${a.status.toLowerCase()})`).join(", ")
        );
      }
      if (connected === 0) return { skipped: "configured, nobody connected yet" };
      return `${connected} account${connected === 1 ? "" : "s"} connected`;
    }),
  ]);
}

/* Persist a round of checks. Fire-and-forget at every call site: a failure to
   write history must never turn into a failure to report health. */
export async function recordHealth(services: Service[], source: HealthSource): Promise<void> {
  await HealthSample.insertMany(
    services.map((s) => ({
      service: s.name,
      ok: s.ok,
      ms: s.ms,
      detail: s.detail,
      error: s.ok ? null : s.detail,
      source,
    })),
    { ordered: false }
  );
}

const UPTIME_DAYS = 90;
type DayStatus = "ok" | "partial" | "none";
export type Uptime = { pct: number | null; days: { day: string; status: DayStatus }[] };

/* Roll recorded samples into a per-service uptime %, and a bar per day for the
   last 90 days (green = clean, amber = a blip, grey = no data yet). */
export async function computeUptime(names: readonly string[]): Promise<Record<string, Uptime>> {
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

/* The last sample a monitor wrote, per source.

   This is the number that says whether the monitoring itself is alive. A wall
   of green with a cron timestamp from three days ago is not ninety days of
   uptime — it is three days of nobody checking, and the two look identical
   until you print this. */
export async function lastSampleAt(): Promise<Record<HealthSource, string | null>> {
  const rows = await HealthSample.aggregate<{ _id: string; at: Date }>([
    { $group: { _id: "$source", at: { $max: "$at" } } },
  ]);
  const out: Record<HealthSource, string | null> = { web: null, cron: null, cli: null };
  for (const r of rows) {
    /* samples written before `source` existed carry no value; they are web
       samples by definition, because the route was the only writer */
    const key = (r._id ?? "web") as HealthSource;
    if (key in out) out[key] = r.at.toISOString();
  }
  return out;
}
