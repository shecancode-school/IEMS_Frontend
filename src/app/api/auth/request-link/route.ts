import { createHash, randomBytes } from "crypto";
import { after } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Participant, VerificationToken } from "@/models";
import { sendMagicLinkEmail } from "@/lib/mailer";
import { appUrl } from "@/lib/appUrl";
import { ok, fail } from "@/lib/http";
import { isLiveProgramme } from "@/lib/programme";

const Body = z.object({
  email: z.string().email(),
  /* set when the visitor came through a specific event's terms popup —
     when they're registered for several events, that one wins */
  eventSlug: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("A valid email is required");
  const email = parsed.data.email.toLowerCase();

  await dbConnect();

  /* guests are checked in by admins/participants and don't log in themselves */
  const participants = await Participant.find({ email });
  let match: { participantId: string; eventName: string; name: string } | null = null;
  let sawFullEvent = false;
  for (const p of participants) {
    /* Any LIVE programme, not just an OPEN one.

       This used to require status: "OPEN", which is about whether REGISTRATION
       is still taking people — so the moment an event closed its doors, every
       participant already holding a ticket was locked out of the portal that
       shows it. Closing registration is not the same as ending the event.

       isLiveProgramme is the shared rule (published, out of draft, not
       archived) that /api/me and the mailer also use, so a link is never
       issued for a programme the portal would then refuse. */
    const event = await Event.findById(p.event);
    if (!event || !isLiveProgramme(event)) continue;
    /* capacity gate: don't start a login the event can't honour. A participant
       who already holds a ticket still counts toward the reserved slots, so
       only block when the event is full AND they have no ticket yet. */
    const full = event.maxAttendees > 0 && event.registeredCount >= event.maxAttendees;
    if (full && !p.ticket) {
      sawFullEvent = true;
      continue;
    }
    const candidate = { participantId: p._id.toString(), eventName: event.name, name: p.name };
    if (event.slug === parsed.data.eventSlug) {
      match = candidate;
      break;
    }
    match ??= candidate;
  }

  /* only surface "full" when it's the sole reason we can't proceed — otherwise
     keep the neutral response so the endpoint can't probe the roster */
  if (!match && sawFullEvent) {
    return fail("This event has reached its maximum capacity.", 409);
  }

  /* same response whether or not the email is registered, so the endpoint
     can't be used to probe the participant list */
  if (match) {
    const token = randomBytes(32).toString("hex");
    await VerificationToken.create({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      purpose: "LOGIN",
      email,
      participant: match.participantId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    const url = appUrl(`/verify/${token}`);
    /* respond immediately; the email goes out right after the response —
       the visitor isn't held on the SMTP round-trip */
    const { name, eventName } = match;
    after(async () => {
      try {
        await sendMagicLinkEmail(email, name, url, eventName);
      } catch (err) {
        console.error("magic link email failed", err);
      }
    });
  }

  return ok({ message: "If that email is registered, a verification link is on its way." });
}
