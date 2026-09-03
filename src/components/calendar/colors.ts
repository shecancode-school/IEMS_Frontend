import type { CalendarItem } from "@/types/admin";

/* One colour per source, so a glance at the grid tells you what kind of thing
   each block is before you read a word of it.

   Two things were wrong with the previous set and both made the board harder
   to read rather than easier.

   First, every label was written as `text-sky-700 dark:text-sky-300`. The dark
   variant is `@custom-variant dark (&:is(.dark *))` and NOTHING in this app
   ever sets a `.dark` class — there is no ThemeProvider in the tree. So the
   dark half never applied and the admin console, whose surfaces are
   oklch(0.205) near-black, was rendering 700-weight text on them at roughly
   2:1 contrast. Three of the four sources were close to illegible. The shades
   below are the ones meant for a dark surface, written unconditionally.

   Second, EVENT was built on --primary, which inside .admin-scope is shadcn's
   near-WHITE. The single most important source on the board rendered grey and
   read as disabled. It has a real hue now.

   The five hues — orange, green, blue, pink, purple — stay apart from each
   other at chip size, and orange is reserved for today/selection
   (--calendar-accent) so a state and a source can never be confused. */

export const SOURCE_COLOR: Record<CalendarItem["source"], string> = {
  /* the organisation's own published events */
  EVENT: "#34d399",
  /* internal classes, mentorship, sessions */
  ACTIVITY: "#38bdf8",
  /* somebody booked a member of staff */
  BOOKING: "#fb7185",
  /* read-only context pulled from Google */
  GOOGLE: "#a78bfa",
};

/* The chip's own clothes: a wash of its hue, a border in the same hue, and
   label text light enough to read on a near-black card. Google stays visually
   quieter through a dashed border rather than through being greyed out — on a
   calendar whose busiest source IS Google, greying it made the whole week look
   switched off. */
export const SOURCE_STYLE: Record<CalendarItem["source"], string> = {
  EVENT: "bg-emerald-400/15 text-emerald-200 border-emerald-400/40",
  ACTIVITY: "bg-sky-400/15 text-sky-200 border-sky-400/40",
  BOOKING: "bg-rose-400/15 text-rose-200 border-rose-400/40",
  GOOGLE: "bg-violet-400/15 text-violet-200 border-violet-400/40 border-dashed",
};

/* The solid accent for the same source — used for the left rail on a block and
   for legend swatches, where an alpha wash would disappear. */
export const SOURCE_ACCENT = SOURCE_COLOR;

export const SOURCE_LABEL: Record<CalendarItem["source"], string> = {
  EVENT: "Event",
  ACTIVITY: "Activity",
  BOOKING: "Booking",
  GOOGLE: "Google",
};

export const SOURCES: CalendarItem["source"][] = [
  "EVENT",
  "ACTIVITY",
  "BOOKING",
  "GOOGLE",
];

/* Stable per-person accent for the people lanes. Hashing the id means a person
   keeps the same colour across reloads and across views without us having to
   store one. These are lane markers on a header, not chip fills, so they only
   have to be distinguishable from each other — but they are still the lighter
   shades, because a 700-weight dot on a near-black header is a smudge. */
const LANE_COLORS = [
  "#38bdf8",
  "#fbbf24",
  "#a78bfa",
  "#34d399",
  "#fb7185",
  "#2dd4bf",
  "#f472b6",
  "#facc15",
];

export function personColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return LANE_COLORS[Math.abs(hash) % LANE_COLORS.length];
}
