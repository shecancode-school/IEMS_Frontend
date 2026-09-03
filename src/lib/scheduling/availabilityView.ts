import type { AvailabilityDoc } from "@/models/Availability";
import type { SlotRules } from "./slots";

export type AvailabilityView = {
  bookable: boolean;
  slug: string;
  headline: string;
  bio: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  leadTimeMinutes: number;
  horizonDays: number;
  maxPerDay: number;
  weekly: { weekday: number; start: string; end: string }[];
  blackouts: { start: string; end: string; reason: string }[];
};

export function availabilityView(a: AvailabilityDoc): AvailabilityView {
  return {
    bookable: a.bookable,
    slug: a.slug,
    headline: a.headline,
    bio: a.bio,
    timezone: a.timezone,
    slotMinutes: a.slotMinutes,
    bufferMinutes: a.bufferMinutes,
    leadTimeMinutes: a.leadTimeMinutes,
    horizonDays: a.horizonDays,
    maxPerDay: a.maxPerDay,
    weekly: a.weekly.map((w) => ({ weekday: w.weekday, start: w.start, end: w.end })),
    blackouts: a.blackouts.map((b) => ({
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      reason: b.reason ?? "",
    })),
  };
}

/* the subset the pure slot engine needs */
export function toSlotRules(a: AvailabilityDoc): SlotRules {
  return {
    weekly: a.weekly.map((w) => ({ weekday: w.weekday, start: w.start, end: w.end })),
    slotMinutes: a.slotMinutes,
    bufferMinutes: a.bufferMinutes,
    leadTimeMinutes: a.leadTimeMinutes,
    horizonDays: a.horizonDays,
    maxPerDay: a.maxPerDay,
    blackouts: a.blackouts.map((b) => ({ start: b.start, end: b.end })),
  };
}

/* "aline-uwase" from "Aline Uwase" — the public booking URL */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "staff"
  );
}
