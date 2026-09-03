"use client";

import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { ACTIVITY_COLOR, CATEGORY_COLORS } from "@/lib/events";
import { FOCUS_RING_SOFT, TAP } from "./publicStyles";

/* The calendar is a stack of calendars, and this is how you choose which ones
   you are looking at.

   Two axes, because they answer different questions:
     source — "show me the organisation's events" vs "show me open sessions"
     person — "show me one person's public timetable"

   The people list is derived from the feed itself rather than from the staff
   directory: only someone with at least one PUBLIC item appears, so this
   control can never leak the existence of a colleague who has published
   nothing.

   It reads as part of the calendar rather than as a component parked above it:
   the source chips carry the same colours as the chips they govern, so the
   control and its effect are visibly the same thing. */

export type CalendarSource = "EVENT" | "ACTIVITY";

export type CalendarPerson = {
  /** stable within one feed: the booking slug when there is one, else the name */
  key: string;
  name: string;
  /** their /book/<slug> page, when they take bookings */
  slug: string | null;
  count: number;
};

const SOURCE_META: Record<CalendarSource, { label: string; colour: string }> = {
  /* the events layer wears a programme colour; sessions wear the session sage,
     matching the chips they control */
  EVENT: { label: "Events", colour: CATEGORY_COLORS.SheCanCODE },
  ACTIVITY: { label: "Open sessions", colour: ACTIVITY_COLOR },
};

function SourceChip({
  source,
  active,
  count,
  onToggle,
}: {
  source: CalendarSource;
  active: boolean;
  count: number;
  onToggle: () => void;
}) {
  const { label, colour } = SOURCE_META[source];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${TAP} sm:min-h-9 ${FOCUS_RING_SOFT} ${
        active ? "border-transparent text-cream" : "border-line text-cream-dim hover:text-cream"
      }`}
      style={active ? { backgroundColor: `${colour}26`, borderColor: colour } : undefined}
    >
      {/* filled when the layer is on, hollow when off — the swatch itself
          reports the state, so the control does not depend on colour alone */}
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full border-2 transition-colors"
        style={{
          borderColor: colour,
          backgroundColor: active ? colour : "transparent",
        }}
      />
      {label}
      <span className="tabular-nums text-[11px] text-cream-dim">{count}</span>
    </button>
  );
}

export function CalendarFilters({
  sources,
  counts,
  onToggleSource,
  people,
  personKey,
  onPerson,
}: {
  sources: Set<CalendarSource>;
  counts: Record<CalendarSource, number>;
  onToggleSource: (s: CalendarSource) => void;
  people: CalendarPerson[];
  personKey: string | null;
  onPerson: (key: string | null) => void;
}) {
  const selected = people.find((p) => p.key === personKey) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <span className="label sr-only text-[10px] font-semibold text-cream-dim sm:not-sr-only">
        Calendars
      </span>

      {(Object.keys(SOURCE_META) as CalendarSource[]).map((s) => (
        <SourceChip
          key={s}
          source={s}
          active={sources.has(s)}
          count={counts[s]}
          onToggle={() => onToggleSource(s)}
        />
      ))}

      {people.length > 0 && (
        <>
          <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />

          {/* A native select: it is the control every phone renders as a
              scrollable wheel, it is keyboard- and screen-reader-complete for
              free, and a custom listbox here would be a lot of code to
              reproduce that badly. The chevron is drawn on because the native
              arrow does not follow the dark theme. */}
          <div className="relative">
            <label htmlFor="calendar-person" className="sr-only">
              Show one person&apos;s calendar
            </label>
            <select
              id="calendar-person"
              value={personKey ?? ""}
              onChange={(e) => onPerson(e.target.value || null)}
              className={`cursor-pointer appearance-none rounded-full border bg-panel py-1.5 pl-3 pr-8 text-xs font-medium transition-colors hover:border-orange sm:text-sm ${TAP} sm:min-h-9 ${FOCUS_RING_SOFT} ${
                selected ? "border-orange text-cream" : "border-line text-cream-dim"
              }`}
            >
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-cream-dim"
            />
          </div>
        </>
      )}

      {selected && (
        <button
          type="button"
          onClick={() => onPerson(null)}
          className={`flex cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-medium text-cream-dim transition-colors hover:text-orange ${TAP} sm:min-h-9 ${FOCUS_RING_SOFT}`}
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </button>
      )}

      {/* Only offered for someone who actually takes bookings — a link to a
          /book page that does not exist would be worse than no link. */}
      {selected?.slug && (
        <Link
          href={`/book/${selected.slug}`}
          className={`flex items-center rounded-full bg-orange px-4 text-xs font-semibold text-bg transition-colors hover:bg-orange-deep sm:text-sm ${TAP} sm:min-h-9 ${FOCUS_RING_SOFT}`}
        >
          Book time with {selected.name.split(" ")[0]}
        </Link>
      )}
    </div>
  );
}
