import { NextResponse } from "next/server";
import { signSignInState } from "@/lib/auth";
import { googleConfigured } from "@/lib/google/config";
import { buildSignInUrl, newPkcePair, newSignInNonce, SIGNIN_STATE_COOKIE } from "@/lib/google/signin";
import { fail } from "@/lib/http";

/* Begin signing in with Google.

   Unlike the calendar-connect flow, this one is a plain redirect: the visitor
   has no session yet, so there is no bearer token that a navigation would
   fail to carry. CSRF protection is the nonce — it is signed into `state` and
   also written to an httpOnly cookie, and the callback requires both to agree.

   Nothing is stored in localStorage at any point in this flow. */
export async function GET(req: Request) {
  if (!googleConfigured()) {
    return fail("Google sign-in is not configured on this deployment", 503);
  }

  const nonce = newSignInNonce();
  const { verifier, challenge } = newPkcePair();
  const state = await signSignInState(nonce);

  /* ?consent=1 is set only by the callback, when a sign-in came back without a
     refresh token and we hold none for that account. It is not a security
     control — the worst a hand-crafted value does is show the consent screen. */
  const forceConsent = new URL(req.url).searchParams.get("consent") === "1";

  const res = NextResponse.redirect(
    buildSignInUrl({ state, codeChallenge: challenge, forceConsent })
  );

  const flags = [
    "Path=/api/auth",
    "Max-Age=600",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  /* nonce and PKCE verifier ride together; the callback needs both */
  res.headers.append("set-cookie", `${SIGNIN_STATE_COOKIE}=${nonce}.${verifier}; ${flags}`);
  return res;
}
