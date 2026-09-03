"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { meService, staffService } from "@/services/admin";
import type { StaffCreateValues, StaffEditValues } from "@/schemas/admin";
import { can, type Capability } from "@/types/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

/* The signed-in staff member, straight from the server. The console caches
   name/role in localStorage at login; this is what makes a promotion or
   demotion visible without forcing a re-login. */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: adminKeys.me,
    queryFn: () => meService.get(),
    enabled,
    staleTime: 60_000,
  });
}

/* Capability check backed by the server's answer, falling back to the cached
   role carried in the session until /api/auth/staff/session resolves. Nav
   gating only — every
   route re-checks server-side, so a stale client answer can't grant access. */
export function useCan(cachedRole?: string, enabled = true) {
  const { data } = useMe(enabled);
  const caps = data?.capabilities;
  return (cap: Capability): boolean =>
    caps ? caps.includes(cap) : can(cachedRole, cap);
}

export function useStaff(enabled = true) {
  return useQuery({
    queryKey: adminKeys.staff,
    queryFn: () => staffService.list().then((d) => d.staff),
    enabled,
    staleTime: 15_000,
  });
}

export function useStaffMember(id: string) {
  const q = useStaff();
  return { ...q, data: q.data?.find((s) => s.id === id) };
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffCreateValues) => staffService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.staff });
      toast.success("Staff account created");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: StaffEditValues }) =>
      staffService.update(vars.id, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.staff });
      /* a role change to yourself must refresh your own capabilities too */
      qc.invalidateQueries({ queryKey: adminKeys.me });
      toast.success("Staff account updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeactivateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => staffService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.staff });
      toast.success("Staff account deactivated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
