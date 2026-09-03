"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
import { setToken, setSession, clearSession, COOKIE_SESSION, type Role } from "@/store/authSlice";
import { registerAuthBridge } from "@/lib/authBridge";
import {
  fetchStaffSession,
  useParticipantLink,
  useParticipantVerify,
  useParticipantMe,
  useLogout,
} from "@/hooks/authHooks";

/* default landing pages when a role is signed out */
const LOGIN_ROUTE: Record<Role, string> = {
  participant: "/",
  admin: "/admin",
};

type AuthContextValue = {
  /* false on the server and the first client render, true after mount. Both
     sessions are restored by asking the server, so auth-gated UI must wait for
     this to avoid an SSR/client hydration mismatch. */
  hydrated: boolean;
  /* true once the one-shot participant refresh on load has settled, so guards
     don't redirect during the initial token bootstrap */
  bootstrapped: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const [hydrated, setHydrated] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  /* Register the request-layer bridge during render (before children mount) so
     the very first api() call can resolve a token and recover from a 401. */
  useMemo(() => {
    registerAuthBridge({
      getToken: (role) => store.getState().auth.sessions[role].token,
      onUnauthorized: (role) => {
        dispatch(clearSession({ role }));
      },
      refresh: async () => {
        try {
          const res = await fetch("/api/auth/refresh", {
            method: "POST",
            credentials: "include",
          });
          if (!res.ok) {
            dispatch(setToken({ role: "participant", token: null }));
            return null;
          }
          const data = (await res.json()) as { accessToken: string };
          dispatch(setToken({ role: "participant", token: data.accessToken }));
          return data.accessToken;
        } catch {
          return null;
        }
      },
    });
  }, [store, dispatch]);

  /* One-shot bootstrap on load. Two independent restores, because neither the
     staff session nor the participant session leaves anything readable in the
     browser: both are httpOnly cookies, so the only way to learn whether we
     are signed in is to ask the server. */
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    /* first client render is now behind us — auth-gated UI can reveal */
    setHydrated(true);

    /* staff: who does the cookie say we are? */
    const staffRestore = fetchStaffSession().then((identity) => {
      if (!identity) return;
      dispatch(
        setSession({
          role: "admin",
          token: COOKIE_SESSION,
          user: {
            id: identity.admin.id,
            name: identity.admin.name,
            email: identity.admin.email,
            role: identity.admin.role,
            canScan: identity.admin.canScan,
            title: identity.admin.title,
            /* the Google profile picture, so the console can show a real face
               without a second request */
            photoUrl: identity.admin.photoUrl,
          },
        })
      );
    });

    const participantRestore = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as { accessToken: string };
          dispatch(setToken({ role: "participant", token: data.accessToken }));
        }
      })
      .catch(() => {});

    /* guards may only act once BOTH restores have settled — acting earlier
       would redirect a signed-in person away on every hard refresh */
    void Promise.allSettled([staffRestore, participantRestore]).then(() =>
      setBootstrapped(true)
    );
  }, [dispatch]);

  const value = useMemo(() => ({ hydrated, bootstrapped }), [hydrated, bootstrapped]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth hooks must be used within <AuthProvider>");
  return ctx;
}

/* ---- role-scoped facades: components use these, never Redux/Query directly -- */

export function useAdminAuth() {
  const session = useAppSelector((s) => s.auth.sessions.admin);
  const logout = useLogout("admin");
  return {
    user: session.user,
    /* always the COOKIE_SESSION sentinel — there is no readable staff token */
    token: session.token,
    isAuthenticated: !!session.token,
    /* a signed-in admin can operate the gate if they hold the scan grant
       (privileged roles always do; everyone else is an explicit grant) */
    canScan: !!session.user?.canScan,
    /* sign-in is a full-page redirect into Google, not an API call */
    signInUrl: "/api/auth/google/start",
    logout,
  };
}

export function useParticipantAuth() {
  const { bootstrapped } = useAuthContext();
  const session = useAppSelector((s) => s.auth.sessions.participant);
  const requestLink = useParticipantLink();
  const verify = useParticipantVerify();
  const logout = useLogout("participant");
  /* keep the identity fresh once we hold a token */
  const me = useParticipantMe(!!session.token);
  return {
    user: session.user,
    token: session.token,
    isAuthenticated: !!session.token,
    isLoading: !bootstrapped || (!!session.token && me.isLoading),
    requestLink,
    verify,
    logout,
    me,
  };
}

/* generic accessor keyed off whichever role is active */
export function useAuth() {
  const activeRole = useAppSelector((s) => s.auth.activeRole);
  const sessions = useAppSelector((s) => s.auth.sessions);
  const { hydrated, bootstrapped } = useAuthContext();
  const session = activeRole ? sessions[activeRole] : null;
  return {
    activeRole,
    user: session?.user ?? null,
    isAuthenticated: !!session?.token,
    hydrated,
    bootstrapped,
  };
}

/* true once the client has hydrated — gate any UI that branches on the
   cookie-backed staff session to avoid a hydration mismatch */
export function useAuthHydrated(): boolean {
  return useAuthContext().hydrated;
}

/* Redirect to the role's login when unauthenticated. Waits for hydration (and,
   for the participant, the refresh bootstrap) so it neither mismatches on
   hydration nor bounces mid-refresh. `ready` gates auth-dependent rendering. */
export function useRequireAuth(role: Role, redirectTo?: string) {
  const router = useRouter();
  const { hydrated, bootstrapped } = useAuthContext();
  const session = useAppSelector((s) => s.auth.sessions[role]);
  /* both sessions are restored asynchronously from their cookies, so a guard
     must wait for the bootstrap or it would bounce a signed-in person straight
     back to the sign-in page on every hard refresh */
  const ready = hydrated && bootstrapped;

  useEffect(() => {
    if (ready && !session.token) {
      router.replace(redirectTo ?? LOGIN_ROUTE[role]);
    }
  }, [ready, session.token, role, redirectTo, router]);

  return { session, ready, isAuthenticated: !!session.token };
}
