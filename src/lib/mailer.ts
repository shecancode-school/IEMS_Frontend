import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { dbConnect } from "./db";
import { EmailLog, type EmailKind } from "@/models/EmailLog";
import { formatEventDate, formatEventDateTime } from "./time";
import { googleCalendarUrl, icsForEvent } from "./calendarLinks";

/* ------------------------------------------------------------------ SMTP
   Explicit host/port with enforced TLS, and any number of sending accounts.

   `service: "gmail"` was a shorthand that hid the transport settings; naming
   the host and port makes the security properties reviewable and lets the
   whole thing point somewhere other than Gmail without a code change:

     port 587  STARTTLS — connect in the clear, then upgrade. `requireTLS`
               makes the upgrade mandatory, so a downgrade attack fails the
               send instead of quietly transmitting credentials in plaintext.
     port 465  implicit TLS — encrypted from the first byte.

   `servername` is set explicitly for SNI. Without it a host behind shared
   infrastructure presents the wrong certificate and the failure surfaces as a
   misleading "self-signed certificate" error rather than a name mismatch.

   Several accounts can send: MAIL_ACCOUNTS is a JSON array, so a new sender is
   an environment change and a restart, not a redeploy. Each gets its own
   pooled transport, built on first use. */

export type MailAccount = { email: string; pass: string; label: string };

/* Named providers, so a deployment declares MAIL_PROVIDER=gmail rather than
   remembering that Gmail submission is 587 and that 465 means implicit TLS.
   SMTP_HOST / SMTP_PORT still win when they are set, which is what "custom"
   is for. Every preset here is a submission port with mandatory TLS — there
   is deliberately no plaintext 25 entry. */
const PROVIDERS = {
  gmail: { smtp: "smtp.gmail.com", port: 587, imap: "imap.gmail.com", imapPort: 993 },
  zoho: { smtp: "smtp.zoho.com", port: 465, imap: "imap.zoho.com", imapPort: 993 },
  outlook: { smtp: "smtp-mail.outlook.com", port: 587, imap: "outlook.office365.com", imapPort: 993 },
} as const;

type ProviderName = keyof typeof PROVIDERS;

function provider(): (typeof PROVIDERS)[ProviderName] | null {
  const name = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  if (!name || name === "custom") return null;
  const preset = PROVIDERS[name as ProviderName];
  if (!preset) {
    console.error(
      `MAIL_PROVIDER="${name}" is not one of ${Object.keys(PROVIDERS).join(", ")} — set SMTP_HOST/SMTP_PORT explicitly`
    );
    return null;
  }
  return preset;
}

export type SmtpSettings = {
  host: string;
  port: number;
  /** implicit TLS from the first byte (465) vs STARTTLS upgrade (587) */
  implicitTls: boolean;
  encryption: "TLS" | "STARTTLS";
};

/* The single place the transport settings are decided.

   This used to be inlined in three places (transport, mailerConfig, and the
   health check), which meant the admin Emails screen could report a host the
   transport was not actually using. */
export function smtpSettings(): SmtpSettings {
  const preset = provider();
  const host = process.env.SMTP_HOST?.trim() || preset?.smtp || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? preset?.port ?? 587);
  const implicitTls = port === 465;
  return { host, port, implicitTls, encryption: implicitTls ? "TLS" : "STARTTLS" };
}

/* IMAP is not used for sending; it is reported so an administrator can see
   the whole mailbox configuration in one place on the health screen. */
export function imapSettings(): { host: string; port: number } | null {
  const preset = provider();
  const host = process.env.IMAP_HOST?.trim() || preset?.imap;
  if (!host) return null;
  return { host, port: Number(process.env.IMAP_PORT ?? preset?.imapPort ?? 993) };
}

let accountCache: MailAccount[] | undefined;

