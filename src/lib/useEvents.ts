"use client";

import { useEffect } from "react";
import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { subscribeEventsFeed } from "@/lib/liveStream";
import type { VenueEvent } from "@/lib/events";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: { Accept: "application/json" },
});

async function fetchEvents(): Promise<VenueEvent[]> {
  const { data } = await apiClient.get<{ events: VenueEvent[] }>("/events");
  return data.events;
}

/* One shared cache entry — Nav, Hero and the calendar all read from it,
   so the page makes a single request for the whole events feed. The query
   client is persisted (see Providers), so a refresh paints the last-known
   events straight from cache; a shared SSE subscription then refetches the
   moment an admin changes any event. */
export function useEvents() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeEventsFeed(() => {
        queryClient.invalidateQueries({ queryKey: ["events"] });
      }),
    [queryClient]
  );
  return useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    staleTime: 60_000,
  });
}
