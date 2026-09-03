import { randomBytes } from "node:crypto";
import { GOOGLE_AUTH_URL, GOOGLE_SCOPES, googleClientId, googleRedirectUri } from "./config";
import { newPkcePair, type TokenResponse } from "./oauth";
import { GOOGLE_TOKEN_URL, googleClientSecret } from "./config";
import { ALLOWED_DOMAIN } from "./identity";

/* Sign-in and calendar access are ONE consent.

   Splitting them would mean asking every staff member for permission twice —
   once to prove who they are, once to read their calendar — for a product
   whose whole point is the calendar. So the sign-in request asks for the
   calendar scopes too, and a successful sign-in leaves the account already
   connected. */
export const SIGNIN_SCOPES = ["openid", "email", "profile", ...GOOGLE_SCOPES.slice(2)];

export const SIGNIN_STATE_COOKIE = "iems_signin";

/* `forceConsent` re-shows Google's permission screen.

   It used to be unconditional, which meant every single sign-in made staff
   approve calendar access again — an approval they had already given, on a
   product whose whole point is the calendar. Consent fatigue teaches people to
   click through permission screens without reading them, so re-asking when we
   do not need to is worse than a nuisance.

   Without `prompt`, Google sends a returning user who has already granted
   every requested scope straight through. The one thing that costs us is that
   `access_type=offline` then returns a refresh_token only on the FIRST
   authorization — so the callback checks whether we actually hold one and, if
   not, comes back through here once with forceConsent. That is one extra
   round-trip for the rare account that needs it, and none for everyone else. */
export function buildSignInUrl(opts: {
  state: string;
  codeChallenge: string;
  forceConsent?: boolean;
}): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: signInRedirectUri(),
    response_type: "code",
    scope: SIGNIN_SCOPES.join(" "),
    access_type: "offline",
    ...(opts.forceConsent ? { prompt: "consent" } : {}),
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    /* a hint to Google's account chooser, not a security control — the real
       domain check happens on the verified id_token */
    hd: ALLOWED_DOMAIN,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/* Sign-in has its own redirect URI so it can be registered separately from the
   calendar-connect one and the two flows never cross. */
export function signInRedirectUri(): string {
  const configured = process.env.GOOGLE_SIGNIN_REDIRECT_URI;
  if (configured) return configured;
  return googleRedirectUri().replace("/api/admin/google/callback", "/api/auth/callback/google");
}

export function newSignInNonce(): string {
  return randomBytes(16).toString("hex");
}

export { newPkcePair };

/* Same token endpoint as the calendar connect, but redeemed against the
   sign-in redirect URI — Google requires the redirect_uri on the exchange to
   match the one the code was issued for. */
export async function exchangeCodeForSignIn(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: signInRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Google rejected the sign-in code (${res.status})`);
  return (await res.json()) as TokenResponse;
}