export function mailAccounts(): MailAccount[] {
  if (accountCache) return accountCache;

  const raw = process.env.MAIL_ACCOUNTS?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MailAccount[];
      const valid = parsed.filter((a) => a?.email && a?.pass);
      if (valid.length) {
        accountCache = valid.map((a) => ({
          email: a.email.trim(),
          pass: a.pass.trim(),
          label: a.label?.trim() || a.email.trim(),
        }));
        return accountCache;
      }
    } catch {
      /* a malformed MAIL_ACCOUNTS must not silently mean "no email at all" —
         fall through to the single-account variables below */
      console.error("MAIL_ACCOUNTS is not valid JSON — falling back to GMAIL_USER");
    }
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  accountCache = user && pass ? [{ email: user, pass, label: "Default" }] : [];
  return accountCache;
}

/* Which account sends when the caller does not name one. */
export function defaultMailAccount(): MailAccount {
  const all = mailAccounts();
  if (!all.length) {
    throw new Error("No sending account configured — set MAIL_ACCOUNTS or GMAIL_USER/GMAIL_APP_PASSWORD");
  }
  const preferred = process.env.MAIL_FROM?.trim().toLowerCase();
  return all.find((a) => a.email.toLowerCase() === preferred) ?? all[0];
}

function resolveAccount(email?: string): MailAccount {
  if (!email) return defaultMailAccount();
  const match = mailAccounts().find((a) => a.email.toLowerCase() === email.toLowerCase());
  /* an unknown sender falls back rather than throwing: a stale saved choice in
     the admin UI should not stop an email going out */
  return match ?? defaultMailAccount();
}

/* One pooled transport per account, built lazily.

   Lazy matters: the app injects env before modules run, but tsx (seed, health,
   tests) loads .env.local after the hoisted imports evaluate, so an eager
   transport would capture undefined credentials and fail every send with
   "Missing credentials". */
const transports = new Map<string, Transporter>();

function transport(account: MailAccount = defaultMailAccount()): Transporter {
  const existing = transports.get(account.email);
  if (existing) return existing;

  const { host, port, implicitTls } = smtpSettings();

  const created = nodemailer.createTransport({
    host,
    port,
    /* true only for implicit-TLS 465; 587 starts plain and upgrades */
    secure: implicitTls,
    /* on 587 the upgrade is mandatory — never fall back to an unencrypted
       session just because the server did not advertise STARTTLS */
    requireTLS: !implicitTls,
    /* pooling is the speed fix: without it every email pays a fresh TLS
       handshake + login (1–3s). The pool keeps 4 authenticated connections
       open and sends through them concurrently, so one email costs
       ~200–500ms and a blast runs 4-wide. */
    pool: true,
    maxConnections: 4,
    maxMessages: 100,
    /* a wedged connection must fail fast, not stall a send for minutes */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: {
      /* SNI — without it a shared-infrastructure host presents the wrong
         certificate and the error reads as "self-signed certificate" */
      servername: host,
      minVersion: "TLSv1.2",
      /* certificate verification stays on. If a deployment genuinely needs it
         off, that belongs in a documented, deliberate change here — not an
         env var someone can flip by accident. */
      rejectUnauthorized: true,
    },
    auth: { user: account.email, pass: account.pass },
  });

  transports.set(account.email, created);
  return created;
}

const FROM = (account: MailAccount) =>
  `Igire Rwanda Organization Events <${account.email}>`;

/* Liveness check for the health-check script: opens the connection and
   authenticates against EVERY configured account without sending anything, so
   a broken app password on the second sender is caught before it is used. */
export async function verifyMailer(): Promise<boolean> {
  const all = mailAccounts();
  if (!all.length) throw new Error("No sending account configured");
  const results = await Promise.allSettled(all.map((a) => transport(a).verify()));

  const failed = results
    .map((r, i) => (r.status === "rejected" ? all[i].email : null))
    .filter(Boolean);
  if (failed.length) throw new Error(`SMTP verification failed for: ${failed.join(", ")}`);
  return true;
}

