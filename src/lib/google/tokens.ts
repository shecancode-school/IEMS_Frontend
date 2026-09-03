import { dbConnect } from "@/lib/db";
import { GoogleAccount, type GoogleAccountDoc } from "@/models";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken } from "./oauth";
import { GoogleAuthError } from "./errors";

/* Access tokens live an hour; refresh a minute early so a request that takes a
   moment to reach Google doesn't arrive with an expired one. */
const SKEW_MS = 60_000;

export type GoogleSession = {
  accessToken: string;
  calendarId: string;
  email: string;
};

/* The single place a Google connection can die. Everything that talks to
   Google goes through here, so revocation is handled once: mark the account,
   drop both ciphertexts, and throw a typed error the callers can degrade on. */
async function markRevoked(account: GoogleAccountDoc, reason: string): Promise<never> {
  await GoogleAccount.updateOne(
    { _id: account._id },
    {
      status: "REVOKED",
      accessToken: null,
      accessTokenExpiresAt: null,
      lastError: reason,
    }
  );
  throw new GoogleAuthError();
}

/* A usable access token for a staff member, refreshing and re-encrypting on
   the way if the cached one has expired. Returns null when they simply have
   not connected Google — that is a normal state, not an error. */
export async function getGoogleSession(adminId: string): Promise<GoogleSession | null> {
  await dbConnect();
  const account = await GoogleAccount.findOne({ admin: adminId });
  if (!account) return null;
  if (account.status === "REVOKED") throw new GoogleAuthError();

  const fresh =
    account.accessToken &&
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt.getTime() - SKEW_MS > Date.now();

  if (fresh) {
    return {
      accessToken: decryptSecret(account.accessToken!),
      calendarId: account.calendarId,
      email: account.email,
    };
  }

  let refreshed;
  try {
    refreshed = await refreshAccessToken(decryptSecret(account.refreshToken));
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return markRevoked(account, "Refresh token rejected by Google (invalid_grant)");
    }
    throw err;
  }

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await GoogleAccount.updateOne(
    { _id: account._id },
    {
      accessToken: encryptSecret(refreshed.access_token),
      accessTokenExpiresAt: expiresAt,
      status: "CONNECTED",
      lastError: null,
      lastUsedAt: new Date(),
    }
  );

  return {
    accessToken: refreshed.access_token,
    calendarId: account.calendarId,
    email: account.email,
  };
}

/* Same, but insists on a connection — for paths where the caller has already
   checked that this person is connected (creating a Meet link, say). */
export async function requireGoogleSession(adminId: string): Promise<GoogleSession> {
  const session = await getGoogleSession(adminId);
  if (!session) throw new GoogleAuthError("This account has not connected Google Calendar");
  return session;
}

/* Which of these staff members can we actually reach Google for? One indexed
   query instead of N, for the calendar feed and the bookable-hosts list. */
export async function connectedAdminIds(adminIds: string[]): Promise<Set<string>> {
  await dbConnect();
  const rows = await GoogleAccount.find({
    admin: { $in: adminIds },
    status: "CONNECTED",
  }).select("admin");
  return new Set(rows.map((r) => r.admin.toString()));
}
