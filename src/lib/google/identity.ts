import { createRemoteJWKSet, jwtVerify } from "jose";
import { googleClientId } from "./config";

/* Proving a sign-in really came from Google.

   The id_token is a JWT signed by Google. We verify it against Google's
   published JWKS rather than trusting the response body — that is what makes
   this "validate that it came from Google" rather than "hope it did". jose
   caches and re-fetches the key set on rotation, so this is one network call
   every few hours, not one per sign-in.

   Three checks matter and all three are enforced:
     issuer    — accounts.google.com (Google emits it both with and without
                 the https:// prefix, and both are legitimate)
     audience  — OUR client id, so a token minted for a different application
                 cannot be replayed against us
     hd        — the Google Workspace domain the account belongs to */

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/* Only this domain may sign in. `hd` is a Workspace claim, so a personal
   gmail.com account has no `hd` at all and is rejected before the email is
   even looked at. */
export const ALLOWED_DOMAIN = process.env.ALLOWED_SIGNIN_DOMAIN ?? "igirerwanda.org";

/* Whoever this is, is the administrator. Hard-wired so the console can never
   end up with nobody able to reach it, whatever the database says. */
export const ROOT_ADMIN_EMAIL = (
  process.env.ROOT_ADMIN_EMAIL ?? "derrick@igirerwanda.org"
).toLowerCase();

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function keySet() {
  /* built lazily: createRemoteJWKSet reads the client id at call time, and the
     API smoke test imports every route module without Google configured */
  jwks ??= createRemoteJWKSet(JWKS_URL);
  return jwks;
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
  hd: string | null;
};

export class SignInRejected extends Error {
  reason: "bad_token" | "unverified_email" | "wrong_domain";
  constructor(reason: GoogleIdentityError, message: string) {
    super(message);
    this.name = "SignInRejected";
    this.reason = reason;
  }
}

export type GoogleIdentityError = "bad_token" | "unverified_email" | "wrong_domain";

/* Verify the id_token's signature and claims, then apply our own rules. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  let claims;
  try {
    const verified = await jwtVerify(idToken, keySet(), {
      issuer: GOOGLE_ISSUERS,
      audience: googleClientId(),
    });
    claims = verified.payload;
  } catch {
    throw new SignInRejected("bad_token", "That sign-in could not be verified with Google.");
  }

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const emailVerified = claims.email_verified === true;
  const hd = typeof claims.hd === "string" ? claims.hd.toLowerCase() : null;

  if (!claims.sub || !email) {
    throw new SignInRejected("bad_token", "Google did not tell us who signed in.");
  }

  /* an unverified address can be anything the account holder typed */
  if (!emailVerified) {
    throw new SignInRejected(
      "unverified_email",
      "That Google account's email address is not verified."
    );
  }

  /* both the Workspace claim and the address itself must match, so neither a
     personal account nor a lookalike address gets in */
  if (hd !== ALLOWED_DOMAIN || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new SignInRejected(
      "wrong_domain",
      `Only ${ALLOWED_DOMAIN} accounts can sign in here.`
    );
  }

  return {
    sub: String(claims.sub),
    email,
    emailVerified,
    name: typeof claims.name === "string" ? claims.name : email.split("@")[0],
    picture: typeof claims.picture === "string" ? claims.picture : null,
    hd,
  };
}

/* The OpenID Connect v3 userinfo endpoint. The id_token already carries name
   and picture, but they go stale — someone changes their photo and the token
   we verified months ago still has the old one. This is called on each sign-in
   to refresh the profile. */
export async function fetchGoogleProfile(
  accessToken: string
): Promise<{ name: string; picture: string | null } | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: string; picture?: string };
    return {
      name: typeof body.name === "string" ? body.name : "",
      picture: typeof body.picture === "string" ? body.picture : null,
    };
  } catch {
    /* the profile is a nicety — never fail a sign-in over it */
    return null;
  }
}

export const isRootAdmin = (email: string) => email.toLowerCase() === ROOT_ADMIN_EMAIL;
