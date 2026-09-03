import { kigaliDayEnd, kigaliDayStart } from "@/lib/time";

export type Interval = { start: Date; end: Date };

/* Google returns two shapes for an event's start/end:
     timed    → { dateTime: "2026-03-05T14:00:00+02:00" }  — carries an offset
     all-day  → { date: "2026-03-05" }                     — carries NOTHING

   Feeding the all-day form to `new Date()` parses it as UTC midnight, which in
   Kigali is 02:00 — so an all-day "out of office" would appear to start two
   hours late and free up the first two hours of the day for booking. Expanding
   it through the Kigali day helpers is the fix. */
export type GoogleDate = { dateTime?: string | null; date?: string | null; timeZone?: string | null };

export function toInstant(g: GoogleDate | undefined, edge: "start" | "end"): Date | null {
  if (!g) return null;
  if (g.dateTime) return new Date(g.dateTime);
  if (g.date) {
    /* Google's all-day `end.date` is exclusive — an event on the 5th alone
       comes back as start 2026-03-05, end 2026-03-06 — so the end edge is the
       last millisecond of the day BEFORE the one it names. */
    if (edge === "start") return kigaliDayStart(g.date);
    const d = new Date(`${g.date}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return kigaliDayEnd(d.toISOString().slice(0, 10));
  }
  return null;
}

export function toInterval(
  start: GoogleDate | undefined,
  end: GoogleDate | undefined
): Interval | null {
  const s = toInstant(start, "start");
  const e = toInstant(end, "end");
  if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  return { start: s, end: e };
}
