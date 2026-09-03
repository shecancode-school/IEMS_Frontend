import { NextResponse, type NextRequest } from "next/server";

/* Fixed-window, in-process rate limiting for auth-sensitive endpoints. Uses the
   Next 16 `proxy` convention (formerly `middleware`). Runs in the Edge runtime;
   the counter map lives per server instance, which is fine for the single-node
   self-hosted deployment. Behind a multi-instance load balancer this would need
   a shared store (Redis). */

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

/* per-path-prefix limits: [max requests, window ms].

   There are no password logins left to brute-force — staff sign in with Google
   and attendees use magic links — so what is protected here is the endpoints
   that send mail, mint sessions or write on behalf of an anonymous caller. */
const LIMITS: { prefix: string; method?: string; max: number; windowMs: number }[] = [
  { prefix: "/api/auth/request-link", max: 5, windowMs: 60_000 },
  { prefix: "/api/auth/verify", max: 10, windowMs: 60_000 },
  { prefix: "/api/auth/refresh", max: 20, windowMs: 60_000 },
  /* public booking is unauthenticated and writes to the database, so writes get
     a tight budget while browsing slots stays comfortable */
  { prefix: "/api/book", method: "POST", max: 5, windowMs: 60_000 },
  { prefix: "/api/book", max: 30, windowMs: 60_000 },
  { prefix: "/api/admin/google/connect", max: 10, windowMs: 60_000 },
  /* an anonymous form that writes to the database and pings administrators —
     a tight budget keeps it from becoming a notification firehose */
  { prefix: "/api/public/api-keys/request", max: 3, windowMs: 60 * 60_000 },
];

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";



  
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  /* method-specific rules are listed first and win, so POST /api/book gets the
     tight write budget rather than the looser browse one */
  const rule = LIMITS.find(
    (l) => path.startsWith(l.prefix) && (!l.method || l.method === req.method)
  );
  if (!rule) return NextResponse.next();

  const key = `${rule.prefix}:${rule.method ?? "*"}:${clientIp(req)}`;
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
    "/api/auth/request-link",
    "/api/auth/verify",
    "/api/auth/refresh",
    "/api/book/:path*",
    "/api/admin/google/connect",
    "/api/public/api-keys/request",
  ],
};
