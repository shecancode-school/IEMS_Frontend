import { describe, it, expect } from "vitest";
import { hourWindow, packLanes, placement } from "@/lib/scheduling/layout";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 2, 5, h, m)).toISOString();
const slot = (id: string, from: number, to: number) => ({ id, start: at(from), end: at(to) });

describe("packLanes", () => {
  it("gives non-overlapping items the same full-width lane", () => {
    const packed = packLanes([slot("a", 9, 10), slot("b", 11, 12)]);
    expect(packed.map((p) => [p.item.id, p.lane, p.laneCount])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  it("splits two overlapping items into side-by-side lanes", () => {
    const packed = packLanes([slot("a", 9, 11), slot("b", 10, 12)]);
    expect(packed.find((p) => p.item.id === "a")).toMatchObject({ lane: 0, laneCount: 2 });
    expect(packed.find((p) => p.item.id === "b")).toMatchObject({ lane: 1, laneCount: 2 });
  });

  it("reuses a lane once its occupant has finished", () => {
    const packed = packLanes([slot("a", 9, 10), slot("b", 9, 12), slot("c", 10, 11)]);
    /* c starts exactly when a ends, so it takes a's lane rather than a third */
    expect(packed.find((p) => p.item.id === "c")?.lane).toBe(0);
    expect(packed.every((p) => p.laneCount === 2)).toBe(true);
  });

  it("does not leak a lane count across unrelated clusters", () => {
    const packed = packLanes([
      slot("a", 9, 11),
      slot("b", 10, 12), // overlaps a → 2 lanes
      slot("c", 15, 16), // alone later in the day → full width
    ]);
    expect(packed.find((p) => p.item.id === "c")?.laneCount).toBe(1);
    expect(packed.find((p) => p.item.id === "a")?.laneCount).toBe(2);
  });

  it("handles an empty day", () => {
    expect(packLanes([])).toEqual([]);
  });
});

describe("placement", () => {
  const dayStart = new Date(Date.UTC(2026, 2, 5, 0, 0));

  it("positions an item inside the window", () => {
    const p = placement(slot("a", 12, 13), dayStart, 8, 20);
    /* 12:00 is a third of the way through an 8→20 window; one hour of twelve */
    expect(p?.topPct).toBeCloseTo(33.33, 1);
    expect(p?.heightPct).toBeCloseTo(8.33, 1);
  });

  it("clamps an item that runs past the last visible hour", () => {
    const p = placement(slot("a", 19, 23), dayStart, 8, 20);
    expect(p).not.toBeNull();
    expect((p?.topPct ?? 0) + (p?.heightPct ?? 0)).toBeCloseTo(100, 1);
  });

  it("drops an item entirely outside the window", () => {
    expect(placement(slot("a", 2, 3), dayStart, 8, 20)).toBeNull();
    expect(placement(slot("a", 21, 22), dayStart, 8, 20)).toBeNull();
  });

  it("keeps a very short item clickable", () => {
    const p = placement({ start: at(12), end: at(12, 5) }, dayStart, 8, 20);
    expect(p?.heightPct).toBeGreaterThanOrEqual(1.5);
  });
});

describe("hourWindow", () => {
  const day = new Date(Date.UTC(2026, 2, 5, 0, 0));

  it("falls back to the working day when there is nothing to show", () => {
    expect(hourWindow([], [day])).toEqual([7, 19]);
  });

  it("never narrows below the working day", () => {
    expect(hourWindow([slot("a", 10, 11)], [day])).toEqual([7, 19]);
  });

  it("widens to include an early start and a late finish", () => {
    expect(hourWindow([slot("a", 5, 6), slot("b", 20, 21)], [day])).toEqual([4, 22]);
  });

  it("stays inside a single day", () => {
    expect(hourWindow([slot("a", 0, 1), slot("b", 23, 24)], [day])).toEqual([0, 24]);
  });
});
