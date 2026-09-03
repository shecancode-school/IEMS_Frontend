"use client";

import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CHIPS_PER_CELL, HOUR_PX, WEEKDAY_HEAD } from "./adminStyles";
import type { CalendarView } from "./CalendarToolbar";

/* Loading and messaging, shaped like the calendar rather than like a table.

   Both admin calendars used `TableSkeleton cols={7}` while they loaded — a
   *table* placeholder standing in for a grid. It is the wrong silhouette, and
   it collapses to a different height than the board that replaces it, so every
   load shifted the page under the cursor. */

export function CalendarSkeleton({ view }: { view: CalendarView }) {
  if (view === "month") {
    return (
      <div className="overflow-hidden rounded-lg border bg-card" role="status" aria-label="Loading calendar">
        <div className="grid grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={WEEKDAY_HEAD}>
              <Skeleton className="mx-auto h-2.5 w-7" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 42 }).map((_, i) => (
            <div
              key={i}
              className="min-h-16 space-y-1 border-b border-l p-1.5 [&:nth-child(7n+1)]:border-l-0 sm:min-h-28"
            >
              <Skeleton className="size-[26px] rounded-full sm:size-7" />
              {/* only some cells get chips, so the placeholder reads as a
                  calendar rather than as a uniform grey mesh */}
              {i % 3 === 0 &&
                Array.from({ length: (i % CHIPS_PER_CELL) + 1 }).map((_, c) => (
                  <Skeleton key={c} className="hidden h-[22px] w-full rounded sm:block" />
                ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const columns = view === "day" ? 4 : 7;
  return (
    <div className="overflow-hidden rounded-lg border bg-card" role="status" aria-label="Loading calendar">
      <div
        className="grid border-b"
        style={{ gridTemplateColumns: `3.5rem repeat(${columns}, minmax(0, 1fr))` }}
      >
        <div className="border-r" />
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="space-y-1.5 border-l px-2 py-2">
            <Skeleton className="mx-auto h-2.5 w-8" />
            <Skeleton className="mx-auto size-7 rounded-full" />
          </div>
        ))}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: `3.5rem repeat(${columns}, minmax(0, 1fr))` }}
      >
        <div className="border-r">
          {Array.from({ length: 8 }).map((_, h) => (
            <div key={h} style={{ height: HOUR_PX }} className="border-b px-1.5 pt-0.5">
              <Skeleton className="ml-auto h-2 w-8" />
            </div>
          ))}
        </div>
        {Array.from({ length: columns }).map((_, c) => (
          <div key={c} className="relative border-l">
            {Array.from({ length: 8 }).map((_, h) => (
              <div key={h} style={{ height: HOUR_PX }} className="border-b" />
            ))}
            <Skeleton
              className="absolute inset-x-1 rounded-md"
              style={{ top: ((c * 37) % 5) * HOUR_PX + 8, height: HOUR_PX - 12 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* A message about the board, in the board's own theme.

   The Google-error banner on both admin pages was `border-amber-200 bg-amber-50
   text-amber-900` — hardcoded light-mode values on a page whose surfaces are
   near-black. It rendered as a glaring cream rectangle. */
export function CalendarNotice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warning";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm",
        tone === "warning"
          ? "border-amber-400/35 bg-amber-400/10 text-amber-100"
          : "border-border bg-muted/40 text-muted-foreground",
        className
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          tone === "warning" ? "text-amber-300" : "text-muted-foreground"
        )}
      />
      {children}
    </div>
  );
}
