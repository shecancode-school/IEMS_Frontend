import { describe, it, expect } from "vitest";
import {
  addDaysISO,
  dayRangeISO,
  eventDayISO,
  kigaliDayEnd,
  kigaliDayStart,
  kigaliHHmm,
  kigaliTimeToInstant,
  kigaliWeekday,
} from "@/lib/time";

/* Kigali is UTC+2 with no DST, so every assertion below is exact and stable
   regardless of the machine running the suite — which is the whole point of
   these helpers existing. */
describe("Kigali day windows", () => {
  it("starts a day at 22:00 UTC the previous day", () => {
    expect(kigaliDayStart("2026-03-05").toISOString()).toBe("2026-03-04T22:00:00.000Z");
  });

  it("ends a day one millisecond before the next", () => {
    expect(kigaliDayEnd("2026-03-05").toISOString()).toBe("2026-03-05T21:59:59.999Z");
  });

  it("does not depend on the host timezone", () => {
    /* the old implementation used new Date("…T00:00:00"), which parses local */
    const naive = new Date("2026-03-05T00:00:00");
    const correct = kigaliDayStart("2026-03-05");
    if (process.env.TZ === "UTC") expect(naive.getTime()).not.toBe(correct.getTime());
    expect(eventDayISO(correct)).toBe("2026-03-05");
    expect(eventDayISO(kigaliDayEnd("2026-03-05"))).toBe("2026-03-05");
  });

  it("round-trips a wall-clock time", () => {
    const t = kigaliTimeToInstant("2026-03-05", "14:30");
    expect(t.toISOString()).toBe("2026-03-05T12:30:00.000Z");
    expect(kigaliHHmm(t)).toBe("14:30");
  });

  it("reports midnight as 00:00, not 24:00", () => {
    expect(kigaliHHmm(kigaliDayStart("2026-03-05"))).toBe("00:00");
  });
});

describe("kigaliWeekday", () => {
  it("maps 0=Sunday through 6=Saturday", () => {
    expect(kigaliWeekday(kigaliDayStart("2026-03-01"))).toBe(0); // Sunday
    expect(kigaliWeekday(kigaliDayStart("2026-03-05"))).toBe(4); // Thursday
    expect(kigaliWeekday(kigaliDayStart("2026-03-07"))).toBe(6); // Saturday
  });

  it("uses the Kigali day, not the UTC one", () => {
    /* 2026-03-05T22:30Z is already Friday the 6th in Kigali */
    expect(kigaliWeekday("2026-03-05T22:30:00.000Z")).toBe(5);
  });
});

describe("day arithmetic", () => {
  it("rolls over months and years", () => {
    expect(addDaysISO("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysISO("2028-03-01", -1)).toBe("2028-02-29"); // leap year
  });

  it("builds an inclusive range", () => {
    expect(dayRangeISO("2026-03-05", "2026-03-08")).toEqual([
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ]);
    expect(dayRangeISO("2026-03-05", "2026-03-05")).toEqual(["2026-03-05"]);
    expect(dayRangeISO("2026-03-08", "2026-03-05")).toEqual([]);
  });
});
