"use client";

import { useState } from "react";
import {
  FileClock,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useAuditLog } from "@/hooks/admin/audit";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatEventDateTime } from "@/lib/time";
import { AuditRow } from "@/types/admin";
import { cn } from "@/lib/utils";

const CATEGORY_TONE: Record<AuditRow["category"], string> = {
  AUTH: "bg-amber-100 text-amber-900",
  STAFF: "bg-violet-100 text-violet-900",
  CALENDAR: "bg-sky-100 text-sky-900",
  BOOKING: "bg-green-100 text-green-800",
  EVENT: "bg-primary/15 text-primary",
  TICKET: "bg-rose-100 text-rose-900",
  SYSTEM: "bg-muted text-muted-foreground",
};

const CATEGORY_LABELS: Record<AuditRow["category"], string> = {
  AUTH: "Auth",
  STAFF: "Staff",
  CALENDAR: "Calendar",
  BOOKING: "Booking",
  EVENT: "Event",
  TICKET: "Tickets",
  SYSTEM: "System",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as AuditRow["category"][];

export default function AuditPage() {
  const [category, setCategory] = useState<AuditRow["category"] | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const { data, isPending, error, refetch } = useAuditLog({
    category: category === "ALL" ? undefined : category,
    q: appliedQ || undefined,
  });

  const columns: Column<AuditRow>[] = [
    {
      id: "when",
      header: "When",
      sortValue: (l) => l.at,
      cell: (l) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {formatEventDateTime(new Date(l.at))}
        </span>
      ),
    },
    {
      id: "actor",
      header: "Who",
      cell: (l) => (
        <div>
          <p className="font-medium text-foreground">{l.actorName}</p>
          <p className="text-xs text-muted-foreground">{l.actorEmail}</p>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      cell: (l) => (
        <Badge className={cn("rounded-full border-transparent", CATEGORY_TONE[l.category])}>
          {CATEGORY_LABELS[l.category]}
        </Badge>
      ),
    },
    {
      id: "action",
      header: "Action",
      cell: (l) => <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{l.action}</code>,
    },
    {
      id: "summary",
      header: "What happened",
      cell: (l) => (
        <div className="max-w-md">
          <p className="text-sm text-foreground">{l.summary}</p>
          {l.changed.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              changed: {l.changed.join(", ")}
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="An append-only record of who did what — sign-ins, staff management, activities, bookings and events."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedQ(q)}
            placeholder="Search people or actions…"
            className="w-64 pl-8"
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as AuditRow["category"] | "ALL")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {appliedQ && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setAppliedQ(""); }}>
            Clear
          </Button>
        )}
      </div>

      {isPending ? (
        <TableSkeleton cols={5} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<FileClock className="size-5" />}
          title="Nothing logged yet"
          message="Actions like sign-ins, staff changes and bookings will appear here."
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          getRowId={(l) => l.id}
          searchable={() => ""}
        />
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" />
        Only administrators can read this. Entries are never edited or deleted.
      </div>
    </div>
  );
}
