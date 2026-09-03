import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, EVENT_CATEGORIES, EVENT_TYPES } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { publishContentChange } from "@/lib/scanBus";
import { EVENT_MODES } from "@/types/admin";
import { recordAudit } from "@/lib/audit";
import { ok, fail, unauthorized } from "@/lib/http";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  await dbConnect();
  /* the host is rendered by name on the calendar and the event page, so it is
     populated here rather than making the client resolve ids */
  const events = await Event.find()
    .populate<{ host: { _id: unknown; name: string } | null }>("host", "name")
    .sort({ startTime: -1 });
  return ok({
    events: events.map((e) => ({
      id: e._id,
      name: e.name,
      slug: e.slug,
      category: e.category,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
      gallery: e.gallery,
      organiser: e.organiser,
      maxAttendees: e.maxAttendees,
      details: e.details,
      rules: e.rules,
      status: e.status,
      price: e.price,
      location: e.location,
      mode: e.mode ?? "IN_PERSON",
      meetLink: e.meetLink || null,
      host: e.host ? { id: String(e.host._id), name: e.host.name } : null,
      isPublished: e.isPublished,
    })),
  });
}

const Body = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  category: z.enum(EVENT_CATEGORIES).default("Mentorship"),
  type: z.enum(EVENT_TYPES).default("WORKSHOP"),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullish(),
  gallery: z.array(z.string().url()).default([]),
  organiser: z.string().default("Igire Rwanda Organization"),
  maxAttendees: z.number().int().min(0).default(0),
  details: z.string().default(""),
  rules: z.array(z.string()).default([]),
  price: z.string().default("Free"),
  location: z.string().default(""),
  mode: z.enum(EVENT_MODES).default("IN_PERSON"),
  /* the staff member running it — owns the Google Calendar copy that holds
     the Meet link, and gets the event on their lane in the org calendar */
  host: z.string().nullish(),
  isPublished: z.boolean().default(false),
});

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid event details");

  await dbConnect();
  try {
    const event = await Event.create(parsed.data);
    publishContentChange("events");
    await recordAudit({
      actorId: admin.id,
      action: "event.create",
      target: { type: "event", id: event._id.toString(), label: event.name },
      summary: `Created event "${event.name}"`,
    });
    return ok({ event: { id: event._id, name: event.name, slug: event.slug } }, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("An event with that slug already exists", 409);
    }
    throw err;
  }
}
