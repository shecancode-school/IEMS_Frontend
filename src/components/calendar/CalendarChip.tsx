"use client";

import Link from "next/link";
import { Globe, Lock, Video } from "lucide-react";
import type { CalendarItem } from "@/types/admin";
import { compactTime, eventDayISO, formatEventDate, formatEventTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SOURCE_STYLE } from "./colors";
import { CHIP_H, FOCUS_RING_SOFT } from "./adminStyles";

/* One block on the grid. Renders as a button when there is something to open,
   as a link when it has somewhere to go, and as a plain div when it doesn't —
   a redacted busy block or a read-only Google entry should not look clickable.

   Three shapes, because three places need different things from it:

     "row"    a month-cell chip. Fixed height, one line, time then title. The
              fixed height is load-bearing: without it a Tuesday with three
              items was taller than the Wednesday beside it and, because grid
              rows stretch to their tallest cell, the whole week row grew. The
              board rippled as you paged through months.
     "block"  a positioned block in the time grid. Fills the height it is given.
     "tight"  the same, for a block too short to hold two lines. */
export type ChipShape = "row" | "block" | "tight";

/* What an all-day chip says where a timed one says "9am". A single-day item is
   just "All day"; one that runs across days says so, because "All day" on a
   Thursday chip for something that started Tuesday is a lie the grid tells
   three times over. */
function allDayLabel(item: CalendarItem): string {
  const from = eventDayISO(item.start);
  /* the end of an all-day range is exclusive midnight, so step inside it
     before asking which day it lands on */
  const endMs = new Date(item.end).getTime();
  if (!Number.isFinite(endMs)) return "All day";
  const to = eventDayISO(new Date(endMs - 1));
  if (to <= from) return "All day";
  const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${formatEventDate(`${from}T12:00:00.000Z`, short)} – ${formatEventDate(
    `${to}T12:00:00.000Z`,
    short
  )}`;
}

export function CalendarChip({
  item,
  shape = "block",
  allDay = false,
  onSelect,
  focusable = true,
  className,
  style,
}: {
  item: CalendarItem;
  shape?: ChipShape;
  /* Forced on by the all-day lane. Not everything that lands there has
     `item.allDay` set — the lane also catches 24/7 blocks and anything that
     spans the whole visible window, and those still carry a real start time.
     Printing it would say "9am" for something filed under All day. */
  allDay?: boolean;
  onSelect?: (item: CalendarItem) => void;
  /* False inside the month grid on purpose. That grid is an ARIA grid: arrow
     keys move between days and Tab leaves the whole widget. Leaving the chips
     in the tab order meant tabbing through a busy month took forty stops
     before reaching anything else on the page. */
  focusable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const oneLine = shape !== "block";
  const isAllDay = allDay || item.allDay;

  /* Icons carry meaning the title cannot, so they are never dropped — but at
     row size there is only room for the ones that change what you would do:
     a private block you cannot open, and a session the public can see. */
  const icons = (
    <>
      {item.redacted && <Lock className="size-3 shrink-0 opacity-70" aria-label="Private" />}
      {item.visibility === "PUBLIC" && (
        <Globe className="size-3 shrink-0 opacity-70" aria-label="Public" />
      )}
      {item.meetLink && shape !== "row" && (
        <Video className="size-3 shrink-0 opacity-70" aria-label="Has a meeting link" />
      )}
    </>
  );

  const body =
    shape === "row" ? (
      /* Time first, title second, both on one line. The time is context and
         the title is the thing, so they get different weights — before, they
         shared one and competed for the eye. */
      <span className="flex w-full items-center gap-1 overflow-hidden">
        {icons}
        <span className="shrink-0 font-medium tabular-nums opacity-70">
          {isAllDay ? allDayLabel(item) : compactTime(formatEventTime(item.start))}
        </span>
        <span className="truncate font-semibold">{item.title}</span>
      </span>
    ) : (
      <>
        <span className="flex items-start gap-1 font-semibold">
          <span className="mt-px flex shrink-0 items-center gap-1">{icons}</span>
          <span className={oneLine ? "truncate" : "line-clamp-2"}>{item.title}</span>
        </span>
        {!oneLine && (
          <span className="mt-0.5 block truncate text-[11px] opacity-80">
            {isAllDay ? allDayLabel(item) : formatEventTime(item.start)}
            {item.location ? ` · ${item.location}` : ""}
            {item.ownerName ? ` · ${item.ownerName}` : ""}
          </span>
        )}
      </>
    );

  const classes = cn(
    "block w-full overflow-hidden rounded-md border text-left leading-tight transition-shadow",
    /* px-2 py-1 rather than px-1.5: the block is the tap target, and a 2px hit
       area on a phone is not one. */
    shape === "row" ? `${CHIP_H} flex items-center px-1.5 text-[11px]` : "px-2 py-1 text-xs",
    SOURCE_STYLE[item.source],
    (item.href || onSelect) && `cursor-pointer hover:z-10 hover:shadow-md ${FOCUS_RING_SOFT}`,
    className
  );

  /* Inside the month grid the cell itself is the "open this day" target, so a
     click on a chip must not also move the day selection underneath it. */
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (onSelect && !item.redacted) {
    return (
      <button
        type="button"
        tabIndex={focusable ? undefined : -1}
        onClick={(e) => {
          stop(e);
          onSelect(item);
        }}
        title={item.title}
        className={classes}
        style={style}
      >
        {body}
      </button>
    );
  }
  if (item.href) {
    return (
      <Link
        href={item.href}
        tabIndex={focusable ? undefined : -1}
        onClick={stop}
        {...(item.source === "GOOGLE" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        title={item.title}
        className={classes}
        style={style}
      >
        {body}
      </Link>
    );
  }
  return (
    <div title={item.title} className={classes} style={style}>
      {body}
    </div>
  );
}
