/* Typed admin API service layer. Every function wraps the shared role-aware
   fetch client (src/lib/client.ts) with `role: "admin"`. UI code calls these
   through the TanStack Query hooks in src/hooks/admin. */

import { api } from "@/lib/client";
import type { CreatedBooking } from "@/services/booking";
import { bridgeGetToken } from "@/lib/authBridge";
import type {
  AdminEvent,
  EmailDetail,
  EmailLogRow,
  EmailReport,
  EmailTemplatePreview,
  SendPassResult,
  AdminGuest,
  AdminNotification,
  AdminParticipant,
  AdminStaff,
  AdminActivity,
  AuditRow,
  CalendarEventDetail,
  CalendarFeed,
  CalendarPerson,
  DirectoryPerson,
  AdminRole,
  Capability,
  AdminTicket,
  DashboardStats,
  EventStat,
  GuestProfile,
  ParticipantProfile,
} from "@/types/admin";
import type {
  EventCreateValues,
  EventUpdateBody,
  GuestCreateValues,
  GuestEditValues,
  ParticipantCreateValues,
  ParticipantEditValues,
  PlusOneAssignValues,
  StaffCreateValues,
  StaffEditValues,
} from "@/schemas/admin";
import type { EventEngagement, ReminderSummary } from "@/types/admin";

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/* ------------------------------------------------------------- Dashboard */
export const dashboardService = {
  stats: () => api<DashboardStats>("/api/admin/dashboard", { role: "admin" }),
  eventStats: () =>
    api<{ stats: EventStat[]; recentScans: { at: string; result: string }[] }>(
      "/api/admin/stats",
      { role: "admin" }
    ),
};

/* ---------------------------------------------------------------- Events */
export const eventsService = {
  /* one event, readable by any staff member — the calendar's detail panel.
     The list endpoint beside it is administrators only. */
  get: (id: string) =>
    api<{ event: CalendarEventDetail }>(`/api/admin/events/${id}`, { role: "admin" }),
  /* generate (or refresh) the Google Meet link for an online/hybrid event —
     created on the host's own calendar, which is why the event needs a host */
  generateMeet: (id: string) =>
    api<{ meetLink: string | null; pending: boolean; message?: string }>(
      `/api/admin/events/${id}/meet`,
      { role: "admin", method: "POST" }
    ),
  list: () => api<{ events: AdminEvent[] }>("/api/admin/events", { role: "admin" }),
  create: (body: EventCreateValues) =>
    api<{ event: { id: string; name: string; slug: string } }>("/api/admin/events", {
      role: "admin",
      body,
    }),
  update: (id: string, body: EventUpdateBody) =>
    api<{ event: Record<string, unknown> }>(`/api/admin/events/${id}`, {
      role: "admin",
      method: "PATCH",
      body,
    }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/api/admin/events/${id}`, { role: "admin", method: "DELETE" }),
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.set("image", file);
    return api<{ url: string; gallery: string[] }>(`/api/admin/events/${id}/poster`, {
      role: "admin",
      form,
    });
  },
  sendReminders: (id: string, message?: string) =>
    api<{ recipients: number; sent: number; failed: number }>(
      `/api/admin/events/${id}/reminders`,
      { role: "admin", body: message ? { message } : {} }
    ),
  stats: (id: string) =>
    api<EventEngagement>(`/api/admin/events/${id}/stats`, { role: "admin" }),
};

/* ---------------------------------------------------------- Participants */
export type ParticipantFilters = {
  stack?: string;
  status?: string;
  registrationStatus?: string;
  event?: string;
  q?: string;
  /** "none" = no plus-one invited yet, "has" = has one */
  plusOne?: string;
};

export const participantsService = {
  list: (f: ParticipantFilters = {}) =>
    api<{ attendees: AdminParticipant[] }>(`/api/admin/attendees${qs(f)}`, { role: "admin" }),
  get: (id: string) => api<ParticipantProfile>(`/api/admin/attendees/${id}`, { role: "admin" }),
  create: (body: ParticipantCreateValues) =>
    api<{ participant: { id: string; name: string; email: string } }>("/api/admin/attendees", {
      role: "admin",
      body,
    }),
  update: (id: string, body: ParticipantEditValues) =>
    api<{ participant: Record<string, unknown> }>(`/api/admin/attendees/${id}`, {
      role: "admin",
      method: "PATCH",
      body,
    }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/api/admin/attendees/${id}`, { role: "admin", method: "DELETE" }),
  revokePlusOne: (id: string) =>
    api<{ revoked: boolean }>(`/api/admin/attendees/${id}/plus-one`, {
      role: "admin",
      method: "DELETE",
    }),
  assignPlusOne: (id: string, body: PlusOneAssignValues) =>
    api<{ plusOne: { id: string; name: string; email: string; ticketCode?: string } }>(
      `/api/admin/attendees/${id}/plus-one`,
      { role: "admin", body }
    ),
};

