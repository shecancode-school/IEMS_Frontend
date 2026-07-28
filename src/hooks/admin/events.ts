"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { eventsService } from "@/services/admin";
import type { EventCreateValues, EventUpdateBody } from "@/schemas/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useEvents() {
  return useQuery({
    queryKey: adminKeys.events,
    queryFn: () => eventsService.list().then((d) => d.events),
    staleTime: 15_000,
  });
}

/* single event, selected from the cached list (no dedicated GET endpoint) */
export function useEvent(id: string) {
  const q = useEvents();
  return { ...q, data: q.data?.find((e) => e.id === id) };
}

/* per-event engagement: reminder pool, plus-one split, emails-by-kind. Driven
   live by the admin SSE sync (check-ins, guest-adds, event edits); the interval
   is a fallback for changes that don't emit a socket event — e.g. a participant
   verifying or completing their own profile. */
export function useEventEngagement(id: string) {
  return useQuery({
    queryKey: adminKeys.eventEngagement(id),
    queryFn: () => eventsService.stats(id),
    enabled: !!id,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EventCreateValues) => eventsService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.events });
      toast.success("Event created");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: EventUpdateBody }) =>
      eventsService.update(vars.id, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.events });
      toast.success("Event updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eventsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.events });
      toast.success("Event deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUploadEventImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; file: File }) =>
      eventsService.uploadImage(vars.id, vars.file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.events });
      toast.success("Image added to gallery");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useSendReminders() {
  return useMutation({
    mutationFn: (vars: { id: string; message?: string }) =>
      eventsService.sendReminders(vars.id, vars.message),
    onSuccess: (r) => toast.success(`Sent to ${r.sent} of ${r.recipients}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
