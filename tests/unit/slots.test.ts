import { describe, it, expect } from "vitest";
import {
  computeFreeSlots,
  mergeIntervals,
  sliceIntoSlots,
  slotIsOffered,
  subtractIntervals,
  windowsForDay,
  type SlotRules,
} from "@/lib/scheduling/slots";
import { kigaliTimeToInstant } from "@/lib/time";

/* 2026-03-05 is a Thursday (weekday 4); 2026-03-07 is a Saturday. */
const DAY = "2026-03-05";
const at = (hhmm: string, day = DAY) => kigaliTimeToInstant(day, hhmm);
const iv = (from: string, to: string, day = DAY) => ({ start: at(from, day), end: at(to, day) });
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

const WEEKDAYS_9_TO_5 = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start: "09:00",
  end: "17:00",
}));

const rules = (over: Partial<SlotRules> = {}): SlotRules => ({
  weekly: WEEKDAYS_9_TO_5,
  slotMinutes: 60,
  bufferMinutes: 0,
  leadTimeMinutes: 0,
  horizonDays: 30,
  maxPerDay: 0,
  blackouts: [],
  ...over,
});

/* a fixed "now" well before the test day, so lead time never interferes
   unless a test is specifically about it */
const NOW = at("08:00", "2026-03-01");

describe("mergeIntervals", () => {
  it("merges overlapping blocks", () => {
    const m = mergeIntervals([iv("09:00", "11:00"), iv("10:00", "12:00")]);
    expect(m).toHaveLength(1);
    expect(hhmm(m[0].end)).toBe("12:00");
  });

  it("merges touching blocks", () => {
    /* 09–10 and 10–11 are one busy stretch; treating them separately would
       invent a zero-length gap between them */
    expect(mergeIntervals([iv("09:00", "10:00"), iv("10:00", "11:00")])).toHaveLength(1);
  });

  it("keeps a genuine gap", () => {
    expect(mergeIntervals([iv("09:00", "10:00"), iv("11:00", "12:00")])).toHaveLength(2);
  });

  it("drops empty and inverted intervals", () => {
    expect(mergeIntervals([iv("09:00", "09:00"), iv("11:00", "10:00")])).toEqual([]);
  });
});

describe("subtractIntervals", () => {
  it("carves a hole in the middle", () => {
    const free = subtractIntervals([iv("09:00", "17:00")], [iv("12:00", "13:00")]);
    expect(free.map((f) => [hhmm(f.start), hhmm(f.end)])).toEqual([
      ["09:00", "12:00"],
      ["13:00", "17:00"],
    ]);
  });

  it("trims both edges", () => {
    const free = subtractIntervals(
      [iv("09:00", "17:00")],
      [iv("08:00", "10:00"), iv("16:00", "18:00")]
    );
    expect(free.map((f) => [hhmm(f.start), hhmm(f.end)])).toEqual([["10:00", "16:00"]]);
  });

  it("returns nothing when the whole span is busy", () => {
    expect(subtractIntervals([iv("09:00", "17:00")], [iv("08:00", "18:00")])).toEqual([]);
  });

  it("ignores busy blocks outside the span", () => {
    const free = subtractIntervals([iv("09:00", "12:00")], [iv("14:00", "15:00")]);
    expect(free).toHaveLength(1);
  });
});

describe("windowsForDay", () => {
  it("returns the rule for that weekday only", () => {
    const w = windowsForDay(DAY, WEEKDAYS_9_TO_5); // Thursday
    expect(w.map((x) => [hhmm(x.start), hhmm(x.end)])).toEqual([["09:00", "17:00"]]);
  });

  it("returns nothing on a day with no rule", () => {
    expect(windowsForDay("2026-03-07", WEEKDAYS_9_TO_5)).toEqual([]); // Saturday
  });

  it("keeps a lunch break as two windows", () => {
    const split = [
      { weekday: 4, start: "09:00", end: "12:00" },
      { weekday: 4, start: "14:00", end: "17:00" },
    ];
    expect(windowsForDay(DAY, split).map((x) => hhmm(x.start))).toEqual(["09:00", "14:00"]);
  });
});

