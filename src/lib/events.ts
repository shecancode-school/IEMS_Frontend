import { eventDayISO } from "./time";

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
  /* EVENT is a ticketed event people register for; ACTIVITY is a staff
     session (class, mentorship, office hours) published to the public
     calendar. Both share this shape so the whole public site — Nav, Hero,
     MonthCalendar — reads one feed and one cache. */
  kind: "EVENT" | "ACTIVITY";
  /* who is running it: the point of showing per-person timetables. Null on
     an event with no assigned host. */
  host: string | null;
  /* Their booking slug, when they take bookings — the calendar uses it both to
     group a person's items into "their" calendar and to offer a link to their
     open times. Null when nobody is assigned, or when the person is not
     bookable. It is a public slug, never an email or an internal id. */
  hostSlug: string | null;
  /* Activities have no programme category, so this is absent for them —
     every read must guard rather than index CATEGORY_COLORS blindly. */
  category: EventCategory | null;
  /* How you attend. Load-bearing for sessions: an ONLINE or HYBRID session is
     something you can ask to join remotely, an IN_PERSON one is somewhere you
     turn up. The site offers different actions for the two, so this has to
     reach the browser. It says nothing secret — the Meet link itself is still
     withheld from the public feed. */
  mode: "IN_PERSON" | "ONLINE" | "HYBRID" | null;
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

/* Staff sessions carry no programme category, so they get their own accent.

   It used to be "#a9d4a0" — the sage — which is the SAME value as the
   "Advanced Frontend" programme above it. So the one colour that was supposed
   to say "this is a drop-in session, not a ticketed event" was also the colour
   of a ticketed event, and the two were indistinguishable on the grid. This
   teal is not any of the six programme colours, and it stays clear of the
   orange the calendar reserves for today and selection. */
export const ACTIVITY_COLOR = "#5ec8c0";

/* One accessor for "what colour is this item", so nothing indexes
   CATEGORY_COLORS with a category that may legitimately be null. */
export function itemColor(item: Pick<VenueEvent, "kind" | "category">): string {
  if (item.kind === "ACTIVITY" || !item.category) return ACTIVITY_COLOR;
  return CATEGORY_COLORS[item.category];
}

/* What to print where a category label would go. */
export function itemCategoryLabel(item: Pick<VenueEvent, "kind" | "category" | "type">): string {
  if (item.category) return item.category;
  return item.kind === "ACTIVITY" ? (item.type || "Session") : "";
}

/* Ticketed events can be registered for; sessions are informational, so
   nothing on the public site should offer to open a ticket flow for one. */
export const isBookableEvent = (item: Pick<VenueEvent, "kind">) => item.kind !== "ACTIVITY";

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/* Today in KIGALI, not in the visitor's timezone.

   `event.date` is produced server-side with eventDayISO, so it is always a
   Kigali calendar day. Comparing it against the browser's local date meant a
   visitor west of UTC saw an event happening today in Kigali as already past
   — the calendar would quietly drop it hours before it started. */
export function todayIso(): string {
  return eventDayISO(new Date());
}

export function nextEvent(events: VenueEvent[]): VenueEvent | undefined {
  const t = todayIso();
  return [...events]
    .filter((e) => e.date >= t)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
}
