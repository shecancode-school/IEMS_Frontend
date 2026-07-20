import { NextResponse, type NextRequest } from "next/server";

/* Fixed-window, in-process rate limiting for auth-sensitive endpoints. Uses the
   Next 16 `proxy` convention (formerly `middleware`). Runs in the Edge runtime;
   the counter map lives per server instance, which is fine for the single-node
   self-hosted deployment. Behind a multi-instance load balancer this would need
   a shared store (Redis). */

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

/* per-path-prefix limits: [max requests, window ms]. Password logins get a
   tight budget over a long window — brute-forcing an admin/scanner password is
   the highest-value attack, so 5 tries per 15 min per IP. The magic-link flow
   is passwordless, so its budget is looser. */
const LIMITS: { prefix: string; max: number; windowMs: number }[] = [
  { prefix: "/api/admin/login", max: 5, windowMs: 15 * 60_000 },
  { prefix: "/api/scanner/login", max: 5, windowMs: 15 * 60_000 },
  { prefix: "/api/auth/request-link", max: 5, windowMs: 60_000 },
  { prefix: "/api/auth/verify", max: 10, windowMs: 60_000 },
  { prefix: "/api/auth/refresh", max: 20, windowMs: 60_000 },
];

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";



  
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const rule = LIMITS.find((l) => path.startsWith(l.prefix));
  if (!rule) return NextResponse.next();

  const key = `${rule.prefix}:${clientIp(req)}`;
  const now = Date.now();
  const win = buckets.get(key);

  if (!win || now > win.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return NextResponse.next();
  }

  if (win.count >= rule.max) {
    const retryAfter = Math.ceil((win.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  win.count += 1;
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/admin/login",
    "/api/scanner/login",
    "/api/auth/request-link",
    "/api/auth/verify",
    "/api/auth/refresh",
  ],
};