/* the transport settings, for the health page and the admin Emails screen */
export function mailerConfig() {
  const { host, port, encryption } = smtpSettings();
  return {
    host,
    port,
    encryption,
    provider: process.env.MAIL_PROVIDER?.trim().toLowerCase() || "custom",
    imap: imapSettings(),
    accounts: mailAccounts().map((a) => ({ email: a.email, label: a.label })),
    defaultFrom: mailAccounts().length ? defaultMailAccount().email : null,
  };
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
  const first = p.name.split(" ")[0];
  const when = p.whenLabel ? ` ${p.whenLabel}` : "";
  if (p.step === "VERIFY") {
    return {
      subject: `Finish signing up for ${p.eventName}`,
      html: shell(`
        <p>Hi ${first},</p>
        <p>You're registered for <b>${p.eventName}</b>${when}, but your email address isn't verified yet — so we can't issue your event pass.</p>
        <p><b>Where you are:</b> step 1 of 2, confirm your email. <b>What's next:</b> click below to verify, then add a photo and your pass is on its way.</p>
        ${button(p.url, "Verify my email & continue")}
        <p style="font-size:13px;color:#555">This sign-in link is single-use and expires in 72 hours.</p>
      `),
    };
  }
  if (p.step === "FINISH") {
    return {
      subject: `One step left for your ${p.eventName} pass`,
      html: shell(`
        <p>Hi ${first},</p>
        <p>Your email is verified for <b>${p.eventName}</b>${when} — you're almost there. We just need a profile photo before your event pass can be issued.</p>
        <p><b>Where you are:</b> step 2 of 2, complete your profile. <b>What's next:</b> sign in below, add your photo, and your pass is emailed to you right away.</p>
        ${button(p.url, "Finish & get my pass")}
        <p style="font-size:13px;color:#555">This sign-in link is single-use and expires in 72 hours.</p>
      `),
    };
  }
  /* PLUS_ONE — fully registered, but hasn't invited their one allowed guest */
  return {
    subject: `Bring a guest to ${p.eventName}`,
    html: shell(`
      <p>Hi ${first},</p>
      <p>You're all set for <b>${p.eventName}</b>${when} and your pass has been issued. A quick reminder: you can bring <b>one guest</b>, and you haven't invited a plus-one yet.</p>
      <p><b>What's next:</b> sign in to your dashboard below to add your plus-one's details, or send them their own invite link. Their guest pass is issued the moment they're added.</p>
      ${button(p.url, "Invite my plus-one")}
      <p style="font-size:13px;color:#555">This sign-in link is single-use and expires in 72 hours. If you'd rather come on your own, you can ignore this — no action needed.</p>
    `),
  };
}

/* Sent to a plus-one when an admin removes them from an event: their guest pass
   no longer works. */
