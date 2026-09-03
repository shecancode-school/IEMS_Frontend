"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarOff } from "lucide-react";
import type { CalendarItem } from "@/types/admin";
import { addDaysISO, eventDayISO, formatEventDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CalendarChip } from "./CalendarChip";
import { SOURCE_COLOR } from "./colors";
import {
  CHIPS_PER_CELL,
  FOCUS_RING,
  SELECTED_CELL,
  SELECTED_RAIL,
  WEEKDAY_HEAD,
  dateBadge,
} from "./adminStyles";

/* Monday-start month grid for the admin console.

   Deliberately a separate component from the public MonthCalendar: that one is
   the marketing board with its own tokens, gsap scroll effects and event-flow
   modal. Sharing it would mean dragging all of that into the admin theme. It
   does now share the *ideas*, though — the interaction model below is the one
   the public grid already proved.

   Two things changed here that are worth spelling out.

   The whole cell is the day. Before, the only way to select 14 September was
   to hit a 24px date button; the cell around it was inert. That is under half
   the 44px guideline, it is a miss more often than a hit on a phone, and it is
   not how any calendar behaves. The cell now carries the role, the roving
   tabindex, the label and the click.

   And the rows no longer ripple. Cells used to be `min-h-24 space-y-1` with no
   clipping, so a week holding three chips measured ~130px against an empty
   week's 96px — and because grid rows stretch to their tallest cell, the whole
   row grew. Paging through months made the board jump. Chips are a fixed
   height now and the chip area is clipped. */

const WEEKDAYS = [
  ["Mon", "M"],
  ["Tue", "T"],
  ["Wed", "W"],
  ["Thu", "T"],
  ["Fri", "F"],
  ["Sat", "S"],
  ["Sun", "S"],
];

/* Dots stand in for chips on a phone, where a 45px column cannot hold text.
   Four is where a row of dots stops reading as a quantity and starts reading
   as a texture; past that the cell says how many. */
const DOTS_PER_CELL = 4;

/* the Monday on or before the 1st, through the Sunday on or after the last */
function monthCells(anchorISO: string): string[] {
  const [y, m] = anchorISO.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const firstDow = new Date(`${first}T12:00:00.000Z`).getUTCDay(); // 0=Sun
  const backfill = (firstDow + 6) % 7; // Monday-start offset
  const start = addDaysISO(first, -backfill);
  return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}

