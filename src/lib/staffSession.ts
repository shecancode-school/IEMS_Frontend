import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { StaffSession } from "@/models";

/* Cookie-only sessions for staff.

   Nothing is stored in localStorage: an XSS on the admin console must not be
   able to read a credential and walk away with it. The browser holds two
   httpOnly cookies and JavaScript can see neither:

     iems_staff    short-lived signed access token (15 min), sent on every
                   request to /api
     iems_staff_rt long-lived opaque refresh token (30 days), scoped to
                   /api/auth so it is not attached to ordinary API calls

   When the access cookie expires the client makes one call to
   /api/auth/refresh, which rotates the refresh token and reissues both. */

export const STAFF_COOKIE = "iems_staff";
export const STAFF_REFRESH_COOKIE = "iems_staff_rt";

export const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

const options = (path: string, maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path,
  maxAge,
});

/* The access cookie is sent on every API call, so it is scoped to /api rather
   than "/" — no reason to attach a credential to image and asset requests. */
export function setAccessCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(STAFF_COOKIE, token, options("/api", ACCESS_TTL_SECONDS));
  return res;
}

/* The refresh cookie is only ever presented to the refresh and sign-out
   endpoints, so a leak of any other response cannot carry it. */
export function setRefreshCookie(res: NextResponse, raw: string): NextResponse {
  res.cookies.set(STAFF_REFRESH_COOKIE, raw, options("/api/auth", REFRESH_TTL_MS / 1000));
  return res;
}

export function clearStaffCookies(res: NextResponse): NextResponse {
  res.cookies.set(STAFF_COOKIE, "", options("/api", 0));
  res.cookies.set(STAFF_REFRESH_COOKIE, "", options("/api/auth", 0));
  return res;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || undefined;
  }
  return undefined;
}

export type SessionContext = { ip: string; userAgent: string };

export function requestContext(req: Request): SessionContext {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? ""),
    userAgent: req.headers.get("user-agent") ?? "",
  };
}

/* Open a session after a successful Google sign-in. */
export async function issueStaffSession(
  adminId: string,
  ctx: SessionContext
): Promise<{ raw: string; sessionId: string }> {
  const raw = randomBytes(32).toString("hex");
  const session = await StaffSession.create({
    admin: adminId,
    tokenHash: hash(raw),
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { raw, sessionId: session._id.toString() };
}

/* Validate and rotate. Presenting a token that has already been rotated means
   it was captured and replayed, so the whole chain for that person is revoked
   rather than quietly issuing another one. */
export async function rotateStaffSession(
  raw: string | undefined,
  ctx: SessionContext
): Promise<{ adminId: string; raw: string; sessionId: string } | null> {
  if (!raw) return null;

  const current = await StaffSession.findOne({ tokenHash: hash(raw) });
  if (!current || current.revokedAt || current.expiresAt < new Date()) return null;

  if (current.usedAt) {
    await StaffSession.updateMany(
      { admin: current.admin, revokedAt: null },
      { revokedAt: new Date() }
    );
    return null;
  }

  const adminId = current.admin.toString();
  const nextRaw = randomBytes(32).toString("hex");
  const next = await StaffSession.create({
    admin: adminId,
    tokenHash: hash(nextRaw),
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  current.usedAt = new Date();
  current.replacedBy = hash(nextRaw);
  await current.save();

  return { adminId, raw: nextRaw, sessionId: next._id.toString() };
}

export async function revokeStaffSession(raw: string | undefined): Promise<void> {
  if (!raw) return;
  await StaffSession.updateOne({ tokenHash: hash(raw) }, { revokedAt: new Date() });
}

/* "Sign me out everywhere" — and what an administrator triggers when they
   deactivate someone. */
export async function revokeAllSessions(adminId: string): Promise<number> {
  const res = await StaffSession.updateMany(
    { admin: adminId, revokedAt: null },
    { revokedAt: new Date() }
  );
  return res.modifiedCount ?? 0;
}

export async function touchSession(sessionId: string): Promise<void> {
  await StaffSession.updateOne({ _id: sessionId }, { lastSeenAt: new Date() }).catch(
    () => undefined
  );
}
