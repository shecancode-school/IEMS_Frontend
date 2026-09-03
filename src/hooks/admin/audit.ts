"use client";

import { useQuery } from "@tanstack/react-query";
import { auditService } from "@/services/admin";
import { adminKeys } from "./keys";

export function useAuditLog(filters: { category?: string; q?: string } = {}) {
  return useQuery({
    queryKey: adminKeys.audit(filters),
    queryFn: () => auditService.list(filters).then((d) => d.logs),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
