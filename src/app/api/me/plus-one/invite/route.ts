import { createHash, randomBytes } from "crypto";
import { after } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, VerificationToken } from "@/models";
import { requireAttendee } from "@/lib/auth";
import { sendPlusOneInviteEmail } from "@/lib/mailer";
import { appUrl } from "@/lib/appUrl";
import { ok, fail, unauthorized, notFound } from "@/lib/http";

const Body = z.object({ email: z.string().email().optional() });

/* alternative path: generate a link the plus-one uses to fill their own
   details; optionally emailed straight to them */
export async function POST(req: Request) {
  const participantId = await requireAttendee(req);
  if (!participantId) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Invalid email");

  await dbConnect();
  const participant = await Participant.findById(participantId);
  if (!participant) return notFound("Registration");

  const existing = await Guest.findOne({ inviter: participant._id });
  if (existing) return fail("You already have a plus-one", 409);

  const event = await Event.findOne({ _id: participant.event, status: "OPEN" });
  if (!event) return fail("Registration for this event is closed", 409);

  const token = randomBytes(32).toString("hex");
  await VerificationToken.create({
    tokenHash: createHash("sha256").update(token).digest("hex"),
    purpose: "PLUS_ONE_INVITE",
    email: parsed.data.email?.toLowerCase(),
    participant: participant._id,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });

  const inviteUrl = appUrl(`/plus-one/${token}`);
  if (parsed.data.email) {
    /* respond with the link immediately; the invite email follows right
       after the response instead of holding it up */
    const guestEmail = parsed.data.email;
    const participantName = participant.name;
    after(async () => {
      try {
        await sendPlusOneInviteEmail(guestEmail, participantName, inviteUrl, event.name);
      } catch (err) {
        console.error("plus-one invite email failed", err);
      }
    });
  }
  return ok({ inviteUrl });
}
