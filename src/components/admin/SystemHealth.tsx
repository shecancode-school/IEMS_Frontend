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

type Service = { name: string; ok: boolean; detail: string; ms: number };
type Health = {
  ok: boolean;
  services: Service[];
  checkedAt: string;
  uptimeSeconds: number;
  queue: { ticketEmails: number; pendingVerifications: number; awaitingTicket: number };
  traffic: { scansLastHour: number; scansToday: number };
};

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
                data.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
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
          hint={data ? `Checked ${new Date(data.checkedAt).toLocaleTimeString()}` : "—"}
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
          value={`${okCount}/${services.length || 3}`}
          loading={isPending}
          badge={
            <>
              {okCount === services.length ? <CheckCircle2 /> : <XCircle />}
              {okCount === services.length ? "Healthy" : "Issues"}
            </>
          }
          footer="Integrations"
          footerIcon={ServerIcon}
          hint="Database · Cloudinary · Email"
        />
      </div>
    </section>
  );
}
