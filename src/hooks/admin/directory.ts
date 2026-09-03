"use client";

import { useQuery } from "@tanstack/react-query";
import { directoryService } from "@/services/admin";
import { adminKeys } from "./keys";

export function useDirectory() {
  return useQuery({
    queryKey: adminKeys.directory,
    queryFn: () => directoryService.snapshot().then((d) => d.people),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
