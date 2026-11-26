import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, Ticket, GENDERS, STACKS } from "@/models";
import { requireAttendee } from "@/lib/auth";
import { roleLine } from "@/lib/tickets";
import { ticketPreview } from "@/lib/ticketPreview";
import { canAddPlusOne } from "@/lib/plusOneSlots";
import { ok, fail, unauthorized, notFound } from "@/lib/http";

export async function GET(req: Request) {
  const participantId = await requireAttendee(req);
  if (!participantId) return unauthorized();

  await dbConnect();
  const participant = await Participant.findById(participantId);
  if (!participant) return notFound("Registration");

  /* places are only used by guests actually added, so this just checks room */
  const plusOneAllowed = await canAddPlusOne(participant);
  const [event, ticket, plusOne] = await Promise.all([
    Event.findById(participant.event),
    Ticket.findOne({ holderType: "Participant", holderId: participant._id }),
    Guest.findOne({ inviter: participant._id }),
  ]);

  /* the plus-one's Guest record is deleted when they check in at the gate, so a
     live lookup goes empty even though they attended. Fall back to the archived
     holder snapshot on their ticket so the participant still sees them. */
  let plusOneView = plusOne
    ? {
        fullName: plusOne.name,
        email: plusOne.email,
        gender: plusOne.gender ?? null,
        relationship: plusOne.relationship ?? null,
        status: plusOne.ticket ? "ISSUED" : "PENDING",
      }
    : null;
  if (!plusOneView && participant.plusOne) {
    const archived = await Ticket.findOne({
      holderType: "Guest",
      holderId: participant.plusOne,
    });
    if (archived?.holder) {
      plusOneView = {
        fullName: archived.holder.name,
        email: archived.holder.email,
        gender: null,
        relationship: null,
        status: "ATTENDED",
      };
    }
  }

  return ok({
    attendee: {
      type: "PARTICIPANT",
      fullName: participant.name,
      email: participant.email,
      phone: participant.phone ?? null,
      gender: participant.gender ?? null,
      roleLine: await roleLine({ kind: "Participant", doc: participant }),
      cohort: participant.stack ?? null,
      photoUrl: participant.profilePicture ?? null,
      /* the photo uploads in the background for a moment after the pass is issued */
      photoPending:
        !participant.profilePicture &&
        !!ticket &&
        Date.now() - new Date(ticket.issuedAt).getTime() < 2 * 60 * 1000,
      status: participant.status,
    },
    event: event && {
      id: event._id,
      name: event.name,
      date: event.startTime,
      venue: event.location,
      about: event.details ?? "",
      rules: event.rules,
    },
    ticket: ticket && {
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      code: ticket.code,
      status: ticket.status,
      preview: await ticketPreview(ticket, { event, holder: { name: participant.name, type: "PARTICIPANT" } }),
    },
    plusOne: plusOneView,
    plusOneAllowed,
  });
}

const ProfileBody = z
  .object({
    name: z.string().min(2),
    phone: z.string().min(6),
    gender: z.enum(GENDERS),
    stack: z.enum(STACKS),
  })
  .partial();

/* the participant fills in whatever personal details are still missing
   after verifying their email — the ticket is only issued once done */
export async function PATCH(req: Request) {
  const participantId = await requireAttendee(req);
  if (!participantId) return unauthorized();

  const parsed = ProfileBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid profile details");

  await dbConnect();
  const participant = await Participant.findById(participantId);
  if (!participant) return notFound("Registration");
  if (participant.status === "PENDING") return fail("Verify your email first", 403);

  /* participants only fill in what's missing; details already on file stay */
  const { name, phone, gender, stack } = parsed.data;
  if (name && (!participant.name || participant.name.startsWith("Guest of "))) participant.name = name;
  if (phone && !participant.phone) participant.phone = phone;
  if (gender && !participant.gender) participant.gender = gender;
  if (stack && !participant.stack) participant.stack = stack;
  await participant.save();

  return ok({
    attendee: {
      name: participant.name,
      phone: participant.phone,
      gender: participant.gender,
      stack: participant.stack,
    },
  });
}
