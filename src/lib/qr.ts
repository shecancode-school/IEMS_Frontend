import { readFile } from "fs/promises";
import { join } from "path";
import QRCode from "qrcode";
import sharp from "sharp";
import { signQrToken, type QrIdentity } from "./auth";

/* The pass QR: dark modules on a light (cream) field with the Igire mark
   composited into the middle. Phone scanners' native detectors only read
   dark-on-light reliably — they don't invert — so the field must stay light
   for auto-scan to work. Error correction "H" keeps ~30% redundancy so the
   centred logo never stops it decoding. Cream (not pure white) keeps it on
   brand without hurting contrast. */
const SIZE = 640;
const LOGO_FRAC = 0.2; // logo chip covers ~20% of the QR's width

const QR_OPTS = {
  width: SIZE,
  margin: 2,
  errorCorrectionLevel: "H" as const,
  color: { dark: "#0b2818", light: "#f7f3ea" },
};

/* Rasterise the brand SVG onto a small rounded white plate once and reuse it —
   the opaque chip keeps the mark legible where it covers the light modules. */
let logoChipPromise: Promise<Buffer> | null = null;
function logoChip(): Promise<Buffer> {
  if (!logoChipPromise) {
    logoChipPromise = (async () => {
      const svg = await readFile(join(process.cwd(), "public", "iro-logo.svg"));
      const dim = Math.round(SIZE * LOGO_FRAC);
      const pad = Math.round(dim * 0.14);
      const inner = dim - pad * 2;
      const mark = await sharp(svg, { density: 300 })
        .resize(inner, inner, { fit: "contain", background: "#00000000" })
        .png()
        .toBuffer();
      const radius = Math.round(dim * 0.22);
      /* plate matches the QR field so the mark blends into the code */
      const plate = Buffer.from(
        `<svg width="${dim}" height="${dim}"><rect width="${dim}" height="${dim}" rx="${radius}" ry="${radius}" fill="#f7f3ea"/></svg>`
      );
      return sharp(plate)
        .composite([{ input: mark, gravity: "centre" }])
        .png()
        .toBuffer();
    })();
  }
  return logoChipPromise;
}

/* QR PNG with the logo baked into the centre, transparent background */
async function renderQr(ticketCode: string, who: QrIdentity): Promise<Buffer> {
  const [qr, chip] = await Promise.all([
    QRCode.toBuffer(await signQrToken(ticketCode, who), QR_OPTS),
    logoChip(),
  ]);
  return sharp(qr)
    .composite([{ input: chip, gravity: "centre" }])
    .png()
    .toBuffer();
}

/* A ticket's QR is a pure function of its code + the identity baked into the
   token, and only changes when the code is reset. Rendering it runs QR encoding
   plus a sharp composite, so cache the PNG in-process and reuse it across the
   dashboard, public pass, and email/PDF paths. Bounded LRU keyed by the inputs;
   per-instance, which matches the app's other in-process caches. */
const QR_CACHE_MAX = 500;
const qrCache = new Map<string, Buffer>();

function cacheKey(code: string, who: QrIdentity): string {
  return `${code}|${who.name ?? ""}|${who.type ?? ""}|${who.eventName ?? ""}`;
}

async function buildQr(ticketCode: string, who: QrIdentity): Promise<Buffer> {
  const key = cacheKey(ticketCode, who);
  const hit = qrCache.get(key);
  if (hit) {
    /* refresh recency (Map preserves insertion order) */
    qrCache.delete(key);
    qrCache.set(key, hit);
    return hit;
  }
  const png = await renderQr(ticketCode, who);
  qrCache.set(key, png);
  if (qrCache.size > QR_CACHE_MAX) {
    /* evict the least-recently-used entry */
    qrCache.delete(qrCache.keys().next().value as string);
  }
  return png;
}

export async function ticketQrPngBuffer(ticketCode: string, who: QrIdentity = {}): Promise<Buffer> {
  return buildQr(ticketCode, who);
}

export async function ticketQrDataUrl(ticketCode: string, who: QrIdentity = {}): Promise<string> {
  const png = await buildQr(ticketCode, who);
  return `data:image/png;base64,${png.toString("base64")}`;
}
