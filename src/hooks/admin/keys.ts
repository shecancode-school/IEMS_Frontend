import type { ParticipantFilters } from "@/services/admin";

/* Central query-key registry so mutations invalidate consistently. */
export const adminKeys = {
  dashboard: ["admin", "dashboard"] as const,
  eventStats: ["admin", "event-stats"] as const,

  events: ["admin", "events"] as const,

  participants: (f: ParticipantFilters = {}) => ["admin", "participants", f] as const,
  participantsAll: ["admin", "participants"] as const,
  participant: (id: string) => ["admin", "participant", id] as const,

  guests: ["admin", "guests"] as const,
  guest: (id: string) => ["admin", "guest", id] as const,

  tickets: (f: { event?: string; status?: string } = {}) => ["admin", "tickets", f] as const,
  ticketsAll: ["admin", "tickets"] as const,
  ticket: (id: string) => ["admin", "ticket", id] as const,

  scanners: ["admin", "scanners"] as const,

  notifications: ["admin", "notifications"] as const,

  emails: (f: { kind?: string; status?: string } = {}) => ["admin", "emails", f] as const,
  emailTemplates: ["admin", "email-templates"] as const,
  email: (id: string) => ["admin", "email", id] as const,
};
