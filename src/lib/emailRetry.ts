import type { Types } from "mongoose";
import { EmailLog, Event, Guest, Participant, Ticket, type EmailKind } from "@/models";
import { sendRegistrationConfirmation } from "./mailer";
import { sendParticipantInvitation } from "./participantInvitation";
import { resendTicket } from "./tickets";
import { plusOnesFull } from "./plusOneSlots";

/* Kinds an admin can retry: each one is rebuilt fresh (new sign-in link, current
   ticket) instead of replaying the stored HTML, whose links may have expired. */
export const RETRYABLE_EMAIL_KINDS = ["MAGIC_LINK", "CONFIRMATION", "TICKET"] as const;
export type RetryableEmailKind = (typeof RETRYABLE_EMAIL_KINDS)[number];

export type UnresolvedFailure = { kind: EmailKind; to: string; failedAt: Date };

export type RetrySummary = {
  sent: string[];
  skipped: { to: string; reason: string }[];
  failed: { to: string; error: string }[];
};

/* Every address that belongs to an event: participants, guests and the
   snapshots of guests who already checked in. */
export async function eventEmails(eventId: Types.ObjectId): Promise<string[]> {
  const [participants, guests, holders] = await Promise.all([
    Participant.find({ event: eventId }).distinct("email"),
    Guest.find({ event: eventId }).distinct("email"),
    Ticket.find({ event: eventId }).distinct("holder.email"),
  ]);
  return [...new Set([...participants, ...guests, ...holders].filter(Boolean) as string[])];
}

/* A failure stays unresolved only while it is the latest attempt for that
   address and kind: a later successful send of the same kind settles it. */
export async function unresolvedFailures(
  emails: string[],
  kind?: EmailKind
): Promise<UnresolvedFailure[]> {
  if (emails.length === 0) return [];
  const rows: { _id: { kind: EmailKind; to: string }; status: string; at: Date }[] =
    await EmailLog.aggregate([
      { $match: { to: { $in: emails }, ...(kind ? { kind } : {}) } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { kind: "$kind", to: "$to" },
          status: { $first: "$status" },
          resolvedAt: { $first: "$resolvedAt" },
          at: { $first: "$createdAt" },
        },
      },
      { $match: { status: "FAILED", resolvedAt: null } },
    ]);
  return rows.map((r) => ({ kind: r._id.kind, to: r._id.to, failedAt: r.at }));
}

async function retryOne(
  eventId: Types.ObjectId,
  eventName: string,
  plusOneLimit: number,
  failure: UnresolvedFailure
): Promise<{ sent: true } | { skipped: string }> {
  const participant = await Participant.findOne({ event: eventId, email: failure.to });

  if (failure.kind === "MAGIC_LINK") {
    if (!participant) return { skipped: "No longer registered for this event" };
    if (participant.status !== "PENDING") return { skipped: "Already verified their email" };
    if (participant.registrationStatus === "REJECTED") return { skipped: "Registration rejected" };
    await sendParticipantInvitation(participant, eventName);
    return { sent: true };
  }

  if (failure.kind === "CONFIRMATION") {
    if (!participant) return { skipped: "No longer registered for this event" };
    if (participant.registrationStatus === "REJECTED") return { skipped: "Registration rejected" };
    await sendRegistrationConfirmation(participant.email, participant.name, eventName, {
      allowed: !(await plusOnesFull(eventId)),
      limit: plusOneLimit,
    });
    return { sent: true };
  }

  if (failure.kind === "TICKET") {
    const guest = participant ? null : await Guest.findOne({ event: eventId, email: failure.to });
    const holderId = participant?._id ?? guest?._id;
    const ticket = holderId
      ? await Ticket.findOne({ event: eventId, holderId })
      : await Ticket.findOne({ event: eventId, "holder.email": failure.to });
    if (!ticket) return { skipped: "No ticket for this person any more" };
    if (ticket.status === "REVOKED") return { skipped: "Ticket was cancelled" };
    if (ticket.status === "USED") return { skipped: "Already checked in" };
    if (ticket.sentAt && ticket.sentAt > failure.failedAt) {
      return { skipped: "Ticket was delivered after the failure" };
    }
    const delivered = await resendTicket(ticket);
    return delivered ? { sent: true } : { skipped: "Ticket has no active holder" };
  }

  return { skipped: "This email type can't be retried" };
}

const running = new Set<string>();

/* Re-sends one kind of failed email for an event, only to people whose latest
   attempt of that kind failed and who still need it. Refuses to run twice at
   once for the same event and kind, so a double click can't double-send. */
export async function retryFailedEmails(
  eventId: Types.ObjectId,
  kind: RetryableEmailKind
): Promise<RetrySummary | null> {
  const key = `${eventId}:${kind}`;
  if (running.has(key)) return null;
  running.add(key);
  try {
    const event = await Event.findById(eventId).select("name plusOneLimit");
    if (!event) return { sent: [], skipped: [], failed: [] };
    const failures = await unresolvedFailures(await eventEmails(eventId), kind);
    const summary: RetrySummary = { sent: [], skipped: [], failed: [] };
    for (let i = 0; i < failures.length; i += 4) {
      await Promise.all(
        failures.slice(i, i + 4).map(async (f) => {
          try {
            const result = await retryOne(eventId, event.name, event.plusOneLimit ?? 0, f);
            if ("sent" in result) summary.sent.push(f.to);
            else {
              summary.skipped.push({ to: f.to, reason: result.skipped });
              /* they no longer need it: stop counting this failure as outstanding */
              await EmailLog.updateMany(
                { kind: f.kind, to: f.to, status: "FAILED", resolvedAt: null },
                { $set: { resolvedAt: new Date() } }
              );
            }
          } catch (err) {
            summary.failed.push({ to: f.to, error: err instanceof Error ? err.message : "Send failed" });
          }
        })
      );
    }
    return summary;
  } finally {
    running.delete(key);
  }
}
