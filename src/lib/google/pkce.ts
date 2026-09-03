/* The PKCE verifier has to survive a round trip through Google and come back
   on the callback request. It cannot ride in `state` — that is echoed in the
   URL and would defeat the point — so it goes in an httpOnly cookie scoped to
   this route group, the same shape as the refresh cookie in lib/session.ts. */

export const PKCE_COOKIE = "iems_goauth";
const MAX_AGE = 600;

const flags = (maxAge: number) =>
  [
    `Path=/api/admin/google`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

export const pkceCookie = (verifier: string) => `${PKCE_COOKIE}=${verifier}; ${flags(MAX_AGE)}`;
export const clearPkceCookie = () => `${PKCE_COOKIE}=; ${flags(0)}`;

export function readPkceCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === PKCE_COOKIE) return rest.join("=") || null;
  }
  return null;
}
