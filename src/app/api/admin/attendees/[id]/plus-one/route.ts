import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, Ticket, GENDERS, RELATIONSHIPS } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { issueTicket, CapacityError } from "@/lib/tickets";
import { sendPlusOneRevokedEmail } from "@/lib/mailer";
import { ok, fail, unauthorized, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Admin management of a participant's single plus-one.
   DELETE = revoke (remove the guest, revoke their pass, free the seat, notify
   them); POST = assign a fresh plus-one. Together they give the admin a
   revoke-then-reassign flow from the participant screen. `id` is the
   participant id. */

/* Admin: revoke a participant's plus-one. Mirrors the guest-delete primitive in
   /api/admin/guests/[id] and then emails the removed guest. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Participant");

  await dbConnect();
  const participant = await Participant.findById(id);
  if (!participant) return notFound("Participant");

  const guest = await Guest.findOne({ inviter: participant._id });
  if (!guest) return fail("This participant has no plus-one", 404);

  const liveTicket = await Ticket.countDocuments({
    holderType: "Guest",
    holderId: guest._id,
    status: { $ne: "REVOKED" },
  });

  await Promise.all([
    Guest.deleteOne({ _id: guest._id }),
    Ticket.deleteMany({ holderType: "Guest", holderId: guest._id }),
    Participant.updateOne({ _id: participant._id }, { plusOne: null }),
  ]);
  if (liveTicket > 0) {
    await Event.findOneAndUpdate(
      { _id: guest.event, registeredCount: { $gt: 0 } },
      { $inc: { registeredCount: -1 } }
    );
  }

  /* tell the removed guest their pass no longer works (best-effort — the revoke
     itself has already succeeded) */
  try {
    const event = await Event.findById(guest.event).select("name");
    await sendPlusOneRevokedEmail(guest.email, guest.name, event?.name ?? "the event");
  } catch (err) {
    console.error("plus-one revoked email failed", err);
  }

  await recordAudit({
    actorId: admin.id,
    req,
    action: "attendee.plus_one_revoke",
    target: { type: "participant", id, label: "" },
    summary: "Revoked a participant's plus-one and released the seat",
  });

  return ok({ revoked: true });
}

const AssignBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  gender: z.enum(GENDERS).optional(),
  relationship: z.enum(RELATIONSHIPS).optional(),
});

/* Admin: assign a new plus-one to a participant (used after a revoke, or when a
   participant never added one). Mirrors the participant-facing
   /api/me/plus-one POST but with admin auth. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Participant");

  const parsed = AssignBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("A name and valid email are required");

  await dbConnect();
  const participant = await Participant.findById(id);
  if (!participant) return notFound("Participant");

  const email = parsed.data.email.toLowerCase();
  if (email === participant.email) return fail("The plus-one needs their own email address");

  const existing = await Guest.findOne({ inviter: participant._id });
  if (existing) return fail("This participant already has a plus-one — revoke it first", 409);

  const event = await Event.findOne({ _id: participant.event, status: "OPEN" });
  if (!event) return fail("Registration for this event is closed", 409);

  let guest;
  try {
    guest = await Guest.create({
      event: participant.event,
      name: parsed.data.name,
      email,
      guestType: "PLUS_ONE",
      inviter: participant._id,
      gender: parsed.data.gender ?? null,
      relationship: parsed.data.relationship ?? null,
    });
  } catch (err: unknown) {
    /* unique indexes: (event,email) or one-plus-one-per-participant */
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("That email is already registered for this event", 409);
    }
    throw err;
  }

  try {
    const ticket = await issueTicket({ kind: "Guest", doc: guest });
    await Participant.updateOne({ _id: participant._id }, { plusOne: guest._id });
    await recordAudit({
      actorId: admin.id,
      req,
      action: "attendee.plus_one_assign",
      target: { type: "guest", id: guest._id.toString(), label: guest.name },
      summary: `Assigned ${guest.name} <${email}> as ${participant.name}'s plus-one`,
    });
    return ok(
      { plusOne: { id: guest._id, name: guest.name, email, ticketCode: ticket.code } },
      201
    );
  } catch (err) {
    if (err instanceof CapacityError) {
      await Guest.deleteOne({ _id: guest._id });
      return fail(err.message, 409);
    }
    throw err;
  }
}
