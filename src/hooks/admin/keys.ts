import type {
  CalendarFilters,
  GuestFilters,
  ParticipantFilters,
  TicketFilters,
} from "@/services/admin";

/* Central query-key registry so mutations invalidate consistently. */
export const adminKeys = {
  dashboard: ["admin", "dashboard"] as const,
  eventStats: ["admin", "event-stats"] as const,

  events: ["admin", "events"] as const,
  /* one event read on its own, for the calendar's detail panel — not a slice
     of the admin-only list above */
  event: (id: string) => ["admin", "event", id] as const,
  eventEngagement: (id: string) => ["admin", "event-engagement", id] as const,

  participants: (f: ParticipantFilters = {}) => ["admin", "participants", f] as const,
  participantsAll: ["admin", "participants"] as const,
  participant: (id: string) => ["admin", "participant", id] as const,

  guests: (f: GuestFilters = {}) => ["admin", "guests", f] as const,
  guestsAll: ["admin", "guests"] as const,
  guest: (id: string) => ["admin", "guest", id] as const,

  tickets: (f: TicketFilters = {}) => ["admin", "tickets", f] as const,
  ticketsAll: ["admin", "tickets"] as const,
  ticket: (id: string) => ["admin", "ticket", id] as const,

  me: ["admin", "me"] as const,
  staff: ["admin", "staff"] as const,
  googleStatus: ["admin", "google-status"] as const,

  calendar: (f: CalendarFilters = {}) => ["admin", "calendar", f] as const,
  calendarAll: ["admin", "calendar"] as const,
  calendarDay: (date: string) => ["admin", "calendar-day", date] as const,
  myCalendar: (f: CalendarFilters = {}) => ["admin", "my-calendar", f] as const,
  calendarPeople: ["admin", "calendar-people"] as const,
  activities: (f: Record<string, string | undefined> = {}) => ["admin", "activities", f] as const,
  activitiesAll: ["admin", "activities"] as const,
  availability: ["admin", "availability"] as const,
  bookings: (f: Record<string, string | undefined> = {}) => ["admin", "bookings", f] as const,
  bookingsAll: ["admin", "bookings"] as const,
  booking: (id: string) => ["admin", "booking", id] as const,

  notifications: ["admin", "notifications"] as const,

  emails: (f: { kind?: string; status?: string } = {}) => ["admin", "emails", f] as const,
  emailTemplates: ["admin", "email-templates"] as const,
  email: (id: string) => ["admin", "email", id] as const,

  audit: (f: Record<string, string | undefined> = {}) => ["admin", "audit", f] as const,

  directory: ["admin", "directory"] as const,
  apiKeys: (status?: string) => ["admin", "api-keys", status ?? "all"] as const,
  apiKeysAll: ["admin", "api-keys"] as const,
};
