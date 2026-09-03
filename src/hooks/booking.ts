"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { bookingApi } from "@/services/booking";

/* Public booking hooks. No auth, no toasts — the public pages render their own
   inline messages rather than firing notifications at a first-time visitor. */

export function useBookingHosts() {
  return useQuery({
    queryKey: ["book", "hosts"],
    queryFn: () => bookingApi.hosts().then((d) => d.hosts),
    staleTime: 5 * 60_000,
  });
}

export function useSlots(slug: string, from: string, to: string) {
  return useQuery({
    queryKey: ["book", "slots", slug, from, to],
    queryFn: () => bookingApi.slots(slug, from, to),
    enabled: Boolean(slug && from && to),
    /* availability moves under you — a slot list older than a minute is a
       promise we might not be able to keep */
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateBooking(slug: string) {
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      phone?: string;
      topic?: string;
      start: string;
    }) => bookingApi.create(slug, body),
  });
}

export function useCancelView(token: string) {
  return useQuery({
    queryKey: ["book", "cancel", token],
    queryFn: () => bookingApi.cancelView(token).then((d) => d.booking),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useCancelBookingByToken(token: string) {
  return useMutation({ mutationFn: () => bookingApi.cancel(token) });
}
