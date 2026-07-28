import PDFDocument from "pdfkit";
import { formatEventDate, formatEventTime } from "./time";

/* Palette — a dark hero panel (event poster behind a green wash) beside a
   clean white info card, mirroring the on-screen "event pass" design. */
const BG = "#0b2818"; // deep green backdrop / hero wash
const GREEN = "#2fbf6e"; // brand green (accents, ribbon)
const GREEN_BRIGHT = "#3ad884"; // headline / motto highlight
const GREEN_DIM = "#7fb79a"; // muted green for hero eyebrow text
const CREAM = "#ffffff"; // light text on the dark hero
const CARD = "#ffffff"; // info card
const INK = "#14231b"; // primary text on the card
const INK_DIM = "#6b7c72"; // secondary text on the card
const HAIR = "#e3ebe5"; // hairline divider on the card

const W = 780;
const H = 400;

/* hero panel spans the left; the white card floats over the right */
const HERO_X = 36;
const HERO_W = 300 - HERO_X - 16;
const CX0 = 312;
const CY0 = 24;
const CX1 = W - 24;
const CY1 = H - 24;
const CP = 28; // card padding
const CONTENT_X = CX0 + CP;
const CONTENT_R = CX1 - CP;

const BIG = "Helvetica-BoldOblique";
const BOLD = "Helvetica-Bold";
const REG = "Helvetica";
const MONO = "Courier-Bold";

export type TicketPdfInput = {
  name: string;
  role?: string;
  /** holder type (PARTICIPANT / GUEST / PLUS_ONE) */
  type: string;
  eventName: string;
  eventDate?: Date | null;
  venue?: string;
  code: string;
  qrPng: Buffer;
  photo?: Buffer | null;
  /** event poster, drawn (dimmed) as the hero-panel background */
  eventImage?: Buffer | null;
  /** event format badge shown in the hero pill (e.g. MEETUP) */
  eventType?: string;
  /** ticket price — "Free"/empty renders as COMPLIMENTARY */
  price?: string;
  /** issuing organisation */
  organiser?: string;
};

/* Renders the event pass as a one-page landscape PDF: a dark hero panel on the
   left (event poster behind a green wash) and a white info card on the right. */
