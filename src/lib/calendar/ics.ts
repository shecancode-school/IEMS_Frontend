/* iCalendar (RFC 5545) generation, hand-written. The `ics` npm package would
   add a dependency for what is fundamentally string assembly, and the format's
   sharp edges — CRLF line endings, 75-octet folding, escaping — are only a few
   lines each. */

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /* bumped whenever the event changes, so subscribed clients update rather
     than showing a stale copy */
  sequence?: number;
  status?: "CONFIRMED" | "CANCELLED";
};

/* "20260305T120000Z" — UTC form, which every client understands without
   needing us to ship a VTIMEZONE block for Africa/Kigali. */
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/* commas, semicolons and backslashes are structural in iCalendar, and a raw
   newline would end the property */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/* Lines must be at most 75 octets; continuations start with a single space.
   Folding on characters rather than bytes would split a multi-byte character
   in half, so this counts UTF-8 length. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    /* first line gets 75 octets, continuations 74 (the leading space counts) */
    const limit = parts.length === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);
    /* never cut mid-character: continuation bytes are 10xxxxxx */
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], calendarName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Igire Rwanda Organization//IEMS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
    "X-WR-TIMEZONE:Africa/Kigali",
  ];

  const now = stamp(new Date());
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(e.title)}`,
      `SEQUENCE:${e.sequence ?? 0}`,
      `STATUS:${e.status ?? "CONFIRMED"}`
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${esc(e.url)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  /* CRLF is required by the spec, and some clients genuinely reject LF-only */
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function icsResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
