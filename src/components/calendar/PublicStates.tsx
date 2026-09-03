"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { FOCUS_RING_SOFT, HOUR_PX, TAP, WEEKDAY_HEAD } from "./publicStyles";
import type { View } from "./PublicToolbar";

/* Loading and failure, drawn to the same plan as the thing they stand in for.

   The old skeleton was a month grid whatever view you were on, so switching to
   Upcoming and refreshing showed a flash of month-shaped boxes before an
   agenda appeared — the page appeared to change its mind. Each view now has a
   skeleton with its own geometry, and the numbers come from the same constants
   the real views use, so the layout does not jump when the data lands. */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const Bar = ({ className = "" }: { className?: string }) => (
  <span className={`block rounded bg-panel-2 ${className}`} />
);

/* A fixed pattern rather than random lengths: a skeleton that reshuffles on
   every render draws attention to itself, and this one renders on every
   refetch. */
const CHIPS_AT = [2, 5, 9, 10, 13, 16, 17, 22, 24, 30, 31, 33, 38];

function MonthSkeleton() {
  return (
    <div className="bg-panel">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className={`${WEEKDAY_HEAD} text-cream-dim`}>
            <span className="hidden sm:inline">{wd}</span>
            <span className="sm:hidden">{wd[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid animate-pulse grid-cols-7">
        {Array.from({ length: 42 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-16 flex-col border-b border-r border-line p-1 nth-[7n]:border-r-0 sm:min-h-32 sm:p-1.5"
          >
            <Bar className="size-7 shrink-0 rounded-full sm:size-8" />
            {CHIPS_AT.includes(i) && (
              <div className="mt-1 space-y-0.5">
                {/* dots on a phone, chips above it — the same substitution the
                    real grid makes */}
                <span className="block size-1.5 rounded-full bg-panel-2 sm:hidden" />
                <Bar className="hidden h-[22px] sm:block" />
                {i % 3 === 0 && <Bar className="hidden h-[22px] w-4/5 sm:block" />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekSkeleton() {
  return (
    <div className="animate-pulse bg-panel">
      <div className="grid border-b border-line bg-panel-2/40 [grid-template-columns:2.5rem_repeat(7,minmax(0,1fr))] sm:[grid-template-columns:3.5rem_repeat(7,minmax(0,1fr))] md:[grid-template-columns:3.5rem_repeat(7,minmax(5.5rem,1fr))]">
        <div />
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="flex flex-col items-center gap-1 border-l border-line py-2">
            <Bar className="h-2 w-6" />
            <Bar className="size-7 rounded-full sm:size-8" />
          </div>
        ))}
      </div>

      <div className="grid [grid-template-columns:2.5rem_repeat(7,minmax(0,1fr))] sm:[grid-template-columns:3.5rem_repeat(7,minmax(0,1fr))] md:[grid-template-columns:3.5rem_repeat(7,minmax(5.5rem,1fr))]">
        <div>
          {Array.from({ length: 6 }, (_, h) => (
            <div key={h} className="border-b border-line pr-1.5 pt-1 text-right">
              <Bar className="ml-auto h-2 w-6" />
            </div>
          ))}
        </div>
        {WEEKDAYS.map((wd, d) => (
          <div key={wd} className="relative border-l border-line">
            {Array.from({ length: 6 }, (_, h) => (
              <div key={h} className="border-b border-line" style={{ height: HOUR_PX }} />
            ))}
            {/* placed on the hour ruler so the block sits where a real session
                would, rather than floating at an arbitrary offset */}
            {d % 2 === 0 && (
              <span
                className="absolute inset-x-1 rounded-md bg-panel-2"
                style={{ top: HOUR_PX * (1 + (d % 3)), height: HOUR_PX - 6 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="animate-pulse bg-panel">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[3rem_1fr] gap-3 border-b border-line px-3 py-4 last:border-b-0 sm:grid-cols-[4rem_1fr] sm:gap-5 sm:px-6"
        >
          <div className="flex flex-col items-center gap-1.5">
            <Bar className="size-8 rounded-full" />
            <Bar className="h-2 w-6" />
          </div>
          <div className="space-y-2 py-1">
            <Bar className="h-2 w-20" />
            <Bar className="h-4 w-3/5" />
            <Bar className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton({ view }: { view: View }) {
  return (
    <div role="status" aria-label="Loading the calendar">
      {view === "month" ? <MonthSkeleton /> : view === "week" ? <WeekSkeleton /> : <AgendaSkeleton />}
      <span className="sr-only">Loading the calendar…</span>
    </div>
  );
}

export function CalendarErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 bg-panel px-6 py-16 text-center"
    >
      <span className="grid size-12 place-items-center rounded-full border border-terracotta/40 bg-terracotta/10 text-terracotta">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-cream">We couldn&apos;t load the calendar</p>
        <p className="mt-1 max-w-sm text-sm text-cream-dim">
          The connection dropped or the feed is briefly unavailable. Nothing is lost —
          try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={`flex cursor-pointer items-center gap-2 rounded-md border border-line bg-panel-2 px-4 text-sm font-semibold text-cream transition-colors hover:border-orange hover:text-orange ${TAP} ${FOCUS_RING_SOFT}`}
      >
        <RotateCw className="size-4" aria-hidden />
        Try again
      </button>
    </div>
  );
}