/* ------------------------------------------------------------- Reminders */
export const remindersService = {
  runNow: () => api<ReminderSummary>("/api/admin/reminders/run", { role: "admin", method: "POST" }),
};

/* ---------------------------------------------------------------- Guests */
export type GuestFilters = { event?: string; type?: string; q?: string };

export const guestsService = {
  list: (f: GuestFilters = {}) =>
    api<{ guests: AdminGuest[] }>(`/api/admin/guests${qs(f)}`, { role: "admin" }),
  get: (id: string) => api<GuestProfile>(`/api/admin/guests/${id}`, { role: "admin" }),
  create: (body: GuestCreateValues) =>
    api<{ guest: { id: string; name: string; ticketCode?: string } }>("/api/admin/guests", {
      role: "admin",
      body: { ...body, eventId: body.eventId },
    }),
  update: (id: string, body: GuestEditValues) =>
    api<{ guest: Record<string, unknown> }>(`/api/admin/guests/${id}`, {
      role: "admin",
      method: "PATCH",
      body,
    }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/api/admin/guests/${id}`, { role: "admin", method: "DELETE" }),
};

/* --------------------------------------------------------------- Tickets */
export type TicketFilters = { event?: string; status?: string; q?: string };

export const ticketsService = {
  list: (f: TicketFilters = {}) =>
    api<{ tickets: AdminTicket[] }>(`/api/admin/tickets${qs(f)}`, { role: "admin" }),
  get: (id: string) =>
    api<{ ticket: AdminTicket; history: { at: string; result: string; scanner: string | null }[] }>(
      `/api/admin/tickets/${id}`,
      { role: "admin" }
    ),
  generate: (body: { participantId?: string; guestId?: string; email?: boolean }) =>
    api<{ ticket: AdminTicket }>("/api/admin/tickets", { role: "admin", body }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/api/admin/tickets/${id}`, { role: "admin", method: "DELETE" }),
  resend: (id: string) =>
    api<{ ticket: Record<string, unknown> }>(`/api/admin/tickets/${id}/resend`, {
      role: "admin",
      method: "POST",
    }),
  reset: (id: string) =>
    api<{ ticket: Record<string, unknown> }>(`/api/admin/tickets/${id}/reset`, {
      role: "admin",
      method: "POST",
    }),
  revoke: (id: string) =>
    api<{ ticket: Record<string, unknown> }>(`/api/admin/tickets/${id}/revoke`, {
      role: "admin",
      method: "POST",
    }),
  regenerateQr: (id: string) =>
    api<{ ticket: { id: string; ticketNumber: string }; qrDataUrl: string }>(
      `/api/admin/tickets/${id}/regenerate-qr`,
      { role: "admin", method: "POST" }
    ),
};

/* -------------------------------------------------------------- Calendar */
export type CalendarFilters = {
  from?: string;
  to?: string;
  people?: string[];
  sources?: string[];
  includeGoogle?: boolean;
};

export type DayFeed = CalendarFeed & {
  date: string;
  lanes: { person: CalendarPerson; items: CalendarFeed["items"] }[];
  unassigned: CalendarFeed["items"];
};

const calendarQuery = (f: CalendarFilters) =>
  qs({
    from: f.from,
    to: f.to,
    people: f.people?.length ? f.people.join(",") : undefined,
    sources: f.sources?.length ? f.sources.join(",") : undefined,
    includeGoogle: f.includeGoogle ? "1" : undefined,
  });

export const calendarService = {
  feed: (f: CalendarFilters = {}) =>
    api<CalendarFeed>(`/api/admin/calendar${calendarQuery(f)}`, { role: "admin" }),
  day: (date: string, includeGoogle = false) =>
    api<DayFeed>(`/api/admin/calendar/day${qs({ date, includeGoogle: includeGoogle ? "1" : undefined })}`, {
      role: "admin",
    }),
  mine: (f: CalendarFilters = {}) =>
    api<CalendarFeed>(
      `/api/admin/calendar/me${qs({
        from: f.from,
        to: f.to,
        includeGoogle: f.includeGoogle === false ? "0" : undefined,
      })}`,
      { role: "admin" }
    ),
  people: () =>
    api<{ people: (CalendarPerson & { isYou: boolean })[] }>("/api/admin/calendar/people", {
      role: "admin",
    }),
  /* a long-lived subscription URL for Google Calendar / Outlook */
  icsUrl: () =>
    api<{ url: string; webcalUrl: string }>("/api/calendar/ics", { role: "admin" }),
};

export const directoryService = {
  snapshot: () => api<{ people: DirectoryPerson[] }>("/api/admin/directory", { role: "admin" }),
};

