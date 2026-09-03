/* The shared visual language of the admin calendar.

   The public board already has one of these (publicStyles.ts) and it is the
   reason its three views agree about what "today" looks like. The admin board
   had nothing equivalent: MonthGrid drew its own date circle, TimeGrid drew a
   different one in its column headers, and "today" was a 5% wash in one place
   and a filled disc in the other.

   Three states can land on the same day at once, so they get three different
   channels rather than three shades of one colour:

     today          a filled accent disc         (a property of the date)
     selected       a tinted cell + top rail     (a property of the cell)
     keyboard focus an inset ring                (a property of the focus)

   Everything here is written against .admin-scope tokens, which are shadcn's
   default dark theme — near-black surfaces, a near-WHITE --primary. That last
   part matters: `bg-primary/5` for "today" is a 5% white wash on a near-black
   card, which is why today was invisible on the old grid. Accent states here
   use --calendar-accent, defined below, instead. */

/* Keyboard focus.

   The global rule in globals.css is `outline: 2px solid var(--orange);
   outline-offset: 3px`. Outset by 3px on a grid cell that paints over the
   neighbouring cell's border and reads as a selection — and orange is not an
   .admin-scope colour at all. Inset and neutral instead. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/70";

/* Same, for a control sitting on a surface rather than inside the grid. */
export const FOCUS_RING_SOFT =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/* Every tappable control clears the 44px guideline. A min-height rather than a
   fixed one, so a control can still grow with its content. */
export const TAP = "min-h-11";

/* One hour of the time grid, in pixels. A number rather than a class because
   the scroll position and the now-line are computed from it — deriving a
   layout from a class name would mean guessing. */
export const HOUR_PX = 56;

/* A day cell holds this many chips before it says "+N more". Three keeps every
   row in the month the same height whatever the month contains; the grid
   staying calm matters more than showing a fourth chip. */
export const CHIPS_PER_CELL = 3;

/* Fixed chip geometry. A chip in a month cell is one line, always, so five
   items on a Tuesday and one on a Wednesday do not make the two week rows
   different heights. This is the whole fix for the ripple. */
export const CHIP_H = "h-[22px]";

/* The board frame, shared so month and time views sit in the same box and
   switching between them does not move the border. */
export const BOARD = "overflow-hidden rounded-lg border bg-card";

/* Weekday column headings. No vertical rules: the columns below are already
   ruled and doubling the lines makes it read as a spreadsheet. */
export const WEEKDAY_HEAD =
  "border-b bg-muted/40 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px]";

export type DateBadgeState = {
  today?: boolean;
  selected?: boolean;
  /** a day borrowed from the neighbouring month */
  muted?: boolean;
  /** the badge sits inside something already handling hover */
  interactive?: boolean;
};

/* The date number, in every admin view.

   Sized in rem rather than by the font so the disc stays a circle at every
   breakpoint, and kept at 26/28px: big enough to read and to hit, small enough
   that it does not dominate a cell that also has to hold three chips. */
export function dateBadge({
  today,
  selected,
  muted,
  interactive,
}: DateBadgeState = {}): string {
  const base =
    "flex items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors size-[26px] sm:size-7 sm:text-sm";

  if (today) return `${base} bg-[var(--calendar-accent)] font-bold text-background`;
  if (selected)
    return `${base} font-semibold text-[var(--calendar-accent)] ring-1 ring-[var(--calendar-accent)]/70`;
  if (muted) return `${base} text-muted-foreground/45`;
  return `${base} text-foreground${interactive ? " group-hover:bg-muted" : ""}`;
}

/* The tinted-cell + top-rail treatment for a selected day or column. Kept here
   so month and time views cannot drift apart on what "selected" looks like. */
export const SELECTED_CELL = "bg-[var(--calendar-accent)]/[0.08]";
export const SELECTED_RAIL =
  "pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[var(--calendar-accent)]";

/* Today's column, behind everything. Deliberately fainter than selection: a
   column can be both, and selection has to win. */
export const TODAY_COLUMN = "bg-[var(--calendar-accent)]/[0.035]";
