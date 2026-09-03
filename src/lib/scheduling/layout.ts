/* Overlap layout for a time grid. Pure and side-effect free so it can be
   unit-tested without rendering anything.

   Two independent jobs:
     packLanes  — side-by-side columns for items that overlap in ONE person's
                  day (two meetings at 10:00 sit next to each other)
     placement  — turning an interval into top/height percentages inside a
                  visible hour window */

export type Placeable = { start: string | Date; end: string | Date };

export type Packed<T> = { item: T; lane: number; laneCount: number };

const ms = (v: string | Date) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/* Greedy interval-graph colouring. Items are swept in start order; each one
   takes the first lane whose previous occupant has already finished. A
   "cluster" of transitively-overlapping items shares one laneCount, so two
   items that overlap each other are half-width even if a third item elsewhere
   in the day is alone and full-width. */
export function packLanes<T extends Placeable>(items: T[]): Packed<T>[] {
  const sorted = [...items].sort((a, b) => ms(a.start) - ms(b.start) || ms(a.end) - ms(b.end));
  const out: Packed<T>[] = [];

  let cluster: Packed<T>[] = [];
  let clusterEnd = -Infinity;
  /* laneEnds[i] is when the item currently occupying lane i finishes */
  let laneEnds: number[] = [];

  const flush = () => {
    const width = laneEnds.length || 1;
    for (const p of cluster) out.push({ ...p, laneCount: width });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    const start = ms(item.start);
    const end = ms(item.end);

    /* nothing in the current cluster is still running — start a fresh one so
       the lane count doesn't leak across unrelated parts of the day */
    if (start >= clusterEnd) flush();

    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    cluster.push({ item, lane, laneCount: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();

  return out;
}

/* Position within a day column showing [windowStartHour, windowEndHour).
   Returns null for an item entirely outside the window; clamps one that only
   partly overlaps, so an event running past the last visible hour still shows
   up as reaching the bottom edge rather than vanishing. */
export function placement(
  item: Placeable,
  dayStart: Date,
  windowStartHour: number,
  windowEndHour: number
): { topPct: number; heightPct: number } | null {
  const spanMs = (windowEndHour - windowStartHour) * 3_600_000;
  if (spanMs <= 0) return null;

  const windowStart = dayStart.getTime() + windowStartHour * 3_600_000;
  const windowEnd = windowStart + spanMs;

  const start = Math.max(ms(item.start), windowStart);
  const end = Math.min(ms(item.end), windowEnd);
  if (end <= windowStart || start >= windowEnd) return null;

  const topPct = ((start - windowStart) / spanMs) * 100;
  /* a zero-length or very short item still needs to be clickable */
  const heightPct = Math.max(((end - start) / spanMs) * 100, 1.5);
  return { topPct, heightPct: Math.min(heightPct, 100 - topPct) };
}

/* The tightest hour window that still shows everything, padded by an hour on
   each side and never narrower than the working day. Keeps a calendar with one
   07:00 stand-up from rendering 24 mostly-empty rows. */
export function hourWindow(
  items: Placeable[],
  dayStarts: Date[],
  fallback: [number, number] = [7, 19]
): [number, number] {
  if (!items.length || !dayStarts.length) return fallback;

  /* The hour of padding belongs to the items, not to the fallback — widening
     the working day by an hour just because it is the default would show two
     empty rows on every ordinary week. */
  let earliest = Infinity;
  let latest = -Infinity;
  for (const item of items) {
    for (const day of dayStarts) {
      const startH = (ms(item.start) - day.getTime()) / 3_600_000;
      const endH = (ms(item.end) - day.getTime()) / 3_600_000;
      if (endH <= 0 || startH >= 24) continue;
      earliest = Math.min(earliest, Math.max(0, Math.floor(startH)));
      latest = Math.max(latest, Math.min(24, Math.ceil(endH)));
    }
  }
  if (earliest === Infinity) return fallback;

  return [
    Math.max(0, Math.min(fallback[0], earliest - 1)),
    Math.min(24, Math.max(fallback[1], latest + 1)),
  ];
}
