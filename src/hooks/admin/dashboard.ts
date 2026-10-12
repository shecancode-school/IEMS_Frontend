"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dashboardService, notificationsService } from "@/services/admin";
import { adminKeys } from "./keys";
import { errorMessage } from "./util";

export function useDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: () => dashboardService.stats(),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useEventStats() {
  return useQuery({
    queryKey: adminKeys.eventStats,
    queryFn: () => dashboardService.eventStats(),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: adminKeys.notifications,
    queryFn: () => notificationsService.list(),
    staleTime: 10_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationsService.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.notifications }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
