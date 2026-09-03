"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscribeEventsFeed } from "@/lib/liveStream";
import { toast } from "sonner";
import {
  activitiesService,
  calendarService,
  eventsService,
  type ActivityCreateBody,
  type CalendarFilters,
} from "@/services/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useCalendar(filters: CalendarFilters, enabled = true) {
  return useQuery({
    queryKey: adminKeys.calendar(filters),
    queryFn: () => calendarService.feed(filters),
    enabled: enabled && Boolean(filters.from && filters.to),
    /* Google is read live behind a 60s server cache, so anything shorter here
       just re-renders the same answer */
    staleTime: 30_000,
  });
}

export function useMyCalendar(filters: CalendarFilters, enabled = true) {
  return useQuery({
    queryKey: adminKeys.myCalendar(filters),
    queryFn: () => calendarService.mine(filters),
    enabled: enabled && Boolean(filters.from && filters.to),
    staleTime: 30_000,
  });
}

export function useCalendarDay(date: string, includeGoogle = false) {
  return useQuery({
    queryKey: adminKeys.calendarDay(`${date}|${includeGoogle}`),
    queryFn: () => calendarService.day(date, includeGoogle),
    enabled: Boolean(date),
    staleTime: 30_000,
  });
}

export function useCalendarPeople() {
  return useQuery({
    queryKey: adminKeys.calendarPeople,
    queryFn: () => calendarService.people().then((d) => d.people),
    staleTime: 5 * 60_000,
  });
}

/* fetched on demand — the token is long-lived, so we only mint one when
   somebody actually asks for their subscription link */
export function useIcsUrl(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "ics-url"],
    queryFn: () => calendarService.icsUrl(),
    enabled,
    staleTime: Infinity,
  });
}

/* One event, read on its own rather than picked out of the administrators-only
   list — GET /api/admin/events/:id is requireStaff, so a facilitator opening an
   event on the calendar actually sees it. */
export function useCalendarEvent(id: string | null) {
  return useQuery({
    queryKey: adminKeys.event(id ?? ""),
    queryFn: () => eventsService.get(id!).then((d) => d.event),
    enabled: Boolean(id),
  });
}

export function useActivity(id: string | null) {
  return useQuery({
    queryKey: adminKeys.activities({ id: id ?? undefined }),
    queryFn: () => activitiesService.get(id!).then((d) => d.activity),
    enabled: Boolean(id),
  });
}

/* Live calendar, no refresh button.

   Every calendar write — an activity created or cancelled, a booking taken or
   released, an event's Meet link generated — already calls
   publishContentChange("calendar"), and /api/events/stream already relays that
   to anyone listening. Nothing on the admin side was listening, which is why
   the board only changed when you reloaded it.

   That stream is deliberately reused rather than a new authenticated one being
   added: it carries a bare {scope} and no calendar content at all, so it tells
   a listener *that* something changed and nothing about what. The refetch it
   triggers goes through the normal authenticated calendar endpoint, which is
   where the permission checks live. */
export function useLiveCalendar() {
  const qc = useQueryClient();
  const invalidate = useInvalidateCalendar();
  useEffect(
    () =>
      subscribeEventsFeed((scope) => {
        /* Every frame refetches the board, including "events" ones.

           That scope used to be filtered out here, on the reading that events
           are a different feature. They are not: an event is a chip on this
           calendar, so an event created or moved anywhere in the console was
           invisible on the board until somebody reloaded the page — the exact
           thing this hook exists to prevent. A null scope is a frame we could
           not parse, and is treated the same way rather than risking a board
           that has silently stopped updating. */
        invalidate();
        if (scope !== "calendar") qc.invalidateQueries({ queryKey: adminKeys.events });
      }),
    [invalidate, qc]
  );
}

/* every calendar surface is derived from the same writes, so one helper keeps
   the invalidation list in a single place. Exported because the booking
   mutations live in availability.ts and have to fan out the same way. */
export function useInvalidateCalendar() {
  const qc = useQueryClient();
  /* stable: useLiveCalendar depends on it, and a fresh closure every render
     would tear down and reopen the subscription on every render */
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: adminKeys.calendarAll });
    qc.invalidateQueries({ queryKey: ["admin", "my-calendar"] });
    qc.invalidateQueries({ queryKey: ["admin", "calendar-day"] });
    qc.invalidateQueries({ queryKey: adminKeys.activitiesAll });
    qc.invalidateQueries({ queryKey: adminKeys.bookingsAll });
  }, [qc]);
}

export function useCreateActivity() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: ActivityCreateBody) => activitiesService.create(body),
    onSuccess: (data) => {
      invalidate();
      toast.success("Activity scheduled");
      /* a missing Meet link is not a failure, but the person needs to know */
      if (data.warning) toast.warning(data.warning);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUpdateActivity() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<ActivityCreateBody> }) =>
      activitiesService.update(vars.id, vars.body),
    onSuccess: () => {
      invalidate();
      toast.success("Activity updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useCancelActivity() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (id: string) => activitiesService.cancel(id),
    onSuccess: () => {
      invalidate();
      toast.success("Activity cancelled");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
