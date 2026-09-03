"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { hourWindow, packLanes, placement } from "@/lib/scheduling/layout";
import { compactTime, kigaliDayStart, kigaliHHmm } from "@/lib/time";
import { isBookableEvent, itemColor, type VenueEvent } from "@/lib/events";
import { chipTitle } from "./PublicChip";
import { EmptyCalendarArt } from "./EmptyCalendarArt";
import { FOCUS_RING_SOFT, HOUR_PX, dateBadge } from "./publicStyles";

/* A real week view: hour rows down the side, one column per day, items placed
   at their actual time and sized by their actual duration.

   The overlap maths is `src/lib/scheduling/layout.ts` — the same pure engine
   the admin console's TimeGrid uses, unit-tested and shared rather than
   re-derived. Only the styling differs: that grid wears the shadcn admin
   theme, this one wears the public site's greens.

   It wears the month grid's clothes, deliberately. Today is the same orange
   disc, selection is the same tint and top rail, the date badge comes from the
   same function — before, week view had its own idea of all three and
   switching views felt like arriving somewhere else.

   The one thing it does not do is scroll sideways on a phone. It used to
   force a 736px minimum width inside a 320px screen, which is a horizontal
   scroll bar inside a vertically scrolling page: the interaction nobody wants.
   The columns simply get narrower, the chips lose their time line, and the
   day panel underneath carries the detail. */

const HOUR_LABEL = (h: number) =>
  h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

/* Minutes since Kigali midnight, ticking once a minute, or null when today is
   not one of the seven columns on screen.

   The "you are here" line is the thing that makes a week view readable at a
   glance — it is why you can tell, without reading a single time label,
   whether the 2pm session has been and gone. The admin time grid has had one
   since it was written; this one did not, which was the largest single
   difference between the two week views. Kigali, not the browser's clock: the
   feed's days are Kigali days, so a visitor in London would otherwise see the
   line two hours out. */
function useNowMinutes(active: boolean): number | null {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setMinutes(null);
      return;
    }
    const read = () => {
      const [h, m] = kigaliHHmm(new Date()).split(":").map(Number);
      setMinutes(h * 60 + m);
    };
    read();
    /* a minute is the resolution the line is drawn at; anything faster is
       repaint for no visible gain */
    const t = setInterval(read, 60_000);
    return () => clearInterval(t);
  }, [active]);

  return minutes;
}

/* A 2.5rem gutter and seven free columns fit a 320px screen without overflow;
   from `sm` the gutter grows, and from `md` the columns get a floor so a wide
   screen does not stretch seven columns across 1400px of nothing.

   The floor arrives at `md`, not at `sm`. A 5.5rem floor makes the grid
   3.5rem + 7 x 5.5rem = 672px wide, and the board inside the section's
   padding is only about 600px at a 640px viewport — so between 640px and
   712px the seven columns did not fit, and the board's `overflow-hidden`
   clipped Sunday off the right-hand edge rather than scrolling to it. That is
   the small-tablet range. Below `md` the columns simply share what there is. */
const COLUMNS =
  "[grid-template-columns:2.5rem_repeat(7,minmax(0,1fr))] sm:[grid-template-columns:3.5rem_repeat(7,minmax(0,1fr))] md:[grid-template-columns:3.5rem_repeat(7,minmax(5.5rem,1fr))]";

