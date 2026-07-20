import { createHash } from "crypto";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, VerificationToken } from "@/models";
import { issueTicket, CapacityError } from "@/lib/tickets";
import { ok, fail } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };

async function findInvite(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return VerificationToken.findOne({
    tokenHash,
    purpose: "PLUS_ONE_INVITE",
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  await dbConnect();
  const invite = await findInvite(token);
  if (!invite) return fail("This invite link is invalid or has expired", 404);

  const participant = await Participant.findById(invite.participant);
  const event = participant && (await Event.findById(participant.event));
  if (!participant || !event) return fail("This invite link is invalid or has expired", 404);
  if (await Guest.findOne({ inviter: participant._id })) {
    return fail("This participant already has a plus-one", 409);
  }

  return ok({
    participantName: participant.name,
    eventName: event.name,
    email: invite.email ?? null,
  });
}

/* the plus-one names themselves and gives an email; their ticket is emailed */
const Body = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("A valid email is required");

  await dbConnect();
  const invite = await findInvite(token);
  if (!invite) return fail("This invite link is invalid or has expired", 404);

  const participant = await Participant.findById(invite.participant);
  const event = participant && (await Event.findOne({ _id: participant.event, status: "OPEN" }));
  if (!participant || !event) return fail("Registration for this event is closed", 409);

  /* an invite addressed to a specific person is locked to that address —
     whatever the form submits, the guest record gets the invited email */
  const email = (invite.email ?? parsed.data.email).toLowerCase();
  let guest;
  try {
    guest = await Guest.create({
      event: participant.event,
      name: parsed.data.name ?? `Guest of ${participant.name}`,
      email,
      guestType: "PLUS_ONE",
      inviter: participant._id,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("This participant already has a plus-one, or that email is already registered", 409);
    }
    throw err;
  }
  invite.usedAt = new Date();
  await invite.save();

  try {
    await issueTicket({ kind: "Guest", doc: guest });
    await Participant.updateOne({ _id: participant._id }, { plusOne: guest._id });
    return ok({ message: "You're all set — check your inbox for your ticket." }, 201);
  } catch (err) {
    if (err instanceof CapacityError) {
      await Guest.deleteOne({ _id: guest._id });
      return fail(err.message, 409);
    }
    throw err;
  }
}
