import { dbConnect } from "@/lib/db";
import { Admin } from "@/models";
import { signStaffAccessToken } from "@/lib/auth";
import { sameOriginOk } from "@/lib/csrf";
import {
  STAFF_REFRESH_COOKIE,
  clearStaffCookies,
  readCookie,
  requestContext,
  rotateStaffSession,
  setAccessCookie,
  setRefreshCookie,
} from "@/lib/staffSession";
import { ok, fail, unauthorized } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Mint a new access cookie from the refresh cookie.

   The client calls this once, transparently, when a request comes back 401 —
   the browser never sees either token, so this endpoint is the only way to get
   a fresh one. Rotation is single-use: presenting a spent token means it was
   captured, and the whole session chain is revoked rather than renewed. */
export async function POST(req: Request) {
  /* the refresh cookie is SameSite=Lax and this is the one endpoint that can
     exchange it, so the origin check matters here specifically */
  if (!sameOriginOk(req)) return fail("Bad origin", 403);

  const presented = readCookie(req, STAFF_REFRESH_COOKIE);
  await dbConnect();

  const rotated = await rotateStaffSession(presented, requestContext(req));
  if (!rotated) {
    /* clear the cookies too — leaving a dead refresh token in the browser
       means every future request pays a pointless round trip */
    return clearStaffCookies(unauthorized());
  }

  const admin = await Admin.findById(rotated.adminId).select("active role");
  if (!admin?.active) return clearStaffCookies(unauthorized());

  const accessToken = await signStaffAccessToken(rotated.adminId, rotated.sessionId);
  const res = ok({ ok: true });
  setAccessCookie(res, accessToken);
  setRefreshCookie(res, rotated.raw);
  await recordAudit({
    actorId: rotated.adminId,
    action: "auth.token_rotated",
    target: { type: "session", id: rotated.sessionId },
    summary: "Staff session token rotated",
  });
  return res;
}
