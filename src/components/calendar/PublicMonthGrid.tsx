"use client";

import { motion } from "motion/react";
import { itemColor, type VenueEvent } from "@/lib/events";
import type { GridCell } from "@/lib/calendarGrid";
import { DayChip } from "./PublicChip";
import { EmptyCalendarArt } from "./EmptyCalendarArt";
import { CHIPS_PER_CELL, FOCUS_RING, WEEKDAY_HEAD, dateBadge } from "./publicStyles";

/* The month board.

   Pulled out of MonthCalendar so that file is orchestration — state, keyboard,
   data — and this one is the drawing. They were one 780-line component and the
   grid markup was buried six levels deep inside two AnimatePresence wrappers.

   The interaction model is a real ARIA grid, and that changed one thing worth
   spelling out: the whole cell is the day, not the little date circle inside
   it. Before, the only way to select 14 September was to hit a 32px disc — on
   a phone that is a miss more often than a hit, and it is not how any calendar
   behaves. The cell now carries the role, the roving tabindex, the label and
   the click, and the chips inside it are `tabIndex={-1}` because a grid is one
   tab stop: arrows move within it, Tab leaves it, and the chips are reachable
   as real buttons in the day panel that Enter opens. */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* Dots stand in for chips on a phone, where a 45px column cannot hold text.
   Four is where a row of dots stops reading as a quantity and starts reading
   as a texture; past that the cell says how many. */
const DOTS_PER_CELL = 4;

