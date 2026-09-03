/* The shared visual language of the public calendar.

   Month, Week and Upcoming are three renderings of one calendar, and before
   this they each spelled out their own date circle, their own today marker and
   their own idea of what "selected" looks like. They drifted: today was an
   orange disc in the month grid and an orange disc of a different size in the
   week header, and selection was a heavy inset ring in one place and a changed
   background in another.

   Keeping the recipes here means a change to how "today" reads happens once.

   Three states have to stay distinguishable, because they can all land on the
   same day at the same time. They are deliberately given three different
   channels rather than three shades of orange:

     today          a filled orange disc          (a property of the date)
     selected       an orange-tinted cell + rail  (a property of the cell)
     keyboard focus a white inset ring            (a property of the focus)

   Orange is the brand, so it carries meaning; white is not used anywhere else
   on the grid, so a focus ring can never be mistaken for content. */

/* Keyboard focus, everywhere on the calendar. The global :focus-visible rule
   in globals.css draws an *outset* orange outline, which on a grid cell paints
   over the neighbouring cell's border and reads as an orange selection. Inset
   and white instead: it stays inside the cell it belongs to and cannot be
   confused with today or with the selected day. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cream";

/* Same, for a control that sits on a surface rather than in the grid. */
export const FOCUS_RING_SOFT =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/* Every tappable control on the calendar clears the 44px guideline. Written
   as a min-height rather than a fixed one so a control can still grow. */
export const TAP = "min-h-11";

/* One hour of the week grid. 56px is the smallest that fits a two-line chip
   for a one-hour session, which is the commonest length on this calendar. */
export const HOUR_PX = 56;

/* A day cell holds this many chips before it says "+N more". Three keeps
   every row in the month the same height whatever the month contains — the
   grid staying calm matters more than showing a fourth chip. */
export const CHIPS_PER_CELL = 3;

/* Fixed chip geometry. A chip is one line, always, so five events on a
   Tuesday and one on a Wednesday do not make the two rows different heights. */
export const CHIP_H = "h-[22px]";

export type DateBadgeState = {
  today?: boolean;
  selected?: boolean;
  /** a day borrowed from the neighbouring month */
  muted?: boolean;
  /** the badge sits inside something already handling hover */
  interactive?: boolean;
};

/* The date number, in every view.

   Sized in rem rather than by the font so the disc is a circle at every
   breakpoint, and kept at 28/32px: big enough to read and to hit, small
   enough that it does not dominate the cell the way a 40px disc does. */
export function dateBadge({
  today,
  selected,
  muted,
  interactive,
}: DateBadgeState = {}): string {
  const base =
    "flex items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors sm:text-sm size-7 sm:size-8";

  if (today) return `${base} bg-orange font-bold text-bg`;
  if (selected) return `${base} font-semibold text-orange ring-1 ring-orange/70`;
  if (muted) return `${base} text-cream-dim/40`;
  return `${base} text-cream${interactive ? " group-hover:bg-panel-2" : ""}`;
}

/* The month/week grid's surrounding surface, shared so the two views sit in
   the same frame and switching between them does not move the border. */
export const BOARD =
  "overflow-hidden rounded-xl border border-line bg-panel";

/* Weekday column headings. No vertical rules between them: the columns below
   are already ruled, and doubling the lines makes the header look like a
   spreadsheet rather than a calendar. */
export const WEEKDAY_HEAD =
  "label border-b border-line bg-panel-2/40 py-2 text-center text-[10px] font-semibold tracking-[0.14em] sm:py-2.5 sm:text-[11px]";
