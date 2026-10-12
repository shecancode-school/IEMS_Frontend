"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import {
  persistAdmin,
  persistScanner,
  clearAdmin,
  clearScanner,
} from "@/lib/authStorage";
import { useAppDispatch } from "@/store/hooks";
import { setSession, clearSession, patchUser, type Role } from "@/store/authSlice";

/* Server-sync auth hooks. Each mutation talks to the API, then dispatches the
   resulting session into Redux (the single source of truth) and, for the
   long-lived roles, persists it to localStorage. */

export function useAdminLogin() {
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api<{ accessToken: string; admin: { role: string; name: string } }>("/api/admin/login", {
        body: vars,
      }),
    onSuccess: (data) => {
      const user = { role: data.admin.role, name: data.admin.name };
      persistAdmin(data.accessToken, user);
      dispatch(setSession({ role: "admin", token: data.accessToken, user }));
    },
  });
}

export function useScannerLogin() {
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api<{ accessToken: string; scanner: { name: string; email: string } }>("/api/scanner/login", {
        body: vars,
      }),
    onSuccess: (data) => {
      const user = { name: data.scanner.name, email: data.scanner.email };
      persistScanner(data.accessToken, user);
      dispatch(setSession({ role: "scanner", token: data.accessToken, user }));
    },
  });
}

/* Participant magic-link request — no session yet, just an email sent. */
export function useParticipantLink() {
  return useMutation({
    mutationFn: (vars: { email: string; eventSlug?: string }) =>
      api<{ message: string }>("/api/auth/request-link", { body: vars }),
  });
}

/* Redeem the magic-link token: sets the refresh cookie + returns the access
   token, which we hold in Redux memory only. */
export function useParticipantVerify() {
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (vars: { token: string }) =>
      api<{ accessToken: string; expiresIn: number }>("/api/auth/verify", {
        body: vars,
        credentials: "include",
      }),
    onSuccess: (data) => {
      dispatch(setSession({ role: "participant", token: data.accessToken, user: null }));
    },
  });
}

/* Validate/refresh the participant identity from the server. */
export function useParticipantMe(enabled: boolean) {
  const dispatch = useAppDispatch();
  return useQuery({
    queryKey: ["auth", "participant", "me"],
    enabled,
    queryFn: async () => {
      const data = await api<{
        participant: { id: string; name: string; email: string; status: string };
      }>("/api/auth/me", { role: "participant" });
      dispatch(
        patchUser({
          role: "participant",
          user: {
            id: data.participant.id,
            name: data.participant.name,
            email: data.participant.email,
            status: data.participant.status,
          },
        })
      );
      return data.participant;
    },
  });
}

export function useLogout(role: Role) {
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: async () => {
      if (role === "participant") {
        await api("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
      }
    },
    onSuccess: () => {
      if (role === "admin") clearAdmin();
      if (role === "scanner") clearScanner();
      dispatch(clearSession({ role }));
    },
  });
}
