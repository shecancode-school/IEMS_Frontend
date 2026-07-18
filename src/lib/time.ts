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
