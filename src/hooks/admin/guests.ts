"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { guestsService, downloadBlob, exportUrls, type GuestFilters } from "@/services/admin";
import type { GuestCreateValues, GuestEditValues } from "@/schemas/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useGuests(filters: GuestFilters = {}) {
  return useQuery({
    queryKey: adminKeys.guests(filters),
    queryFn: () => guestsService.list(filters).then((d) => d.guests),
    staleTime: 10_000,
  });
}

/* downloads exactly the rows the table is showing — same filters, same search */
export function useExportGuests() {
  return useMutation({
    mutationFn: (filters: GuestFilters = {}) => downloadBlob(exportUrls.guests(filters)),
    onSuccess: () => toast.success("Export downloaded"),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useGuest(id: string) {
  return useQuery({
    queryKey: adminKeys.guest(id),
    queryFn: () => guestsService.get(id),
    enabled: !!id,
  });
}

export function useCreateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GuestCreateValues) => guestsService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.guestsAll });
      toast.success("Guest added — ticket emailed");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUpdateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: GuestEditValues }) =>
      guestsService.update(vars.id, vars.body),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: adminKeys.guestsAll });
      qc.invalidateQueries({ queryKey: adminKeys.guest(vars.id) });
      toast.success("Guest updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => guestsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.guestsAll });
      toast.success("Guest deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
