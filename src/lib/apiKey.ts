import { randomBytes } from "node:crypto";
import { ApiKey, type ApiKeyScope } from "@/models";
import { dbConnect } from "./db";
import { sha256 } from "./crypto";

/* Authenticating a third-party integration.

   This cannot live in src/proxy.ts with the IP rate limiter: that runs on the
   Edge runtime and cannot reach Mongo, and a key check is a database lookup.
   So the guard runs inside the route handler, and the per-key rate limit uses
   the same globalThis fixed-window convention as the proxy and the Google
   cache — with the same caveat, that it is per-instance. */

const PREFIX = "iro_live_";

/* Fixed-window counters, keyed by key id. Same single-instance caveat as
   everything else on globalThis: behind a load balancer each instance counts
   separately, which loosens the ceiling but never fails a legitimate call. */
type Window = { count: number; resetAt: number };
const buckets: Map<string, Window> =
  (globalThis as { __iemsApiKeyBuckets?: Map<string, Window> }).__iemsApiKeyBuckets ??
  ((globalThis as { __iemsApiKeyBuckets?: Map<string, Window> }).__iemsApiKeyBuckets = new Map());

/* "iro_live_" + 32 random bytes. The prefix makes a leaked key obvious in a
   log or a commit, and greppable by secret scanners. */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    raw,
    hash: sha256(raw),
    /* enough to identify the key in a list, far too little to use */
    prefix: raw.slice(0, PREFIX.length + 6),
  };
}

export type ApiKeyAuth = {
  id: string;
  label: string;
  organisation: string;
  scopes: ApiKeyScope[];
};

export type ApiKeyFailure =
  | { error: "missing"; status: 401; message: string }
  | { error: "invalid"; status: 401; message: string }
  | { error: "forbidden"; status: 403; message: string }
  | { error: "rate_limited"; status: 429; message: string; retryAfter: number };

export type ApiKeyResult = { ok: true; key: ApiKeyAuth } | ({ ok: false } & ApiKeyFailure);

function checkRate(id: string, perMinute: number): number | null {
  const now = Date.now();
  const win = buckets.get(id);
  if (!win || now > win.resetAt) {
    buckets.set(id, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  if (win.count >= perMinute) return Math.ceil((win.resetAt - now) / 1000);
  win.count += 1;
  return null;
}

/* Verify the `x-api-key` header and the scope it needs.

   The failure messages deliberately do not distinguish "no such key" from
   "revoked key" — an integrator with a dead key gets the same answer either
   way, and someone guessing learns nothing from the difference. */
export async function requireApiKey(req: Request, scope: ApiKeyScope): Promise<ApiKeyResult> {
  const presented = req.headers.get("x-api-key")?.trim();
  if (!presented) {
    return {
      ok: false,
      error: "missing",
      status: 401,
      message: "Send your key in an `x-api-key` header. Request one at /docs.",
    };
  }

  await dbConnect();
  const key = await ApiKey.findOne({ keyHash: sha256(presented), status: "ACTIVE" });
  if (!key) {
    return { ok: false, error: "invalid", status: 401, message: "That API key is not valid." };
  }

  if (!key.scopes.includes(scope)) {
    return {
      ok: false,
      error: "forbidden",
      status: 403,
      message: `That key does not carry the \`${scope}\` scope.`,
    };
  }

  const retryAfter = checkRate(key._id.toString(), key.rateLimitPerMinute);
  if (retryAfter !== null) {
    return {
      ok: false,
      error: "rate_limited",
      status: 429,
      message: `Rate limit reached (${key.rateLimitPerMinute}/min). Try again shortly.`,
      retryAfter,
    };
  }

  /* usage stats are for the admin list, never on the critical path */
  void ApiKey.updateOne(
    { _id: key._id },
    { lastUsedAt: new Date(), $inc: { requestCount: 1 } }
  ).catch(() => undefined);

  return {
    ok: true,
    key: {
      id: key._id.toString(),
      label: key.label,
      organisation: key.organisation,
      scopes: key.scopes,
    },
  };
}

/* Forget a revoked key's counter so a reissued key starts clean. */
export function forgetApiKeyBucket(id: string): void {
  buckets.delete(id);
}