export function ticketPdfBuffer(t: TicketPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [W, H], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const organiser = t.organiser?.trim() || "Igire Rwanda Organization";
    const typeLabel = t.type === "PLUS_ONE" ? "GUEST" : t.type.toUpperCase();

    /* round the whole ticket's corners */
    doc.save();
    doc.roundedRect(0, 0, W, H, 18).clip();

    /* ── background: event poster behind a dark green wash ── */
    doc.rect(0, 0, W, H).fill(BG);
    if (t.eventImage) {
      try {
        doc.image(t.eventImage, 0, 0, { cover: [W, H], align: "center", valign: "center" });
        doc.rect(0, 0, W, H).fillOpacity(0.78).fill(BG);
        doc.fillOpacity(1);
      } catch {
        /* unsupported image — the solid backdrop already stands in */
      }
    }
    /* soft green glow low on the hero for a bit of depth */
    doc.save();
    doc.circle(70, H - 40, 150).fillOpacity(0.07).fill(GREEN_BRIGHT);
    doc.fillOpacity(1);
    doc.restore();

    /* ── hero panel (left) ── */
    doc
      .font(BOLD)
      .fontSize(8.5)
      .fillColor(GREEN_DIM)
      .text(`${organiser.toUpperCase()} · EVENT PASS`, HERO_X, 40, {
        width: HERO_W,
        characterSpacing: 1,
        lineGap: 2,
      });

    /* big two-tone headline built from the event name: all but the last word
       in white, the last word in green — the poster-style wordmark */
    const words = t.eventName.trim().split(/\s+/).filter(Boolean);
    const lastWord = (words.pop() ?? t.eventName).toUpperCase();
    const leadWords = words.join(" ").toUpperCase();
    doc.font(BIG).fontSize(34).fillColor(CREAM);
    if (leadWords) {
      doc.text(`${leadWords} `, HERO_X, 112, { width: HERO_W, lineGap: -2, continued: true });
    } else {
      doc.text("", HERO_X, 112, { width: HERO_W, lineGap: -2, continued: true });
    }
    doc.fillColor(GREEN_BRIGHT).text(lastWord, { continued: false });
    const headlineBottom = doc.y;

    /* motto pill (event format badge) */
    const pillText = (t.eventType || "EVENT PASS").toUpperCase();
    doc.font(BOLD).fontSize(9);
    const pillW = doc.widthOfString(pillText) + pillText.length * 2 + 30;
    const pillY = headlineBottom + 20;
    doc.roundedRect(HERO_X, pillY, pillW, 30, 7).lineWidth(1.5).stroke(GREEN);
    doc
      .fillColor(GREEN_BRIGHT)
      .text(pillText, HERO_X, pillY + 10, { width: pillW, align: "center", characterSpacing: 2 });

    /* "Admit ONE" footer, bottom-left of the hero */
    doc
      .font(BOLD)
      .fontSize(9)
      .fillColor(GREEN_DIM)
      .text("ADMIT", HERO_X, H - 80, { characterSpacing: 2 });
    doc.font(BIG).fontSize(26).fillColor(CREAM).text("ONE", HERO_X, H - 68);

    /* ── info card (right) ── */
    doc.roundedRect(CX0, CY0, CX1 - CX0, CY1 - CY0, 16).fill(CARD);

    /* date/venue ribbon — a slanted green banner folded over the top-right */
    doc
      .moveTo(W - 336, 0)
      .lineTo(W, 0)
      .lineTo(W, 60)
      .lineTo(W - 300, 60)
      .closePath()
      .fill(GREEN);
    let ribbon = "";
    if (t.eventDate) {
      const wd = formatEventDate(t.eventDate, { weekday: "short" }).toUpperCase();
      const day = formatEventDate(t.eventDate, { day: "numeric" });
      const mon = formatEventDate(t.eventDate, { month: "short" }).toUpperCase();
      const yr = formatEventDate(t.eventDate, { year: "2-digit" });
      ribbon = `${wd} ${day} ${mon} '${yr}`;
    }
    if (t.venue) ribbon = ribbon ? `${ribbon}   |   ${t.venue.toUpperCase()}` : t.venue.toUpperCase();
    doc
      .font(BOLD)
      .fontSize(10)
      .fillColor(CREAM)
      .text(ribbon, W - 300, 22, { width: 284, align: "right", characterSpacing: 0.8 });

    /* QR, top-right inside the card */
    const qrSize = 118;
    const qrX = CONTENT_R - qrSize;
    const qrY = CY0 + 28;
    doc.image(t.qrPng, qrX, qrY, { width: qrSize, height: qrSize });
    doc
      .font(REG)
      .fontSize(7.5)
      .fillColor(INK_DIM)
      .text("This pass is valid for one entry.", qrX - 20, qrY + qrSize + 7, {
        width: qrSize + 20,
        align: "right",
      });

    /* event title + subtitle */
    const titleW = qrX - 18 - CONTENT_X;
    doc.font(BOLD).fontSize(22).fillColor(INK).text(t.eventName, CONTENT_X, CY0 + 30, { width: titleW });
    if (t.eventDate || t.venue) {
      const longDate = t.eventDate
        ? `${formatEventDate(t.eventDate, { weekday: "long" })} ${formatEventDate(t.eventDate, {
            day: "numeric",
          })} ${formatEventDate(t.eventDate, { month: "long" })} ${formatEventDate(t.eventDate, {
            year: "numeric",
          })}`
        : "";
      const sub = [t.venue, longDate].filter(Boolean).join(" — ");
      doc.font(REG).fontSize(11).fillColor(INK_DIM).text(sub, CONTENT_X, doc.y + 4, { width: titleW });
    }

    /* holder photo + name */
    const holderY = CY0 + 114;
    if (t.photo) {
      doc.save();
      doc.roundedRect(CONTENT_X, holderY, 58, 58, 10).clip();
      try {
        doc.image(t.photo, CONTENT_X, holderY, { cover: [58, 58], align: "center", valign: "center" });
      } catch {
        /* unsupported image — leave the frame empty */
      }
      doc.restore();
      doc.roundedRect(CONTENT_X, holderY, 58, 58, 10).lineWidth(2).stroke(GREEN);
    }
    const nameX = t.photo ? CONTENT_X + 74 : CONTENT_X;
    doc
      .font(BOLD)
      .fontSize(7.5)
      .fillColor(INK_DIM)
      .text("ADMITS", nameX, holderY + 4, { characterSpacing: 2 });
    doc
      .font(BOLD)
      .fontSize(18)
      .fillColor(INK)
      .text(t.name, nameX, holderY + 15, { width: qrX - 18 - nameX });
    if (t.role) {
      doc.font(BOLD).fontSize(11).fillColor(GREEN).text(t.role, nameX, doc.y + 2);
    }

    /* pass id */
    const idY = CY0 + 186;
    doc.font(REG).fontSize(10).fillColor(INK_DIM).text("Pass ID:", CONTENT_X, idY);
    doc.font(MONO).fontSize(10.5).fillColor(INK).text(t.code, CONTENT_X + 66, idY - 0.5);

    /* meta grid: Type / Entrance / Time */
    const gridY = CY0 + 212;
    const col2X = CONTENT_X + 220;
    const cell = (label: string, value: string, x: number, y: number) => {
      doc.font(REG).fontSize(9).fillColor(INK_DIM).text(label, x, y);
      doc.font(BOLD).fontSize(11).fillColor(INK).text(value, x, y + 11);
    };
    cell("Type:", typeLabel, CONTENT_X, gridY);
    if (t.eventDate) cell("Time:", formatEventTime(t.eventDate), col2X, gridY);
    if (t.venue) cell("Entrance:", t.venue, CONTENT_X, gridY + 28);

    /* admission */
    const admission = !t.price || /free/i.test(t.price) ? "COMPLIMENTARY" : t.price.toUpperCase();
    doc.font(REG).fontSize(10).fillColor(INK_DIM).text("Admission:", CONTENT_X, CY1 - 84);
    doc.font(BOLD).fontSize(28).fillColor(INK).text(admission, CONTENT_X, CY1 - 72, { width: CONTENT_R - CONTENT_X });

    /* footer */
    doc.moveTo(CONTENT_X, CY1 - 28).lineTo(CONTENT_R, CY1 - 28).lineWidth(1).stroke(HAIR);
    doc.font(REG).fontSize(9).fillColor(INK_DIM).text(`Issued: ${organiser}`, CONTENT_X, CY1 - 20, { width: 220 });
    doc
      .font(REG)
      .fontSize(9)
      .fillColor(INK_DIM)
      .text("Event Pass · ADMIT ONE", CONTENT_X, CY1 - 20, { width: CONTENT_R - CONTENT_X, align: "right" });
    doc
      .font(BOLD)
      .fontSize(8)
      .fillColor(GREEN)
      .text("@IGIRERWANDA", CONTENT_X, CY1 - 6, { width: CONTENT_R - CONTENT_X, align: "right", characterSpacing: 0.5 });

    doc.restore();
    doc.end();
  });
}
