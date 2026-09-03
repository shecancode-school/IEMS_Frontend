"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Clock,
  Inbox,
  RadioIcon,
  RefreshCw,
  ServerIcon,
  TrendingUpIcon,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Service = {
  name: string;
  ok: boolean;
  /* "not_configured" is not an outage — a deployment without Cloudinary or
     Google is a legitimate configuration, not a broken one */
  status: "ok" | "down" | "not_configured";
  detail: string;
  ms: number;
};
type DayStatus = "ok" | "partial" | "none";
type Health = {
  ok: boolean;
  services: Service[];
  checkedAt: string;
  uptimeSeconds: number;
  /* The unattended monitor: the only check that runs when nobody is on the
     site. Its age is computed server-side, both because the browser's clock is
     not authoritative and because reading Date.now() in render is impure. */
  monitor: { lastCronAt: string | null; ageMinutes: number | null; stale: boolean };
  queue: { ticketEmails: number; pendingVerifications: number; awaitingTicket: number };
  traffic: { scansLastHour: number; scansToday: number };
  /* 90 days of recorded samples per service — omitted from this type before,
     so the dashboard could only ever show "right now" */
  uptime: Record<string, { pct: number | null; days: { day: string; status: DayStatus }[] }>;
};

/* How long ago, in words, from an age the server measured. The exact
   timestamp is noise on a dashboard; what you need to know is whether it was
   minutes or days. */
function ago(mins: number | null): string {
  if (mins === null) return "never";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function uptimeLabel(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* one stat card in the dashboard-01 language: label, big value, a badge in the
   top-right, then a titled footer line with a muted hint */
function StatCard({
  label,
  value,
  loading,
  badge,
  footer,
  footerIcon: FooterIcon,
  hint,
}: {
  label: string;
  value: ReactNode;
  loading?: boolean;
  badge: ReactNode;
  footer: string;
  footerIcon: typeof Clock;
  hint: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {loading ? <Skeleton className="h-8 w-20" /> : value}
        </CardTitle>
        <CardAction>{!loading && <Badge variant="outline">{badge}</Badge>}</CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {footer} <FooterIcon className="size-4" />
        </div>
        <div className="text-muted-foreground">{hint}</div>
      </CardFooter>
    </Card>
  );
}

/* Dashboard lead block: API health, uptime, gate traffic and the async work
   queue as dashboard-01 stat cards. */
export function SystemHealth() {
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api<Health>("/api/admin/health", { role: "admin" }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const services = data?.services ?? [];
  const okCount = services.filter((s) => s.ok).length;
  const cronAge = data?.monitor?.ageMinutes ?? null;
  const cronStale = data?.monitor?.stale ?? true;
  const queued =
    (data?.queue?.ticketEmails ?? 0) +
    (data?.queue?.awaitingTicket ?? 0) +
    (data?.queue?.pendingVerifications ?? 0);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">API status &amp; health</h2>
          {data && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                data.ok
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-destructive/15 text-destructive"
              )}
            >
              {data.ok ? "All systems go" : "Degraded"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/status">View status</Link>
          </Button>
        </div>
      </div>

      {/* stat cards, matching the dashboard section cards */}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        <StatCard
          label="Uptime"
          value={data ? uptimeLabel(data.uptimeSeconds) : "—"}
          loading={isPending}
          badge={
            <>
              <RadioIcon />
              {data?.ok ? "Healthy" : "Degraded"}
            </>
          }
          footer="Server running"
          footerIcon={Clock}
          /* The monitor, not the page view. A wall of green whose last
             unattended sample is three days old is not three days of uptime —
             it is three days of nobody checking, and the two are
             indistinguishable unless this line says so. */
          hint={
            data
              ? cronStale
                ? `Unattended check ${ago(cronAge)} — monitoring may be down`
                : `Unattended check ${ago(cronAge)}`
              : "—"
          }
        />
        <StatCard
          label="Gate traffic"
          value={data?.traffic?.scansLastHour ?? 0}
          loading={isPending}
          badge={
            <>
              <TrendingUpIcon />
              {data?.traffic?.scansToday ?? 0} today
            </>
          }
          footer="Scans per hour"
          footerIcon={Activity}
          hint="Live check-in rate at the gate"
        />
        <StatCard
          label="In the queue"
          value={queued}
          loading={isPending}
          badge={
            <>
              <Inbox />
              {data?.queue?.ticketEmails ?? 0} sending
            </>
          }
          footer="Work waiting"
          footerIcon={Inbox}
          hint={`${data?.queue?.awaitingTicket ?? 0} awaiting pass · ${data?.queue?.pendingVerifications ?? 0} unverified`}
        />
        <StatCard
          label="Services"
          value={`${okCount}/${services.length || 4}`}
          loading={isPending}
          badge={
            <>
              {okCount === services.length ? <CheckCircle2 /> : <XCircle />}
              {okCount === services.length ? "Healthy" : "Issues"}
            </>
          }
          footer="Integrations"
          footerIcon={ServerIcon}
          hint={services.map((s) => s.name).join(" · ") || "Database · Cloudinary · Email"}
        />
      </div>

      {/* 90 days of recorded samples, per service. The dashboard used to show
          only the current second, so an outage that ended before you looked
          left no trace anywhere in the console. */}
      {data && services.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <UptimeRow key={s.name} service={s} uptime={data.uptime?.[s.name]} />
          ))}
        </div>
      )}
    </section>
  );
}

function UptimeRow({
  service,
  uptime,
}: {
  service: Service;
  uptime?: { pct: number | null; days: { day: string; status: DayStatus }[] };
}) {
  const days = uptime?.days ?? [];
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{service.name}</span>
        <span
          className={cn(
            "text-xs tabular-nums",
            service.status === "down" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {service.status === "not_configured"
            ? "not configured"
            : uptime?.pct != null
              ? `${uptime.pct}%`
              : "no history"}
        </span>
      </div>
      {/* one bar per day, oldest left. Grey is "nothing recorded", which is a
          different statement from green and must not look like it. */}
      <div className="mt-2 flex h-6 items-end gap-px" aria-hidden>
        {days.map((d) => (
          <span
            key={d.day}
            title={`${d.day}: ${d.status === "none" ? "no data" : d.status}`}
            className={cn(
              "h-full flex-1 rounded-[1px]",
              d.status === "ok" && "bg-emerald-500/70",
              d.status === "partial" && "bg-amber-500/80",
              d.status === "none" && "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={service.detail}>
        {service.detail}
      </p>
    </div>
  );
}