describe("sliceIntoSlots", () => {
  it("cuts a window into back-to-back slots", () => {
    const slots = sliceIntoSlots([iv("09:00", "12:00")], 60, 0);
    expect(slots.map((s) => hhmm(s.start))).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("spaces slots by the buffer", () => {
    const slots = sliceIntoSlots([iv("09:00", "12:00")], 60, 30);
    expect(slots.map((s) => hhmm(s.start))).toEqual(["09:00", "10:30"]);
  });

  it("never emits a slot that overruns the window", () => {
    const slots = sliceIntoSlots([iv("09:00", "09:45")], 60, 0);
    expect(slots).toEqual([]);
  });
});

describe("computeFreeSlots", () => {
  it("offers the whole working day when nothing is booked", () => {
    const [day] = computeFreeSlots({ from: DAY, to: DAY, rules: rules(), busy: [], now: NOW });
    expect(day.slots).toHaveLength(8); // 09:00 → 17:00, hourly
    expect(hhmm(day.slots[0].start)).toBe("09:00");
    expect(hhmm(day.slots[7].end)).toBe("17:00");
  });

  it("removes a slot blocked by a Google busy block", () => {
    const [day] = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules(),
      busy: [iv("10:00", "11:00")],
      now: NOW,
    });
    expect(day.slots.map((s) => hhmm(s.start))).not.toContain("10:00");
    expect(day.slots).toHaveLength(7);
  });

  it("removes every slot a busy block touches, not just the aligned one", () => {
    /* a 10:30–11:30 meeting makes both the 10:00 and 11:00 hours unusable */
    const [day] = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules(),
      busy: [iv("10:30", "11:30")],
      now: NOW,
    });
    const starts = day.slots.map((s) => hhmm(s.start));
    expect(starts).not.toContain("10:00");
    expect(starts).not.toContain("11:00");
  });

  it("blocks a whole day with an all-day busy block", () => {
    /* the regression this guards: an all-day Google event parsed as UTC
       midnight would leave 09:00 and 10:00 Kigali bookable */
    const days = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules(),
      busy: [{ start: at("00:00"), end: at("23:59") }],
      now: NOW,
    });
    expect(days).toEqual([]);
  });

  it("applies the buffer around existing commitments", () => {
    const [day] = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules({ slotMinutes: 30, bufferMinutes: 30 }),
      busy: [iv("10:00", "10:30")],
      now: NOW,
    });
    const starts = day.slots.map((s) => hhmm(s.start));
    /* the buffer protects 09:30–11:00 around the 10:00 meeting */
    expect(starts).not.toContain("09:30");
    expect(starts).not.toContain("10:30");
  });

  it("honours the lead time", () => {
    /* "now" is 08:00 on the day itself, with 12 hours of required notice */
    const days = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules({ leadTimeMinutes: 720 }),
      busy: [],
      now: at("08:00"),
    });
    expect(days).toEqual([]);
  });

  it("trims only the too-soon part of today", () => {
    const [day] = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules({ leadTimeMinutes: 120 }),
      busy: [],
      now: at("09:00"),
    });
    /* 11:00 onwards survives; 09:00 and 10:00 do not */
    expect(hhmm(day.slots[0].start)).toBe("11:00");
  });

  it("stops at the booking horizon", () => {
    const days = computeFreeSlots({
      from: "2026-03-02",
      to: "2026-04-30",
      rules: rules({ horizonDays: 3 }),
      busy: [],
      now: at("08:00", "2026-03-02"),
    });
    expect(days.every((d) => d.day <= "2026-03-05")).toBe(true);
  });

  it("skips days with no availability rule", () => {
    const days = computeFreeSlots({
      from: "2026-03-07", // Saturday
      to: "2026-03-08", // Sunday
      rules: rules(),
      busy: [],
      now: NOW,
    });
    expect(days).toEqual([]);
  });

  it("respects a blackout", () => {
    const [day] = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules({ blackouts: [iv("09:00", "13:00")] }),
      busy: [],
      now: NOW,
    });
    expect(hhmm(day.slots[0].start)).toBe("13:00");
  });

  it("caps the number of slots offered per day", () => {
    const [day] = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules({ maxPerDay: 2 }),
      busy: [],
      now: NOW,
    });
    expect(day.slots).toHaveLength(2);
  });

  it("counts existing bookings against the daily cap", () => {
    const [day] = computeFreeSlots({
      from: DAY,
      to: DAY,
      rules: rules({ maxPerDay: 2 }),
      busy: [iv("09:00", "10:00")],
      now: NOW,
    });
    expect(day.slots).toHaveLength(1);
  });

  it("returns nothing when the host has no weekly rules", () => {
    expect(
      computeFreeSlots({ from: DAY, to: DAY, rules: rules({ weekly: [] }), busy: [], now: NOW })
    ).toEqual([]);
  });

  it("returns nothing for an inverted range", () => {
    expect(
      computeFreeSlots({ from: "2026-03-08", to: "2026-03-05", rules: rules(), busy: [], now: NOW })
    ).toEqual([]);
  });
});

describe("slotIsOffered", () => {
  const days = computeFreeSlots({ from: DAY, to: DAY, rules: rules(), busy: [], now: NOW });

  it("accepts an exact slot start", () => {
    expect(slotIsOffered(days, at("10:00"))).not.toBeNull();
  });

  it("rejects a time between slots", () => {
    /* the client must not be able to invent a 10:17 booking */
    expect(slotIsOffered(days, at("10:17"))).toBeNull();
  });

  it("rejects a time outside working hours", () => {
    expect(slotIsOffered(days, at("18:00"))).toBeNull();
  });
});
