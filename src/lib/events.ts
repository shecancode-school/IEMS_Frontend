/* IRO's real program areas, per igirerwanda.org */
export type EventCategory =
  | "SheCanCODE"
  | "Entrepreneurship"
  | "Web Fundamentals"
  | "Advanced Backend"
  | "Advanced Frontend"
  | "Mentorship";

export type VenueEvent = {
  id: string;
  title: string;
  category: EventCategory;
  /** ISO date, e.g. "2026-07-18" — places the event on the calendar grid */
  date: string;
  time: string;
  /** when it wraps up, e.g. "9:00 PM"; empty when the event has no end time */
  endTime: string;
  /** full ISO datetimes — drive the live countdown on the featured card */
  startsAt: string;
  endsAt: string | null;
  space: string;
  price: string;
  /** one-liner on what the session is about, shown on the hero card */
  description: string;
  /** the format the session takes (WORKSHOP, BOOTCAMP, …) */
  type: string;
  /** who is running the session */
  organiser: string;
  /** promo poster (Cloudinary) — featured card art + hero background */
  posterUrl: string;
  /** every uploaded image for the event */
  gallery: string[];
  /** OPEN events are taking registrations right now */
  status: "OPEN" | "CLOSED";
  /** terms & conditions the attendee must accept before getting a ticket */
  rules: string[];
  soldOut?: boolean;
  /** max attendees (0 = uncapped) */
  capacity: number;
  /** slots already reserved */
  registeredParticipants: number;
  /** slots left, or null when uncapped */
  remainingSlots: number | null;
  isFull: boolean;
  /** clock+capacity lifecycle: Upcoming | Ongoing | Completed | Full */
  lifecycleStatus: "Upcoming" | "Ongoing" | "Completed" | "Full";
};

export const CATEGORIES: EventCategory[] = [
  "SheCanCODE",
  "Entrepreneurship",
  "Web Fundamentals",
  "Advanced Backend",
  "Advanced Frontend",
  "Mentorship",
];

/* IRO brand family — greens and burnt oranges pulled from the logo */
export const CATEGORY_COLORS: Record<EventCategory, string> = {
  SheCanCODE: "#f59300",
  Entrepreneurship: "#e2603a",
  "Web Fundamentals": "#d4b458",
  "Advanced Backend": "#7cc35a",
  "Advanced Frontend": "#a9d4a0",
  Mentorship: "#ffffff",
};

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function nextEvent(events: VenueEvent[]): VenueEvent | undefined {
  const t = todayIso();
  return [...events]
    .filter((e) => e.date >= t)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}
