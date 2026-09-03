/* "Add this to my calendar" links.

   The booking already lands in the HOST's Google Calendar, because we own that
   connection. The person who booked is usually not staff and has no connection
   to us at all, so the only way their own calendar learns about the meeting is
   if we hand them a link — otherwise the confirmation email is the sole record
   and it is one inbox-scroll away from being forgotten.

   Google's template URL is used rather than an .ics attachment: attachments get
   stripped by some corporate mail filters, and a link works on a phone where
   opening an .ics is fiddly. Both are offered where we can.

   Times are UTC in the compact form Google expects (YYYYMMDDTHHMMSSZ). */

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type CalendarLinkEvent = {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
};

export function googleCalendarUrl(e: CalendarLinkEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    ...(e.details ? { details: e.details } : {}),
    ...(e.location ? { location: e.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* Outlook and Apple Calendar both read .ics; this is the same event as a
   downloadable file, for anyone not on Google. */
export function icsForEvent(e: CalendarLinkEvent, uid: string): string {
  const escape = (v: string) => v.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Igire Rwanda Organization//IEMS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escape(e.title)}`,
    ...(e.details ? [`DESCRIPTION:${escape(e.details)}`] : []),
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
