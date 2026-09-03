import { describe, it, expect } from "vitest";
import {
  GRID_ROWS,
  addDays,
  addMonths,
  clampMonth,
  compareMonths,
  groupByDay,
  isoDay,
  monthLabel,
  monthMatrix,
  monthOf,
  weekOf,
  weekdayIndex,
} from "@/lib/calendarGrid";

describe("day arithmetic", () => {
  it("adds and subtracts days across a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  /* The bug this guards: `new Date("2026-09-02T00:00:00")` is parsed in the
     browser's timezone, so west of UTC every day shifts back by one and the
     whole grid is off. The helpers must be timezone-independent. */
  it("gives the same answer regardless of the process timezone", () => {
    const original = process.env.TZ;
    const results: string[] = [];
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      results.push(`${addDays("2026-09-02", 1)}|${weekdayIndex("2026-09-02")}`);
    }
    process.env.TZ = original;
    expect(new Set(results).size).toBe(1);
  });

  it("indexes weekdays from Monday", () => {
    expect(weekdayIndex("2026-08-31")).toBe(0); // Monday
    expect(weekdayIndex("2026-09-05")).toBe(5); // Saturday
    expect(weekdayIndex("2026-09-06")).toBe(6); // Sunday
  });
});

describe("month arithmetic", () => {
  it("rolls forward and backward over a year boundary", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 5 }, -18)).toEqual({ year: 2024, month: 11 });
  });

  it("orders and clamps months", () => {
    const min = { year: 2026, month: 3 };
    const max = { year: 2027, month: 2 };
    expect(compareMonths({ year: 2026, month: 4 }, min)).toBeGreaterThan(0);
    expect(clampMonth({ year: 2025, month: 0 }, min, max)).toEqual(min);
    expect(clampMonth({ year: 2030, month: 0 }, min, max)).toEqual(max);
    expect(clampMonth({ year: 2026, month: 8 }, min, max)).toEqual({ year: 2026, month: 8 });
  });

  it("reads a month off an ISO day and labels it", () => {
    expect(monthOf("2026-09-02")).toEqual({ year: 2026, month: 8 });
    expect(monthLabel({ year: 2026, month: 8 })).toBe("September 2026");
  });

  it("formats an ISO day with zero padding", () => {
    expect(isoDay(2026, 0, 5)).toBe("2026-01-05");
  });
});

describe("monthMatrix", () => {
  /* Six rows always: a five-week month and a six-week month must be the same
     height, or the page jumps every time the next-month arrow is pressed. */
  it("is always six rows, whatever the month's shape", () => {
    for (const [y, m] of [
      [2026, 1], // February 2026 starts on a Sunday — the awkward one
      [2026, 8],
      [2027, 4],
    ] as const) {
      expect(monthMatrix(y, m)).toHaveLength(GRID_ROWS * 7);
    }
  });

  it("starts on the Monday on or before the first of the month", () => {
    // 1 September 2026 is a Tuesday, so the grid opens on Monday the 31st
    const cells = monthMatrix(2026, 8);
    expect(cells[0].key).toBe("2026-08-31");
    expect(cells[0].inMonth).toBe(false);
    expect(cells[1].key).toBe("2026-09-01");
    expect(cells[1].inMonth).toBe(true);
  });

  it("marks exactly the days of the month as inMonth", () => {
    const cells = monthMatrix(2026, 8);
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0].key).toBe("2026-09-01");
    expect(inMonth[29].key).toBe("2026-09-30");
  });

  it("marks Saturday and Sunday as the weekend", () => {
    const cells = monthMatrix(2026, 8);
    expect(cells.filter((c) => c.weekend)).toHaveLength(GRID_ROWS * 2);
    expect(cells[5].weekend).toBe(true);
    expect(cells[6].weekend).toBe(true);
    expect(cells[4].weekend).toBe(false);
  });

  it("runs in an unbroken daily sequence", () => {
    const cells = monthMatrix(2027, 1);
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].key).toBe(addDays(cells[i - 1].key, 1));
    }
  });
});

describe("weekOf", () => {
  it("returns Monday through Sunday around any day in the week", () => {
    const fromWednesday = weekOf("2026-09-02");
    expect(fromWednesday[0]).toBe("2026-08-31");
    expect(fromWednesday[6]).toBe("2026-09-06");
    expect(weekOf("2026-09-06")).toEqual(fromWednesday); // Sunday belongs to the same week
    expect(weekOf("2026-08-31")).toEqual(fromWednesday); // so does its Monday
  });
});

describe("groupByDay", () => {
  it("buckets items by date, preserving their order", () => {
    const map = groupByDay([
      { id: "a", date: "2026-09-02" },
      { id: "b", date: "2026-09-03" },
      { id: "c", date: "2026-09-02" },
    ]);
    expect(map.get("2026-09-02")?.map((i) => i.id)).toEqual(["a", "c"]);
    expect(map.get("2026-09-03")?.map((i) => i.id)).toEqual(["b"]);
    expect(map.get("2026-09-04")).toBeUndefined();
  });

  it("is empty for an empty feed", () => {
    expect(groupByDay([]).size).toBe(0);
  });
});
