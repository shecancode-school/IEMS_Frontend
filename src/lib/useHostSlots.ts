"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./useEvents";

/* "Is this person free?" for one day, straight from the public booking API.

   It is its own query rather than part of the events feed because the answer
   is live: a slot taken thirty seconds ago must stop being offered, whereas
   the events feed is happily cached for a minute. Keying on the day means
   clicking around the month reuses days already fetched. */

export type HostSlot = { start: string; end: string };

export type HostDaySlots = {
  slug: string;
  name: string;
  slotMinutes: number;
  slots: HostSlot[];
  /* false when their Google calendar could not be read, so these times may
     clash with something the server cannot see. Say so rather than implying
     the list is authoritative. */
  complete: boolean;
};

type SlotsResponse = {
  slug: string;
  name: string;
  slotMinutes: number;
  days: { day: string; slots: HostSlot[] }[];
  complete: boolean;
};

export function useHostSlots(slug: string | null, dayISO: string | null) {
  return useQuery({
    queryKey: ["host-slots", slug, dayISO],
    enabled: Boolean(slug && dayISO),
    /* short: availability is the one thing on this page that goes stale in
       seconds, because somebody else may be booking the same slot */
    staleTime: 15_000,
    queryFn: async (): Promise<HostDaySlots> => {
      const { data } = await apiClient.get<SlotsResponse>(`/book/${slug}/slots`, {
        params: { from: dayISO, to: dayISO },
      });
      return {
        slug: data.slug,
        name: data.name,
        slotMinutes: data.slotMinutes,
        slots: data.days.find((d) => d.day === dayISO)?.slots ?? [],
        complete: data.complete,
      };
    },
  });
}
