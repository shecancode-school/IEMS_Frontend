import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, tokenKeyConfigured, sha256 } from "@/lib/crypto";
import { toInstant, toInterval } from "@/lib/google/normalize";
import { isRetryable, googleErrorMessage, GoogleApiError, GoogleAuthError } from "@/lib/google/errors";

beforeAll(() => {
  process.env.GOOGLE_TOKEN_KEY = "a".repeat(64);
});

describe("secret encryption", () => {
  it("round-trips a refresh token", () => {
    const token = "1//0gABCdef-not-a-real-refresh-token";
    const blob = encryptSecret(token);
    expect(blob).not.toContain(token);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(decryptSecret(blob)).toBe(token);
  });

  it("produces a different ciphertext each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses a ciphertext encrypted for another purpose", () => {
    const blob = encryptSecret("secret", "google-token");
    expect(() => decryptSecret(blob, "ics-feed")).toThrow();
  });

  it("rejects tampering", () => {
    const blob = encryptSecret("secret");
    const parts = blob.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects a malformed key", () => {
    const good = process.env.GOOGLE_TOKEN_KEY;
    process.env.GOOGLE_TOKEN_KEY = "too-short";
    expect(tokenKeyConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/64 hex/);
    process.env.GOOGLE_TOKEN_KEY = good;
  });

  it("hashes opaque tokens deterministically", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});

describe("Google date normalisation", () => {
  it("keeps an offset-carrying dateTime exactly", () => {
    const d = toInstant({ dateTime: "2026-03-05T14:00:00+02:00" }, "start");
    expect(d?.toISOString()).toBe("2026-03-05T12:00:00.000Z");
  });

  it("expands an all-day date into the Kigali day, not UTC midnight", () => {
    /* the bug this guards: new Date("2026-03-05") is 2026-03-05T00:00Z, which
       is 02:00 in Kigali — an all-day block would leave the first two hours of
       the morning bookable */
    const start = toInstant({ date: "2026-03-05" }, "start");
    expect(start?.toISOString()).toBe("2026-03-04T22:00:00.000Z");
    expect(start?.toISOString()).not.toBe("2026-03-05T00:00:00.000Z");
  });

  it("treats an all-day end date as exclusive", () => {
    /* Google describes a single all-day event on the 5th as 05 → 06 */
    const interval = toInterval({ date: "2026-03-05" }, { date: "2026-03-06" });
    expect(interval?.start.toISOString()).toBe("2026-03-04T22:00:00.000Z");
    expect(interval?.end.toISOString()).toBe("2026-03-05T21:59:59.999Z");
  });

  it("covers a whole multi-day all-day block", () => {
    const interval = toInterval({ date: "2026-03-05" }, { date: "2026-03-08" });
    expect(interval?.end.toISOString()).toBe("2026-03-07T21:59:59.999Z");
  });

  it("drops intervals that are empty or inverted", () => {
    expect(toInterval({ dateTime: "2026-03-05T14:00:00Z" }, { dateTime: "2026-03-05T14:00:00Z" })).toBeNull();
    expect(toInterval({ dateTime: "2026-03-05T15:00:00Z" }, { dateTime: "2026-03-05T14:00:00Z" })).toBeNull();
    expect(toInterval(undefined, undefined)).toBeNull();
  });
});

describe("retry policy", () => {
  it("retries throttling and server faults", () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(503)).toBe(true);
    expect(isRetryable(403, "rateLimitExceeded")).toBe(true);
    expect(isRetryable(403, "userRateLimitExceeded")).toBe(true);
  });

  it("never retries our own bad requests", () => {
    /* retrying these just burns quota — the request is wrong, not unlucky */
    expect(isRetryable(400)).toBe(false);
    expect(isRetryable(401)).toBe(false);
    expect(isRetryable(404)).toBe(false);
    expect(isRetryable(403, "insufficientPermissions")).toBe(false);
  });
});

describe("google error messaging", () => {
  it("says reconnection for a dead grant", () => {
    expect(googleErrorMessage(new GoogleAuthError())).toMatch(/reconnect/i);
  });

  it("names the disabled API for accessNotConfigured", () => {
    const err = new GoogleApiError("x", 403, "accessNotConfigured");
    expect(googleErrorMessage(err)).toMatch(/not enabled/i);
  });

  it("stays generic for network-shaped failures", () => {
    expect(googleErrorMessage(new Error("fetch failed"))).toBe(
      "Could not reach Google Calendar just now."
    );
  });
});
