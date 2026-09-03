import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/* The two sign-in domains. Standalone gate-scanner accounts were retired when
   sign-in became Google-only — scanning is now a duty granted to a staff
   account, so a scanner signs in as themselves. */
export type Role = "participant" | "admin";

/* backend token-kind names, used by the request layer */
export const TOKEN_KIND: Record<Role, "attendee" | "admin"> = {
  participant: "attendee",
  admin: "admin",
};

/* a normalized identity snapshot — only the fields the UI needs per role */
export interface RoleUser {
  id?: string;
  name?: string;
  email?: string;
  /* staff role: ADMIN | CEO | FACILITATOR | ACADEMIC | STAFF */
  role?: string;
  /* participant: PENDING | VERIFIED | COMPLETE */
  status?: string;
  /* staff: explicit grant to operate the gate scanner */
  canScan?: boolean;
  /* Google profile picture, refreshed at each sign-in */
  photoUrl?: string | null;
  /* staff: profile title shown on the org calendar and booking pages */
  title?: string | null;
}

/* Staff sessions live in httpOnly cookies, so the browser genuinely has no
   token to hold. This sentinel stands in for one, purely so the many
   `!!session.token` checks across the UI keep meaning "signed in" without
   every consumer having to learn which roles are cookie-backed. It is never
   sent anywhere — the cookie is. */
export const COOKIE_SESSION = "cookie";

export type SessionStatus = "idle" | "authed" | "anon";

export interface RoleSession {
  token: string | null;
  user: RoleUser | null;
  status: SessionStatus;
}

export interface AuthState {
  activeRole: Role | null;
  sessions: Record<Role, RoleSession>;
}

const emptySession = (): RoleSession => ({ token: null, user: null, status: "idle" });

const initialState: AuthState = {
  activeRole: null,
  sessions: {
    participant: emptySession(),
    admin: emptySession(),
  },
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /* establish (or replace) a role's session and make it the active one */
    setSession(
      state,
      action: PayloadAction<{ role: Role; token: string | null; user: RoleUser | null }>
    ) {
      const { role, token, user } = action.payload;
      state.sessions[role] = { token, user, status: "authed" };
      state.activeRole = role;
    },
    /* merge fields into a role's identity (e.g. after fetching /me) */
    patchUser(state, action: PayloadAction<{ role: Role; user: RoleUser }>) {
      const { role, user } = action.payload;
      const s = state.sessions[role];
      s.user = { ...(s.user ?? {}), ...user };
      if (s.status === "idle") s.status = "authed";
    },
    /* rotate just the access token (e.g. participant refresh) without touching
       the identity or the active role. Keeps status in step with the token. */
    setToken(state, action: PayloadAction<{ role: Role; token: string | null }>) {
      const s = state.sessions[action.payload.role];
      s.token = action.payload.token;
      s.status = action.payload.token ? "authed" : "anon";
    },
    /* mark a role signed-out */
    clearSession(state, action: PayloadAction<{ role: Role }>) {
      state.sessions[action.payload.role] = { token: null, user: null, status: "anon" };
      if (state.activeRole === action.payload.role) state.activeRole = null;
    },
    setActiveRole(state, action: PayloadAction<Role | null>) {
      state.activeRole = action.payload;
    },
  },
});

export const { setSession, patchUser, setToken, clearSession, setActiveRole } = authSlice.actions;
export default authSlice.reducer;
