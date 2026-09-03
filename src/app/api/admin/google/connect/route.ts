import { dbConnect } from "@/lib/db";
import { Admin } from "@/models";
import { requireStaff, signOAuthState } from "@/lib/auth";
import { buildAuthUrl, newPkcePair } from "@/lib/google/oauth";
import { googleConfigured } from "@/lib/google/config";
import { ok, fail, unauthorized } from "@/lib/http";
import { pkceCookie } from "@/lib/google/pkce";
import { recordAudit } from "@/lib/audit";

/* Start the Google connection.

   This is a POST returning a URL rather than a GET that redirects, because the
   staff session is an httpOnly cookie scoped to /api, which a cross-site
   redirect back from Google would not carry
   in lib/client.ts. A top-level navigation to a GET route would arrive with no
   Authorization header, so the server could not tell who is connecting. The
   client fetches this WITH auth, then does window.location.assign(authUrl). */
export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  if (!googleConfigured()) {
    return fail(
      "Google Calendar is not configured on this deployment — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_TOKEN_KEY must be set",
      503
    );
  }

  await dbConnect();
  const admin = await Admin.findById(staff.id).select("email");

  const { verifier, challenge } = newPkcePair();
  const state = await signOAuthState(staff.id);
  const authUrl = buildAuthUrl({
    state,
    codeChallenge: challenge,
    loginHint: admin?.email,
  });

  const res = ok({ authUrl });
  res.headers.append("set-cookie", pkceCookie(verifier));
  await recordAudit({
    actorId: staff.id,
    action: "google.connect_started",
    target: { type: "googleAccount", id: staff.id, label: admin?.email ?? "" },
    summary: "Started connecting their Google Calendar",
  });
  return res;
}
