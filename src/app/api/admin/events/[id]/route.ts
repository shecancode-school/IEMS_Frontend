import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, Ticket, EVENT_CATEGORIES, EVENT_TYPES, EVENT_STATUSES } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { publishContentChange } from "@/lib/scanBus";
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
    isPublished: z.boolean(),
    /* archive/unarchive convenience toggle */
    archived: z.boolean(),
  })
  .partial();

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
  const event = await Event.findByIdAndUpdate(id, update, { new: true });
  if (!event) return notFound("Event");
  publishContentChange("events");
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

  await Promise.all([
    Event.deleteOne({ _id: event._id }),
    Participant.deleteMany({ event: event._id }),
    Guest.deleteMany({ event: event._id }),
    Ticket.deleteMany({ event: event._id }),
  ]);
  publishContentChange("events");
  return ok({ deleted: true });
}
