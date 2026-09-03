import { describe, it, expect } from "vitest";
import { buildIcs } from "@/lib/calendar/ics";

const base = {
  uid: "test@iems",
  start: new Date("2026-03-05T12:00:00.000Z"),
  end: new Date("2026-03-05T13:00:00.000Z"),
  title: "Backend review",
};

describe("buildIcs", () => {
  it("produces a well-formed calendar", () => {
    const ics = buildIcs([base], "My schedule");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:test@iems");
  });

  it("uses CRLF line endings throughout", () => {
    /* some clients genuinely reject LF-only files */
    const ics = buildIcs([base], "My schedule");
    const bareLf = ics.split("\n").filter((l) => !l.endsWith("\r") && l !== "");
    expect(bareLf).toEqual([]);
  });

  it("writes times as UTC stamps", () => {
    const ics = buildIcs([base], "cal");
    expect(ics).toContain("DTSTART:20260305T120000Z");
    expect(ics).toContain("DTEND:20260305T130000Z");
  });

  it("escapes the structural characters", () => {
    const ics = buildIcs(
      [{ ...base, title: "Review; part 1, 2", description: "line one\nline two" }],
      "cal"
    );
    expect(ics).toContain("SUMMARY:Review\; part 1\\, 2");
    expect(ics).toContain("DESCRIPTION:line one\\nline two");
  });

  it("folds long lines to 75 octets with a leading space", () => {
    const ics = buildIcs([{ ...base, title: "x".repeat(200) }], "cal");
    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("\r\n x");
  });

  it("never splits a multi-byte character across a fold", () => {
    /* naive character-count folding corrupts UTF-8 here */
    const ics = buildIcs([{ ...base, title: "é".repeat(100) }], "cal");
    expect(ics).not.toContain("�");
    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
  });

  it("marks a cancelled event", () => {
    const ics = buildIcs([{ ...base, status: "CANCELLED" }], "cal");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("handles an empty calendar", () => {
    const ics = buildIcs([], "cal");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
