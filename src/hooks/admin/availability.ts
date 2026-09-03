"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { availabilityService, bookingsService, type AvailabilityView } from "@/services/admin";
import { useInvalidateCalendar } from "./calendar";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useAvailability() {
  return useQuery({
    queryKey: adminKeys.availability,
    queryFn: () => availabilityService.get().then((d) => d.availability),
    staleTime: 60_000,
  });
}

export function useSaveAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AvailabilityView) => availabilityService.save(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.availability });
      /* the bookable flag shows on the calendar roster too */
      qc.invalidateQueries({ queryKey: adminKeys.calendarPeople });
      toast.success("Availability saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useBookings(filters: { status?: string; host?: string } = {}) {
  return useQuery({
    queryKey: adminKeys.bookings(filters),
    queryFn: () => bookingsService.list(filters),
    staleTime: 15_000,
  });
}

/* One booking with the requester's details, for the calendar detail panel.
   The bookings board reads a list; a chip on the calendar knows only an id. */
export function useBooking(id: string | null) {
  return useQuery({
    queryKey: adminKeys.booking(id ?? ""),
    queryFn: () => bookingsService.get(id!).then((d) => d.booking),
    enabled: Boolean(id),
  });
}

export function useRescheduleBooking() {
  const qc = useQueryClient();
  const invalidateCalendar = useInvalidateCalendar();
  return useMutation({
    mutationFn: (vars: { id: string; start: string }) =>
      bookingsService.reschedule(vars.id, vars.start),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: adminKeys.booking(vars.id) });
      /* the slot it vacated becomes offerable and the one it took stops being
         offered, so the public slot lists have to go too */
      qc.invalidateQueries({ queryKey: ["admin", "book-slots"] });
      invalidateCalendar();
      toast.success("Booking moved — both sides have been emailed");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bookingsService.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.bookingsAll });
      qc.invalidateQueries({ queryKey: adminKeys.calendarAll });
      toast.success("Booking cancelled — we let them know by email");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
