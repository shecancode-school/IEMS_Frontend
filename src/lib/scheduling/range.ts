import { addDaysISO, eventDayISO } from "@/lib/time";

/* Turning "which view, anchored where" into the [from, to] the feed wants.
   Pure string arithmetic on Kigali calendar days — no Date parsing, so it
   cannot drift with the host timezone. */

export type CalendarView = "day" | "week" | "month";

export const todayISO = () => eventDayISO(new Date());

/* the Monday of the week containing `dayISO` */
export function weekStart(dayISO: string): string {
  const dow = new Date(`${dayISO}T12:00:00.000Z`).getUTCDay(); // 0=Sun
  return addDaysISO(dayISO, -((dow + 6) % 7));
}

export function monthStart(dayISO: string): string {
  return `${dayISO.slice(0, 7)}-01`;
}

export function monthEnd(dayISO: string): string {
  const [y, m] = dayISO.split("-").map(Number);
  /* day 0 of the next month is the last day of this one */
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${dayISO.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function viewRange(view: CalendarView, anchorISO: string): { from: string; to: string } {
  if (view === "day") return { from: anchorISO, to: anchorISO };
  if (view === "week") {
    const from = weekStart(anchorISO);
    return { from, to: addDaysISO(from, 6) };
  }
  /* month view renders a 6-week grid, so the feed has to cover the leading and
     trailing days from the neighbouring months too */
  return { from: addDaysISO(monthStart(anchorISO), -7), to: addDaysISO(monthEnd(anchorISO), 7) };
}

export function shiftAnchor(view: CalendarView, anchorISO: string, direction: 1 | -1): string {
  if (view === "day") return addDaysISO(anchorISO, direction);
  if (view === "week") return addDaysISO(anchorISO, 7 * direction);
  const [y, m] = anchorISO.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + direction, 1));
  return shifted.toISOString().slice(0, 10);
}
