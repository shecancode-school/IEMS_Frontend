import { dbConnect } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  STAFF_REFRESH_COOKIE,
  clearStaffCookies,
  readCookie,
  requestContext,
  revokeAllSessions,
  revokeStaffSession,
} from "@/lib/staffSession";
import { ok } from "@/lib/http";

/* Sign out. `?all=1` ends every session for this person, not just this device.

   Always succeeds and always clears the cookies, even when the session was
   already gone — someone clicking "sign out" must never be told no. */
export async function POST(req: Request) {
  const everywhere = new URL(req.url).searchParams.get("all") === "1";
  const staff = await requireStaffSession(req);

  await dbConnect();
  if (everywhere && staff) {
    const ended = await revokeAllSessions(staff.id);
    await recordAudit({
      actorId: staff.id,
      action: "auth.signout_all",
      target: { type: "Admin", id: staff.id },
      summary: `Signed out of all devices (${ended} ${ended === 1 ? "session" : "sessions"} ended)`,
      ...requestContext(req),
    });
  } else {
    await revokeStaffSession(readCookie(req, STAFF_REFRESH_COOKIE));
    if (staff) {
      await recordAudit({
        actorId: staff.id,
        action: "auth.signout",
        target: { type: "Admin", id: staff.id },
        summary: "Signed out",
        ...requestContext(req),
      });
    }
  }

  return clearStaffCookies(ok({ signedOut: true }));
}
