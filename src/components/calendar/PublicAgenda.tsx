"use client";

import { useMemo } from "react";
import { MapPin, User } from "lucide-react";
import {
  isBookableEvent,
  itemCategoryLabel,
  itemColor,
  type VenueEvent,
} from "@/lib/events";
import { EmptyCalendarArt } from "./EmptyCalendarArt";
import { FOCUS_RING_SOFT, dateBadge } from "./publicStyles";

/* Upcoming, as an agenda rather than a list.

   What was here printed a big orange day number on every row, so three things
   on the same Friday printed "12 / SEP FRI" three times down the page — the
   date, which is the one thing an agenda is organised by, was the most
   repeated element on the screen. Items are grouped under their day now, and
   the day is stated once.

   Months are separated too. Scrolling from September into October used to
   happen without a mark, so a row for the 3rd appeared below a row for the
   28th and read as going backwards.

   The price pill was the loudest thing in every row, in solid orange, and
   drew the eye before the title of the event it belonged to. It is an outline
   now: still findable, no longer shouting over the thing it prices. */

type DayGroup = { day: string; items: VenueEvent[] };

function groupDays(items: VenueEvent[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const item of [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const last = out[out.length - 1];
    if (last && last.day === item.date) last.items.push(item);
    else out.push({ day: item.date, items: [item] });
  }
  return out;
}

const fmt = (dayISO: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${dayISO}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

/* "Today" / "Tomorrow" where they apply, and the weekday otherwise.

   An agenda's first two rows are the ones anyone actually came to read, and
   "Today" answers the question faster than "WED" plus a date the reader then
   has to compare against their own idea of what day it is. Google, Fantastical
   and every mail client's agenda pane do the same. Beyond tomorrow the
   weekday is the more useful label, because by then the question is which day
   of the week rather than how many sleeps. */
function relativeDay(dayISO: string, todayKey: string): string | null {
  if (dayISO === todayKey) return "Today";
  /* string arithmetic on the Kigali day, so this cannot drift with the host
     timezone the way `new Date(...) + 86400000` would across a DST boundary */
  const next = new Date(`${todayKey}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10) === dayISO ? "Tomorrow" : null;
}

/* Right-hand status. Every kind of item gets one, so the column is never
   ragged: a ticketed event states its price or that it has sold out, and a
   session states how you attend it — which for a session is the equivalent
   piece of "can I come to this" information. */
function StatusPill({ item }: { item: VenueEvent }) {
  if (!isBookableEvent(item)) {
    return (
      <span className="whitespace-nowrap rounded-full border border-dashed border-cream-dim/40 px-3 py-1 text-[11px] font-semibold text-cream-dim">
        {item.mode === "ONLINE"
          ? "Online"
          : item.mode === "HYBRID"
            ? "Online or in person"
            : "In person"}
      </span>
    );
  }
  if (item.soldOut) {
    return (
      <span className="whitespace-nowrap rounded-full bg-panel-2 px-3 py-1 text-[11px] font-semibold text-cream-dim">
        Sold out
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full border border-orange/50 bg-orange/10 px-3 py-1 text-[11px] font-semibold text-orange">
      {item.price || "Free"}
    </span>
  );
}

function Row({ item, onOpen }: { item: VenueEvent; onOpen: (e: VenueEvent) => void }) {
  const colour = itemColor(item);
  const bookable = isBookableEvent(item);
  const label = itemCategoryLabel(item);
  const Tag = bookable ? "button" : "div";

  return (
    <Tag
      {...(bookable ? { type: "button" as const, onClick: () => onOpen(item) } : {})}
      className={`flex w-full items-start gap-3 py-3 pr-1 text-left ${
        bookable ? `cursor-pointer ${FOCUS_RING_SOFT}` : ""
      }`}
    >
      {/* the colour rail: one job, carried in one place, instead of a rail on
          the row AND a dot beside the label doing the same job twice */}
      <span
        aria-hidden
        className="mt-1 h-9 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
      />

      <span className="min-w-0 flex-1">
        {label && (
          <span className="label block text-[10px] font-semibold text-cream-dim">{label}</span>
        )}
        <span
          className={`mt-0.5 block font-semibold leading-snug text-cream ${
            bookable ? "transition-colors group-hover:text-orange" : ""
          }`}
        >
          {item.title}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-cream-dim">
          <span className="tabular-nums">
            {item.time}
            {item.endTime && ` – ${item.endTime}`}
          </span>
          {item.space && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{item.space}</span>
            </span>
          )}
          {item.host && (
            <span className="flex min-w-0 items-center gap-1">
              <User className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{item.host}</span>
            </span>
          )}
        </span>
      </span>

      <span className="shrink-0 pt-0.5">
        <StatusPill item={item} />
      </span>
    </Tag>
  );
}

export function PublicAgenda({
  items,
  todayKey,
  onOpen,
}: {
  items: VenueEvent[];
  todayKey: string;
  onOpen: (e: VenueEvent) => void;
}) {
  const groups = useMemo(() => groupDays(items), [items]);

  if (groups.length === 0) {
    return (
      <EmptyCalendarArt
        size="lg"
        title="Nothing coming up yet"
        message="New sessions and events are added regularly — or switch to Month to look further ahead."
      />
    );
  }

  return (
    <div className="bg-panel">
      {groups.map((group, i) => {
        const isToday = group.day === todayKey;
        const relative = relativeDay(group.day, todayKey);
        /* a month heading only where the month actually turns over, so the
           first group does not get a redundant banner above it */
        const newMonth =
          i > 0 && group.day.slice(0, 7) !== groups[i - 1].day.slice(0, 7);

        return (
          <div key={group.day}>
            {newMonth && (
              <h3 className="label sticky top-0 z-10 border-y border-line bg-panel-2/90 px-4 py-2 text-[11px] font-semibold text-cream-dim backdrop-blur-sm sm:px-6">
                {fmt(group.day, { month: "long", year: "numeric" })}
              </h3>
            )}

            <div className="grid grid-cols-[3rem_1fr] gap-3 border-b border-line px-3 py-2 last:border-b-0 sm:grid-cols-[4rem_1fr] sm:gap-5 sm:px-6">
              {/* the date rail: stated once for the whole day */}
              <div className="flex flex-col items-center pt-3">
                <span className={dateBadge({ today: isToday })}>
                  {Number(group.day.slice(8, 10))}
                </span>
                <span
                  className={`label mt-1 text-center text-[10px] font-semibold leading-tight ${
                    relative ? "text-orange" : "text-cream-dim"
                  }`}
                >
                  {relative ?? fmt(group.day, { weekday: "short" })}
                </span>
              </div>

              <ul className="divide-y divide-line/60">
                {group.items.map((item) => (
                  <li key={item.id} className="group">
                    <Row item={item} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
