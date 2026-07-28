import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Event, Participant, Guest, EmailLog, EMAIL_KINDS } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized, notFound } from "@/lib/http";

/* Per-event engagement stats that complement the aggregate numbers on the event
   page: where participants sit in the flow (the reminder pool), the plus-one
   split, and how many of each email type actually reached this event's people
   (matched by recipient address, since EmailLog isn't tied to an event). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Event");

  await dbConnect();
  const event = await Event.findById(id).select("_id");
  if (!event) return notFound("Event");

  const [pending, verified, complete, participantCount, inviterIds] = await Promise.all([
    Participant.countDocuments({ event: event._id, status: "PENDING" }),
    Participant.countDocuments({ event: event._id, status: "VERIFIED" }),
    Participant.countDocuments({ event: event._id, status: "COMPLETE" }),
    Participant.countDocuments({ event: event._id }),
    Guest.find({ event: event._id, inviter: { $ne: null } }).distinct("inviter"),
  ]);

  /* COMPLETE participants who still haven't invited a plus-one — the target of
     the plus-one reminder step */
  const completeNoPlusOne = await Participant.countDocuments({
    event: event._id,
    status: "COMPLETE",
    _id: { $nin: inviterIds },
  });
  const hasPlusOne = inviterIds.length;

  /* emails that reached this event's people — participants + guests, by address */
  const [participantEmails, guestEmails] = await Promise.all([
    Participant.find({ event: event._id }).distinct("email"),
    Guest.find({ event: event._id }).distinct("email"),
  ]);
  const emails = [...new Set([...participantEmails, ...guestEmails])];
  const byKindAgg = emails.length
    ? await EmailLog.aggregate([
        { $match: { to: { $in: emails } } },
        { $group: { _id: { kind: "$kind", status: "$status" }, n: { $sum: 1 } } },
      ])
    : [];
  const byKind = Object.fromEntries(EMAIL_KINDS.map((k) => [k, { sent: 0, failed: 0 }])) as Record<
    string,
    { sent: number; failed: number }
  >;
  let emailTotal = 0;
  for (const row of byKindAgg as { _id: { kind: string; status: string }; n: number }[]) {
    const bucket = byKind[row._id.kind];
    if (bucket) {
      bucket[row._id.status === "SENT" ? "sent" : "failed"] += row.n;
      emailTotal += row.n;
    }
  }

  return ok({
    funnel: { pending, verified, complete, total: participantCount },
    reminderPool: {
      verifyEmail: pending,
      finishProfile: verified,
      invitePlusOne: completeNoPlusOne,
      total: pending + verified + completeNoPlusOne,
    },
    plusOne: { has: hasPlusOne, none: Math.max(0, participantCount - hasPlusOne) },
    emails: { total: emailTotal, byKind },
  });
}
