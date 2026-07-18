"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { emailsService } from "@/services/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useEmailReport(filters: { kind?: string; status?: string } = {}) {
  return useQuery({
    queryKey: adminKeys.emails(filters),
    queryFn: () => emailsService.report(filters),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

/* templates only change with a deploy, but a long-lived admin tab should
   still pick those changes up — refetch after a minute, not never */
export function useEmailTemplates() {
  return useQuery({
    queryKey: adminKeys.emailTemplates,
    queryFn: () => emailsService.templates().then((d) => d.templates),
    staleTime: 60_000,
  });
}

export function useSendPassEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantIds: string[]) => emailsService.sendPasses(participantIds),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "emails"] });
      qc.invalidateQueries({ queryKey: adminKeys.participantsAll });
      if (r.failed === 0) toast.success(`Sent to all ${r.sent} recipient${r.sent === 1 ? "" : "s"}`);
      else toast.warning(`Sent ${r.sent} of ${r.requested} — ${r.failed} failed`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useEmailDetail(id: string | null) {
  return useQuery({
    queryKey: adminKeys.email(id ?? "none"),
    queryFn: () => emailsService.detail(id!).then((d) => d.email),
    enabled: Boolean(id),
  });
}
