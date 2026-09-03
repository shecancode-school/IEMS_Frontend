import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Admin, GoogleAccount } from "@/models";
import { signStaffAccessToken, verifySignInState } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCodeForSignIn } from "@/lib/google/signin";
import {
  SIGNIN_STATE_COOKIE,
} from "@/lib/google/signin";
import {
  SignInRejected,
  fetchGoogleProfile,
  isRootAdmin,
  verifyGoogleIdToken,
} from "@/lib/google/identity";
import { GOOGLE_SCOPES } from "@/lib/google/config";
import {
  issueStaffSession,
  requestContext,
  readCookie,
  setAccessCookie,
  setRefreshCookie,
} from "@/lib/staffSession";
import { recordAudit } from "@/lib/audit";

/* Where Google sends the browser back after signing in.

   Every check happens here, in order, and any failure redirects to the sign-in
   page with a reason rather than leaking detail into an error body:
     1. the signed state matches the httpOnly nonce cookie   (CSRF)
     2. the authorization code exchanges with our PKCE verifier
     3. the returned id_token verifies against Google's JWKS (authenticity)
     4. the email is verified and the account is on our domain
   Only then is a session opened. */

const SIGNIN_PAGE = "/admin";

function back(req: Request, params: Record<string, string>) {
  const url = new URL(SIGNIN_PAGE, new URL(req.url).origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.headers.append(
    "set-cookie",
    `${SIGNIN_STATE_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax`
  );
  return res;
}

/* Marks that we have already bounced this browser through the consent screen
   once, so a Google account that never returns a refresh token cannot trap the
   person in a redirect loop. Short-lived and scoped to the auth path. */
const CONSENT_RETRY_COOKIE = "iems_consent_retry";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  if (params.get("error")) return back(req, { error: "cancelled" });

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back(req, { error: "incomplete" });

  const nonce = await verifySignInState(state);
  const cookie = readCookie(req, SIGNIN_STATE_COOKIE);
  const [cookieNonce, verifier] = (cookie ?? "").split(".");
  if (!nonce || !verifier || nonce !== cookieNonce) {
    return back(req, { error: "expired" });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForSignIn(code, verifier);
  } catch {
    return back(req, { error: "exchange_failed" });
  }
  if (!tokens.id_token) return back(req, { error: "no_identity" });

  let identity;
  try {
    identity = await verifyGoogleIdToken(tokens.id_token);
  } catch (err) {
    return back(req, { error: err instanceof SignInRejected ? err.reason : "bad_token" });
  }

  /* the id_token's name and picture go stale; userinfo has today's */
  const profile = await fetchGoogleProfile(tokens.access_token);
  const name = profile?.name || identity.name;
  const photoUrl = profile?.picture ?? identity.picture;

  await dbConnect();

  /* An existing account is matched on email first, so someone who was created
     by an administrator before their first sign-in keeps their role. */
  const existing = await Admin.findOne({ email: identity.email });
  if (existing && !existing.active) {
    return back(req, { error: "deactivated" });
  }

  /* The root administrator is decided by address, not by the database, so the
     console can never end up with nobody able to reach it. Everyone else keeps
     whatever role they already have, and a brand-new person starts as STAFF. */
  const role = isRootAdmin(identity.email) ? "ADMIN" : (existing?.role ?? "STAFF");

  const admin = await Admin.findOneAndUpdate(
    { email: identity.email },
    {
      $set: {
        name,
        photoUrl,
        googleSub: identity.sub,
        role,
        lastSignInAt: new Date(),
      },
      $setOnInsert: { email: identity.email, active: true, canScan: false },
    },
    { upsert: true, new: true }
  );

  /* Signing in also connects the calendar: the consent already covered the
     calendar scopes, so asking again later would be a pointless second prompt.
     A returning sign-in may not include a refresh token, in which case the
     stored one is left in place rather than overwritten with nothing. */
  if (tokens.refresh_token) {
    await GoogleAccount.findOneAndUpdate(
      { admin: admin._id },
      {
        admin: admin._id,
        googleSub: identity.sub,
        email: identity.email,
        scopes: tokens.scope ? tokens.scope.split(" ") : [...GOOGLE_SCOPES],
        refreshToken: encryptSecret(tokens.refresh_token),
        accessToken: encryptSecret(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: "CONNECTED",
        lastError: null,
        connectedAt: new Date(),
      },
      { upsert: true }
    );
  } else {
    /* No refresh token in this response. That is the NORMAL case for a
       returning sign-in now that we no longer force the consent screen, and
       the stored one still works — so refresh the access token and move on.

       The exception is an account we hold no refresh token for at all: a first
       sign-in that Google decided not to re-consent, or one whose grant was
       revoked. Without a refresh token the calendar silently stops working an
       hour later, so send them back through the flow ONCE with the consent
       screen forced. `consent=1` only ever comes from here. */
    const existing = await GoogleAccount.findOne({ admin: admin._id }).select("refreshToken");
    /* One retry, never a loop. prompt=consent always yields a refresh token,
       so a second empty response means something is wrong upstream — and
       bouncing a person between us and Google forever is a far worse failure
       than a calendar that needs reconnecting from the settings page. */
    const alreadyRetried = req.headers.get("cookie")?.includes(`${CONSENT_RETRY_COOKIE}=1`);
    if (!existing?.refreshToken && !alreadyRetried) {
      const retry = NextResponse.redirect(new URL("/api/auth/google/start?consent=1", req.url));
      retry.headers.append(
        "set-cookie",
        `${CONSENT_RETRY_COOKIE}=1; Path=/api/auth; Max-Age=600; HttpOnly; SameSite=Lax${
          process.env.NODE_ENV === "production" ? "; Secure" : ""
        }`
      );
      return retry;
    }

    await GoogleAccount.updateOne(
      { admin: admin._id },
      {
        accessToken: encryptSecret(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: "CONNECTED",
        lastError: null,
      }
    );
  }

  const ctx = requestContext(req);
  const { raw, sessionId } = await issueStaffSession(admin._id.toString(), ctx);
  const accessToken = await signStaffAccessToken(admin._id.toString(), sessionId);

  await recordAudit({
    actorId: admin._id.toString(),
    actorName: admin.name,
    action: existing ? "auth.signin" : "auth.signup",
    target: { type: "Admin", id: admin._id.toString(), label: admin.email },
    summary: existing
      ? `Signed in with Google as ${admin.email}`
      : `First sign-in — account created for ${admin.email} as ${role}`,
    ...ctx,
  });

  /* landing depends on reach: the console dashboard is ADMIN|CEO only */
  const landing = role === "ADMIN" || role === "CEO" ? "/admin/dashboard" : "/admin/calendar";
  const res = NextResponse.redirect(new URL(landing, new URL(req.url).origin));
  res.headers.append(
    "set-cookie",
    `${SIGNIN_STATE_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax`
  );
  setAccessCookie(res, accessToken);
  setRefreshCookie(res, raw);
  return res;
}
