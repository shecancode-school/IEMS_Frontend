"use client";

import { compactTime } from "@/lib/time";
import { isBookableEvent, itemColor, type VenueEvent } from "@/lib/events";
import { CHIP_H, FOCUS_RING_SOFT, TAP } from "./publicStyles";

/* A single item on the public calendar.

   Two kinds share the grid and they must not look alike: a ticketed event is
   a solid block in its programme colour and opens the registration flow; a
   staff session is an outlined block in the session accent and opens nothing,
   because there is no ticket to buy. Rendering a session as a button would
   promise an action that does not exist.

   Every chip is exactly one line tall. It used to wrap, which meant a day with
   a long title was taller than the day beside it and the grid rippled — and
   because the cell has a fixed minimum height, the third chip silently
   overflowed its cell. Truncating is the honest trade: the full text is one
   click away in the day panel, and the grid stays readable. */

function subtitle(item: VenueEvent): string {
  if (!isBookableEvent(item)) return item.host ? `${item.time} · ${item.host}` : item.time;
  return `${item.time} at ${item.space} · ${item.soldOut ? "Sold out" : item.price}`;
}

/* the full sentence a screen reader or a hover gets */
export function chipTitle(item: VenueEvent): string {
  const who = item.host ? ` with ${item.host}` : "";
  if (!isBookableEvent(item)) {
    return `${item.title}${who} — ${item.time}, ${item.space || "location to be confirmed"}`;
  }
  return `${item.title} — ${item.time}, ${item.space}. ${item.soldOut ? "Sold out" : item.price}`;
}

/* Compact chip for the desktop month grid.

   `focusable` is false inside the month grid on purpose. That grid is an ARIA
   grid: arrow keys move between days and Tab leaves the whole widget. Leaving
   the chips in the tab order meant tabbing through a busy month took forty
   stops before reaching the footer — the pattern says a grid is one tab stop,
   and the chips are reachable from the day panel that Enter opens. */
export function DayChip({
  item,
  onOpen,
  focusable = false,
}: {
  item: VenueEvent;
  onOpen: (e: VenueEvent) => void;
  focusable?: boolean;
}) {
  const colour = itemColor(item);
  const base = `${CHIP_H} flex w-full items-center gap-1 overflow-hidden rounded px-1.5 text-left text-[11px] leading-none`;

  if (!isBookableEvent(item)) {
    return (
      <div
        title={chipTitle(item)}
        className={`${base} border border-dashed text-cream`}
        style={{ borderColor: colour, backgroundColor: `${colour}1f` }}
      >
        <span className="shrink-0 font-medium text-cream-dim">
          {compactTime(item.time)}
        </span>
        <span className="truncate font-semibold">{item.title}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      tabIndex={focusable ? undefined : -1}
      /* the cell behind this chip is itself the "select this day" target, so
         without this a click on a chip would open the event AND move the day
         selection underneath it */
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      title={chipTitle(item)}
      className={`${base} ${FOCUS_RING_SOFT} cursor-pointer text-bg transition-[filter] hover:brightness-110`}
      style={{ backgroundColor: colour }}
    >
      {/* the time is context, the title is the thing — they used to share one
          weight and compete for the eye */}
      <span className="shrink-0 font-medium opacity-70">{compactTime(item.time)}</span>
      <span className="truncate font-semibold">{item.title}</span>
    </button>
  );
}

/* Roomier row for the mobile agenda and the day panel. */
export function AgendaChip({
  item,
  onOpen,
}: {
  item: VenueEvent;
  onOpen: (e: VenueEvent) => void;
}) {
  const colour = itemColor(item);
  const base = `${TAP} block w-full rounded-lg px-3.5 py-2.5 text-left`;

  if (!isBookableEvent(item)) {
    return (
      <div
        className={`${base} border border-dashed text-cream`}
        style={{ borderColor: colour, backgroundColor: `${colour}1f` }}
      >
        <span className="block text-sm font-bold leading-snug">{item.title}</span>
        <span className="block text-xs font-medium text-cream-dim">{subtitle(item)}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`${base} ${FOCUS_RING_SOFT} cursor-pointer text-bg transition-[filter] hover:brightness-110`}
      style={{ backgroundColor: colour }}
    >
      <span className="block text-sm font-bold leading-snug">{item.title}</span>
      <span className="block text-xs font-medium opacity-80">{subtitle(item)}</span>
    </button>
  );
}