export type ActivityCreateBody = {
  title: string;
  description?: string;
  type: string;
  start: string;
  end: string;
  mode: string;
  location?: string;
  visibility: string;
  attendees?: { email: string; name: string }[];
  eventId?: string;
  ownerId?: string;
};

export const activitiesService = {
  list: (f: { from?: string; to?: string; owner?: string; type?: string } = {}) =>
    api<{ activities: AdminActivity[] }>(`/api/admin/activities${qs(f)}`, { role: "admin" }),
  get: (id: string) =>
    api<{ activity: AdminActivity }>(`/api/admin/activities/${id}`, { role: "admin" }),
  create: (body: ActivityCreateBody) =>
    api<{ activity: AdminActivity; warning: string | null }>("/api/admin/activities", {
      role: "admin",
      body,
    }),
  update: (id: string, body: Partial<ActivityCreateBody>) =>
    api<{ activity: AdminActivity }>(`/api/admin/activities/${id}`, {
      role: "admin",
      method: "PATCH",
      body,
    }),
  cancel: (id: string) =>
    api<{ cancelled: boolean }>(`/api/admin/activities/${id}`, {
      role: "admin",
      method: "DELETE",
    }),
};

/* ---------------------------------------------------------- Availability */
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

export const availabilityService = {
  get: () =>
    api<{ availability: AvailabilityView }>("/api/admin/availability", { role: "admin" }),
  save: (body: AvailabilityView) =>
    api<{ availability: AvailabilityView }>("/api/admin/availability", {
      role: "admin",
      method: "PUT",
      body,
    }),
};

/* -------------------------------------------------------------- Bookings */
export type AdminBooking = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  topic: string;
  start: string;
  end: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  meetLink: string | null;
  source: "PUBLIC" | "ADMIN";
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
};

/* One booking, with the requester's details — GET /api/admin/bookings/:id.
   Only the host and an administrator can read it; everyone else sees the
   anonymous busy block the calendar feed already gives them. */
export type AdminBookingDetail = AdminBooking & {
  hostId: string;
  hostName: string | null;
  /* null when the host has stopped taking bookings — the panel uses it to
     fetch open times, so no slug means no reschedule */
  hostSlug: string | null;
};

export const bookingsService = {
  get: (id: string) =>
    api<{ booking: AdminBookingDetail }>(`/api/admin/bookings/${id}`, { role: "admin" }),
  /* move a booking to another time. The slot is re-checked server-side against
     the host's live availability, exactly as a new booking is. */
  reschedule: (id: string, start: string) =>
    api<{ booking: { id: string; start: string; end: string; hostName: string; meetLink: string | null } }>(
      `/api/admin/bookings/${id}`,
      { role: "admin", method: "PATCH", body: { start } }
    ),
  list: (f: { status?: string; host?: string; from?: string; to?: string } = {}) =>
    api<{ hostName: string | null; bookings: AdminBooking[] }>(
      `/api/admin/bookings${qs(f)}`,
      { role: "admin" }
    ),
  cancel: (id: string) =>
    api<{ cancelled: boolean }>(`/api/admin/bookings/${id}`, {
      role: "admin",
      method: "DELETE",
    }),
  /* book on someone's behalf — the walk-in at the desk. The slot is
     re-validated server-side against the host's live availability. */
  create: (body: {
    slug: string;
    name: string;
    email: string;
    phone?: string;
    topic?: string;
    start: string;
  }) => api<{ booking: CreatedBooking }>("/api/admin/bookings", { role: "admin", body }),
};

/* -------------------------------------------------------------- API keys */
export type AdminApiKey = {
  id: string;
  label: string;
  organisation: string;
  contactName: string;
  contactEmail: string;
  website: string;
  purpose: string;
  keyPrefix: string | null;
  scopes: string[];
  status: "PENDING" | "ACTIVE" | "REVOKED" | "REJECTED";
  rateLimitPerMinute: number;
  approvedBy: string | null;
  approvedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
};

export const apiKeysService = {
  list: (status?: string) =>
    api<{ keys: AdminApiKey[] }>(`/api/admin/api-keys${qs({ status })}`, { role: "admin" }),
  /* the only response that ever contains the raw key */
  approve: (id: string, opts: { rateLimitPerMinute?: number; scopes?: string[] } = {}) =>
    api<{
      key: string;
      keyPrefix: string;
      scopes: string[];
      rateLimitPerMinute: number;
      warning: string;
    }>(`/api/admin/api-keys/${id}/approve`, {
      role: "admin",
      body: {
        ...(opts.rateLimitPerMinute ? { rateLimitPerMinute: opts.rateLimitPerMinute } : {}),
        ...(opts.scopes?.length ? { scopes: opts.scopes } : {}),
      },
    }),
  revoke: (id: string, reason?: string) =>
    api<{ revoked: boolean }>(`/api/admin/api-keys/${id}/revoke`, {
      role: "admin",
      body: reason ? { reason } : {},
    }),
};

