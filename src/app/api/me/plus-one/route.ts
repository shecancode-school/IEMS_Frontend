import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, GENDERS, RELATIONSHIPS } from "@/models";
import { requireAttendee } from "@/lib/auth";
import { issueTicket, CapacityError } from "@/lib/tickets";
import { canAddPlusOne, confirmPlusOnePlace, PLUS_ONE_FULL_MESSAGE } from "@/lib/plusOneSlots";
import { ok, fail, unauthorized, notFound } from "@/lib/http";

/* the participant fills their plus-one's details directly; the guest is
   created as a PLUS_ONE and their ticket is issued and emailed straight away.
   Accept both `name` and `fullName` so the field survives whichever key the
   client sends, and persist gender + relationship rather than dropping them. */
const Body = z
  .object({
    name: z.string().min(2).optional(),
    fullName: z.string().min(2).optional(),
    email: z.string().email(),
    gender: z.enum(GENDERS).optional(),
    relationship: z.enum(RELATIONSHIPS).optional(),
  })
  .transform((d) => ({ ...d, name: d.name ?? d.fullName }));

export async function POST(req: Request) {
  const participantId = await requireAttendee(req);
  if (!participantId) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("A valid email is required");

  await dbConnect();
  const participant = await Participant.findById(participantId);
  if (!participant) return notFound("Registration");
  if (!(await canAddPlusOne(participant))) return fail(PLUS_ONE_FULL_MESSAGE, 403);

  const email = parsed.data.email.toLowerCase();
  if (email === participant.email) return fail("Your plus-one needs their own email address");

  const existing = await Guest.findOne({ inviter: participant._id });
  if (existing) return fail("You already have a plus-one", 409);

  const event = await Event.findOne({ _id: participant.event, status: "OPEN" });
  if (!event) return fail("Registration for this event is closed", 409);

  let guest;
  try {
    guest = await Guest.create({
      event: participant.event,
      name: parsed.data.name ?? `Guest of ${participant.name}`,
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
  /* someone else may have taken the last place a moment ago */
  if (!(await confirmPlusOnePlace(guest))) {
    await Guest.deleteOne({ _id: guest._id });
    return fail(PLUS_ONE_FULL_MESSAGE, 403);
  }

  try {
    const ticket = await issueTicket({ kind: "Guest", doc: guest });
    /* keep the participant's back-reference to their plus-one in sync */
    await Participant.updateOne({ _id: participant._id }, { plusOne: guest._id });
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
