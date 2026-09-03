import { createHash, randomBytes } from "node:crypto";
import { decodeJwt } from "jose";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_URL,
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
} from "./config";
import { GoogleAuthError } from "./errors";

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

const b64url = (b: Buffer) => b.toString("base64url");

/* PKCE. Google treats a web app with a client secret as confidential, so PKCE
   isn't strictly required — but it costs one hash and closes the authorization
   code interception window, so we do it anyway. */
export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrl(opts: {
  state: string;
  codeChallenge: string;
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    /* offline + consent is what makes Google hand back a refresh_token.
       Without prompt=consent a returning user gets an access token only, and
       the reconnect silently produces an account we can never refresh. */
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    /* invalid_grant is the one error that means "this connection is over" —
       the user revoked access, changed their password, or the code expired */
    if (json.error === "invalid_grant") throw new GoogleAuthError();
    throw new Error(
      `Google token request failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim()
    );
  }
  return json;
}

export function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  return postToken({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postToken({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/* Best effort — if Google says no, we still forget the account locally. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => undefined);
}

/* The id_token comes straight from Google's token endpoint over TLS in a
   response to a request we authenticated with our client secret, so its
   signature adds nothing here — we only need the claims. */
export function identityFromIdToken(idToken: string): { sub: string; email: string } | null {
  try {
    const claims = decodeJwt(idToken);
    const sub = typeof claims.sub === "string" ? claims.sub : null;
    const email = typeof claims.email === "string" ? claims.email : null;
    return sub && email ? { sub, email } : null;
  } catch {
    return null;
  }
}
