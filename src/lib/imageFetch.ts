/* Fetch an image URL (or decode a data: URL) into a Buffer, tolerating failure.
   Used by the ticket PDF/email builders to embed profile photos and event
   posters. A slow or unreachable image must never hang the request or break the
   pass, so this always resolves — returning null when the image can't be had. */

const DEFAULT_TIMEOUT_MS = 5_000;

export async function fetchImageBuffer(
  url: string | null | undefined,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Buffer | null> {
  if (!url) return null;

  if (url.startsWith("data:")) {
    try {
      const base64 = url.split(",")[1] ?? "";
      return Buffer.from(base64, "base64");
    } catch {
      return null;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    /* timeout, network error, or abort — the pass renders fine without it */
    return null;
  } finally {
    clearTimeout(timer);
  }
}
