"use client";

import { z } from "zod";
import { useDashboard, useEventStats } from "@/hooks/admin/dashboard";
import { useEvents } from "@/hooks/admin/events";
import { SectionCards } from "@/components/section-cards";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable, schema } from "@/components/data-table";
import { SystemHealth } from "@/components/admin/SystemHealth";
import { ErrorState } from "@/components/admin/states";

export default function DashboardPage() {
  const dash = useDashboard();
  const eventStats = useEventStats();
  const events = useEvents();

  const orgById = new Map((events.data ?? []).map((e) => [e.id, e.organiser]));

  const rows: z.infer<typeof schema>[] = (eventStats.data?.stats ?? []).map((s, i) => ({
    id: i + 1,
    header: s.event.name,
    type: s.event.category,
    status: s.event.status,
    target: String(s.event.maxAttendees),
    limit: String(s.fullness.issued),
    reviewer: orgById.get(s.event.id) ?? "Igire Rwanda Organization",
    image: s.event.gallery?.[0],
  }));

  if (dash.error)
    return <ErrorState message={dash.error.message} onRetry={() => dash.refetch()} />;

  return (
    /* negative margins cancel the panel's padding so the block spans edge to
       edge with its own spacing — matching the dashboard-01 layout */
    <div className="@container/main -mx-4 flex flex-col gap-4 md:-mx-6 md:gap-6 lg:-mx-8">
      {/* API health, uptime, traffic and the work queue lead the dashboard */}
      <div className="px-4 lg:px-6">
        <SystemHealth />
      </div>
      <SectionCards data={dash.data} loading={dash.isPending} />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive
          daily={dash.data?.attendance.dailyCheckins ?? []}
          hourly={dash.data?.attendance.hourlyCheckins ?? []}
        />
      </div>
      <DataTable data={rows} loading={eventStats.isPending || events.isPending} />
    </div>
  );
}
