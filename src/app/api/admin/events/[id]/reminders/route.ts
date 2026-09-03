import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Participant } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { sendEventReminderEmail, sendEventUpdateEmail } from "@/lib/mailer";
import { formatEventDateTime } from "@/lib/time";
import { ok, fail, unauthorized, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";
import { programmeBlockedReason } from "@/lib/programme";

/* Optional custom message turns this into an event-update blast; without it a
   standard "coming up" reminder is sent. Intended to be called by an external
   cron/scheduler or an admin, not on a request hot-path. */
const Body = z.object({ message: z.string().min(1).optional() }).nullable();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Event");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  const message = parsed.success ? (parsed.data?.message ?? null) : null;

  await dbConnect();
  const event = await Event.findById(id);
  if (!event) return notFound("Event");

  /* Nothing goes out for a programme that is not live. A draft or unpublished
     event has no agreed date, venue or wording yet, so a "reminder" about it
     is at best confusing and at worst a public commitment nobody signed off. */
  const blocked = programmeBlockedReason(event);
  if (blocked) return fail(`${blocked} Publish it before emailing participants.`, 409);

  const participants = await Participant.find({ event: event._id }).select("name email");
  if (participants.length === 0) return fail("No participants to notify", 409);

  const whenLabel = formatEventDateTime(event.startTime, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const results = await Promise.allSettled(
    participants.map((p) =>
      message
        ? sendEventUpdateEmail(p.email, p.name, event.name, message)
        : sendEventReminderEmail(p.email, p.name, event.name, `on ${whenLabel}`)
    )
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;

  await recordAudit({
    actorId: admin.id,
    req,
    action: "event.reminders",
    target: { type: "event", id, label: "" },
    summary: `Sent event reminders to ${sent} of ${participants.length} registrants`,
  });

  return ok({ recipients: participants.length, sent, failed: participants.length - sent });
}
