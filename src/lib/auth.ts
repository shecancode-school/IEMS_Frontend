import { SignJWT, jwtVerify } from "jose";
import type { AdminRole } from "@/models/Admin";
import { Admin, Scanner } from "@/models";
import { dbConnect } from "./db";

const encoder = new TextEncoder();

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return encoder.encode(s);
}

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

async function isActiveScanner(id: string): Promise<boolean> {
  await dbConnect();
  const scanner = await Scanner.findById(id).select("active");
  return !!scanner && scanner.active;
}

export async function requireAdmin(req: Request): Promise<{ id: string; role: AdminRole } | null> {
  const auth = await getAuth(req);
  if (auth?.kind !== "admin") return null;
  return activeAdmin(auth.sub);
}

/* gate scanning is open to admins and scanner accounts */
export async function requireScanner(
  req: Request
): Promise<{ adminId?: string; scannerId?: string } | null> {
  const auth = await getAuth(req);
  if (auth?.kind === "admin") return (await activeAdmin(auth.sub)) ? { adminId: auth.sub } : null;
  if (auth?.kind === "scanner") return (await isActiveScanner(auth.sub)) ? { scannerId: auth.sub } : null;
  return null;
}

/* endpoints exclusive to a signed-in scanner account */
export async function requireScannerAccount(req: Request): Promise<string | null> {
  const auth = await getAuth(req);
  if (auth?.kind !== "scanner") return null;
  return (await isActiveScanner(auth.sub)) ? auth.sub : null;
}