export function renderPlusOneRevokedEmail(p: { name: string; eventName: string }): RenderedEmail {
  return {
    subject: `Update on your guest pass for ${p.eventName}`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>We're letting you know that your guest pass for <b>${p.eventName}</b> has been withdrawn. It can no longer be used to enter the event, and any QR code you were sent is now inactive.</p>
      <p>If you think this was a mistake, please reply to this email or reach out to the person who originally invited you.</p>
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
  /** online and hybrid events: the Google Meet link, shown alongside the pass */
  meetLink?: string | null;
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

      ${
        opts.meetLink
          ? `<div style="margin:24px 0;padding:16px 18px;background:#f6f7f5;border-radius:10px">
               <p style="margin:0 0 4px;font-weight:bold;color:#0b2818">This one is online</p>
               <p style="margin:0 0 12px;font-size:14px;color:#555">Join with the link below when it starts — the same link is in your calendar invitation.</p>
               <a href="${opts.meetLink}" style="background:#0b2818;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 22px;border-radius:8px;display:inline-block">Join the Google Meet</a>
             </div>`
          : ""
      }
      ${button(opts.ticketUrl, "View my pass online")}
      ${opts.hasPdf ? `<p style="font-size:13px;color:#555">We also attached a printable copy of your ticket as a PDF — handy if your phone battery has other plans.</p>` : ""}
    `),
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

/* Reminders/updates are the bulk, "could look like marketing" messages — giving
   them a List-Unsubscribe header is what Gmail's bulk-sender guidelines ask for
   and keeps them out of spam. Transactional mail (magic link, ticket) is left
   alone: an unsubscribe link there would be nonsensical. */
const BULK_KINDS = new Set<EmailKind>(["REMINDER", "PROGRESS_REMINDER", "UPDATE"]);

async function logEmail(
  kind: EmailKind,
  to: string,
  rendered: RenderedEmail,
  status: "SENT" | "FAILED",
  error?: unknown,
  /** which sending account was used — needed to trace a delivery problem back
      to one mailbox when several are in rotation */
  from?: string
) {
  try {
    await dbConnect();
    await EmailLog.create({
      kind,
      to,
      from: from ?? "",
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
  logged: RenderedEmail = rendered,
  /** which configured account sends it; omitted means the default */
  fromAccount?: string
) {
  const account = resolveAccount(fromAccount);

  /* `extra` is caller-supplied message options (attachments, headers). It must
     never be able to rewrite who the message claims to be from: a From that
     does not match the authenticated account fails DMARC alignment and the
     mail is filed as spam or rejected outright. Strip both keys rather than
     trusting every caller to leave them alone. */
  const { from: _ignoredFrom, envelope: _ignoredEnvelope, ...safeExtra } = extra;
  void _ignoredFrom;
  void _ignoredEnvelope;

  try {
    await transport(account).sendMail({
      from: FROM(account),
      /* The envelope sender must match the authenticated account, or SPF and
         DKIM alignment break and the message lands in spam. Stating it
         explicitly keeps that true even when `from` is a display name. */
      envelope: { from: account.email, to },
      /* replies reach a real inbox — mail with a valid, aligned Reply-To is
         trusted more than a no-reply sender */
      replyTo: account.email,
      to,
      subject: rendered.subject,
      html: rendered.html,
      /* the plain-text half of the multipart/alternative message */
      text: htmlToText(rendered.html),
      ...(BULK_KINDS.has(kind)
        ? {
            list: {
              unsubscribe: {
                url: `mailto:${account.email}?subject=Unsubscribe`,
                comment: "Unsubscribe from Igire Rwanda event emails",
              },
            },
          }
        : {}),
      ...safeExtra,
    });
  } catch (err) {
    /* log writes are off the critical path — the send result never waits on
       the database */
    void logEmail(kind, to, logged, "FAILED", err, account.email);
    throw err;
  }
  void logEmail(kind, to, logged, "SENT", undefined, account.email);
}

/* --------------------------------------------------------------- bookings */
/* Every time is written with an explicit "(Kigali time, UTC+2)" — a requester
   may well be in another country, and the instant is unambiguous to us but the
   rendered string is not to them. */

export function renderBookingConfirmationEmail(p: {
  name: string;
  hostName: string;
  when: string;
  meetLink: string | null;
  cancelUrl: string;
  topic: string;
  /* the real instants, for the "add to calendar" link. Optional so the
     existing callers and the admin preview keep working without them. */
  start?: Date;
  end?: Date;
  location?: string;
}): RenderedEmail {
  /* The booking is on the HOST's calendar automatically — we hold that
     connection. The person who booked is usually not staff, so unless we hand
     them a link this email is the only record they have of it. */
  const addToCalendar =
    p.start && p.end
      ? googleCalendarUrl({
          title: `Meeting with ${p.hostName}`,
          start: p.start,
          end: p.end,
          details: [p.topic, p.meetLink ? `Join: ${p.meetLink}` : ""].filter(Boolean).join("\n\n"),
          location: p.meetLink ?? p.location ?? "",
        })
      : null;

  return {
    subject: `Confirmed: your meeting with ${p.hostName}`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>Your meeting with <b>${p.hostName}</b> is confirmed for <b>${p.when}</b>.</p>
      ${p.topic ? `<p style="background:#f6f7f5;border-radius:8px;padding:12px 14px;margin:18px 0"><b>What you asked about</b><br/>${p.topic}</p>` : ""}
      ${
        p.meetLink
          ? `${button(p.meetLink, "Join the Google Meet")}<p style="font-size:13px;color:#555">The same link is on the calendar invitation, so you can join from either.</p>`
          : `<p>${p.hostName} will be in touch with the joining details closer to the time.</p>`
      }
      ${
        addToCalendar
          ? `<p style="margin:22px 0"><a href="${addToCalendar}" style="border:1px solid #0b2818;color:#0b2818;text-decoration:none;font-weight:bold;padding:11px 22px;border-radius:8px;display:inline-block">Add to Google Calendar</a></p>
             <p style="font-size:13px;color:#555">Not on Google? The attached invitation opens in Outlook, Apple Calendar and anything else that reads .ics.</p>`
          : ""
      }
      <p style="font-size:13px;color:#555">Something come up? You can <a href="${p.cancelUrl}">cancel this meeting</a> — please do, so the slot goes back to someone else.</p>
    `),
  };
}

