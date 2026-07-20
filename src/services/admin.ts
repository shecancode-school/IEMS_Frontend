/* Typed admin API service layer. Every function wraps the shared role-aware
   fetch client (src/lib/client.ts) with `role: "admin"`. UI code calls these
   through the TanStack Query hooks in src/hooks/admin. */

import { api } from "@/lib/client";
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
  AdminScanner,
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
  ScannerCreateValues,
  ScannerEditValues,
} from "@/schemas/admin";

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
};

/* ---------------------------------------------------------- Participants */
export type ParticipantFilters = {
  stack?: string;
  status?: string;
  registrationStatus?: string;
  event?: string;
  q?: string;
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
};

/* ---------------------------------------------------------------- Guests */
export const guestsService = {
  list: () => api<{ guests: AdminGuest[] }>("/api/admin/guests", { role: "admin" }),
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
export const ticketsService = {
  list: (f: { event?: string; status?: string } = {}) =>
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

/* -------------------------------------------------------------- Scanners */
export const scannersService = {
  list: () => api<{ scanners: AdminScanner[] }>("/api/admin/scanners", { role: "admin" }),
  create: (body: ScannerCreateValues) =>
    api<{ scanner: { id: string; name: string; email: string } }>("/api/admin/scanners", {
      role: "admin",
      body,
    }),
  update: (id: string, body: ScannerEditValues) =>
    api<{ scanner: Record<string, unknown> }>(`/api/admin/scanners/${id}`, {
      role: "admin",
      method: "PATCH",
      body,
    }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/api/admin/scanners/${id}`, { role: "admin", method: "DELETE" }),
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

/* Raw binary download (CSV/PDF) — the JSON api() helper can't stream blobs, so
   we fetch with the admin bearer token and hand back a Blob. */
export async function downloadBlob(path: string, filename: string): Promise<void> {
  const token = bridgeGetToken("admin");
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Download failed");
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
