import { addDaysISO, dayRangeISO, eventDayISO, kigaliTimeToInstant, kigaliWeekday } from "@/lib/time";

/* The booking engine. Pure: no database, no network, no Date.now() — `now` is
   injected — so every rule below is directly unit-testable, which matters
   because a mistake here silently double-books a real person.

   All arithmetic runs on absolute instants derived from Kigali wall-clock
   rules. Kigali has never observed DST, so "09:00 Monday" is unambiguous. */

export type Interval = { start: Date; end: Date };

export type WeeklyRule = { weekday: number; start: string; end: string };

export type SlotRules = {
  weekly: WeeklyRule[];
  slotMinutes: number;
  bufferMinutes: number;
  leadTimeMinutes: number;
  horizonDays: number;
  maxPerDay: number;
  blackouts: Interval[];
};

const MIN = 60_000;

/* ---------------------------------------------------------------- intervals */

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];

  for (const iv of sorted) {
    const last = out[out.length - 1];
    /* touching intervals merge too: 09:00–10:00 and 10:00–11:00 are one busy
       block, and treating them separately would invent a zero-length gap */
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      out.push({ start: new Date(iv.start), end: new Date(iv.end) });
    }
  }
  return out;
}

export function subtractIntervals(base: Interval[], busy: Interval[]): Interval[] {
  const blocks = mergeIntervals(busy);
  const out: Interval[] = [];

  for (const span of base) {
    let cursor = span.start;
    for (const block of blocks) {
      if (block.end <= cursor) continue;
      if (block.start >= span.end) break;
      if (block.start > cursor) out.push({ start: cursor, end: new Date(Math.min(block.start.getTime(), span.end.getTime())) });
      if (block.end > cursor) cursor = block.end;
      if (cursor >= span.end) break;
    }
    if (cursor < span.end) out.push({ start: cursor, end: span.end });
  }
  return out.filter((i) => i.end > i.start);
}

/* ------------------------------------------------------------------- rules */

/* The working windows on one Kigali calendar day. Multiple rules per weekday
   are allowed and merged, so "09:00–12:00 and 14:00–17:00" is a lunch break
   rather than two competing rules. */
export function windowsForDay(dayISO: string, weekly: WeeklyRule[]): Interval[] {
  const weekday = kigaliWeekday(kigaliTimeToInstant(dayISO, "12:00"));
  const windows = weekly
    .filter((r) => r.weekday === weekday && r.start < r.end)
    .map((r) => ({
      start: kigaliTimeToInstant(dayISO, r.start),
      end: kigaliTimeToInstant(dayISO, r.end),
    }));
  return mergeIntervals(windows);
}

/* Chop free spans into bookable starts. The buffer is reserved AFTER the
   meeting, so a 30-minute slot with a 10-minute buffer needs 40 minutes of
   clear time — except at the very end of a window, where the buffer would
   only run into time the host was never offering anyway. */
export function sliceIntoSlots(
  free: Interval[],
  slotMinutes: number,
  bufferMinutes: number
): Interval[] {
  const slotMs = slotMinutes * MIN;
  const bufferMs = bufferMinutes * MIN;
  const slots: Interval[] = [];

  for (const span of free) {
    let start = span.start.getTime();
    while (start + slotMs <= span.end.getTime()) {
      slots.push({ start: new Date(start), end: new Date(start + slotMs) });
      start += slotMs + bufferMs;
    }
  }
  return slots;
}

/* -------------------------------------------------------------- the engine */

export type ComputeInput = {
  from: string;
  to: string;
  rules: SlotRules;
  /* Google busy blocks plus existing bookings, in any order */
  busy: Interval[];
  now: Date;
};

export type DaySlots = { day: string; slots: Interval[] };

export function computeFreeSlots(input: ComputeInput): DaySlots[] {
  const { rules, now } = input;

  /* nothing sooner than the required notice, nothing further out than the
     horizon — both clamp the requested range rather than rejecting it */
  const earliest = new Date(now.getTime() + rules.leadTimeMinutes * MIN);
  const horizonEnd = addDaysISO(eventDayISO(now), rules.horizonDays);

  const from = input.from > eventDayISO(earliest) ? input.from : eventDayISO(earliest);
  const to = input.to < horizonEnd ? input.to : horizonEnd;
  if (to < from) return [];

  /* the buffer applies around existing commitments too, not just between new
     slots — otherwise a booking could start the second another one ends */
  const padded = input.busy.map((b) => ({
    start: new Date(b.start.getTime() - rules.bufferMinutes * MIN),
    end: new Date(b.end.getTime() + rules.bufferMinutes * MIN),
  }));
  const blocked = mergeIntervals([...padded, ...rules.blackouts]);

  const out: DaySlots[] = [];
  for (const day of dayRangeISO(from, to)) {
    const windows = windowsForDay(day, rules.weekly);
    if (!windows.length) continue;

    const free = subtractIntervals(windows, blocked);
    let slots = sliceIntoSlots(free, rules.slotMinutes, rules.bufferMinutes)
      .filter((s) => s.start >= earliest);

    if (rules.maxPerDay > 0) {
      /* the cap counts what is already booked that day, so a host with a
         2-a-day limit and one booking is offered one more slot, not two */
      const takenToday = input.busy.filter((b) => eventDayISO(b.start) === day).length;
      const remaining = Math.max(0, rules.maxPerDay - takenToday);
      slots = slots.slice(0, remaining);
    }

    if (slots.length) out.push({ day, slots });
  }
  return out;
}

/* Is this exact start time still on offer? The booking route re-runs this
   immediately before writing — the client is never trusted to have picked a
   real slot, and the list it was shown may be a minute stale. */
export function slotIsOffered(days: DaySlots[], start: Date): Interval | null {
  const t = start.getTime();
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.start.getTime() === t) return slot;
    }
  }
  return null;
}
