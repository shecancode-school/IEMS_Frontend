import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { PRIVILEGED_ROLES, can, type AdminRole, type Capability } from "@/types/admin";
import { Admin, StaffSession } from "@/models";
import { dbConnect } from "./db";
import {
  ACCESS_TTL_SECONDS,
  STAFF_COOKIE,
  readCookie,
  touchSession,
} from "./staffSession";

const encoder = new TextEncoder();

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return encoder.encode(s);
}

/* `scanner` is retained only so an unexpired token issued before the move to
   Google sign-in verifies rather than throwing; nothing accepts it any more. */
export type AuthPayload =
  | { kind: "attendee"; sub: string }
  | { kind: "admin"; sub: string; role: AdminRole }
  | { kind: "scanner"; sub: string };

export async function signAuthToken(payload: AuthPayload, expiresIn = "7d"): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

/* Participant access tokens are short-lived; a rotating refresh cookie keeps
   the session alive (see lib/session.ts). */
export const ACCESS_TOKEN_TTL = "15m";

export function signParticipantAccessToken(participantId: string): Promise<string> {
  return signAuthToken({ kind: "attendee", sub: participantId }, ACCESS_TOKEN_TTL);
}

export async function verifyAuthToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind === "attendee" || payload.kind === "admin" || payload.kind === "scanner") {
      return payload as unknown as AuthPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/* QR payloads are their own token kind so an access token can never be
   scanned as a ticket or vice versa. Besides the ticket code, the signed
   payload carries the holder's identity so the gate can greet them even
   before the database answers. */
export type QrIdentity = {
  name?: string;
  type?: string;
  eventName?: string;
};

export async function signQrToken(ticketCode: string, who: QrIdentity = {}): Promise<string> {
  return new SignJWT({
    kind: "qr",
    t: ticketCode,
    ...(who.name ? { n: who.name } : {}),
    ...(who.type ? { y: who.type } : {}),
    ...(who.eventName ? { e: who.eventName } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(secret());
}

export type QrPayload = { code: string } & QrIdentity;

export async function verifyQrToken(token: string): Promise<QrPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "qr" || typeof payload.t !== "string") return null;
    return {
      code: payload.t,
      name: typeof payload.n === "string" ? payload.n : undefined,
      type: typeof payload.y === "string" ? payload.y : undefined,
      eventName: typeof payload.e === "string" ? payload.e : undefined,
    };
  } catch {
    return null;
  }
}

/* The Google OAuth callback is a cross-site browser GET: no Authorization
   header, no same-origin check. Identity travels in this signed state token
   instead. Its own `kind` means verifyAuthToken will never accept it as a
   session token, the same separation the qr kind uses. */
export async function signOAuthState(adminId: string): Promise<string> {
  return new SignJWT({ kind: "google-oauth", sub: adminId, nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function verifyOAuthState(state: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(state, secret());
    if (payload.kind !== "google-oauth" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/* A calendar-feed URL is pasted into Google Calendar or Outlook, which fetch
   it on a schedule with no headers we control. The URL therefore IS the
   credential, so it gets its own long-lived token kind that grants exactly one
   thing: read your own schedule as iCalendar. It can never be replayed as a
   session token, and revoking it means rotating JWT_SECRET or, better, letting
   the person regenerate the link. */
export async function signIcsToken(adminId: string): Promise<string> {
  return new SignJWT({ kind: "ics", sub: adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(secret());
}

export async function verifyIcsToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "ics" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/* The staff access token, carried in an httpOnly cookie rather than a header.

   It names both the person and the SESSION they are using, so signing out on
   one device does not have to wait for the token to expire, and every audit
   entry can point at the session that produced it. */
export type StaffTokenPayload = { sub: string; sid: string };

export async function signStaffAccessToken(adminId: string, sessionId: string): Promise<string> {
  return new SignJWT({ kind: "staff", sub: adminId, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyStaffAccessToken(token: string): Promise<StaffTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "staff" || typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      return null;
    }
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

/* Sign-in is a redirect the visitor is not yet authenticated for, so state
   cannot carry an identity — it carries a nonce we also put in a cookie, and
   the callback insists the two match. */
export async function signSignInState(nonce: string): Promise<string> {
  return new SignJWT({ kind: "google-signin", nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function verifySignInState(state: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(state, secret());
    if (payload.kind !== "google-signin" || typeof payload.nonce !== "string") return null;
    return payload.nonce;
  } catch {
    return null;
  }
}

export async function getAuth(req: Request): Promise<AuthPayload | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyAuthToken(header.slice("Bearer ".length));
}

export async function requireAttendee(req: Request): Promise<string | null> {
  const auth = await getAuth(req);
  return auth?.kind === "attendee" ? auth.sub : null;
}

/* The bearer token is stateless, so revocation happens here: every privileged
   request re-checks that the account still exists and is active. Deactivating
   or deleting an admin/scanner therefore ends their session on the next request
   instead of waiting for the token to expire. One indexed _id lookup per call. */
async function activeAdmin(id: string): Promise<{ id: string; role: AdminRole } | null> {
  await dbConnect();
  const admin = await Admin.findById(id).select("role active");
  if (!admin || !admin.active) return null;
  return { id, role: admin.role };
}

export type StaffAuth = { id: string; role: AdminRole };

export type StaffAuthFull = StaffAuth & { sessionId: string };

/* Any active staff account, whatever their role.

   Three things are re-checked on EVERY request, which is what makes access
   revocable in seconds rather than at token expiry:
     1. the access cookie is a valid, unexpired staff token
     2. the session behind it has not been revoked or timed out
     3. the account still exists and is active

   The role comes back from Mongo rather than the token, so a promotion or
   demotion applies to the very next request with no re-login. */
export async function requireStaffSession(req: Request): Promise<StaffAuthFull | null> {
  const cookie = readCookie(req, STAFF_COOKIE);
  if (!cookie) return null;

  const payload = await verifyStaffAccessToken(cookie);
  if (!payload) return null;

  await dbConnect();
  const session = await StaffSession.findById(payload.sid).select("admin revokedAt expiresAt");
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.admin.toString() !== payload.sub
  ) {
    return null;
  }

  const staff = await activeAdmin(payload.sub);
  if (!staff) return null;

  /* fire-and-forget: "last seen" is for the audit trail, and a request must
     never wait on writing it */
  void touchSession(payload.sid);

  return { ...staff, sessionId: payload.sid };
}

export async function requireStaff(req: Request): Promise<StaffAuth | null> {
  return requireStaffSession(req);
}

/* Staff account whose current role is one of `roles`. */
export async function requireRole(
  req: Request,
  roles: readonly AdminRole[]
): Promise<StaffAuth | null> {
  const staff = await requireStaff(req);
  return staff && roles.includes(staff.role) ? staff : null;
}

/* The admin console. Roles beyond ADMIN|CEO were added for the calendar and
   must NOT inherit the existing console routes, so requireAdmin narrowed to
   the privileged pair — every pre-existing caller keeps its old behaviour. */
export async function requireAdmin(req: Request): Promise<StaffAuth | null> {
  return requireRole(req, PRIVILEGED_ROLES);
}

/* Capability guard for the new calendar/booking routes. Tri-state so a route
   can tell "not signed in" (401) from "signed in, wrong role" (403) — the
   blunt null of requireAdmin would report both as 401.

     const staff = await requireCapability(req, "calendar:write");
     if (!staff) return unauthorized();
     if (staff === "forbidden") return forbidden();
*/
export async function requireCapability(
  req: Request,
  cap: Capability
): Promise<StaffAuth | "forbidden" | null> {
  const staff = await requireStaff(req);
  if (!staff) return null;
  return can(staff.role, cap) ? staff : "forbidden";
}

/* Ticket routes are reachable by two different kinds of caller: the attendee
   who owns the pass (bearer token) and a staff member acting on their behalf
   (session cookie). Before staff moved to cookies both arrived through
   getAuth; now they do not, so the check has to look in both places or an
   administrator silently loses access to every ticket. */
export type TicketViewer =
  | { kind: "attendee"; id: string }
  | { kind: "staff"; id: string; role: AdminRole };

export async function requireTicketViewer(req: Request): Promise<TicketViewer | null> {
  const staff = await requireStaffSession(req);
  if (staff) return { kind: "staff", id: staff.id, role: staff.role };

  const auth = await getAuth(req);
  if (auth?.kind === "attendee") return { kind: "attendee", id: auth.sub };
  return null;
}

/* Gate scanning. Open to an administrator, and to any staff member an
   administrator has granted the scan duty to — that grant is what lets a
   facilitator be handed a phone for one event without giving them the console.

   Standalone Scanner accounts no longer sign in: authentication is Google-only
   and cookie-backed. The Scanner model and ScanLog.scannedByScanner are kept
   so historical scans still name whoever performed them. */
export async function requireScanner(req: Request): Promise<{ adminId: string } | null> {
  const staff = await requireStaffSession(req);
  if (!staff) return null;

  await dbConnect();
  const grant = await Admin.findById(staff.id).select("canScan");
  const allowed =
    PRIVILEGED_ROLES.includes(staff.role as (typeof PRIVILEGED_ROLES)[number]) ||
    Boolean(grant?.canScan);
  return allowed ? { adminId: staff.id } : null;
}

