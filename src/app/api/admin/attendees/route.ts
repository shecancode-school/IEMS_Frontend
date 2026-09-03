import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, GENDERS, Participant, STACKS } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { listParticipantRows, participantFiltersFrom } from "@/lib/participantList";
import { ok, fail, unauthorized } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Admin: list participants, filterable by event / stack / status /
   registration / plus-one / search. The same builder backs the CSV export so
   both stay in step. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const filters = participantFiltersFrom(new URL(req.url).searchParams);
  return ok({ attendees: await listParticipantRows(filters) });
}

const CreateBody = z.object({
  eventId: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  stack: z.enum(STACKS).optional(),
  gender: z.enum(GENDERS).optional(),
});

/* Admin: register a participant directly. No ticket is issued here — use the
   ticket generate endpoint (or the participant's own completion flow). */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Name, valid email and event are required");

  await dbConnect();
  const event = await Event.findById(parsed.data.eventId);
  if (!event) return fail("Event not found", 404);

  try {
    const p = await Participant.create({
      event: event._id,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone,
      stack: parsed.data.stack ?? null,
      gender: parsed.data.gender ?? null,
      status: "PENDING",
      registrationStatus: "APPROVED",
    });
    await recordAudit({
      actorId: admin.id,
      req,
      action: "attendee.create",
      target: { type: "participant", id: p._id.toString(), label: p.name },
      summary: `Registered ${p.name} <${p.email}> for an event`,
    });
    return ok({ participant: { id: p._id, name: p.name, email: p.email } }, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("That email is already registered for this event", 409);
    }
    throw err;
  }
}
