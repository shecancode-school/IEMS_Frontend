/* Browser-side helpers: role-aware JSON fetch.

   NOTHING is stored in localStorage. Staff sessions are httpOnly cookies the
   browser attaches automatically and JavaScript cannot read, so an XSS on the
   console has no credential to steal. The participant access token lives only
   in Redux memory and is re-minted from its own httpOnly refresh cookie. */

import type { Role } from "@/store/authSlice";
import { bridgeGetToken, bridgeOnUnauthorized, bridgeRefresh } from "./authBridge";

/* Deliberately empty: nothing is persisted in the browser any more. Staff use
   an httpOnly session cookie and the participant token lives in memory only. */
export const STORAGE_KEYS = {} as const;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  /** which signed-in role to authenticate as (token resolved from the store) */
  role?: Role;
  form?: FormData;
  /** send/receive cookies (needed for the refresh endpoint) */
  credentials?: RequestCredentials;
};

async function rawFetch(path: string, opts: ApiOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(path, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: opts.credentials,
  });
}

/* Staff auth is a cookie, so it needs no bearer token — only `credentials`,
   and a refresh endpoint to call when the short-lived access cookie expires. */
async function refreshStaffSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/staff/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  /* the admin role authenticates by cookie; only participant and scanner
     still carry a bearer */
  const usesCookie = opts.role === "admin";
  const options: ApiOptions = usesCookie ? { ...opts, credentials: "same-origin" } : opts;
  const token = opts.role && !usesCookie ? bridgeGetToken(opts.role) : null;

  let res = await rawFetch(path, options, token);

  /* one transparent recovery attempt on 401 */
  if (res.status === 401 && opts.role) {
    if (usesCookie) {
      /* the 15-minute access cookie expired; the refresh cookie renews both */
      if (await refreshStaffSession()) {
        res = await rawFetch(path, options, null);
      }
      if (res.status === 401) bridgeOnUnauthorized(opts.role);
    } else if (opts.role === "participant") {
      const fresh = await bridgeRefresh();
      if (fresh) {
        res = await rawFetch(path, options, fresh);
      }
      if (res.status === 401) bridgeOnUnauthorized(opts.role);
    } else {
      bridgeOnUnauthorized(opts.role);
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? "Something went wrong", res.status);
  }
  return data as T;
}
