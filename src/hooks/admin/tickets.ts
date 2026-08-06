"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ticketsService,
  downloadBlob,
  exportUrls,
  type TicketFilters,
} from "@/services/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useTickets(filters: TicketFilters = {}) {
  return useQuery({
    queryKey: adminKeys.tickets(filters),
    queryFn: () => ticketsService.list(filters).then((d) => d.tickets),
    staleTime: 10_000,
  });
}

/* downloads exactly the rows the table is showing — same filters, same search */
export function useExportTickets() {
  return useMutation({
    mutationFn: (filters: TicketFilters = {}) => downloadBlob(exportUrls.tickets(filters)),
    onSuccess: () => toast.success("Export downloaded"),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/* the printable PDF pass for a single ticket */
export function useDownloadTicketPdf() {
  return useMutation({
    mutationFn: (id: string) => downloadBlob(`/api/tickets/${id}/download`),
    onSuccess: () => toast.success("Pass downloaded"),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: adminKeys.ticket(id),
    queryFn: () => ticketsService.get(id),
    enabled: !!id,
  });
}

export function useGenerateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { participantId?: string; guestId?: string; email?: boolean }) =>
      ticketsService.generate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.ticketsAll });
      toast.success("Ticket generated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/* one hook for the row actions, keyed by action name */
type TicketAction = "resend" | "reset" | "revoke" | "delete";
const LABEL: Record<TicketAction, string> = {
  resend: "Ticket resent",
  reset: "Ticket reset — new pass emailed",
  revoke: "Ticket revoked",
  delete: "Ticket deleted",
};

export function useTicketAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: TicketAction }): Promise<void> => {
      if (action === "resend") await ticketsService.resend(id);
      else if (action === "reset") await ticketsService.reset(id);
      else if (action === "revoke") await ticketsService.revoke(id);
      else await ticketsService.remove(id);
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: adminKeys.ticketsAll });
      qc.invalidateQueries({ queryKey: adminKeys.ticket(vars.id) });
      toast.success(LABEL[vars.action]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useRegenerateQr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ticketsService.regenerateQr(id),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: adminKeys.ticket(id) });
      toast.success("QR regenerated — old code invalidated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
