"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiKeysService } from "@/services/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useApiKeys(status?: string) {
  return useQuery({
    queryKey: adminKeys.apiKeys(status),
    queryFn: () => apiKeysService.list(status).then((d) => d.keys),
    staleTime: 30_000,
  });
}

/* Approval is the only call that ever yields a raw key, so the caller has to
   do something with the result immediately — the page shows it once and there
   is no way to fetch it again. */
export function useApproveApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; rateLimitPerMinute?: number; scopes?: string[] }) =>
      apiKeysService.approve(vars.id, {
        rateLimitPerMinute: vars.rateLimitPerMinute,
        scopes: vars.scopes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.apiKeysAll });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      apiKeysService.revoke(vars.id, vars.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.apiKeysAll });
      toast.success("Access revoked");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