export function renderBookingHostNoticeEmail(p: {
  hostName: string;
  requesterName: string;
  requesterEmail: string;
  when: string;
  meetLink: string | null;
  topic: string;
}): RenderedEmail {
  return {
    subject: `New booking: ${p.requesterName}, ${p.when}`,
    html: shell(`
      <p>Hi ${p.hostName.split(" ")[0]},</p>
      <p><b>${p.requesterName}</b> (${p.requesterEmail}) booked time with you on <b>${p.when}</b>.</p>
      ${p.topic ? `<p style="background:#f6f7f5;border-radius:8px;padding:12px 14px;margin:18px 0"><b>What they want to talk about</b><br/>${p.topic}</p>` : ""}
      ${p.meetLink ? button(p.meetLink, "Join the Google Meet") : ""}
      <p style="font-size:13px;color:#555">It is already on your calendar, and the slot is now closed to everyone else.</p>
    `),
  };
}

export function renderBookingCancelledEmail(p: {
  name: string;
  otherName: string;
  when: string;
  cancelledByThem: boolean;
}): RenderedEmail {
  return {
    subject: `Cancelled: your meeting on ${p.when}`,
    html: shell(`
      <p>Hi ${p.name.split(" ")[0]},</p>
      <p>${
        p.cancelledByThem
          ? `<b>${p.otherName}</b> has cancelled your meeting on <b>${p.when}</b>.`
          : `Your meeting with <b>${p.otherName}</b> on <b>${p.when}</b> has been cancelled.`
      }</p>
      <p>Nothing else is needed from you — the calendar entry has been removed and the time is free again.</p>
    `),
  };
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

export async function sendBookingConfirmationEmail(p: {
  to: string;
  name: string;
  hostName: string;
  when: string;
  meetLink: string | null;
  cancelUrl: string;
  topic: string;
  /* when supplied, the email carries an "add to calendar" link and an .ics */
  start?: Date;
  end?: Date;
  location?: string;
  bookingId?: string;
}) {
  const rendered = renderBookingConfirmationEmail(p);
  /* .ics alongside the Google link: attachments cover Outlook and Apple, the
     link covers phones where opening an attachment is fiddly. */
  const invite =
    p.start && p.end
      ? [
          {
            filename: "meeting.ics",
            content: icsForEvent(
              {
                title: `Meeting with ${p.hostName}`,
                start: p.start,
                end: p.end,
                details: p.topic,
                location: p.meetLink ?? p.location ?? "",
              },
              `${p.bookingId ?? p.start.getTime()}@igirerwanda.org`
            ),
            contentType: "text/calendar; charset=utf-8; method=PUBLISH",
          },
        ]
      : undefined;

  await deliver(
    "BOOKING_CONFIRMED",
    p.to,
    rendered,
    invite ? { attachments: invite } : {}
  );
}

export async function sendBookingHostNoticeEmail(p: {
  to: string;
  hostName: string;
  requesterName: string;
  requesterEmail: string;
  when: string;
  meetLink: string | null;
  topic: string;
}) {
  await deliver("BOOKING_HOST_NOTICE", p.to, renderBookingHostNoticeEmail(p));
}

export async function sendBookingCancelledEmail(p: {
  to: string;
  name: string;
  otherName: string;
  when: string;
  cancelledByThem: boolean;
}) {
  await deliver("BOOKING_CANCELLED", p.to, renderBookingCancelledEmail(p));
}
