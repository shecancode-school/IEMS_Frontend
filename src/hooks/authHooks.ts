"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { useAppDispatch } from "@/store/hooks";
import { setSession, clearSession, patchUser, type Role } from "@/store/authSlice";

/* Server-sync auth hooks. Each mutation talks to the API, then dispatches the
   resulting session into Redux (the single source of truth).

   Staff no longer have a password login: they sign in with Google and the
   session is an httpOnly cookie, so there is nothing to persist client-side
   and nothing to dispatch a token for. */

export type StaffIdentity = {
  admin: {
    id: string;
    name: string;
    email: string;
    role: string;
    title: string | null;
    photoUrl: string | null;
    canScan: boolean;
  };
  capabilities: string[];
  google: { connected: boolean; email: string | null; status: string | null };
};

/* Restore the staff session from the cookie by asking the server who we are.
   This is the replacement for reading an identity out of localStorage. */
export async function fetchStaffSession(): Promise<StaffIdentity | null> {
  try {
    const res = await fetch("/api/auth/staff/session", { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as StaffIdentity;
  } catch {
    return null;
  }
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
      if (role === "admin") {
        /* the server has to clear the cookies — the browser cannot */
        await fetch("/api/auth/staff/signout", {
          method: "POST",
          credentials: "same-origin",
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      dispatch(clearSession({ role }));
      if (role === "admin") window.location.assign("/admin");
    },
  });
}
