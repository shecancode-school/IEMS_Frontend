"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarRange } from "lucide-react";
import { useEvents } from "@/hooks/admin/events";
import { EVENT_CATEGORIES, EVENT_STATUSES, type AdminEvent } from "@/types/admin";
import { CATEGORY_COLORS } from "@/lib/events";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatEventDate } from "@/lib/time";

/* event dates always render in Kigali time, matching what the admin typed */
const dateFmt = (s: string) => formatEventDate(s, { month: "short", day: "numeric", year: "numeric" });

export default function EventsPage() {
  const router = useRouter();
  const { data, isPending, error, refetch } = useEvents();
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const rows = useMemo(() => {
    let list = data ?? [];
    if (status !== "all") list = list.filter((e) => e.status === status);
    if (category !== "all") list = list.filter((e) => e.category === category);
    return list;
  }, [data, status, category]);

  const columns: Column<AdminEvent>[] = [
    {
      id: "name",
      header: "Event",
      sortValue: (e) => e.name.toLowerCase(),
      cell: (e) => (
        <div className="flex items-center gap-3">
          {e.gallery?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={e.gallery[0]}
              alt=""
              className="size-10 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ backgroundColor: CATEGORY_COLORS[e.category] ?? "#1e5c38" }}
            >
              {e.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{e.name}</p>
            <p className="truncate text-xs text-muted-foreground">{e.location || "—"}</p>
          </div>
        </div>
      ),
    },
    { id: "category", header: "Category", sortValue: (e) => e.category, cell: (e) => e.category },
    {
      id: "type",
      header: "Type",
      cell: (e) => (
        <span className="text-xs capitalize text-muted-foreground">{e.type.toLowerCase()}</span>
      ),
    },
    {
      id: "start",
      header: "Starts",
      sortValue: (e) => e.startTime,
      cell: (e) => <span className="tabular-nums">{dateFmt(e.startTime)}</span>,
    },
    {
      id: "capacity",
      header: "Capacity",
      sortValue: (e) => e.maxAttendees,
      cell: (e) => (
        <span className="tabular-nums text-muted-foreground">
          {e.maxAttendees === 0 ? "Uncapped" : e.maxAttendees}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (e) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge value={e.status} />
          {!e.isPublished && (
            <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px] text-muted-foreground">
              Unpublished
            </Badge>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Events"
        description="Create and manage every event — tickets expire when an event ends."
        actions={
          <Button asChild>
            <Link href="/admin/events/new">
              <CalendarPlus className="size-4" />
              New event
            </Link>
          </Button>
        }
      />

      {isPending ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="size-5" />}
          title="No events yet"
          message="Create your first event to start issuing tickets."
          action={
            <Button asChild>
              <Link href="/admin/events/new">
                <CalendarPlus className="size-4" />
                New event
              </Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(e) => e.id}
          onRowClick={(e) => router.push(`/admin/events/${e.id}`)}
          searchable={(e) => `${e.name} ${e.location} ${e.slug}`}
          searchPlaceholder="Search events…"
          toolbar={
            <>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-32.5">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {EVENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-42.5">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {EVENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
      )}
    </div>
  );
}
