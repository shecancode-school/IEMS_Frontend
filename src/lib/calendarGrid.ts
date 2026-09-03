/* The arithmetic behind a month grid.

   All of it is pure and works on ISO day strings ("2026-09-02") rather than
   Date objects, because every day on this calendar is a KIGALI day: the feed
   produces `event.date` with eventDayISO, so a visitor in Los Angeles must see
   the same cell contents as a visitor in Kigali. Doing the arithmetic on the
   string, with Date only ever constructed in UTC, keeps the browser's own
   timezone out of it entirely. */

export type YearMonth = { year: number; month: number };

/** ISO day string from year / 0-indexed month / day-of-month. */
export function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* UTC on purpose: `new Date("2026-09-02T00:00:00")` is parsed in local time, so
   in UTC-7 it lands on 1 September and every arithmetic result is a day out. */
function utc(dayISO: string): Date {
  return new Date(`${dayISO}T00:00:00Z`);
}

export function addDays(dayISO: string, days: number): string {
  const d = utc(dayISO);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. The grid starts on Monday, as Rwanda does. */
export function weekdayIndex(dayISO: string): number {
  return (utc(dayISO).getUTCDay() + 6) % 7;
}

export function monthOf(dayISO: string): YearMonth {
  return { year: Number(dayISO.slice(0, 4)), month: Number(dayISO.slice(5, 7)) - 1 };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function clampMonth(m: YearMonth, min: YearMonth, max: YearMonth): YearMonth {
  if (compareMonths(m, min) < 0) return min;
  if (compareMonths(m, max) > 0) return max;
  return m;
}

export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type GridCell = {
  /** ISO day — also the React key and the value of data-day */
  key: string;
  /** day of the month, 1–31 */
  day: number;
  /** false for the leading/trailing days borrowed from the neighbouring month */
  inMonth: boolean;
  /** Saturday or Sunday, which the grid tints */
  weekend: boolean;
};

/* Always SIX rows, never five.

   A month that fits in five weeks and one that needs six would otherwise
   render at different heights, so the whole page jumps every time you press
   the next-month arrow. Fixing the row count costs one extra row of borrowed
   days and makes navigation feel like a calendar instead of a reflow. */
export const GRID_ROWS = 6;

export function monthMatrix(year: number, month: number): GridCell[] {
  const first = isoDay(year, month, 1);
  const start = addDays(first, -weekdayIndex(first));

  return Array.from({ length: GRID_ROWS * 7 }, (_, i) => {
    const key = addDays(start, i);
    const wd = weekdayIndex(key);
    return {
      key,
      day: Number(key.slice(8, 10)),
      inMonth: key.slice(0, 7) === first.slice(0, 7),
      weekend: wd >= 5,
    };
  });
}

/** The Monday–Sunday week containing `dayISO`. */
export function weekOf(dayISO: string): string[] {
  const monday = addDays(dayISO, -weekdayIndex(dayISO));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Index a feed by its Kigali day, so a cell is a Map lookup and not a scan. */
export function groupByDay<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(item.date);
    if (bucket) bucket.push(item);
    else map.set(item.date, [item]);
  }
  return map;
}

/** Just the month name — the toolbar sets the year in a lighter weight beside it. */
export function monthName({ month }: YearMonth): string {
  return MONTH_NAMES[month];
}

/* The heading for a week.

   Split into label and year because the toolbar prints the year quieter than
   the dates, the way a calendar application does: you are almost always
   looking at this year, so the year is context rather than content.

   A week straddling New Year cannot do that — "29 December – 4 January" is
   two different years and dropping either one makes the heading wrong — so it
   spells both out in the label and leaves the year slot empty. */
export function weekRangeLabel(
  startISO: string,
  endISO: string
): { label: string; year: string } {
  const a = monthOf(startISO);
  const b = monthOf(endISO);
  const d1 = Number(startISO.slice(8, 10));
  const d2 = Number(endISO.slice(8, 10));
  const short = (m: number) => MONTH_NAMES[m].slice(0, 3);

  if (a.year !== b.year) {
    return {
      label: `${d1} ${short(a.month)} ${a.year} – ${d2} ${short(b.month)} ${b.year}`,
      year: "",
    };
  }
  if (a.month !== b.month) {
    return { label: `${d1} ${short(a.month)} – ${d2} ${short(b.month)}`, year: String(a.year) };
  }
  return { label: `${d1} – ${d2} ${MONTH_NAMES[a.month]}`, year: String(a.year) };
}
