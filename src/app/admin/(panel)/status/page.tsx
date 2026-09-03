"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Cloud,
  Database,
  Mail,
  MinusCircle,
  RefreshCw,
  Wifi,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/client";
import { useLiveConnection, type Strength } from "@/hooks/admin/useLiveConnection";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Service = {
  name: string;
  ok: boolean;
  /* a dependency nobody configured on this deployment is a fact, not an
     outage — it gets its own neutral state rather than a red pill */
  status: "ok" | "down" | "not_configured";
  detail: string;
  ms: number;
};
type DayStatus = "ok" | "partial" | "none";
type Uptime = { pct: number | null; days: { day: string; status: DayStatus }[] };
type Health = {
  ok: boolean;
  services: Service[];
  checkedAt: string;
  uptimeSeconds: number;
  uptime?: Record<string, Uptime>;
  /* The unattended monitor. `stale` is decided server-side — past 30 minutes,
     twice the recommended 5-minute pinger interval — because the browser's
     clock is not authoritative and reading Date.now() in render is impure. */
  monitor?: { lastCronAt: string | null; ageMinutes: number | null; stale: boolean };
};

function ago(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return "never";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/* GitHub-status-style 90-day uptime bar */
function UptimeBars({ uptime }: { uptime?: Uptime }) {
  const days = uptime?.days ?? [];
  return (
    <div>
      <div className="flex h-8 items-stretch gap-px overflow-hidden rounded">
        {days.map((d) => (
          <span
            key={d.day}
            title={`${d.day}: ${d.status === "none" ? "no data" : d.status === "ok" ? "operational" : "disruption"}`}
            className={cn(
              "flex-1",
              d.status === "ok"
                ? "bg-emerald-400"
                : d.status === "partial"
                  ? "bg-amber-400"
                  : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>90 days ago</span>
        <span className="flex-1 border-t border-dashed border-border mx-2" />
        <span>{uptime?.pct != null ? `${uptime.pct}% uptime` : "gathering data"}</span>
        <span className="flex-1 border-t border-dashed border-border mx-2" />
        <span>Today</span>
      </div>
    </div>
  );
}

const SERVICE_ICON: Record<string, typeof Database> = {
  Database,
  Cloudinary: Cloud,
  "Email (SMTP)": Mail,
  "Google Calendar": CalendarDays,
};

/* signal-bar meter, like a phone's reception, for the live socket */
function SignalBars({ strength }: { strength: Strength }) {
  const filled = strength === "strong" ? 3 : strength === "good" ? 2 : strength === "weak" ? 1 : 0;
  const color =
    strength === "strong"
      ? "bg-emerald-500"
      : strength === "good"
        ? "bg-amber-500"
        : strength === "weak"
          ? "bg-destructive"
          : "bg-muted-foreground/30";
  return (
    <span className="flex items-end gap-0.5">
      {[1, 2, 3].map((b) => (
        <span
          key={b}
          className={cn("w-1.5 rounded-sm", b <= filled ? color : "bg-muted")}
          style={{ height: `${b * 5 + 3}px` }}
        />
      ))}
    </span>
  );
}

function StatusRow({
  icon: Icon,
  name,
  ok,
  detail,
  right,
}: {
  icon: typeof Database;
  name: string;
  ok: boolean;
  detail: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <Icon className="size-5 text-muted-foreground" />
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {right}
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            ok
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-destructive/15 text-destructive"
          )}
        >
          {ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {ok ? "Operational" : "Down"}
        </span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { data, isPending, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api<Health>("/api/admin/health", { role: "admin" }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const live = useLiveConnection();

  const services = data?.services ?? [];
  const cronStale = data?.monitor?.stale ?? true;
  const socketOk = live.state === "open";
  const allOk = (data?.ok ?? false) && socketOk;

  const strengthLabel =
    live.strength === "strong"
      ? "Strong"
      : live.strength === "good"
        ? "Good"
        : live.strength === "weak"
          ? "Weak"
          : "Offline";

  return (
    <div className="w-full">
      <PageHeader
        title="API status"
        description="Real-time health of every service the platform depends on."
        actions={
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Refresh
          </button>
        }
      />

      {/* overall banner, GitHub-status style */}
      <div
        className={cn(
          "mb-6 flex items-center gap-3 rounded-xl px-5 py-4 text-white",
          allOk ? "bg-emerald-600" : "bg-amber-600"
        )}
      >
        {allOk ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
        <div>
          <p className="text-lg font-semibold">
            {allOk ? "All Systems Operational" : "Partial Service Disruption"}
          </p>
          <p className="text-xs text-white/80">
            {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "Checking…"} ·
            re-checks every 15s while this page is open
          </p>
        </div>
      </div>

      {/* The line that says whether any of the above is trustworthy.

          Everything on this page is measured by the page itself, which means
          it only ever describes moments when somebody was watching. The
          unattended check is what fills the rest of the history in, so how
          long ago it last ran is the difference between "90 days of uptime"
          and "90 days of nobody looking". */}
      <div
        className={cn(
          "mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-4 py-3 text-sm",
          cronStale
            ? "border-amber-500/40 bg-amber-500/10"
            : "border-border bg-card/40 text-muted-foreground"
        )}
      >
        <span className="font-medium text-foreground">Unattended monitoring</span>
        <span>·</span>
        <span>last check {ago(data?.monitor?.ageMinutes)}</span>
        {cronStale && (
          <span className="w-full text-xs text-muted-foreground sm:w-auto">
            Nothing has checked this platform without a person watching. Point an external
            pinger at <code className="rounded bg-muted px-1">/api/cron/health</code> every five
            minutes — see <code className="rounded bg-muted px-1">.env.example</code>.
          </span>
        )}
      </div>

      {/* external APIs / integrations, each with a 90-day uptime bar */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {isPending
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="shadow-none">
                <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))
          : services.map((s) => {
              const Icon = SERVICE_ICON[s.name] ?? Database;
              return (
                <Card key={s.name} className="shadow-none">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="size-4 text-muted-foreground" />
                        {s.name}
                      </span>
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-white",
                          s.status === "not_configured"
                            ? "bg-muted-foreground/40"
                            : s.ok
                              ? "bg-emerald-500"
                              : "bg-destructive"
                        )}
                        title={
                          s.status === "not_configured"
                            ? "Not configured on this deployment"
                            : s.ok
                              ? "Operational"
                              : "Down"
                        }
                      >
                        {s.status === "not_configured" ? (
                          <MinusCircle className="size-4" />
                        ) : s.ok ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <XCircle className="size-4" />
                        )}
                      </span>
                    </div>
                    <UptimeBars uptime={data?.uptime?.[s.name]} />
                    <p className="text-xs text-muted-foreground">
                      {s.status === "not_configured"
                        ? "Not configured"
                        : s.ok
                          ? "Normal"
                          : "Disrupted"}{" "}
                      · {s.detail} · {s.ms}ms
                    </p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* live socket connection strength */}
        <Card className="shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Realtime connection</h2>
              <p className="text-xs text-muted-foreground">
                The live socket that streams scans &amp; notifications
              </p>
            </div>
            <StatusRow
              icon={Wifi}
              name="Live socket (SSE)"
              ok={socketOk}
              detail={
                socketOk
                  ? `Signal: ${strengthLabel}${live.latencyMs != null ? ` · ${live.latencyMs}ms handshake` : ""}`
                  : live.state === "connecting"
                    ? "Connecting…"
                    : "Disconnected — retrying"
              }
              right={<SignalBars strength={live.strength} />}
            />
            <div className="grid grid-cols-3 divide-x divide-border">
              <Stat label="Signal" value={strengthLabel} />
              <Stat
                label="Handshake"
                value={live.latencyMs != null ? `${live.latencyMs}ms` : "—"}
              />
              <Stat label="Reconnects" value={String(live.reconnects)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
