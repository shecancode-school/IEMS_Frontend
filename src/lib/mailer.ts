import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { dbConnect } from "./db";
import { EmailLog, type EmailKind } from "@/models/EmailLog";
import { formatEventDate, formatEventDateTime } from "./time";

/* Build the transporter lazily so the Gmail credentials are read at call time.
   The app injects env before modules run, but tsx (seed/health/tests) loads
   .env.local after the hoisted imports evaluate — an eager transporter would
   capture undefined creds and fail every send with "Missing credentials". */
let cached: Transporter | undefined;
function transport(): Transporter {
  if (!cached) {
    cached = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return cached;
}

const FROM = () => `Igire Rwanda Organization Events <${process.env.GMAIL_USER}>`;

/* liveness check for the health-check script — verifies the SMTP connection
   and credentials without sending a message. Throws on failure. */
export async function verifyMailer(): Promise<boolean> {
  return transport().verify();
}

/* ------------------------------------------------------------- templates
   Every template renders to { subject, html } so the admin Emails page can
   preview exactly what recipients see without sending anything. */

export type RenderedEmail = { subject: string; html: string };

/* Reads like a note a person wrote: white background, plain prose, one
   button, a real sign-off — the branding stays out of the way */
function shell(body: string): string {
  return `
  <div style="background:#ffffff;padding:28px 16px;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#242424;font-size:15px;line-height:1.65">
    <div style="max-width:560px;margin:0 auto">
      ${body}
      <p style="margin:30px 0 4px">Warm regards,</p>
      <p style="margin:0;font-weight:bold;color:#0b2818">The Igire Rwanda Events team</p>
      <hr style="margin:26px 0 14px;border:none;border-top:1px solid #e8e8e6"/>
      <p style="font-size:12px;color:#8b9089;margin:0">
        Igire Rwanda Organization · Kigali, Rwanda<br/>
        You are receiving this email because of your event registration with Igire Rwanda Organization.
        If you weren't expecting it, you can safely ignore it.
      </p>
    </div>
  </div>`;
}

const button = (url: string, text: string) =>
  `<p style="margin:26px 0">
     <a href="${url}" style="background:#0b2818;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:8px;display:inline-block">${text}</a>
   </p>
   `

export function renderMagicLinkEmail(p: {
  name: string;
  url: string;
  eventName: string;
}): RenderedEmail {
  return {
    subject: `Verify your email — ${p.eventName}`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>Thank you for registering for <b>${p.eventName}</b>. To continue, please verify your email address using the button below.</p>
      ${button(p.url, "Verify my email")}
      <p style="font-size:13px;color:#555">For your security, this link can be used once and expires in 30 minutes.</p>
    `),
  };
}

export function renderPlusOneInviteEmail(p: {
  participantName: string;
  url: string;
  eventName: string;
}): RenderedEmail {
  return {
    subject: `${p.participantName} invited you to ${p.eventName}`,
    html: shell(`
      <p>Hello,</p>
      <p><b>${p.participantName}</b> would like to bring you as their guest to <b>${p.eventName}</b>. Registering only takes a minute — tell us a little about yourself and your event pass will be on its way.</p>
      ${button(p.url, "Join as their guest")}
    `),
  };
}

export function renderRegistrationConfirmation(p: {
  name: string;
  eventName: string;
}): RenderedEmail {
  return {
    subject: `You're registered for ${p.eventName}`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>Your registration for <b>${p.eventName}</b> is confirmed — welcome aboard!</p>
      <p>The next step is to complete your profile so we can issue your event pass. You will receive it by email as soon as it's ready.</p>
    `),
  };
}

export function renderEventUpdateEmail(p: {
  name: string;
  eventName: string;
  message: string;
}): RenderedEmail {
  return {
    subject: `Update: ${p.eventName}`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>There's an update about <b>${p.eventName}</b>:</p>
      <p style="padding:12px 16px;background:#f6f7f5;border-radius:8px">${p.message}</p>
    `),
  };
}

