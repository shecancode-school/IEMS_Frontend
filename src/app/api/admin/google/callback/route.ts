import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Admin, GoogleAccount } from "@/models";
import { verifyOAuthState } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, identityFromIdToken } from "@/lib/google/oauth";
import { GOOGLE_SCOPES } from "@/lib/google/config";
import { clearPkceCookie, readPkceCookie } from "@/lib/google/pkce";

/* Where Google sends the browser back. Public by necessity — a cross-site GET
   carries no Authorization header — so every check happens on the signed state
   token and the httpOnly PKCE cookie, both of which an attacker cannot forge. */

const SETTINGS = "/admin/settings/google";

function back(req: Request, params: Record<string, string>) {
  const url = new URL(SETTINGS, new URL(req.url).origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.headers.append("set-cookie", clearPkceCookie());
  return res;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  /* the user pressed Cancel on Google's consent screen */
  const denied = params.get("error");
  if (denied) return back(req, { error: denied });

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back(req, { error: "missing_code" });

  const adminId = await verifyOAuthState(state);
  if (!adminId) return back(req, { error: "invalid_state" });

  const verifier = readPkceCookie(req);
  if (!verifier) return back(req, { error: "expired" });

  let tokens;
  try {
    tokens = await exchangeCode(code, verifier);
  } catch {
    return back(req, { error: "exchange_failed" });
  }

  /* Google returns a refresh token only on a fresh grant. Without one we could
     never act on this calendar again after the first hour, so storing the
     account would be worse than failing — refuse and let them retry. */
  if (!tokens.refresh_token) {
    return back(req, { error: "no_refresh_token" });
  }

  const identity = tokens.id_token ? identityFromIdToken(tokens.id_token) : null;
  if (!identity) return back(req, { error: "no_identity" });

  await dbConnect();
  const admin = await Admin.findById(adminId).select("active");
  if (!admin?.active) return back(req, { error: "invalid_state" });

  /* googleSub is unique: if this Google account is already wired to a
     different staff member, connecting it again would silently give two people
     the same calendar and collapse both their availabilities into one. */
  const clash = await GoogleAccount.findOne({ googleSub: identity.sub }).select("admin");
  if (clash && clash.admin.toString() !== adminId) {
    return back(req, { error: "already_linked" });
  }

  await GoogleAccount.findOneAndUpdate(
    { admin: adminId },
    {
      admin: adminId,
      googleSub: identity.sub,
      email: identity.email.toLowerCase(),
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

  return back(req, { connected: "1" });
}
