import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, EVENT_CATEGORIES, EVENT_TYPES } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { publishContentChange } from "@/lib/scanBus";
import { ok, fail, unauthorized } from "@/lib/http";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  await dbConnect();
  const events = await Event.find().sort({ startTime: -1 });
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
    return ok({ event: { id: event._id, name: event.name, slug: event.slug } }, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("An event with that slug already exists", 409);
    }
    throw err;
  }
}
