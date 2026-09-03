/* Google OAuth + Calendar configuration.

   Every env read is lazy, inside a function. tests/api/routes.smoke.test.ts
   imports every route module to prove none of them throws at load, so a
   module-scope `throw new Error("GOOGLE_CLIENT_ID is not set")` would fail the
   whole suite on a machine that never configured Google. Same reasoning as the
   lazy transport in lib/mailer.ts. */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/* calendar.events covers reading and writing the user's own events (including
   creating one with a Meet link); calendar.freebusy returns opaque busy blocks
   for everyone else. Deliberately NOT calendar.readonly — we never want another
   staff member's private event titles anywhere near our database. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const;

export function googleClientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set");
  return v;
}

export function googleClientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return v;
}

export function googleRedirectUri(): string {
  const v = process.env.GOOGLE_REDIRECT_URI;
  if (v) return v;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("GOOGLE_REDIRECT_URI (or NEXT_PUBLIC_APP_URL) is not set");
  return `${base.replace(/\/$/, "")}/api/admin/google/callback`;
}

/* Lets every dependent surface degrade politely on a deployment where Google
   was never configured, instead of 500-ing. */
export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      (process.env.GOOGLE_REDIRECT_URI || process.env.NEXT_PUBLIC_APP_URL) &&
      /^[0-9a-fA-F]{64}$/.test(process.env.GOOGLE_TOKEN_KEY ?? "")
  );
}
