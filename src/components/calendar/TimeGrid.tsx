"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CalendarItem } from "@/types/admin";
import { hourWindow, packLanes, placement } from "@/lib/scheduling/layout";
import { kigaliDayStart, kigaliHHmm } from "@/lib/time";
import { todayISO } from "@/lib/scheduling/range";
import { cn } from "@/lib/utils";
import { CalendarChip } from "./CalendarChip";
import { SOURCE_ACCENT } from "./colors";
import {
  FOCUS_RING,
  FOCUS_RING_SOFT,
  HOUR_PX,
  SELECTED_RAIL,
  TODAY_COLUMN,
  dateBadge,
} from "./adminStyles";

/* The shared body of the week and day views: hour rows down the left, one
   column per "track", items absolutely positioned inside their column.

   A track is a day in week view and a person in day view. Keeping that
   distinction outside this component is what lets one grid serve both.

   Three things changed from the original.

   It no longer forces a horizontal scrollbar onto a phone. The body was
   wrapped in `min-w-[46rem]` — 736px inside a 390px screen, which is a
   sideways scrollbar inside a vertically scrolling page, the interaction
   nobody wants. The columns simply get narrower now, and below `sm` the chips
   drop to a single line. Day view on the org calendar is the exception: one
   column per member of staff genuinely cannot compress, so that one still
   scrolls sideways — but it says so, rather than looking broken.

   The column headers are sticky. Before, scrolling to the evening left you
   with seven unlabelled columns and no way to tell which one was Thursday, or
   in day view which lane was whose.

   And an empty slot is a target. Both admin calendars had a "New activity"
   button but no way to say *this* time by pointing at it, which is the
   first thing anyone reaches for on a calendar. */

export type Track = {
  id: string;
  label: string;
  sublabel?: string;
  /* the Kigali day this column represents; the same for every track in day
     view, and one per column in week view */
  dayISO: string;
  accent?: string;
  highlight?: boolean;
  /* Day view only: show a free/busy badge for this lane. The answer is
     computed here from the blocks already on screen — so it cannot disagree
     with what is drawn beneath it, costs no request, and re-evaluates on the
     grid's own minute tick instead of freezing at first render. */
  showBusy?: boolean;
  items: CalendarItem[];
};

/* Where the grid opens if nothing earlier is scheduled. A calendar that starts
   at midnight buries the working day below the fold, which is what made the
   week look empty even when it was full. */
const DEFAULT_SCROLL_HOUR = 7;

/* No block renders shorter than this, whatever its duration. One line of chip
   text plus its padding and border is about 24px; anything less clips the
   title rather than shrinking it. */
const MIN_BLOCK_PX = 26;

/* How many all-day items a lane shows before it offers to expand. Two keeps
   the lane from pushing the hour grid down the page on a day with six
   recurring Google blocks. */
const ALL_DAY_ROWS = 2;

/* Anything at least this long is treated as all-day even if the source did not
   flag it — a 09:00–23:30 "Office" block is context for the day, not an
   appointment, and letting it into the time grid stretches the hour window to
   the full 24 and squashes everything real into a sliver. */
const ALL_DAY_HOURS = 20;

const HOUR_LABEL = (h: number) =>
  h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

const isAllDay = (item: CalendarItem) =>
  item.allDay ||
  new Date(item.end).getTime() - new Date(item.start).getTime() >= ALL_DAY_HOURS * 3_600_000;

/* Does this item blanket the whole visible day?

   The 20-hour rule above catches an obvious all-day block, but not a recurring
   "In the Office 07:00-19:00" that happens to cover exactly the hours the grid
   is showing. Painted down the column such a block is a full-height wash
   behind everything else — it tells you nothing you can read, and it steals
   the click target for every hour it covers. It belongs in the all-day lane
   with the other context.

   Checked against the window rather than against the clock, so the answer
   follows what is actually on screen. */
