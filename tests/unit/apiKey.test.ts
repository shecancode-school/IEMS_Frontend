import { describe, it, expect } from "vitest";
import { generateApiKey } from "@/lib/apiKey";
import { sha256 } from "@/lib/crypto";

/* The credential's own properties, tested without a database — the lookup and
   revocation paths need Mongo and are covered by the manual pass. */

describe("generateApiKey", () => {
  it("returns a key, its hash and a short identifying prefix", () => {
    const { raw, hash, prefix } = generateApiKey();
    expect(raw.startsWith("iro_live_")).toBe(true);
    expect(hash).toBe(sha256(raw));
    expect(prefix.startsWith("iro_live_")).toBe(true);
  });

  it("stores only the hash — the prefix cannot be used as a key", () => {
    const { raw, hash, prefix } = generateApiKey();
    /* the regression this guards: a prefix long enough to be guessable back
       into the key would make the "shown once" promise meaningless */
    expect(prefix.length).toBeLessThan(raw.length / 2);
    expect(sha256(prefix)).not.toBe(hash);
  });

  it("is unguessable — every key is distinct", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().raw));
    expect(keys.size).toBe(200);
  });

  it("carries enough entropy to resist brute force", () => {
    const { raw } = generateApiKey();
    /* 32 random bytes, base64url — ~43 chars after the 9-char prefix */
    expect(raw.length).toBeGreaterThan(40);
  });

  it("is greppable by a secret scanner", () => {
    /* the whole point of a fixed prefix: a leaked key is obvious in a log
       or a commit diff */
    expect(generateApiKey().raw).toMatch(/^iro_live_[A-Za-z0-9_-]+$/);
  });
});