function dayLabel(dayISO: string, count: number): string {
  const date = new Date(`${dayISO}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  if (count === 0) return `${date}, nothing scheduled`;
  return `${date}, ${count} item${count > 1 ? "s" : ""}`;
}

function DayCell({
  cell,
  items,
  isToday,
  isSelected,
  isFocusTarget,
  onSelect,
  onFocus,
  onOpen,
}: {
  cell: GridCell;
  items: VenueEvent[];
  isToday: boolean;
  isSelected: boolean;
  isFocusTarget: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onOpen: (e: VenueEvent) => void;
}) {
  /* Google's rule, and the right one: when there is an overflow the cell
     shows one fewer chip and spends that line on the count. Showing three
     chips *and* a count would make the cell four lines tall and break the
     row rhythm the fixed chip height exists to protect. */
  const overflow = items.length - CHIPS_PER_CELL;
  const shown = overflow > 0 ? items.slice(0, CHIPS_PER_CELL - 1) : items;
  const hidden = items.length - shown.length;

  return (
    <div
      role="gridcell"
      aria-selected={isSelected}
      aria-label={dayLabel(cell.key, items.length)}
      data-day={cell.key}
      tabIndex={isFocusTarget ? 0 : -1}
      onClick={onSelect}
      onFocus={onFocus}
      className={`group relative flex min-h-16 cursor-pointer flex-col border-b border-r border-line p-1 transition-colors nth-[7n]:border-r-0 sm:min-h-32 sm:p-1.5 ${FOCUS_RING} ${
        cell.inMonth
          ? cell.weekend
            ? "bg-panel-2/25"
            : "bg-panel"
          : "bg-bg/40"
      } ${isSelected ? "bg-orange/[0.07]" : "hover:bg-panel-2/50"}`}
    >
      {/* Selection is a tinted cell and a 2px rail along its top edge, not the
          inset orange ring that used to wrap the whole cell — that ring was
          the loudest mark on the board and shouted over today's own marker. */}
      {isSelected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-orange"
        />
      )}

      <span
        className={`${dateBadge({
          today: isToday,
          selected: isSelected && !isToday,
          muted: !cell.inMonth,
          interactive: cell.inMonth && !isSelected,
        })} shrink-0 self-start`}
      >
        {cell.day}
      </span>

      {/* Phone: dots, then a count once dots stop being countable. */}
      {items.length > 0 && (
        <div aria-hidden className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
          {items.slice(0, DOTS_PER_CELL).map((event) => (
            <span
              key={event.id}
              className="size-1.5 rounded-full"
              style={{ backgroundColor: itemColor(event) }}
            />
          ))}
          {items.length > DOTS_PER_CELL && (
            <span className="text-[9px] font-semibold leading-none text-cream-dim">
              +{items.length - DOTS_PER_CELL}
            </span>
          )}
        </div>
      )}

      {/* Tablet and up: chips. overflow-hidden is load-bearing — a fourth chip
          arriving from a live update must be clipped, not push the row. */}
      <div className="mt-0.5 hidden min-w-0 flex-1 space-y-0.5 overflow-hidden sm:block">
        {shown.map((event) => (
          <DayChip key={event.id} item={event} onOpen={onOpen} />
        ))}

        {/* A span, not a button: the cell it sits in already opens this day on
            click, so a nested button would be a second control doing the same
            thing and a second stop for anyone navigating by element. */}
        {hidden > 0 && (
          <span className="flex h-[22px] items-center px-1.5 text-[11px] font-semibold leading-none text-cream-dim transition-colors group-hover:text-orange">
            +{hidden} more
          </span>
        )}
      </div>
    </div>
  );
}

export function PublicMonthGrid({
  gridRef,
  label,
  weeks,
  byDay,
  todayKey,
  selectedDay,
  focusDay,
  hasItems,
  direction,
  reduced,
  onSelectDay,
  onFocusDay,
  onKeyDown,
  onOpen,
}: {
  gridRef: React.Ref<HTMLDivElement>;
  /** "September 2026" — the grid's accessible name */
  label: string;
  weeks: GridCell[][];
  byDay: Map<string, VenueEvent[]>;
  todayKey: string;
  /** null when nothing is selected, so no cell wears the selected treatment */
  selectedDay: string | null;
  focusDay: string;
  hasItems: boolean;
  direction: number;
  reduced: boolean;
  onSelectDay: (dayISO: string) => void;
  onFocusDay: (dayISO: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onOpen: (e: VenueEvent) => void;
}) {
  return (
    <div className="bg-panel">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={wd}
            className={`${WEEKDAY_HEAD} ${i >= 5 ? "text-cream-dim/70" : "text-cream-dim"}`}
          >
            <span className="hidden sm:inline">{wd}</span>
            <span className="sm:hidden" aria-hidden>
              {wd[0]}
            </span>
            <span className="sr-only sm:hidden">{wd}</span>
          </div>
        ))}
      </div>

      <div className="relative">
        <motion.div
          /* keyed on the month so React swaps the subtree outright. An
             AnimatePresence with mode="wait" here kept the outgoing month
             mounted, and focus went with it — arrowing off the edge of a month
             dropped the keyboard user out of the grid. */
          key={label}
          ref={gridRef}
          role="grid"
          aria-label={`${label} calendar`}
          onKeyDown={onKeyDown}
          initial={reduced ? false : { opacity: 0, x: 10 * direction }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="grid grid-cols-7"
        >
          {weeks.map((week) => (
            /* display:contents — the rows exist for assistive technology,
               which requires grid > row > gridcell, and contribute nothing to
               the seven-column layout */
            <div key={week[0].key} role="row" className="contents">
              {week.map((cell) => (
                <DayCell
                  key={cell.key}
                  cell={cell}
                  items={byDay.get(cell.key) ?? []}
                  isToday={cell.key === todayKey}
                  isSelected={cell.key === selectedDay}
                  isFocusTarget={cell.key === focusDay}
                  onSelect={() => onSelectDay(cell.key)}
                  onFocus={() => onFocusDay(cell.key)}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ))}
        </motion.div>

        {/* Laid over the grid rather than replacing it: the dates are still
            the answer to "what is the date", and a visitor can still click
            into a day to see it really is empty. pointer-events-none so the
            overlay never eats a click meant for a cell. */}
        {!hasItems && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-bg/70 sm:flex">
            <EmptyCalendarArt
              size="sm"
              title="Nothing scheduled this month"
              message="Use the arrows to look ahead, or switch to Upcoming."
            />
          </div>
        )}
      </div>
    </div>
  );
}
