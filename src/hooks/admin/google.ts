"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { googleService } from "@/services/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useGoogleStatus() {
  return useQuery({
    queryKey: adminKeys.googleStatus,
    queryFn: () => googleService.status(),
    staleTime: 30_000,
  });
}

export function useConnectGoogle() {
  return useMutation({
    mutationFn: () => googleService.connect(),
    /* leaving the app is the success case, so there is no onSuccess toast —
       the user is already on Google's consent screen by the time it would show */
    onSuccess: (data) => window.location.assign(data.authUrl),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => googleService.disconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.googleStatus });
      qc.invalidateQueries({ queryKey: adminKeys.me });
      toast.success("Google Calendar disconnected");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
