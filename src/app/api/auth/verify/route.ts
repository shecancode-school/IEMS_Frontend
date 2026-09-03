import { createHash } from "crypto";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Participant, VerificationToken } from "@/models";
import { signParticipantAccessToken } from "@/lib/auth";
import { issueRefreshToken, setRefreshCookie } from "@/lib/session";
import { sendRegistrationConfirmation } from "@/lib/mailer";
import { ok, fail } from "@/lib/http";
import { programmeBlockedReason } from "@/lib/programme";

const Body = z.object({ token: z.string().min(10) });

/// POST /api/auth/verify


export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Token is required");

  await dbConnect();
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  /* atomically claim the token so a double-click can't redeem it twice */
  const vt = await VerificationToken.findOneAndUpdate(
    { tokenHash, purpose: "LOGIN", usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() }
  );
  if (!vt) return fail("This link is invalid or has expired. Request a new one.", 400);

  const participant = await Participant.findById(vt.participant);
  if (!participant) return fail("Registration not found", 404);

  /* The programme has to still be live at the moment the link is CLICKED, not
     just when it was sent. A link is valid for 30 minutes and an event can be
     archived or unpublished inside that window — without this check we would
     mint a perfectly good session that /api/me then refuses, and the person
     would land on a portal that says "Forbidden" with no idea why. Better to
     say it here, at the door, in words they can act on. */
  const event = await Event.findById(participant.event);
  const blocked = programmeBlockedReason(event);
  if (blocked) return fail(`${blocked} Your pass will be available once it is live again.`, 403);

  const id = participant._id.toString();
  const firstVerification = participant.status === "PENDING";
  if (firstVerification) {
    /* first successful verification moves them out of PENDING */
    participant.status = "VERIFIED";
    /* confirm their registration once — the lookup and email are fully
       deferred so they never hold up the response the visitor is waiting on */
    /* the event is already loaded above, so this no longer costs a second
       round trip just to read its name */
    void sendRegistrationConfirmation(participant.email, participant.name, event!.name).catch(
      (err) => console.error("registration confirmation email failed", err)
    );
  }

  /* mint the tokens (and persist the status bump) in one round trip */
  const [accessToken, refresh] = await Promise.all([
    signParticipantAccessToken(id),
    issueRefreshToken(id),
    firstVerification ? participant.save() : Promise.resolve(),
  ]);

  const res = ok({ accessToken, expiresIn: 900 });
  return setRefreshCookie(res, refresh);
}