const SHORT_DAY = (dayISO: string) =>
  new Date(`${dayISO}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });

export function PublicWeekGrid({
  days,
  byDay,
  todayKey,
  selectedDay,
  onSelectDay,
  onOpen,
}: {
  /** the seven Kigali ISO days, Monday first */
  days: string[];
  byDay: Map<string, VenueEvent[]>;
  todayKey: string;
  selectedDay: string | null;
  onSelectDay: (dayISO: string) => void;
  onOpen: (e: VenueEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => days.flatMap((d) => byDay.get(d) ?? []), [days, byDay]);

  const todayIndex = days.indexOf(todayKey);
  const nowMinutes = useNowMinutes(todayIndex >= 0);

  /* `endsAt` is null for an event with no stated finish. Give it a nominal
     hour so it still occupies a readable block instead of collapsing to a
     hairline the visitor cannot read or click. */
  const placeable = useMemo(
    () =>
      items.map((item) => ({
        item,
        start: item.startsAt,
        end: item.endsAt ?? new Date(new Date(item.startsAt).getTime() + 3_600_000).toISOString(),
      })),
    [items]
  );

  const dayStarts = useMemo(() => days.map(kigaliDayStart), [days]);
  const [fromHour, toHour] = useMemo(
    () => hourWindow(placeable, dayStarts),
    [placeable, dayStarts]
  );
  const hours = useMemo(
    () => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i),
    [fromHour, toHour]
  );

  /* Open on the working day rather than at midnight. hourWindow already
     trims the empty ends, but a week containing one 07:00 session and one
     22:00 one is fifteen hours tall, and the top of that is dead space. */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (Math.max(fromHour, 7) - fromHour) * HOUR_PX - HOUR_PX / 2);
  }, [fromHour]);

  return (
    <div className="bg-panel">
      {/* Day headers. Sticky within the board so the dates stay put while the
          hours scroll under them — without this you scroll to the evening and
          can no longer tell which column is Thursday. */}
      <div className={`sticky top-0 z-20 grid border-b border-line bg-panel-2/95 backdrop-blur-sm ${COLUMNS}`}>
        <div />
        {days.map((day) => {
          const isToday = day === todayKey;
          const selected = day === selectedDay;
          const count = (byDay.get(day) ?? []).length;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-pressed={selected}
              aria-label={`${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              })}${count ? `, ${count} item${count > 1 ? "s" : ""}` : ", nothing scheduled"}`}
              className={`relative cursor-pointer border-l border-line px-1 py-2 text-center transition-colors ${FOCUS_RING_SOFT} ${
                selected ? "bg-orange/[0.07]" : "hover:bg-panel/70"
              }`}
            >
              {selected && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-orange"
                />
              )}
              <span className="label block text-[10px] font-semibold text-cream-dim">
                {SHORT_DAY(day).toUpperCase()}
              </span>
              <span
                className={`${dateBadge({ today: isToday, selected: selected && !isToday })} mx-auto mt-1`}
              >
                {Number(day.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <EmptyCalendarArt
          size="sm"
          title="Nothing scheduled this week"
          message="Use the arrows to look at another week."
        />
      ) : (
        /* A capped, scrollable body. A fifteen-hour week is 840px of grid, and
           pinning that into the page pushed the day panel below the fold. */
        <div ref={scrollRef} className="max-h-[32rem] overflow-y-auto overscroll-contain">
          <div className={`relative grid ${COLUMNS}`}>
            <div className="relative bg-panel">
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-b border-line pr-1.5 pt-0.5 text-right text-[9px] tabular-nums text-cream-dim sm:text-[10px]"
                  style={{ height: HOUR_PX }}
                >
                  {HOUR_LABEL(h)}
                </div>
              ))}

              {/* The clock reading, in the gutter beside the line. Stated once
                  here rather than once per column, which is what it would be
                  if it lived with the line itself. */}
              {nowMinutes !== null && (
                <span
                  aria-hidden
                  className="absolute right-0.5 z-20 -translate-y-1/2 rounded-sm bg-terracotta px-1 text-[9px] font-bold leading-tight tabular-nums text-cream"
                  style={{
                    top: `${((nowMinutes / 60 - fromHour) / (toHour - fromHour)) * 100}%`,
                  }}
                >
                  {kigaliHHmm(new Date())}
                </span>
              )}
            </div>

            {days.map((day) => {
              const dayStart = kigaliDayStart(day);
              const packed = packLanes(placeable.filter((p) => p.item.date === day));
              const isToday = day === todayKey;
              const selected = day === selectedDay;

              return (
                <div
                  key={day}
                  className={`relative border-l border-line ${
                    selected ? "bg-orange/[0.05]" : isToday ? "bg-orange/[0.03]" : ""
                  }`}
                >
                  {hours.map((h) => (
                    <div key={h} className="border-b border-line" style={{ height: HOUR_PX }} />
                  ))}

                  {/* The "you are here" line, drawn only on today's column. */}
                  {nowMinutes !== null && isToday && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{
                        top: `${((nowMinutes / 60 - fromHour) / (toHour - fromHour)) * 100}%`,
                      }}
                    >
                      <div className="relative h-px bg-terracotta">
                        <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-terracotta" />
                      </div>
                    </div>
                  )}

                  <div className="absolute inset-0">
                    {packed.map(({ item: entry, lane, laneCount }) => {
                      const pos = placement(entry, dayStart, fromHour, toHour);
                      if (!pos) return null;
                      const event = entry.item;
                      const colour = itemColor(event);
                      const bookable = isBookableEvent(event);
                      const width = 100 / laneCount;
                      /* under about 40 minutes there is only room for one line,
                         and a clipped second line reads as a rendering fault */
                      const tight = pos.heightPct < (100 / (toHour - fromHour)) * 0.7;

                      const Tag = bookable ? "button" : "div";
                      return (
                        <Tag
                          key={event.id}
                          {...(bookable
                            ? { type: "button" as const, onClick: () => onOpen(event) }
                            : {})}
                          title={chipTitle(event)}
                          className={`absolute overflow-hidden rounded-md px-1 py-0.5 text-left text-[10px] font-semibold leading-tight sm:px-1.5 ${
                            bookable
                              ? `cursor-pointer text-bg transition-[filter] hover:z-10 hover:brightness-110 ${FOCUS_RING_SOFT}`
                              : "border border-dashed text-cream"
                          }`}
                          style={{
                            top: `${pos.topPct}%`,
                            height: `${pos.heightPct}%`,
                            left: `calc(${lane * width}% + 2px)`,
                            width: `calc(${width}% - 4px)`,
                            ...(bookable
                              ? { backgroundColor: colour }
                              : { borderColor: colour, backgroundColor: `${colour}1f` }),
                          }}
                        >
                          <span className="block truncate">{event.title}</span>
                          {!tight && (
                            <span className="block truncate font-medium opacity-75">
                              {compactTime(event.time)}
                            </span>
                          )}
                        </Tag>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
