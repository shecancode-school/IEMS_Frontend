import { z } from "zod";
import { dbConnect } from "@/lib/db";
import {
  CalendarActivity,
  Event,
  Guest,
  Participant,
  Ticket,
  EVENT_CATEGORIES,
  EVENT_TYPES,
  EVENT_STATUSES,
} from "@/models";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { deleteEvent as deleteGoogleEvent } from "@/lib/google/calendar";
import { publishContentChange } from "@/lib/scanBus";
import { EVENT_MODES } from "@/types/admin";
import { recordAudit, diff } from "@/lib/audit";
import { ok, fail, unauthorized, notFound } from "@/lib/http";

const Body = z
  .object({
    name: z.string().min(2),
    category: z.enum(EVENT_CATEGORIES),
    type: z.enum(EVENT_TYPES),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().nullable(),
    gallery: z.array(z.string().url()),
    organiser: z.string(),
    maxAttendees: z.number().int().min(0),
    details: z.string(),
    rules: z.array(z.string()),
    status: z.enum(EVENT_STATUSES),
    price: z.string(),
    location: z.string(),
    mode: z.enum(EVENT_MODES),
    host: z.string().nullable(),
    isPublished: z.boolean(),
    /* archive/unarchive convenience toggle */
    archived: z.boolean(),
  })
  .partial();

/* One event, readable by any signed-in staff member.

   The calendar's detail panel needs this. Until now the only way to read a
   single event was to pull the whole list from GET /api/admin/events, which is
   requireAdmin — so a facilitator clicking an event on the org calendar got an
   empty panel even though the chip in front of them came from a feed they are
   allowed to read.

   The projection is deliberately narrow: what the calendar shows plus what an
   edit needs. No attendee list, no ticket data, no registrant PII — a wider
   audience reads this than reads the console's event pages. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  const { id } = await ctx.params;
  await dbConnect();
  const event = await Event.findById(id).select(
    "name slug category type startTime endTime organiser maxAttendees registeredCount details status price location isPublished mode meetLink host archivedAt"
  );
  if (!event) return notFound("Event");

  return ok({
    event: {
      id: event._id.toString(),
      name: event.name,
      slug: event.slug,
      category: event.category,
      type: event.type,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime?.toISOString() ?? null,
      organiser: event.organiser,
      maxAttendees: event.maxAttendees,
      registeredCount: event.registeredCount,
      details: event.details,
      status: event.status,
      price: event.price,
      location: event.location,
      isPublished: event.isPublished,
      mode: event.mode,
      meetLink: event.meetLink || null,
      host: event.host?.toString() ?? null,
      archivedAt: event.archivedAt?.toISOString() ?? null,
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid event settings");

  const { archived, ...fields } = parsed.data;
  const update: Record<string, unknown> = { ...fields };
  if (archived !== undefined) update.archivedAt = archived ? new Date() : null;

  const { id } = await ctx.params;
  await dbConnect();
  const existing = await Event.findById(id);
  if (!existing) return notFound("Event");
  const before: Record<string, unknown> = {
    name: existing.name,
    status: existing.status,
    isPublished: existing.isPublished,
    mode: existing.mode,
    location: existing.location,
    host: existing.host?.toString() ?? null,
  };
  const event = await Event.findByIdAndUpdate(id, update, { new: true });
  if (!event) return notFound("Event");
  publishContentChange("events");
  const changes = diff(before, { ...fields, archivedAt: archived ? new Date() : null });
  await recordAudit({
    actorId: admin.id,
    action: "event.update",
    target: { type: "event", id: event._id.toString(), label: event.name },
    summary: `Updated event "${event.name}"`,
    changes,
  });
  return ok({
    event: {
      id: event._id,
      name: event.name,
      status: event.status,
      isPublished: event.isPublished,
      archivedAt: event.archivedAt ?? null,
    },
  });
}

/* Admin: delete an event and everything attached to it. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  await dbConnect();
  const event = await Event.findById(id);
  if (!event) return notFound("Event");

  /* Activities linked to this event were mirrored onto staff Google calendars.
     Deleting only our records would leave those entries behind, so people would
     keep seeing a session that no longer exists. Cancel them first. */
  const linked = await CalendarActivity.find({ event: event._id, status: { $ne: "CANCELLED" } });
  await Promise.allSettled(
    linked
      .filter((a) => a.googleEventId)
      .map((a) => deleteGoogleEvent(a.owner.toString(), a.googleEventId!))
  );
  if (event.googleEventId && event.host) {
    await deleteGoogleEvent(event.host.toString(), event.googleEventId).catch(() => undefined);
  }

  await Promise.all([
    Event.deleteOne({ _id: event._id }),
    Participant.deleteMany({ event: event._id }),
    Guest.deleteMany({ event: event._id }),
    Ticket.deleteMany({ event: event._id }),
    CalendarActivity.updateMany(
      { event: event._id },
      { status: "CANCELLED", googleEventId: null }
    ),
  ]);
  publishContentChange("events");
  publishContentChange("calendar");
  await recordAudit({
    actorId: admin.id,
    action: "event.delete",
    target: { type: "event", id: event._id.toString(), label: event.name },
    summary: `Deleted event "${event.name}" and everything attached to it`,
  });
  return ok({ deleted: true });
}