const isWeekend = (dayISO: string) => {
  const dow = new Date(`${dayISO}T12:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

function dayLabel(dayISO: string, count: number): string {
  const date = formatEventDate(`${dayISO}T12:00:00.000Z`);
  if (count === 0) return `${date}, nothing scheduled`;
  return `${date}, ${count} item${count > 1 ? "s" : ""}`;
}

function DayCell({
  day,
  items,
  outside,
  isToday,
  isSelected,
  isFocusTarget,
  onSelect,
  onOpenDay,
  onFocus,
  onOpenItem,
}: {
  day: string;
  items: CalendarItem[];
  outside: boolean;
  isToday: boolean;
  isSelected: boolean;
  isFocusTarget: boolean;
  onSelect: () => void;
  onOpenDay: () => void;
  onFocus: () => void;
  onOpenItem?: (item: CalendarItem) => void;
}) {
  /* Google's rule, and the right one: when there is an overflow the cell shows
     one fewer chip and spends that line on the count. Showing three chips AND
     a count would make the cell four lines tall and break the row rhythm the
     fixed chip height exists to protect. */
  const overflow = items.length - CHIPS_PER_CELL;
  const shown = overflow > 0 ? items.slice(0, CHIPS_PER_CELL - 1) : items;
  const hidden = items.length - shown.length;

  return (
    <div
      role="gridcell"
      aria-selected={isSelected}
      aria-label={dayLabel(day, items.length)}
      data-day={day}
      tabIndex={isFocusTarget ? 0 : -1}
      onClick={onSelect}
      /* Select on a single click, open the day on a double — the same split
         Google uses. A single click used to jump straight into Day view, so
         every misclick on the board was a navigation. */
      onDoubleClick={onOpenDay}
      onFocus={onFocus}
      className={cn(
        "group relative flex min-h-16 cursor-pointer flex-col border-b border-l p-1 transition-colors sm:min-h-28 sm:p-1.5",
        "[&:nth-child(7n+1)]:border-l-0",
        FOCUS_RING,
        outside ? "bg-muted/25" : isWeekend(day) ? "bg-muted/10" : "bg-card",
        isSelected ? SELECTED_CELL : "hover:bg-muted/40"
      )}
    >
      {/* Selection is a tinted cell and a 2px rail along its top edge, not a
          ring around the whole cell — a ring is the loudest mark on the board
          and would shout over today's own marker. */}
      {isSelected && <span aria-hidden className={SELECTED_RAIL} />}

      {/* The date itself opens the day. It is the one part of the cell whose
          meaning is "this day" rather than "what is on this day", so it is
          where the navigation belongs — and it keeps a single click on the
          rest of the cell free to mean "select". */}
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onOpenDay();
        }}
        aria-label={`Open ${formatEventDate(`${day}T12:00:00.000Z`)}`}
        className={cn(
          dateBadge({
            today: isToday,
            selected: isSelected && !isToday,
            muted: outside,
            interactive: !outside && !isSelected,
          }),
          "shrink-0 cursor-pointer self-start"
        )}
      >
        {Number(day.slice(-2))}
      </button>

      {/* Phone: dots, then a count once dots stop being countable. */}
      {items.length > 0 && (
        <div aria-hidden className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
          {items.slice(0, DOTS_PER_CELL).map((item) => (
            <span
              key={item.id}
              className="size-1.5 rounded-full"
              style={{ backgroundColor: SOURCE_COLOR[item.source] }}
            />
          ))}
          {items.length > DOTS_PER_CELL && (
            <span className="text-[9px] font-semibold leading-none text-muted-foreground">
              +{items.length - DOTS_PER_CELL}
            </span>
          )}
        </div>
      )}

      {/* Tablet and up: chips. overflow-hidden is load-bearing — a fourth chip
          arriving from a live update must be clipped, not push the row. */}
      <div className="mt-1 hidden min-w-0 flex-1 space-y-0.5 overflow-hidden sm:block">
        {shown.map((item) => (
          <CalendarChip
            key={item.id}
            item={item}
            shape="row"
            focusable={false}
            onSelect={onOpenItem}
          />
        ))}

        {/* "+N more" opens the day, because the day is where the rest of them
            are. tabIndex -1 keeps the grid a single tab stop. */}
        {hidden > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDay();
            }}
            className="flex h-[22px] w-full cursor-pointer items-center px-1.5 text-left text-[11px] font-semibold leading-none text-muted-foreground transition-colors group-hover:text-foreground"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

export function MonthGrid({
  anchorISO,
  items,
  selectedDay = null,
  onSelect,
  onPickDay,
  onOpenDay,
  onAnchorChange,
  onEscape,
}: {
  anchorISO: string;
  items: CalendarItem[];
  /** the day the caller considers open; null when nothing is selected */
  selectedDay?: string | null;
  onSelect?: (item: CalendarItem) => void;
  /** the visitor selected a day — single click, or Enter on the focused cell */
  onPickDay?: (dayISO: string) => void;
  /* "show me this day": the date badge, "+N more", a double click, or Enter on
     an already-selected cell. Separated from onPickDay so a single click does
     not navigate. */
  onOpenDay?: (dayISO: string) => void;
  /* Arrowing off the edge of the rendered six weeks asks the caller to page
     the month. It is separate from onPickDay because the caller's pick handler
     also switches view, and walking the cursor with an arrow key must not
     yank you into Day view. */
  onAnchorChange?: (dayISO: string) => void;
  /** Escape inside the grid — closes whatever the pick opened */
  onEscape?: () => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const cells = useMemo(() => monthCells(anchorISO), [anchorISO]);
  const month = anchorISO.slice(0, 7);
  const today = eventDayISO(new Date());

  /* Roving tabindex: exactly one cell is reachable by Tab. It follows the
     selection when there is one and otherwise sits on today, or on the 1st
     when today is not in view. */
  const defaultFocus = useMemo(
    () => (cells.includes(today) ? today : `${month}-01`),
    [cells, today, month]
  );
  const [focusDay, setFocusDay] = useState(selectedDay ?? defaultFocus);
  const shouldFocus = useRef(false);

  /* Paging to another month must not leave the tab stop on a day that is no
     longer rendered, or Tab would fall out of the grid entirely. */
  useEffect(() => {
    setFocusDay((current) => (cells.includes(current) ? current : defaultFocus));
  }, [cells, defaultFocus]);

  /* Move focus only when a key press asked for it, never on an ordinary
     re-render — otherwise the page would yank itself to the grid on load. */
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)
      ?.focus({ preventScroll: true });
  }, [focusDay]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const day = eventDayISO(item.start);
      const list = map.get(day);
      if (list) list.push(item);
      else map.set(day, [item]);
    }
    /* Chronological within the day. The feed's order is whatever the query
       returned, which put a 17:00 booking above a 09:00 class often enough
       that the cell could not be read top to bottom. */
    for (const list of map.values()) {
      list.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [items]);

  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7)),
    [cells]
  );

  const monthHasItems = useMemo(
    () => cells.some((day) => day.startsWith(month) && byDay.has(day)),
    [cells, month, byDay]
  );

  /* Arrow keys walk the grid a day at a time, exactly as a native date picker
     does. Without this the grid is unusable without a mouse — and it was the
     single largest accessibility gap on the admin calendar. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const moves: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };

      /* Monday-start offset of the focused day, for Home/End */
      const dow = (new Date(`${focusDay}T12:00:00.000Z`).getUTCDay() + 6) % 7;

      let next: string | null = null;
      if (e.key in moves) next = addDaysISO(focusDay, moves[e.key]);
      else if (e.key === "Home") next = addDaysISO(focusDay, -dow);
      else if (e.key === "End") next = addDaysISO(focusDay, 6 - dow);
      else if (e.key === "PageUp" || e.key === "PageDown") {
        /* Keep the day-of-month where it exists in the target month, and fall
           back to the 1st where it does not — 31 January PageDown has no 31
           February to land on. */
        const delta = e.key === "PageUp" ? -1 : 1;
        const [y, m] = focusDay.split("-").map(Number);
        const target = new Date(Date.UTC(y, m - 1 + delta, 1));
        const stem = target.toISOString().slice(0, 8);
        const candidate = `${stem}${focusDay.slice(8)}`;
        next = candidate.slice(0, 7) === stem.slice(0, 7) ? candidate : `${stem}01`;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        /* Enter on the day you already selected means "open it" — the second
           press is how a keyboard user reaches Day view without a pointer. */
        if (focusDay === selectedDay) onOpenDay?.(focusDay);
        else onPickDay?.(focusDay);
        return;
      } else if (e.key === "Escape") {
        onEscape?.();
        return;
      } else {
        return;
      }

      e.preventDefault();
      /* Off the edge of the rendered six weeks: ask the caller to page the
         month, and remember to take focus with us once it re-renders. Without
         the flag the keyboard user is silently dropped out of the grid. */
      if (!cells.includes(next)) {
        if (!onAnchorChange) return;
        shouldFocus.current = true;
        setFocusDay(next);
        onAnchorChange(next);
        return;
      }
      shouldFocus.current = true;
      setFocusDay(next);
    },
    [focusDay, cells, selectedDay, onPickDay, onOpenDay, onAnchorChange, onEscape]
  );

  const label = formatEventDate(`${month}-01T12:00:00.000Z`, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map(([full, short], i) => (
          <div key={i} className={cn(WEEKDAY_HEAD, i >= 5 && "text-muted-foreground/70")}>
            <span className="hidden sm:inline">{full}</span>
            <span className="sm:hidden" aria-hidden>
              {short}
            </span>
            <span className="sr-only sm:hidden">{full}</span>
          </div>
        ))}
      </div>

      <div className="relative">
        <div
          ref={gridRef}
          role="grid"
          aria-label={`${label} calendar`}
          onKeyDown={onKeyDown}
          className="grid grid-cols-7"
        >
          {weeks.map((week) => (
            /* display:contents — the rows exist because an ARIA grid requires
               grid > row > gridcell, and contribute nothing to the layout */
            <div key={week[0]} role="row" className="contents">
              {week.map((day) => (
                <DayCell
                  key={day}
                  day={day}
                  items={byDay.get(day) ?? []}
                  outside={!day.startsWith(month)}
                  isToday={day === today}
                  isSelected={day === selectedDay}
                  isFocusTarget={day === focusDay}
                  onSelect={() => onPickDay?.(day)}
                  onOpenDay={() => onOpenDay?.(day)}
                  onFocus={() => setFocusDay(day)}
                  onOpenItem={onSelect}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Laid over the grid rather than replacing it: the dates are still the
            answer to "what is the date", and you can still click into a day to
            confirm it really is empty. pointer-events-none so the overlay never
            eats a click meant for a cell. */}
        {!monthHasItems && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-background/70 sm:flex">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <CalendarOff className="size-5" />
              </div>
              <p className="font-medium text-foreground">Nothing scheduled in {label}</p>
              <p className="text-sm text-muted-foreground">
                Use the arrows to look at another month.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
