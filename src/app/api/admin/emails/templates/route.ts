import {
  renderMagicLinkEmail,
  renderPlusOneInviteEmail,
  renderRegistrationConfirmation,
  renderEventUpdateEmail,
  renderEventReminderEmail,
  renderProgressReminderEmail,
  renderPlusOneRevokedEmail,
  renderTicketEmail,
  renderTicketNudgeEmail,
} from "@/lib/mailer";
import { GUEST_TYPES } from "@/models/Guest";
import { ticketQrDataUrl } from "@/lib/qr";
import { appUrl } from "@/lib/appUrl";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

/* Live previews of every email the platform sends, rendered from the real
   templates with sample data — what you see here is what recipients get. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const sample = {
    name: "Aline Uwase",
    eventName: "SheCanCODE Demo Day",
    url: appUrl("/verify/sample-token"),
  };

  const qr = await ticketQrDataUrl("SAMPLE-CODE", {
    name: sample.name,
    type: "PARTICIPANT",
    eventName: sample.eventName,
  });

  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  /* the pass email opens differently for every guest type — preview each
     variant so admins can confirm the wording before anyone receives it */
  const GUEST_ROLE: Record<string, string> = {
    VIP: "VIP guest",
    SPEAKER: "Keynote speaker",
    SPONSOR: "Gold sponsor",
    MEDIA: "Press",
    PARTNER: "Partner organisation",
    PLUS_ONE: `Guest of ${sample.name}`,
    GENERAL: "Guest",
  };
  const guestPassVariants = GUEST_TYPES.map((guestType) => ({
    id: `TICKET_${guestType}`,
    name: `Event pass — ${guestType.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}`,
    description: `The pass email a ${guestType.replace(/_/g, "-").toLowerCase()} guest receives when their ticket is issued.`,
    ...renderTicketEmail(
      {
        name: guestType === "PLUS_ONE" ? "Eric Mugisha" : "Grace Ingabire",
        role: GUEST_ROLE[guestType],
        type: guestType,
        eventName: sample.eventName,
        eventDate: in30,
        venue: "Kigali Innovation City",
        ticketCode: "SHE-000107",
        ticketUrl: appUrl("/ticket/sample-code"),
        validUntil: in30,
        hasPdf: true,
      },
      qr
    ),
  }));

  const templates = [
    {
      id: "MAGIC_LINK",
      name: "Verify email (magic link)",
      description: "Sent right after someone registers, to confirm their address.",
      ...renderMagicLinkEmail(sample),
    },
    {
      id: "CONFIRMATION",
      name: "Registration confirmed",
      description: "Sent the first time their email is verified.",
      ...renderRegistrationConfirmation(sample),
    },
    {
      id: "PLUS_ONE_INVITE",
      name: "Plus-one invitation",
      description: "Sent when a participant invites their guest by email.",
      ...renderPlusOneInviteEmail({
        participantName: sample.name,
        url: appUrl("/plus-one/sample-token"),
        eventName: sample.eventName,
      }),
    },
    {
      id: "TICKET_NUDGE",
      name: "Get your ticket (nudge)",
      description:
        "Sent from the Emails page to people who started applying but never finished — invites them to complete their profile and receive their pass.",
      ...renderTicketNudgeEmail({
        name: sample.name,
        url: appUrl("/verify/sample-token"),
        eventName: sample.eventName,
      }),
    },
    {
      id: "TICKET",
      name: "Event pass — participant",
      description: "Sent when the profile is complete and the pass is issued.",
      ...renderTicketEmail(
        {
          name: sample.name,
          role: "Frontend stack",
          type: "PARTICIPANT",
          eventName: sample.eventName,
          eventDate: in30,
          venue: "Kigali Innovation City",
          ticketCode: "SHE-000042",
          ticketUrl: appUrl("/ticket/sample-code"),
          validUntil: in30,
          hasPdf: true,
        },
        qr
      ),
    },
    ...guestPassVariants,
    {
      id: "REMINDER",
      name: "Event reminder",
      description: "The \"coming up\" nudge sent from an event's reminders action.",
      ...renderEventReminderEmail({
        name: sample.name,
        eventName: sample.eventName,
        whenLabel: "on Friday, August 14 at 2:00 PM",
      }),
    },
    {
      id: "PROGRESS_REMINDER_VERIFY",
      name: "Progress reminder — verify email",
      description:
        "Daily nudge to someone who registered but never verified their email address.",
      ...renderProgressReminderEmail({
        name: sample.name,
        eventName: sample.eventName,
        step: "VERIFY",
        url: appUrl("/verify/sample-token"),
        whenLabel: "on Friday, August 14",
      }),
    },
    {
      id: "PROGRESS_REMINDER_FINISH",
      name: "Progress reminder — finish profile",
      description:
        "Daily nudge to someone who verified their email but hasn't added a photo, so no pass is issued yet.",
      ...renderProgressReminderEmail({
        name: sample.name,
        eventName: sample.eventName,
        step: "FINISH",
        url: appUrl("/verify/sample-token"),
        whenLabel: "on Friday, August 14",
      }),
    },
    {
      id: "PROGRESS_REMINDER_PLUS_ONE",
      name: "Progress reminder — invite a plus-one",
      description:
        "Daily nudge to a fully-registered participant who hasn't invited their allowed guest yet.",
      ...renderProgressReminderEmail({
        name: sample.name,
        eventName: sample.eventName,
        step: "PLUS_ONE",
        url: appUrl("/verify/sample-token"),
        whenLabel: "on Friday, August 14",
      }),
    },
    {
      id: "PLUS_ONE_REVOKED",
      name: "Plus-one removed",
      description: "Sent to a plus-one when an admin withdraws their guest pass.",
      ...renderPlusOneRevokedEmail({ name: "Eric Mugisha", eventName: sample.eventName }),
    },
    {
      id: "UPDATE",
      name: "Event update",
      description: "An admin broadcast with a custom message to all participants.",
      ...renderEventUpdateEmail({
        name: sample.name,
        eventName: sample.eventName,
        message: "The venue has changed to the main auditorium — doors open 30 minutes earlier.",
      }),
    },
  ];

  return ok({ templates });
}
