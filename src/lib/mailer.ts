import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { dbConnect } from "./db";
import { EmailLog, type EmailKind } from "@/models/EmailLog";
import { formatEventDate, formatEventDateTime } from "./time";
import { emailUnsubscribeAddress, renderEmailFooter } from "./emailFooter";

/* Build the transporter lazily so the Gmail credentials are read at call time.
   The app injects env before modules run, but tsx (seed/health/tests) loads
   .env.local after the hoisted imports evaluate — an eager transporter would
   capture undefined creds and fail every send with "Missing credentials". */
let cached: Transporter | undefined;
function transport(): Transporter {
  if (!cached) {
    cached = nodemailer.createTransport({
      service: "gmail",
      /* pooling is the speed fix: without it every email pays a fresh TLS
         handshake + Gmail login (1–3s). The pool keeps 4 authenticated
         connections open and sends through them concurrently, so one email
         costs ~200–500ms and a blast runs 4-wide. */
      pool: true,
      maxConnections: 4,
      maxMessages: 100,
      /* a wedged connection must fail fast, not stall a send for minutes */
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return cached;
}

const senderAddress = () => process.env.MAIL_FROM_ADDRESS || "no-reply@igirerwanda.org";
export const emailSender = () => `Igire Rwanda Official Team <${senderAddress()}>`;

/* liveness check for the health-check script — verifies the SMTP connection
   and credentials without sending a message. Throws on failure. */
export async function verifyMailer(): Promise<boolean> {
  return transport().verify();
}

/* ------------------------------------------------------------- templates
   Every template renders to { subject, html } so the admin Emails page can
   preview exactly what recipients see without sending anything. */

export type RenderedEmail = { subject: string; html: string };

const escapeEmailText = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

function shell(body: string, heading: string, programmeName: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="color-scheme" content="light dark"/><title>${escapeEmailText(heading)}</title>
<style>
  :root { color-scheme: light dark; }
  @media (prefers-color-scheme: dark) {
    body { color: #f4f4f5 !important; }
    .email-note, [data-email-footer], [data-email-footer] p, [data-email-footer] a { color: #a1a1aa !important; }
    [data-email-footer] td { color: #7cc35a !important; }
    .email-update { background: #27272a !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:transparent;color:#000000;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:0;margin:0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif">
        <tr><td style="color:inherit;text-align:center;padding:25px">
          <h1 style="margin:0;font-size:24px;line-height:1.3">${escapeEmailText(heading)}</h1>
          <p style="margin:5px 0 0;font-size:16px">${escapeEmailText(programmeName)}</p>
        </td></tr>
        <tr><td style="padding:25px;color:inherit;font-size:16px;line-height:1.6;overflow-wrap:break-word">
          ${body}
        </td></tr>
        <tr><td style="padding:0 0 12px">${renderEmailFooter()}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const button = (url: string, text: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td bgcolor="#065f46" style="border-radius:8px;text-align:center">
    <a href="${escapeEmailText(url)}" style="display:inline-block;padding:14px 24px;border:1px solid #065f46;border-radius:8px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">${text}</a>
  </td></tr></table>`;

export function renderMagicLinkEmail(p: {
  name: string;
  url: string;
  eventName: string;
}): RenderedEmail {
  return {
    subject: `Verify your email — ${p.eventName}`,
    html: shell(`
      <p>Dear <strong>${escapeEmailText(p.name)}</strong>,</p>
      <p>Thank you for registering for <b>${p.eventName}</b>. To continue, please verify your email address using the button below.</p>
      ${button(p.url, "Verify my email")}
      <p class="email-note" style="font-size:13px;color:#555">For your security, this link can be used once and expires in 30 minutes.</p>
    `, "Verify your email address", p.eventName),
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
    `, "You’re invited to join us", p.eventName),
  };
}

export function renderRegistrationConfirmation(p: {
  name: string;
  eventName: string;
  /** limit 0 = unlimited plus-ones */
  plusOne?: { allowed: boolean; limit: number };
}): RenderedEmail {
  return {
    subject: `You're registered for ${p.eventName}`,
    html: shell(`
      <p>Dear <strong>${escapeEmailText(p.name)}</strong>,</p>
      <p>Your registration for <b>${p.eventName}</b> is confirmed — welcome aboard!</p>
      <p>The next step is to complete your profile so we can issue your event pass. You will receive it by email as soon as it's ready.</p>
      ${
        /* participants without a plus-one place simply aren't offered one */
        p.plusOne?.allowed
          ? `<p>You can also bring a plus-one. Add your guest from your dashboard.</p>`
          : ""
      }
    `, "Your registration is confirmed", p.eventName),
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
      <p>Dear <strong>${escapeEmailText(p.name)}</strong>,</p>
      <p>There's an update about <b>${p.eventName}</b>:</p>
      <p class="email-update" style="padding:12px 16px;background:#f6f7f5;border-radius:8px">${p.message}</p>
    `, "An update about your event", p.eventName),
  };
}

/* The daily status-aware nudge. `step` selects which unfinished part of the
   flow the participant is stuck on, so the email always says where they are and
   exactly what to do next. All steps share one single-use sign-in link:
   PENDING verifies the email, VERIFIED/COMPLETE land on the dashboard. */
export type ProgressStep = "VERIFY" | "FINISH" | "PLUS_ONE";

export function renderProgressReminderEmail(p: {
  name: string;
  eventName: string;
  step: ProgressStep;
  url: string;
  whenLabel?: string;
}): RenderedEmail {
  const first = escapeEmailText(p.name);
  const when = p.whenLabel ? ` ${escapeEmailText(p.whenLabel)}` : "";
  if (p.step === "VERIFY") {
    return {
      subject: `Finish signing up for ${p.eventName}`,
      html: shell(`
        <p>Dear <strong>${first}</strong>,</p>
        <p>You're registered for <b>${p.eventName}</b>${when}, but your email address isn't verified yet — so we can't issue your event pass.</p>
        <p><b>Where you are:</b> step 1 of 2, confirm your email. <b>What's next:</b> click below to verify, then add a photo and your pass is on its way.</p>
        ${button(p.url, "Verify my email & continue")}
        <p class="email-note" style="font-size:13px;color:#555">This sign-in link is single-use and expires in 72 hours.</p>
      `, "Verify your email to continue", p.eventName),
    };
  }
  if (p.step === "FINISH") {
    return {
      subject: `One step left for your ${p.eventName} pass`,
      html: shell(`
        <p>Dear <strong>${first}</strong>,</p>
        <p>Your email is verified for <b>${p.eventName}</b>${when} — you're almost there. We just need a profile photo before your event pass can be issued.</p>
        <p><b>Where you are:</b> step 2 of 2, complete your profile. <b>What's next:</b> sign in below, add your photo, and your pass is emailed to you right away.</p>
        ${button(p.url, "Finish & get my pass")}
        <p class="email-note" style="font-size:13px;color:#555">This sign-in link is single-use and expires in 72 hours.</p>
      `, "Complete your profile", p.eventName),
    };
  }
  /* PLUS_ONE — fully registered, but hasn't invited their one allowed guest */
  return {
    subject: `Bring a guest to ${p.eventName}`,
    html: shell(`
      <p>Dear <strong>${first}</strong>,</p>
      <p>You're all set for <b>${p.eventName}</b>${when} and your pass has been issued. A quick reminder: you can bring <b>one guest</b>, and you haven't invited a plus-one yet.</p>
      <p><b>What's next:</b> sign in to your dashboard below to add your plus-one's details, or send them their own invite link. Their guest pass is issued the moment they're added.</p>
      ${button(p.url, "Invite my plus-one")}
      <p class="email-note" style="font-size:13px;color:#555">This sign-in link is single-use and expires in 72 hours. If you'd rather come on your own, you can ignore this — no action needed.</p>
    `, "Bring someone along", p.eventName),
  };
}

/* Sent to a plus-one when an admin removes them from an event: their guest pass
   no longer works. */
export function renderPlusOneRevokedEmail(p: { name: string; eventName: string }): RenderedEmail {
  return {
    subject: `Update on your guest pass for ${p.eventName}`,
    html: shell(`
      <p>Dear <strong>${escapeEmailText(p.name)}</strong>,</p>
      <p>We're letting you know that your guest pass for <b>${p.eventName}</b> has been withdrawn. It can no longer be used to enter the event, and any QR code you were sent is now inactive.</p>
      <p>If you think this was a mistake, please contact your event organiser or the person who originally invited you.</p>
    `, "An update about your guest pass", p.eventName),
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
      <p>Dear <strong>${escapeEmailText(p.name)}</strong>,</p>
      <p>This is a friendly reminder that <b>${p.eventName}</b> is happening ${p.whenLabel}.</p>
      <p>Please bring your event pass — the QR code will be scanned at the entrance. We look forward to seeing you there!</p>
    `, "Your event is coming up", p.eventName),
  };
}

/* Each guest type gets its own opening line, so a VIP isn't welcomed with
   the same words as a press badge. Falls back to the participant copy. */
const PASS_INTROS: Record<string, (eventName: string) => string> = {
  VIP: (e) =>
    `It is our pleasure to welcome you as a VIP guest at <b>${e}</b>. Your VIP ticket is attached — please present the QR code at the entrance for priority access.`,
  SPEAKER: (e) =>
    `Thank you for joining <b>${e}</b> as a speaker — we're honoured to have you on stage. Your speaker ticket is attached; please present the QR code at the entrance.`,
  SPONSOR: (e) =>
    `Thank you for supporting <b>${e}</b> as a sponsor. Your sponsor ticket is attached — please present the QR code at the entrance.`,
  MEDIA: (e) =>
    `Welcome to <b>${e}</b>. Your press ticket is attached — please present the QR code at the entrance.`,
  PARTNER: (e) =>
    `We're delighted to welcome you to <b>${e}</b> as our partner. Your partner ticket is attached — please present the QR code at the entrance.`,
  PLUS_ONE: (e) =>
    `You're confirmed as a guest at <b>${e}</b>. Your guest ticket is attached — simply show the QR code at the entrance and you're in.`,
  GENERAL: (e) =>
    `You're confirmed for <b>${e}</b>. Your ticket is attached — simply show the QR code at the entrance and you're in.`,
};

function passIntro(type: string, eventName: string): string {
  const intro = PASS_INTROS[type];
  if (intro) return intro(eventName);
  return `Great news — you're all set for <b>${eventName}</b>! Your ticket is attached; simply show the QR code at the entrance and you're in.`;
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
      <p>Dear <strong>${escapeEmailText(p.name)}</strong>,</p>
      <p>Your spot at <b>${p.eventName}</b> is reserved, but your registration isn't finished yet — and we can't issue your event pass until it is.</p>
      <p>It only takes a minute: sign in below, complete your profile, and your pass will be emailed to you right away.</p>
      ${button(p.url, "Finish my registration")}
      <p class="email-note" style="font-size:13px;color:#555">For your security, this link can be used once and expires in 72 hours.</p>
    `, "Your event pass is waiting", p.eventName),
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
  /** The single ticket artifact, attached as ticket.pdf. */
  pdf: Buffer;
};

/** Email is a delivery note; the attached PDF is the only ticket. */
export function renderTicketEmail(
  opts: Omit<TicketEmailInput, "pdf" | "to"> & { hasPdf?: boolean },
): RenderedEmail {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
  const date = opts.eventDate ? formatEventDate(opts.eventDate) : "";
  return {
    subject: `Your ticket for ${opts.eventName}`,
    html: shell(`
      <p>Dear <strong>${escape(opts.name)}</strong>,</p>
      <p>${passIntro(opts.type, escape(opts.eventName))}</p>
      <p>${[date, opts.venue].filter(Boolean).map((value) => escape(value!)).join(" · ")}</p>
      <p>Your ticket is the PDF attached to this email. <b>Scroll to the bottom of this email to find the attached ticket.pdf file.</b> Save it to your phone or print it, and show its QR code at the entrance. Each ticket admits one person.</p>
      ${button(opts.ticketUrl, "Open my ticket")}
      <p class="email-note" style="font-size:13px;color:#555">The link opens the same ticket. Keep it private.${opts.validUntil ? `<br/>Entry closes ${formatEventDateTime(opts.validUntil)} (Kigali).` : ""}</p>
    `, "Your event ticket is ready", opts.eventName),
  };
}

/* -------------------------------------------------------------- delivery
   Single choke point: every send goes through deliver(), which records the
   attempt (and the exact HTML the recipient saw) in EmailLog. Logging is
   best-effort — a report row must never block or fail a real email. */

/* A readable plain-text version of the HTML. Sending a multipart/alternative
   message (text + html) is one of the strongest, cheapest spam-filter wins —
   HTML-only mail is a classic spam signal and Gmail scores it down. Links are
   kept inline as "text (url)" so nothing is lost for text-only clients. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* Reminders and updates also expose the shared footer's unsubscribe mailbox in headers. */
const BULK_KINDS = new Set<EmailKind>(["REMINDER", "PROGRESS_REMINDER", "UPDATE"]);

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
  /** Optional logged rendering when it differs from the transported HTML. */
  logged: RenderedEmail = rendered
) {
  try {
    await transport().sendMail({
      from: emailSender(),
      replyTo: process.env.MAIL_REPLY_TO || senderAddress(),
      to,
      subject: rendered.subject,
      html: rendered.html,
      /* the plain-text half of the multipart/alternative message */
      text: htmlToText(rendered.html),
      ...(BULK_KINDS.has(kind)
        ? {
            list: {
              unsubscribe: {
                url: `mailto:${emailUnsubscribeAddress()}?subject=Unsubscribe`,
                comment: "Unsubscribe from Igire Rwanda event emails",
              },
            },
          }
        : {}),
      ...extra,
    });
  } catch (err) {
    // Finish the best-effort log before a serverless request can stop execution.
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

export async function sendRegistrationConfirmation(
  to: string,
  name: string,
  eventName: string,
  plusOne?: { allowed: boolean; limit: number }
) {
  await deliver("CONFIRMATION", to, renderRegistrationConfirmation({ name, eventName, plusOne }));
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

export async function sendProgressReminderEmail(
  to: string,
  name: string,
  eventName: string,
  step: ProgressStep,
  url: string,
  whenLabel?: string
) {
  await deliver(
    "PROGRESS_REMINDER",
    to,
    renderProgressReminderEmail({ name, eventName, step, url, whenLabel })
  );
}

export async function sendPlusOneRevokedEmail(to: string, name: string, eventName: string) {
  await deliver("PLUS_ONE_REVOKED", to, renderPlusOneRevokedEmail({ name, eventName }));
}

export async function sendTicketEmail(opts: TicketEmailInput) {
  const { to, pdf, ...view } = opts;
  const rendered = renderTicketEmail({ ...view, hasPdf: true });
  await deliver("TICKET", to, rendered, {
    attachments: [{ filename: "ticket.pdf", content: pdf, contentType: "application/pdf" }],
  });
}
