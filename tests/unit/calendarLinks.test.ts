import { describe, it, expect } from "vitest";
import { googleCalendarUrl, icsForEvent } from "@/lib/calendarLinks";

const start = new Date("2026-09-10T08:30:00.000Z");
const end = new Date("2026-09-10T09:00:00.000Z");

describe("googleCalendarUrl", () => {
  it("builds a template link with UTC stamps Google understands", () => {
    const url = new URL(googleCalendarUrl({ title: "Meeting with Derrick", start, end }));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Meeting with Derrick");
    /* compact UTC, no punctuation, no milliseconds — anything else and Google
       silently drops the date and opens an empty event form */
    expect(url.searchParams.get("dates")).toBe("20260910T083000Z/20260910T090000Z");
  });

  it("omits details and location rather than sending empty ones", () => {
    const url = new URL(googleCalendarUrl({ title: "T", start, end }));
    expect(url.searchParams.has("details")).toBe(false);
    expect(url.searchParams.has("location")).toBe(false);
  });

  it("carries details and location when given", () => {
    const url = new URL(
      googleCalendarUrl({ title: "T", start, end, details: "Bring notes", location: "Lab 2" })
    );
    expect(url.searchParams.get("details")).toBe("Bring notes");
    expect(url.searchParams.get("location")).toBe("Lab 2");
  });

  it("escapes a title with characters that would break a raw query string", () => {
    const url = new URL(googleCalendarUrl({ title: "Q&A: you + me", start, end }));
    expect(url.searchParams.get("text")).toBe("Q&A: you + me");
  });
});

describe("icsForEvent", () => {
  const ics = icsForEvent(
    { title: "Meeting with Derrick", start, end, details: "Line one\nLine two", location: "Lab 2" },
    "abc@igirerwanda.org"
  );

  it("is a single well-formed VEVENT", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:abc@igirerwanda.org");
  });

  /* RFC 5545 wants CRLF; some clients (Outlook among them) reject bare LF */
  it("uses CRLF line endings", () => {
    expect(ics).toContain("\r\n");
    expect(ics.split("\r\n").some((l) => l.includes("\n"))).toBe(false);
  });

  it("stamps the times in UTC", () => {
    expect(ics).toContain("DTSTART:20260910T083000Z");
    expect(ics).toContain("DTEND:20260910T090000Z");
  });

  /* An unescaped comma or newline ends the property early and the rest of the
     description leaks out as an invalid line, which some clients reject
     outright. */
  it("escapes newlines and separators in text fields", () => {
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    const commas = icsForEvent(
      { title: "A, B; C\\D", start, end },
      "x@y"
    );
    expect(commas).toContain("SUMMARY:A\\, B\\; C\\\\D");
  });

  it("omits optional fields it was not given", () => {
    const bare = icsForEvent({ title: "T", start, end }, "u@h");
    expect(bare).not.toContain("DESCRIPTION:");
    expect(bare).not.toContain("LOCATION:");
  });
});
