import { createHash, randomBytes } from "crypto";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Participant, Ticket, VerificationToken } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { resendTicket } from "@/lib/tickets";
import { sendTicketNudgeEmail } from "@/lib/mailer";
import { appUrl } from "@/lib/appUrl";
import { ok, fail, unauthorized } from "@/lib/http";

/* Admin-triggered pass delivery for a selected list of participants (or a
   single one). Two cases per person, decided by where they are in the flow:
   - they already hold a ticket → their pass email is re-sent as-is;
   - no ticket yet → they get a sign-in nudge so they can finish their
     profile, which issues and emails the pass automatically. */
const Body = z.object({
  participantIds: z.array(z.string().refine(isValidObjectId)).min(1).max(100),
});

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Select between 1 and 100 participants");

  await dbConnect();
  const ids = [...new Set(parsed.data.participantIds)];
  const participants = await Participant.find({ _id: { $in: ids } });
  if (participants.length === 0) return fail("No matching participants", 404);

  const events = await Event.find({
    _id: { $in: [...new Set(participants.map((p) => p.event.toString()))] },
  });
  const eventById = new Map(events.map((e) => [e._id.toString(), e]));

  const results = await Promise.allSettled(
    participants.map(async (p) => {
      const event = eventById.get(p.event.toString());
      if (!event) throw new Error("Event no longer exists");

      if (p.ticket) {
        const ticket = await Ticket.findById(p.ticket);
        if (ticket) {
          const sent = await resendTicket(ticket);
          if (!sent) throw new Error("Ticket has no live holder");
          return { id: p._id.toString(), action: "TICKET" as const };
        }
      }

      /* no pass yet — send a one-time sign-in link so they can finish */
      const token = randomBytes(32).toString("hex");
      await VerificationToken.create({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        purpose: "LOGIN",
        email: p.email,
        participant: p._id,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      });
      await sendTicketNudgeEmail(p.email, p.name, appUrl(`/verify/${token}`), event.name);
      return { id: p._id.toString(), action: "NUDGE" as const };
    })
  );

  const detail = results.map((r, i) => {
    const p = participants[i];
    return r.status === "fulfilled"
      ? { id: p._id.toString(), name: p.name, email: p.email, action: r.value.action, ok: true }
      : {
          id: p._id.toString(),
          name: p.name,
          email: p.email,
          action: p.ticket ? ("TICKET" as const) : ("NUDGE" as const),
          ok: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        };
  });
  const sent = detail.filter((d) => d.ok).length;

  return ok({ requested: participants.length, sent, failed: participants.length - sent, results: detail });
}
