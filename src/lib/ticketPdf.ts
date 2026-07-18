import PDFDocument from "pdfkit";
import { formatEventDate, formatEventTime } from "./time";

/* Brand palette, mirrored from globals.css */
const BG = "#0b2818";
const PANEL = "#123522";
const CREAM = "#ffffff";
const CREAM_DIM = "#bfd4c5";
const ORANGE = "#f59300";
const SAGE = "#a9d4a0";
const LINE = "#3a5a47";

const W = 620;
const H = 250;
const STUB_X = 440;

export type TicketPdfInput = {
  name: string;
  role?: string;
  type: string;
  eventName: string;
  eventDate?: Date | null;
  venue?: string;
  code: string;
  qrPng: Buffer;
  photo?: Buffer | null;
  /** event poster, drawn as the ticket's background */
  eventImage?: Buffer | null;
};

/* Renders the event pass as a one-page landscape PDF ticket that matches
   the on-screen design: main body + perforated stub with the QR code */
export function ticketPdfBuffer(t: TicketPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [W, H], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    /* background + card: the event poster fills the card, dimmed under a dark
       wash so the pass text and QR stay legible over it */
    doc.rect(0, 0, W, H).fill(BG);
    doc.save();
    doc.roundedRect(10, 10, W - 20, H - 20, 14).clip();
    doc.rect(10, 10, W - 20, H - 20).fill(PANEL);
    if (t.eventImage) {
      try {
        doc.image(t.eventImage, 10, 10, { cover: [W - 20, H - 20], align: "center", valign: "center" });
        doc.rect(10, 10, W - 20, H - 20).fillOpacity(0.8).fill(BG);
        doc.fillOpacity(1);
      } catch {
        /* unsupported image — the panel fill already stands in */
      }
    }
    doc.restore();

    /* header band */
    doc.save();
    doc.roundedRect(10, 10, W - 20, 40, 14).clip();
    doc.rect(10, 10, W - 20, 34).fill(ORANGE);
    doc.restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(BG)
      .text("IGIRE RWANDA ORGANIZATION · EVENT PASS", 28, 22, { characterSpacing: 1 });
    const typeLabel = t.type === "PLUS_ONE" ? "GUEST" : t.type;
    doc.text(typeLabel, STUB_X - 110, 22, { width: 100, align: "right" });

    /* stub perforation */
    doc
      .moveTo(STUB_X, 54)
      .lineTo(STUB_X, H - 20)
      .dash(4, { space: 4 })
      .lineWidth(1.5)
      .stroke(LINE)
      .undash();

    /* ── main body ── */
    const bodyX = 32;
    doc
      .font("Helvetica-Bold")
      .fontSize(19)
      .fillColor(ORANGE)
      .text(t.eventName.toUpperCase(), bodyX, 62, { width: STUB_X - bodyX - 16 });

    /* photo */
    const photoY = 100;
    if (t.photo) {
      doc.save();
      doc.roundedRect(bodyX, photoY, 66, 66, 10).clip();
      try {
        doc.image(t.photo, bodyX, photoY, { cover: [66, 66], align: "center", valign: "center" });
      } catch {
        /* unsupported image format — leave the frame empty */
      }
      doc.restore();
      doc.roundedRect(bodyX, photoY, 66, 66, 10).lineWidth(2).stroke(ORANGE);
    }

    const nameX = t.photo ? bodyX + 82 : bodyX;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(CREAM_DIM)
      .text("ADMITS", nameX, photoY + 2, { characterSpacing: 1.5 });
    doc
      .font("Helvetica-Bold")
      .fontSize(17)
      .fillColor(CREAM)
      .text(t.name.toUpperCase(), nameX, photoY + 13, { width: STUB_X - nameX - 16 });
    if (t.role) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(SAGE).text(t.role, nameX, doc.y + 2);
    }

    /* date / time / venue row */
    const metaY = 196;
    const meta: [string, string][] = [];
    if (t.eventDate) {
      meta.push([
        "DATE",
        formatEventDate(t.eventDate, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      ]);
      meta.push(["TIME", formatEventTime(t.eventDate)]);
    }
    if (t.venue) meta.push(["VENUE", t.venue]);
    let mx = bodyX;
    for (const [label, value] of meta) {
      doc.font("Helvetica").fontSize(7).fillColor(CREAM_DIM).text(label, mx, metaY, { characterSpacing: 1.5 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(CREAM).text(value, mx, metaY + 10);
      mx += Math.max(doc.widthOfString(value) + 26, 88);
    }

    /* ── stub ── */
    const stubCenter = STUB_X + (W - 10 - STUB_X) / 2;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(ORANGE)
      .text("ADMIT ONE", STUB_X + 10, 64, {
        width: W - 20 - STUB_X - 10,
        align: "center",
        characterSpacing: 3,
      });

    /* QR sits straight on the ticket — no white card; it's light-on-transparent
       with the Igire mark already baked into the centre */
    const qrSize = 128;
    doc.image(t.qrPng, stubCenter - qrSize / 2, 84, { width: qrSize, height: qrSize });

    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor(CREAM_DIM)
      .text(t.code, STUB_X + 10, 216, {
        width: W - 20 - STUB_X - 10,
        align: "center",
        characterSpacing: 0.5,
      });

    doc.end();
  });
}
