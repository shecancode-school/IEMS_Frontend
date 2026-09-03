import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, GUEST_TYPES } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { issueTicket, CapacityError } from "@/lib/tickets";
import { guestFiltersFrom, listGuestRows } from "@/lib/guestList";
import { notifyAdmins } from "@/lib/notify";
import { ok, fail, unauthorized } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Admin: list guests, filterable by event / type / search. The same builder
   backs the CSV export so both stay in step. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const filters = guestFiltersFrom(new URL(req.url).searchParams);
  return ok({ guests: await listGuestRows(filters) });
}

const Body = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  guestType: z.enum(GUEST_TYPES).default("GENERAL"),
  /* optional: the participant who invited this guest */
  inviterId: z.string().min(1).optional(),
  eventId: z.string().min(1),
});

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Name, valid email and event are required");

  await dbConnect();
  const event = await Event.findById(parsed.data.eventId);
  if (!event) return fail("Event not found", 404);

  let inviterId: string | undefined;
  if (parsed.data.inviterId) {
    const inviter = await Participant.findById(parsed.data.inviterId);
    if (!inviter) return fail("Inviter not found", 404);
    inviterId = inviter._id.toString();
  }

  let guest;
  try {
    guest = await Guest.create({
      event: event._id,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      guestType: parsed.data.guestType,
      inviter: inviterId ?? null,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("That email is already registered for this event", 409);
    }
    throw err;
  }

  try {
    const ticket = await issueTicket({ kind: "Guest", doc: guest });
    void notifyAdmins({
      kind: "GUEST_ADDED",
      severity: "info",
      title: `Guest ticket issued to ${guest.name}`,
      body: `${event.name} · invited by an admin, ticket emailed to ${guest.email}.`,
      eventId: event._id,
    });
    await recordAudit({
      actorId: admin.id,
      req,
      action: "guest.create",
      target: { type: "guest", id: guest._id.toString(), label: guest.name },
      summary: `Added ${guest.guestType} guest ${guest.name} <${guest.email}> and issued a pass`,
    });
    return ok({ guest: { id: guest._id, name: guest.name, ticketCode: ticket.code } }, 201);
  } catch (err) {
    if (err instanceof CapacityError) {
      await Guest.deleteOne({ _id: guest._id });
      return fail(err.message, 409);
    }
    throw err;
  }
}
