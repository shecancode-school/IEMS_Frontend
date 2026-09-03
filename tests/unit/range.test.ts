import { describe, it, expect } from "vitest";
import { monthEnd, monthStart, shiftAnchor, viewRange, weekStart } from "@/lib/scheduling/range";

describe("weekStart", () => {
  it("returns Monday for every day of the week", () => {
    /* 2026-03-02 is a Monday */
    for (let i = 0; i < 7; i++) {
      const day = `2026-03-0${2 + i}`;
      expect(weekStart(day)).toBe("2026-03-02");
    }
  });

  it("walks back across a month boundary", () => {
    /* 2026-03-01 is a Sunday, so its week starts in February */
    expect(weekStart("2026-03-01")).toBe("2026-02-23");
  });
});

describe("month bounds", () => {
  it("finds the last day of the month", () => {
    expect(monthEnd("2026-03-15")).toBe("2026-03-31");
    expect(monthEnd("2026-04-15")).toBe("2026-04-30");
    expect(monthEnd("2026-02-15")).toBe("2026-02-28");
    expect(monthEnd("2028-02-15")).toBe("2028-02-29");
  });

  it("finds the first", () => {
    expect(monthStart("2026-03-15")).toBe("2026-03-01");
  });
});

describe("viewRange", () => {
  it("day view is a single day", () => {
    expect(viewRange("day", "2026-03-05")).toEqual({ from: "2026-03-05", to: "2026-03-05" });
  });

  it("week view is Monday to Sunday", () => {
    expect(viewRange("week", "2026-03-05")).toEqual({ from: "2026-03-02", to: "2026-03-08" });
  });

  it("month view covers the leading and trailing grid days", () => {
    const r = viewRange("month", "2026-03-15");
    /* the 6-week grid shows late February and early April, so the feed must
       reach past the month itself or those cells render empty */
    expect(r.from < "2026-03-01").toBe(true);
    expect(r.to > "2026-03-31").toBe(true);
  });

  it("never exceeds the 92-day feed cap", () => {
    const r = viewRange("month", "2026-03-15");
    const days = (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 + 1;
    expect(days).toBeLessThanOrEqual(92);
  });
});

describe("shiftAnchor", () => {
  it("steps a day", () => {
    expect(shiftAnchor("day", "2026-03-05", 1)).toBe("2026-03-06");
    expect(shiftAnchor("day", "2026-03-01", -1)).toBe("2026-02-28");
  });

  it("steps a week", () => {
    expect(shiftAnchor("week", "2026-03-05", 1)).toBe("2026-03-12");
  });

  it("steps a month and lands on the first", () => {
    expect(shiftAnchor("month", "2026-03-15", 1)).toBe("2026-04-01");
    expect(shiftAnchor("month", "2026-01-15", -1)).toBe("2025-12-01");
  });
});