/* ---------------------------------------------------------------- Google */
export type GoogleStatus = {
  available: boolean;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
  scopes: string[];
  status: string | null;
  lastError: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
};

export const googleService = {
  status: () => api<GoogleStatus>("/api/admin/google/status", { role: "admin" }),
  /* returns the consent URL rather than redirecting, because a top-level
     navigation would not carry the bearer token — see the connect route */
  connect: () =>
    api<{ authUrl: string }>("/api/admin/google/connect", { role: "admin", method: "POST" }),
  disconnect: () =>
    api<{ disconnected: boolean }>("/api/admin/google/disconnect", {
      role: "admin",
      method: "DELETE",
    }),
};

/* ----------------------------------------------------------------- Staff */
export type StaffRow = AdminStaff & { googleConnected: boolean };

export type AdminIdentity = {
  admin: {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
    title: string | null;
    /* the Google profile picture, refreshed at each sign-in */
    photoUrl: string | null;
    bio: string | null;
    /* gate duty, granted by an administrator */
    canScan: boolean;
    active: boolean;
    lastSignInAt: string | null;
  };
  capabilities: Capability[];
  google: { connected: boolean; email: string | null; status: string | null };
};

export const meService = {
  /* Authoritative identity, read from the session cookie. Nothing is cached
     client-side any more, so this is the only way to know who you are — and
     it is what makes a promotion, a demotion or a revoked scan grant visible
     without signing out and back in. */
  get: () => api<AdminIdentity>("/api/auth/staff/session", { role: "admin" }),
};

export const staffService = {
  list: () => api<{ staff: StaffRow[] }>("/api/admin/staff", { role: "admin" }),
  create: (body: StaffCreateValues) =>
    api<{ staff: { id: string; name: string; email: string; role: AdminRole } }>(
      "/api/admin/staff",
      { role: "admin", body }
    ),
  update: (id: string, body: StaffEditValues) =>
    api<{ staff: Record<string, unknown> }>(`/api/admin/staff/${id}`, {
      role: "admin",
      method: "PATCH",
      body,
    }),
  deactivate: (id: string) =>
    api<{ deactivated: boolean }>(`/api/admin/staff/${id}`, { role: "admin", method: "DELETE" }),
};

/* -------------------------------------------------------- Notifications */
export const notificationsService = {
  list: () =>
    api<{ notifications: AdminNotification[]; unread: number }>("/api/admin/notifications", {
      role: "admin",
    }),
  markRead: (ids?: string[]) =>
    api<{ unread: number }>("/api/admin/notifications", {
      role: "admin",
      method: "PATCH",
      body: ids ? { ids } : {},
    }),
};

/* ---------------------------------------------------------------- Audit */
export const auditService = {
  list: (filters: { category?: string; q?: string } = {}) =>
    api<{ logs: AuditRow[] }>(`/api/admin/audit${qs({ ...filters, limit: "100" })}`, {
      role: "admin",
    }),
};

/* ---------------------------------------------------------------- Emails */
export const emailsService = {
  report: (filters: { kind?: string; status?: string } = {}) =>
    api<{ report: EmailReport; logs: EmailLogRow[] }>(`/api/admin/emails${qs(filters)}`, {
      role: "admin",
    }),
  templates: () =>
    api<{ templates: EmailTemplatePreview[] }>("/api/admin/emails/templates", { role: "admin" }),
  detail: (id: string) =>
    api<{ email: EmailDetail }>(`/api/admin/emails/${id}`, { role: "admin" }),
  sendPasses: (participantIds: string[]) =>
    api<SendPassResult>("/api/admin/emails/send", { role: "admin", body: { participantIds } }),
};

/* Export endpoints take exactly the filters the matching list view has active,
   so a download is always "what I'm looking at". */
export const exportUrls = {
  participants: (f: ParticipantFilters = {}) => `/api/admin/attendees/export${qs(f)}`,
  guests: (f: GuestFilters = {}) => `/api/admin/guests/export${qs(f)}`,
  tickets: (f: TicketFilters = {}) => `/api/admin/tickets/export${qs(f)}`,
};

/* Raw binary download (CSV/PDF) — the JSON api() helper can't stream blobs, so
   we fetch with the admin bearer token and save the response as a file. When no
   filename is given the server's Content-Disposition wins. */
export async function downloadBlob(path: string, filename?: string): Promise<void> {
  const token = bridgeGetToken("admin");
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((d) => (d as { error?: string }).error)
      .catch(() => null);
    throw new Error(message || "Download failed");
  }
  const suggested = /filename="?([^"]+)"?/.exec(
    res.headers.get("content-disposition") ?? ""
  )?.[1];
  filename = filename ?? suggested ?? "export.csv";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
