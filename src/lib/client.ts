/* Browser-side helpers: role-aware JSON fetch with auth + localStorage
   persistence for the long-lived roles (admin/scanner). The participant token
   lives only in Redux memory and is refreshed via the httpOnly cookie. */

import type { Role } from "@/store/authSlice";
import { bridgeGetToken, bridgeOnUnauthorized, bridgeRefresh } from "./authBridge";

/* localStorage keys — only admin & scanner persist here (they carry long
   bearer tokens); the participant relies on the refresh cookie instead. */
export const STORAGE_KEYS = {
  admin: { token: "iems_admin_token", role: "iems_admin_role", name: "iems_admin_name" },
  scanner: { token: "iems_scanner_token", name: "iems_scanner_name" },
} as const;

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

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = opts.role ? bridgeGetToken(opts.role) : null;
  let res = await rawFetch(path, opts, token);

  /* one transparent recovery attempt on 401 */
  if (res.status === 401 && opts.role) {
    if (opts.role === "participant") {
      const fresh = await bridgeRefresh();
      if (fresh) {
        res = await rawFetch(path, opts, fresh);
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
