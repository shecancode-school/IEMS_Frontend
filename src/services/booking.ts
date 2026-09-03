/* The PUBLIC booking API. Separate from services/admin.ts on purpose: these
   calls carry no `role`, so the fetch client attaches no bearer token — a
   visitor booking a facilitator is not signed in to anything. */

import { api } from "@/lib/client";

export type BookingHost = {
  slug: string;
  name: string;
  role: string;
  title: string | null;
  bio: string;
  avatarUrl: string | null;
  slotMinutes: number;
  online: boolean;
};

export type SlotDay = { day: string; slots: { start: string; end: string }[] };

export type SlotResponse = {
  slug: string;
  name: string;
  timezone: string;
  slotMinutes: number;
  from: string;
  to: string;
  days: SlotDay[];
  /* false when the host's Google calendar could not be read, so these times
     may clash with something we cannot see */
  complete: boolean;
};

export type CreatedBooking = {
  id: string;
  start: string;
  end: string;
  hostName: string;
  meetLink: string | null;
  cancelUrl: string;
};

export type CancelView = {
  id: string;
  hostName: string;
  hostTitle: string | null;
  requesterName: string;
  start: string;
  end: string;
  topic: string;
  status: string;
  meetLink: string | null;
};

export const bookingApi = {
  hosts: () => api<{ hosts: BookingHost[] }>("/api/book/hosts"),
  slots: (slug: string, from: string, to: string) =>
    api<SlotResponse>(`/api/book/${slug}/slots?from=${from}&to=${to}`),
  create: (
    slug: string,
    body: { name: string; email: string; phone?: string; topic?: string; start: string }
  ) => api<{ booking: CreatedBooking }>(`/api/book/${slug}`, { body }),
  cancelView: (token: string) => api<{ booking: CancelView }>(`/api/book/cancel/${token}`),
  cancel: (token: string) =>
    api<{ cancelled: boolean; alreadyCancelled?: boolean }>(`/api/book/cancel/${token}`, {
      body: {},
    }),
};
