import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/* AES-256-GCM for secrets we must be able to read back — currently each staff
   member's Google refresh token. Passwords stay bcrypt-hashed; this is for
   material the server has to present to a third party later.

   Wire format: "v1:<iv>:<tag>:<ciphertext>", all base64url. The version prefix
   exists so a future GOOGLE_TOKEN_KEY rotation can dual-read old ciphertexts
   instead of forcing every staff member to reconnect on the same deploy.

   The key is read lazily inside the functions, never at module scope: the API
   smoke test (tests/api/routes.smoke.test.ts) imports every route module, and
   a module-scope throw would fail the whole suite on a machine without the
   Google env set. Same reasoning as the lazy transport in lib/mailer.ts. */

const B64 = "base64url" as const;
const ALG = "aes-256-gcm";
const VERSION = "v1";

function key(): Buffer {
  const hex = process.env.GOOGLE_TOKEN_KEY;
  if (!hex) throw new Error("GOOGLE_TOKEN_KEY is not set");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("GOOGLE_TOKEN_KEY must be 64 hex characters (32 bytes) — use: openssl rand -hex 32");
  }
  return Buffer.from(hex, "hex");
}

/* the additional authenticated data binds a ciphertext to its purpose, so a
   blob encrypted for one field can't be replayed into another */
export function encryptSecret(plain: string, aad = "google-token"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString(B64), cipher.getAuthTag().toString(B64), ct.toString(B64)].join(":");
}

export function decryptSecret(blob: string, aad = "google-token"): string {
  const [version, iv, tag, ct] = blob.split(":");
  if (version !== VERSION || !iv || !tag || !ct) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv(ALG, key(), Buffer.from(iv, B64));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, B64));
  return Buffer.concat([decipher.update(Buffer.from(ct, B64)), decipher.final()]).toString("utf8");
}

/* true when the encryption key is configured — lets callers degrade instead of
   throwing on a deployment where Google was never set up */
export function tokenKeyConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env.GOOGLE_TOKEN_KEY ?? "");
}

/* Opaque tokens (booking cancel links, ICS feed keys) are stored hashed, the
   same shape VerificationToken and RefreshToken already use. */
export const sha256 = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex");
