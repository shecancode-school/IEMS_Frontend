/* One timezone for every event clock in the system.
   Events happen in Rwanda, so all wall-clock times are Africa/Kigali time:
   the admin types Kigali time into the form, Mongo stores the exact UTC
   instant, and every surface (public site, admin panel, emails, PDFs)
   formats that instant back in Kigali time. Without this, the rendered time
   depended on whichever machine did the formatting — UTC on the server,
   browser-local on the client. */

export const EVENT_TZ = "Africa/Kigali";
/* Kigali has never observed daylight saving — the offset is a constant. */
export const EVENT_TZ_OFFSET = "+02:00";

/* <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm", Kigali wall
   clock) → ISO instant to send to the API. */
export function kigaliInputToISO(input: string): string {
  return new Date(`${input}:00${EVENT_TZ_OFFSET}`).toISOString();
}

function kigaliParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  /* midnight comes back as "24" in some ICU versions */
  if (out.hour === "24") out.hour = "00";
  return out;
}

/* stored instant → <input type="datetime-local"> value in Kigali time */
export function isoToKigaliInput(iso?: string | Date | null): string {
  if (!iso) return "";
  const p = kigaliParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/* the Kigali calendar day of an instant, as "YYYY-MM-DD" */
export function eventDayISO(d: Date | string): string {
  const p = kigaliParts(new Date(d));
  return `${p.year}-${p.month}-${p.day}`;
}

/* the last millisecond of the instant's Kigali calendar day */
export function endOfEventDay(d: Date | string): Date {
  return new Date(`${eventDayISO(d)}T23:59:59.999${EVENT_TZ_OFFSET}`);
}

/* "2:00 PM" */
export function formatEventTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-US", {
    timeZone: EVENT_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

/* "10:00 AM" -> "10am", "10:30 AM" -> "10:30am".

   A chip in a month cell is about 90px wide at the narrowest desktop size.
   Spelling the time out in full leaves room for four or five characters of
   title, which is not a title. Dropping the empty minutes and the space is how
   every calendar application writes a time in a confined space.

   Anything that is not a recognisable 12-hour clock time is returned
   untouched — better a long label than a mangled one. */
export function compactTime(time: string): string {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i.exec(time.trim());
  if (!m) return time;
  const [, hour, minutes, meridiem] = m;
  return `${hour}${minutes && minutes !== "00" ? `:${minutes}` : ""}${meridiem.toLowerCase()}`;
}

/* "Friday, July 17, 2026" (options can trim it down) */
export function formatEventDate(
  d: Date | string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }
): string {
  return new Date(d).toLocaleDateString("en-US", { timeZone: EVENT_TZ, ...options });
}

/* "July 17, 2026, 2:00 PM" */
export function formatEventDateTime(
  d: Date | string,
  options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }
): string {
  return new Date(d).toLocaleString("en-US", { timeZone: EVENT_TZ, ...options });
}

/* ------------------------------------------------------------ day windows */
/* Building a day window with `new Date("2026-03-05T00:00:00")` parses in the
   SERVER's timezone, which on a UTC host is two hours off Kigali. Every range
   query must go through these instead. */

export function kigaliDayStart(dayISO: string): Date {
  return new Date(`${dayISO}T00:00:00.000${EVENT_TZ_OFFSET}`);
}

export function kigaliDayEnd(dayISO: string): Date {
  return new Date(`${dayISO}T23:59:59.999${EVENT_TZ_OFFSET}`);
}

/* a Kigali wall-clock time on a Kigali calendar day → the exact instant */
export function kigaliTimeToInstant(dayISO: string, hhmm: string): Date {
  return new Date(`${dayISO}T${hhmm}:00.000${EVENT_TZ_OFFSET}`);
}

/* "14:30" — the Kigali wall clock of an instant, for slot maths */
export function kigaliHHmm(d: Date | string): string {
  const p = kigaliParts(new Date(d));
  return `${p.hour}:${p.minute}`;
}

/* 0 = Sunday … 6 = Saturday, in Kigali. Availability rules are keyed on this. */
export function kigaliWeekday(d: Date | string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TZ, weekday: "short" }).format(
    new Date(d)
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
}

/* pure "YYYY-MM-DD" arithmetic — no timezone involved, so it can't drift */
export function addDaysISO(dayISO: string, days: number): string {
  const d = new Date(`${dayISO}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* every Kigali calendar day from `from` to `to`, inclusive */
export function dayRangeISO(fromISO: string, toISO: string): string[] {
  const days: string[] = [];
  for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) {
    days.push(d);
    /* a malformed range must not spin forever */
    if (days.length > 400) break;
  }
  return days;
}