export function renderEventReminderEmail(p: {
  name: string;
  eventName: string;
  whenLabel: string;
}): RenderedEmail {
  return {
    subject: `Reminder: ${p.eventName} is coming up`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>This is a friendly reminder that <b>${p.eventName}</b> is happening ${p.whenLabel}.</p>
      <p>Please bring your event pass — the QR code will be scanned at the entrance. We look forward to seeing you there!</p>
    `),
  };
}

/* Each guest type gets its own opening line, so a VIP isn't welcomed with
   the same words as a press badge. Falls back to the participant copy. */
const PASS_INTROS: Record<string, (eventName: string) => string> = {
  VIP: (e) =>
    `It is our pleasure to welcome you as a VIP guest at <b>${e}</b>. Your VIP pass is below — please present the QR code at the entrance for priority access.`,
  SPEAKER: (e) =>
    `Thank you for joining <b>${e}</b> as a speaker — we're honoured to have you on stage. Your speaker pass is below; please present the QR code at the entrance.`,
  SPONSOR: (e) =>
    `Thank you for supporting <b>${e}</b> as a sponsor. Your sponsor pass is below — please present the QR code at the entrance.`,
  MEDIA: (e) =>
    `Welcome to <b>${e}</b>. Your press pass is below — please present the QR code at the entrance.`,
  PARTNER: (e) =>
    `We're delighted to welcome you to <b>${e}</b> as our partner. Your partner pass is below — please present the QR code at the entrance.`,
  PLUS_ONE: (e) =>
    `You're confirmed as a guest at <b>${e}</b>. Your guest pass is below — simply show the QR code at the entrance and you're in.`,
  GENERAL: (e) =>
    `You're confirmed for <b>${e}</b>. Your event pass is below — simply show the QR code at the entrance and you're in.`,
};

function passIntro(type: string, eventName: string): string {
  const intro = PASS_INTROS[type];
  if (intro) return intro(eventName);
  return `Great news — you're all set for <b>${eventName}</b>! Your personal event pass is below; simply show the QR code at the entrance and you're in.`;
}

/* Sent by an admin from the Emails page to people who started applying but
   never finished — the pass can't be issued until their profile is complete. */
export function renderTicketNudgeEmail(p: {
  name: string;
  url: string;
  eventName: string;
}): RenderedEmail {
  return {
    subject: `Your pass for ${p.eventName} is waiting`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>Your spot at <b>${p.eventName}</b> is reserved, but your registration isn't finished yet — and we can't issue your event pass until it is.</p>
      <p>It only takes a minute: sign in below, complete your profile, and your pass will be emailed to you right away.</p>
      ${button(p.url, "Finish my registration")}
      <p style="font-size:13px;color:#555">For your security, this link can be used once and expires in 72 hours.</p>
    `),
  };
}

export type TicketEmailInput = {
  to: string;
  name: string;
  role?: string;
  photoUrl?: string | null;
  type: string;
  eventName: string;
  eventDate?: Date | null;
  venue?: string;
  /** event poster shown as a banner atop the pass */
  eventImage?: string | null;
  ticketCode: string;
  ticketUrl: string;
  /** the moment the pass stops working — when the event wraps up */
  validUntil?: Date | null;
  qrPng: Buffer;
  /** printable ticket document, attached as ticket.pdf */
  pdf?: Buffer;
};

/* qrSrc: "cid:ticket-qr" when sending (inline attachment); a data URL when
   rendering for the admin preview or the send log. */
export function renderTicketEmail(
  opts: Omit<TicketEmailInput, "qrPng" | "pdf" | "to"> & { hasPdf?: boolean },
  qrSrc = "cid:ticket-qr"
): RenderedEmail {
  /* all times on the pass are event-local (Kigali) — the server TZ used to
     leak in here and shift the printed hours */
  const dateLabel = opts.eventDate
    ? formatEventDate(opts.eventDate, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const typeLabel = opts.type === "PLUS_ONE" ? "GUEST · PLUS-ONE" : opts.type;
  const photoCell = opts.photoUrl
    ? `<img src="${opts.photoUrl}" alt="Your photo" width="84" height="84"
         style="width:84px;height:84px;border-radius:12px;object-fit:cover;border:2px solid #f59300;display:block"/>`
    : "";

  /* the email mirrors the business-card ID shown on the dashboard */
  return {
    subject: `Your event pass ${opts.eventName}`,
    html: shell(`
      <p>Hi ${opts.name.split(" ")[0]},</p>
      <p>${passIntro(opts.type, opts.eventName)}</p>

      <div style="margin:24px 0;border:1px solid #e8e8e6;border-radius:14px;overflow:hidden;background:#123522">
        ${
          opts.eventImage
            ? `<img src="${opts.eventImage}" alt="" width="100%" style="display:block;width:100%;height:150px;object-fit:cover"/>`
            : ""
        }
        <div style="background:#f59300;color:#0b2818;padding:10px 18px;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">
          Igire Rwanda Organization
          <span style="float:right;background:rgba(18,21,13,0.2);border-radius:999px;padding:2px 10px">${typeLabel}</span>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;padding:18px">
          <tr>
            ${photoCell ? `<td style="padding:18px 0 18px 18px;width:96px;vertical-align:top">${photoCell}</td>` : ""}
            <td style="padding:18px;vertical-align:top">
              <p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;text-transform:uppercase">${opts.name}</p>
              ${opts.role ? `<p style="margin:2px 0 0;font-size:13px;font-weight:bold;color:#a9d4a0">${opts.role}</p>` : ""}
              <p style="margin:10px 0 0;font-size:13px;color:#bfd4c5">${opts.eventName}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#bfd4c5">${dateLabel}${dateLabel && opts.venue ? " · " : ""}${opts.venue ?? ""}</p>
            </td>
          </tr>
        </table>
        <div style="text-align:center;padding:0 18px 18px">
          <img src="${qrSrc}" alt="Ticket QR code" width="240" height="240" style="display:block;margin:0 auto"/>
          <p style="margin:10px 0 0;font-size:12px;letter-spacing:2px;color:#bfd4c5">PASS ${opts.ticketCode}</p>
        </div>
        <div style="background:#1b4630;padding:10px 18px;text-align:center;font-size:11px;color:#bfd4c5">
          This pass is personal and its QR code can only be scanned once.${
            opts.validUntil
              ? `<br/>Valid until ${formatEventDateTime(opts.validUntil)} — it expires when the event ends.`
              : ""
          }
        </div>
      </div>

      ${button(opts.ticketUrl, "View my pass online")}
      ${opts.hasPdf ? `<p style="font-size:13px;color:#555">We also attached a printable copy of your ticket as a PDF — handy if your phone battery has other plans.</p>` : ""}
    `),
  };
}

/* -------------------------------------------------------------- delivery
   Single choke point: every send goes through deliver(), which records the
   attempt (and the exact HTML the recipient saw) in EmailLog. Logging is
   best-effort — a report row must never block or fail a real email. */

async function logEmail(
  kind: EmailKind,
  to: string,
  rendered: RenderedEmail,
  status: "SENT" | "FAILED",
  error?: unknown
) {
  try {
    await dbConnect();
    await EmailLog.create({
      kind,
      to,
      subject: rendered.subject,
      html: rendered.html,
      status,
      error: error ? String(error instanceof Error ? error.message : error) : null,
    });
  } catch (err) {
    console.error("email log write failed", err);
  }
}

async function deliver(
  kind: EmailKind,
  to: string,
  rendered: RenderedEmail,
  extra: Partial<Mail.Options> = {},
  /** what to store in the log when it differs from what was transported
      (the ticket email swaps its cid: QR for an inline data URL) */
  logged: RenderedEmail = rendered
) {
  try {
    await transport().sendMail({
      from: FROM(),
      to,
      subject: rendered.subject,
      html: rendered.html,
      ...extra,
    });
  } catch (err) {
    await logEmail(kind, to, logged, "FAILED", err);
    throw err;
  }
  await logEmail(kind, to, logged, "SENT");
}

export async function sendMagicLinkEmail(to: string, name: string, url: string, eventName: string) {
  await deliver("MAGIC_LINK", to, renderMagicLinkEmail({ name, url, eventName }));
}

export async function sendPlusOneInviteEmail(
  to: string,
  participantName: string,
  url: string,
  eventName: string
) {
  await deliver("PLUS_ONE_INVITE", to, renderPlusOneInviteEmail({ participantName, url, eventName }));
}

export async function sendRegistrationConfirmation(to: string, name: string, eventName: string) {
  await deliver("CONFIRMATION", to, renderRegistrationConfirmation({ name, eventName }));
}

export async function sendEventUpdateEmail(
  to: string,
  name: string,
  eventName: string,
  message: string
) {
  await deliver("UPDATE", to, renderEventUpdateEmail({ name, eventName, message }));
}

export async function sendEventReminderEmail(
  to: string,
  name: string,
  eventName: string,
  whenLabel: string
) {
  await deliver("REMINDER", to, renderEventReminderEmail({ name, eventName, whenLabel }));
}

export async function sendTicketNudgeEmail(to: string, name: string, url: string, eventName: string) {
  await deliver("TICKET_NUDGE", to, renderTicketNudgeEmail({ name, url, eventName }));
}

export async function sendTicketEmail(opts: TicketEmailInput) {
  const { to, qrPng, pdf, ...view } = opts;
  const rendered = renderTicketEmail({ ...view, hasPdf: Boolean(pdf) });
  /* the logged copy embeds the QR inline so the admin preview shows the
     real pass, not a broken cid: reference */
  const logged = renderTicketEmail(
    { ...view, hasPdf: Boolean(pdf) },
    `data:image/png;base64,${qrPng.toString("base64")}`
  );
  await deliver("TICKET", to, rendered, {
    attachments: [
      { filename: "ticket-qr.png", content: qrPng, cid: "ticket-qr" },
      ...(pdf
        ? [{ filename: "ticket.pdf", content: pdf, contentType: "application/pdf" }]
        : []),
    ],
  }, logged);
}