function spansWindow(
  item: CalendarItem,
  dayStart: Date,
  fromHour: number,
  toHour: number
): boolean {
  const windowStart = dayStart.getTime() + fromHour * 3_600_000;
  const windowEnd = dayStart.getTime() + toHour * 3_600_000;
  return new Date(item.start).getTime() <= windowStart && new Date(item.end).getTime() >= windowEnd;
}

/* Minutes since Kigali midnight, or null when that day is not today. */
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

export function TimeGrid({
  tracks,
  onSelect,
  onPickSlot,
  onPickTrack,
  selectedTrackId,
  emptyMessage = "Nothing scheduled.",
  /* Day view on the org calendar puts one column per person on the board, and
     twelve people do not fit in 390px however hard you squeeze. That view opts
     into sideways scrolling; week view never needs it. */
  scrollX = false,
}: {
  tracks: Track[];
  onSelect?: (item: CalendarItem) => void;
  /** the visitor clicked an empty hour: (dayISO, "HH:mm") */
  onPickSlot?: (dayISO: string, hhmm: string) => void;
  /** the visitor clicked a column header */
  onPickTrack?: (track: Track) => void;
  selectedTrackId?: string | null;
  emptyMessage?: string;
  scrollX?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /* The all-day lane is capped so it cannot shove the hour grid off screen;
     this opens it on demand. */
  const [allDayOpen, setAllDayOpen] = useState(false);

  /* All-day and day-spanning blocks live in their own row above the grid, the
     way every calendar app does it. */
  const timed = useMemo(
    () => tracks.map((t) => ({ ...t, items: t.items.filter((i) => !isAllDay(i)) })),
    [tracks]
  );
  const allTimed = useMemo(() => timed.flatMap((t) => t.items), [timed]);
  const dayStarts = useMemo(
    () => [...new Set(tracks.map((t) => t.dayISO))].map(kigaliDayStart),
    [tracks]
  );
  const [fromHour, toHour] = useMemo(() => hourWindow(allTimed, dayStarts), [allTimed, dayStarts]);

  /* Second pass, now that the window is known: anything blanketing it joins
     the all-day lane. Deliberately does NOT recompute the window afterwards —
     moving an item out could only ever narrow it, and a narrower window could
     re-qualify the next-widest item, which is how you get a grid that
     collapses one block at a time on every render. */
  const [dayGrid, allDayByTrack] = useMemo(() => {
    const grid: Track[] = [];
    const lane: CalendarItem[][] = [];
    tracks.forEach((t, i) => {
      const dayStart = kigaliDayStart(t.dayISO);
      const spanning = timed[i].items.filter((it) => spansWindow(it, dayStart, fromHour, toHour));
      const spanningIds = new Set(spanning.map((it) => it.id));
      grid.push({ ...timed[i], items: timed[i].items.filter((it) => !spanningIds.has(it.id)) });
      lane.push([...t.items.filter(isAllDay), ...spanning]);
    });
    return [grid, lane] as const;
  }, [tracks, timed, fromHour, toHour]);

  const hasAllDay = allDayByTrack.some((list) => list.length > 0);
  const hours = useMemo(
    () => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i),
    [fromHour, toHour]
  );

  const today = todayISO();
  const todayIndex = tracks.findIndex((t) => t.dayISO === today);
  const wantsClock = todayIndex >= 0 || tracks.some((t) => t.showBusy);
  const nowMinutes = useNowMinutes(wantsClock);

  /* One clock reading drives both the now-line and every lane's badge. */
  const busyByTrack = useMemo(() => {
    if (nowMinutes === null) return null;
    return tracks.map((t) => {
      if (!t.showBusy || t.dayISO !== today) return undefined;
      const now = kigaliDayStart(t.dayISO).getTime() + nowMinutes * 60_000;
      return t.items.some(
        (i) => new Date(i.start).getTime() <= now && new Date(i.end).getTime() > now
      );
    });
  }, [tracks, nowMinutes, today]);

  /* Open on the working day rather than on midnight. Runs before paint so the
     grid never flashes at the wrong scroll position. */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const earliest = allTimed.reduce((min, i) => {
      const h = new Date(i.start).getHours();
      return Number.isFinite(h) ? Math.min(min, h) : min;
    }, DEFAULT_SCROLL_HOUR);
    el.scrollTop = Math.max(0, (Math.min(earliest, DEFAULT_SCROLL_HOUR) - fromHour) * HOUR_PX);
    /* only when the visible range changes, not on every item tweak */
  }, [fromHour, toHour, allTimed]);

  if (!tracks.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  /* A 2.5rem gutter and N free columns fit a 320px screen without overflow;
     from `sm` the gutter grows, and from `md` the columns get a floor so a
     wide screen does not stretch seven columns across 1400px of nothing.

     The floor is at `md`, not `sm`: 3.5rem + 7 x 5.5rem is 672px, which does
     not fit the content area of a 640px viewport, so a floor at `sm` clipped
     the last column through the whole small-tablet range. */
  const columns = scrollX
    ? `3.5rem repeat(${tracks.length}, minmax(8rem, 1fr))`
    : `2.5rem repeat(${tracks.length}, minmax(0, 1fr))`;
  const columnsSm = scrollX ? columns : `3.5rem repeat(${tracks.length}, minmax(0, 1fr))`;
  const columnsMd = scrollX ? columns : `3.5rem repeat(${tracks.length}, minmax(5.5rem, 1fr))`;
  const bodyHeight = hours.length * HOUR_PX;

  /* Which hour a click landed in, from its offset inside the column. Rounded
     to the half hour, which is the granularity anyone actually books at. */
  const slotFromEvent = (e: React.MouseEvent<HTMLElement>, dayISO: string) => {
    if (!onPickSlot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = ((e.clientY - rect.top) / HOUR_PX) * 60 + fromHour * 60;
    const rounded = Math.max(0, Math.min(23 * 60 + 30, Math.round(minutes / 30) * 30));
    const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
    const mm = String(rounded % 60).padStart(2, "0");
    onPickSlot(dayISO, `${hh}:${mm}`);
  };

  return (
    <div className={cn("rounded-lg border bg-card", scrollX ? "overflow-x-auto" : "overflow-hidden")}>
      <div className={scrollX ? "min-w-max" : undefined}>
        {/* ---- column headers ----
            Sticky within the board so the dates stay put while the hours
            scroll under them. */}
        <div
          className="sticky top-0 z-30 grid border-b bg-card/95 backdrop-blur-sm [grid-template-columns:var(--cols)] sm:[grid-template-columns:var(--cols-sm)] md:[grid-template-columns:var(--cols-md)]"
          style={
            {
              "--cols": columns,
              "--cols-sm": columnsSm,
              "--cols-md": columnsMd,
            } as React.CSSProperties
          }
        >
          <div className="border-r" />
          {tracks.map((t, i) => {
            const isToday = t.dayISO === today;
            const busyNow = busyByTrack?.[i];
            const isSelected = t.id === selectedTrackId;

            const headerClass = cn(
              "relative border-l px-1 py-2 text-center transition-colors sm:px-2",
              onPickTrack && `cursor-pointer hover:bg-muted/50 ${FOCUS_RING_SOFT}`,
              isSelected && "bg-[var(--calendar-accent)]/[0.08]",
              !isSelected && t.highlight && "bg-muted/40"
            );

            const inner = (
              <>
                {isSelected && <span aria-hidden className={SELECTED_RAIL} />}

                <span className="flex items-center justify-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                  {t.accent && (
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: t.accent }}
                    />
                  )}
                  <span className="truncate">{t.label}</span>
                </span>

                {/* the day number gets the badge, so today is findable at a
                    glance instead of being one small label among seven */}
                {t.sublabel && (
                  <span
                    className={cn(
                      dateBadge({ today: isToday, selected: isSelected && !isToday }),
                      "mx-auto mt-1"
                    )}
                  >
                    {t.sublabel}
                  </span>
                )}

                {/* free / busy, for the day view's people lanes */}
                {busyNow !== undefined && (
                  <span className="mt-1 flex justify-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        busyNow
                          ? "bg-amber-400/15 text-amber-200"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          busyNow ? "bg-amber-400" : "bg-muted-foreground/60"
                        )}
                      />
                      {busyNow ? "Busy" : "Free"}
                    </span>
                  </span>
                )}

              </>
            );

            return onPickTrack ? (
              <button
                key={t.id}
                type="button"
                onClick={() => onPickTrack(t)}
                aria-pressed={isSelected}
                className={headerClass}
              >
                {inner}
              </button>
            ) : (
              <div key={t.id} className={headerClass}>
                {inner}
              </div>
            );
          })}
        </div>

        {/* ---- all-day row ---- */}
        {hasAllDay && (
          <div
            className="grid border-b bg-muted/30 [grid-template-columns:var(--cols)] sm:[grid-template-columns:var(--cols-sm)] md:[grid-template-columns:var(--cols-md)]"
            style={
              {
                "--cols": columns,
                "--cols-sm": columnsSm,
                "--cols-md": columnsMd,
              } as React.CSSProperties
            }
          >
            <div className="border-r px-1 py-2 text-right text-[9px] uppercase tracking-wide text-muted-foreground sm:px-2 sm:text-[10px]">
              All day
              {allDayOpen && (
                <button
                  type="button"
                  onClick={() => setAllDayOpen(false)}
                  className={cn(
                    "mt-1 block w-full cursor-pointer text-right text-[9px] font-semibold normal-case tracking-normal text-muted-foreground transition-colors hover:text-foreground",
                    FOCUS_RING
                  )}
                >
                  Less
                </button>
              )}
            </div>
            {tracks.map((t, i) => {
              const list = allDayByTrack[i];
              /* Same rule the month cell uses: when there is an overflow, show
                 one fewer item and spend that line on the count. */
              const overflow = !allDayOpen && list.length > ALL_DAY_ROWS;
              const shown = overflow ? list.slice(0, ALL_DAY_ROWS - 1) : list;

              return (
                <div key={t.id} className="min-h-9 space-y-1 border-l p-1">
                  {shown.map((item) => (
                    /* `allDay` is forced on here, not read from the item. The
                       lane also catches items the 20-hour and window-spanning
                       heuristics routed in, and those still carry a real start
                       time — so the chip printed "9am" for something filed
                       under "All day". The lane is the statement. */
                    <CalendarChip
                      key={item.id}
                      item={item}
                      shape="row"
                      allDay
                      onSelect={onSelect}
                    />
                  ))}
                  {overflow && (
                    <button
                      type="button"
                      onClick={() => setAllDayOpen(true)}
                      className={cn(
                        "flex h-[22px] w-full cursor-pointer items-center px-1.5 text-left text-[11px] font-semibold leading-none text-muted-foreground transition-colors hover:text-foreground",
                        FOCUS_RING
                      )}
                    >
                      +{list.length - shown.length} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---- scrollable body ---- */}
        <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto overscroll-contain">
          <div
            className="relative grid [grid-template-columns:var(--cols)] sm:[grid-template-columns:var(--cols-sm)] md:[grid-template-columns:var(--cols-md)]"
            style={
              {
                "--cols": columns,
                "--cols-sm": columnsSm,
                "--cols-md": columnsMd,
                height: bodyHeight,
              } as React.CSSProperties
            }
          >
            {/* hour gutter. The label sits INSIDE the top of its own row rather
                than straddling the line above it — straddling clipped the first
                hour against the top of the scroll container. */}
            <div className="border-r">
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ height: HOUR_PX }}
                  className="border-b pr-1 pt-0.5 text-right text-[9px] tabular-nums leading-none text-muted-foreground sm:pr-1.5 sm:text-[10px]"
                >
                  {HOUR_LABEL(h)}
                </div>
              ))}
            </div>

            {dayGrid.map((track, index) => {
              const dayStart = kigaliDayStart(track.dayISO);
              const packed = packLanes(track.items);
              const isToday = track.dayISO === today;
              const isSelected = track.id === selectedTrackId;

              return (
                <div
                  key={track.id}
                  className={cn(
                    "relative border-l",
                    isSelected
                      ? "bg-[var(--calendar-accent)]/[0.06]"
                      : isToday
                        ? TODAY_COLUMN
                        : track.highlight && "bg-muted/20"
                  )}
                >
                  {/* The hour rows are the click target for "create at this
                      time". A button per hour rather than one hit-test on the
                      column, so the whole thing is reachable by keyboard. */}
                  {hours.map((h) =>
                    onPickSlot ? (
                      <button
                        key={h}
                        type="button"
                        style={{ height: HOUR_PX }}
                        onClick={(e) => slotFromEvent(e, track.dayISO)}
                        aria-label={`New activity at ${HOUR_LABEL(h)}`}
                        className={cn(
                          "block w-full cursor-pointer border-b transition-colors hover:bg-foreground/[0.04]",
                          FOCUS_RING
                        )}
                      />
                    ) : (
                      <div key={h} style={{ height: HOUR_PX }} className="border-b" />
                    )
                  )}

                  {/* pointer-events-none on the layer, auto on each chip, so a
                      click that misses a chip still reaches the slot beneath. */}
                  <div className="pointer-events-none absolute inset-0">
                    {packed.map(({ item, lane, laneCount }) => {
                      const pos = placement(item, dayStart, fromHour, toHour);
                      if (!pos) return null;
                      /* a sliver of overlap on the right edge reads as depth
                         without hiding the item underneath */
                      const width = 100 / laneCount;
                      return (
                        <CalendarChip
                          key={item.id}
                          item={item}
                          /* below roughly one 44px tap target there is only
                             room for the title */
                          shape={(pos.heightPct / 100) * bodyHeight < 44 ? "tight" : "block"}
                          onSelect={onSelect}
                          className="pointer-events-auto absolute"
                          style={{
                            top: `${pos.topPct}%`,
                            height: `${pos.heightPct}%`,
                            /* placement() floors a block at 1.5% of the body,
                               which in a twelve-hour window is 10px — less
                               than the ~24px one line of chip text needs, so
                               short and zero-length items were being sliced
                               through the middle of their own title. CSS
                               min-height beats height, so the layout maths in
                               scheduling/layout.ts stays untouched. */
                            minHeight: MIN_BLOCK_PX,
                            left: `calc(${lane * width}% + 2px)`,
                            width: `calc(${width}% - 4px)`,
                            borderLeft: `3px solid ${SOURCE_ACCENT[item.source]}`,
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* The "you are here" line. Drawn per column so it lands on
                      today in week view and on every lane in day view, where
                      each column is a person and all of them are today. */}
                  {nowMinutes !== null && isToday && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{
                        top: ((nowMinutes / 60 - fromHour) / (toHour - fromHour)) * 100 + "%",
                      }}
                    >
                      <div className="relative h-px bg-red-500">
                        {index === todayIndex && (
                          <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-red-500" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* One time label for the now-line, pinned in the gutter. Drawn
                over the grid rather than in a column so it is not repeated
                once per lane in day view. */}
            {nowMinutes !== null && todayIndex >= 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 z-30 -translate-y-1/2 rounded-sm bg-red-500 px-1 text-[9px] font-bold leading-tight text-white tabular-nums"
                style={{
                  top: ((nowMinutes / 60 - fromHour) / (toHour - fromHour)) * 100 + "%",
                }}
              >
                {kigaliHHmm(new Date())}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
