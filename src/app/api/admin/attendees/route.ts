import { z } from "zod";
import { dbConnect } from "@/lib/db";
import {
  Event,
  GENDERS,
  Guest,
  PARTICIPANT_STATUSES,
  Participant,
  REGISTRATION_STATUSES,
  STACKS,
  Ticket,
  type ParticipantDoc,
  type ParticipantStatus,
  type RegistrationStatus,
  type Stack,
} from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import type { QueryFilter } from "mongoose";

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const url = new URL(req.url);
  const filter: QueryFilter<ParticipantDoc> = {};
  const stack = pick<Stack>(url.searchParams.get("stack"), STACKS);
  if (stack) filter.stack = stack;
  const status = pick<ParticipantStatus>(url.searchParams.get("status"), PARTICIPANT_STATUSES);
  if (status) filter.status = status;
  const registrationStatus = pick<RegistrationStatus>(
    url.searchParams.get("registrationStatus"),
    REGISTRATION_STATUSES
  );
  if (registrationStatus) filter.registrationStatus = registrationStatus;
  const eventId = url.searchParams.get("event");
  if (eventId) filter.event = eventId;
  const q = url.searchParams.get("q");
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  /* "none" = participants who haven't invited a plus-one (the reminder pool),
     "has" = those who have one. Resolved against the Guest.inviter back-link. */
  const plusOne = pick(url.searchParams.get("plusOne"), ["none", "has"] as const);

  await dbConnect();
  if (plusOne) {
    const guestFilter: Record<string, unknown> = { inviter: { $ne: null } };
    if (eventId) guestFilter.event = eventId;
    const inviterIds = await Guest.find(guestFilter).distinct("inviter");
    filter._id = plusOne === "has" ? { $in: inviterIds } : { $nin: inviterIds };
  }

  const participants = await Participant.find(filter)
    .sort({ createdAt: 1 })
    .limit(500)
    .populate("event", "name startTime status");
  const tickets = await Ticket.find({
    holderType: "Participant",
    holderId: { $in: participants.map((p) => p._id) },
  });
  const ticketByHolder = new Map(tickets.map((t) => [t.holderId.toString(), t]));

  type EventRef = { _id: unknown; name?: string; startTime?: Date; status?: string } | null;
  const eventOf = (e: EventRef) =>
    e ? { id: e._id, name: e.name, startTime: e.startTime, status: e.status } : null;

  const live = participants.map((p) => ({
    id: p._id,
    type: "PARTICIPANT" as const,
    name: p.name,
    email: p.email,
    phone: p.phone,
    stack: p.stack,
    gender: p.gender ?? null,
    status: p.status,
    registrationStatus: p.registrationStatus,
    profilePicture: p.profilePicture ?? null,
    event: eventOf(p.event as unknown as EventRef),
    ticket: (() => {
      const t = ticketByHolder.get(p._id.toString());
      return t ? { code: t.code, status: t.status, scannedAt: t.scannedAt ?? null } : null;
    })(),
  }));

  /* checked-in participants live on as ticket holder snapshots — their
     Participant record is deleted at the gate so they can register elsewhere */
  const holderFilter: Record<string, unknown> = {
    holderType: "Participant",
    "holder.name": { $exists: true },
  };
  if (eventId) holderFilter.event = eventId;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    holderFilter.$or = [{ "holder.name": rx }, { "holder.email": rx }];
  }
  /* an archived holder is by definition COMPLETE. The plus-one filter works off
     the live Guest link, which checked-in snapshots no longer have — so skip
     them entirely when it's active. */
  const attended =
    plusOne || (status && status !== "COMPLETE")
      ? []
      : await Ticket.find(holderFilter)
          .sort({ scannedAt: -1 })
          .limit(500)
          .populate("event", "name startTime status");

  const archived = attended.map((t) => {
    const h = t.holder!;
    return {
      id: t._id,
      type: "PARTICIPANT" as const,
      name: h.name,
      email: h.email,
      phone: h.phone ?? undefined,
      stack: h.label ?? null,
      gender: null,
      status: "COMPLETE",
      profilePicture: h.photoUrl ?? null,
      event: eventOf(t.event as unknown as EventRef),
      ticket: { code: t.code, status: t.status, scannedAt: t.scannedAt ?? null },
    };
  });

  return ok({ attendees: [...live, ...archived] });
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
    return ok({ participant: { id: p._id, name: p.name, email: p.email } }, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("That email is already registered for this event", 409);
    }
    throw err;
  }
}
