import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Admin, Availability } from "@/models";
import { requireCapability, requireStaff } from "@/lib/auth";
import {
  availabilityView,
  slugify,
} from "@/lib/scheduling/availabilityView";
import { EVENT_TZ } from "@/lib/time";
import { recordAudit } from "@/lib/audit";
import { ok, fail, forbidden, unauthorized } from "@/lib/http";

/* Your own booking rules. Absent means "never set up", which the UI shows as a
   sensible default rather than an error — nobody should have to configure
   anything before they can look at the page. */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  await dbConnect();
  const availability = await Availability.findOne({ admin: staff.id });
  if (availability) return ok({ availability: availabilityView(availability) });

  const admin = await Admin.findById(staff.id).select("name title");
  return ok({
    availability: {
      bookable: false,
      slug: slugify(admin?.name ?? "staff"),
      headline: admin?.title ?? "",
      bio: "",
      timezone: EVENT_TZ,
      slotMinutes: 30,
      bufferMinutes: 10,
      leadTimeMinutes: 720,
      horizonDays: 30,
      maxPerDay: 0,
      /* Monday–Friday, 09:00–17:00 — the shape most people would set anyway */
      weekly: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "17:00" })),
      blackouts: [],
    },
  });
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const Body = z.object({
  bookable: z.boolean(),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  headline: z.string().max(120).default(""),
  bio: z.string().max(1000).default(""),
  slotMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(240),
  leadTimeMinutes: z.number().int().min(0).max(60 * 24 * 30),
  horizonDays: z.number().int().min(1).max(365),
  maxPerDay: z.number().int().min(0).max(50),
  weekly: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        start: z.string().regex(HHMM),
        end: z.string().regex(HHMM),
      })
    )
    .max(35)
    .refine((rows) => rows.every((r) => r.start < r.end), {
      message: "Each block must end after it starts",
    }),
  blackouts: z
    .array(
      z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
        reason: z.string().max(120).default(""),
      })
    )
    .max(100)
    .default([]),
});

/* Upsert your own rules. Making yourself bookable is the one setting with an
   outside-facing consequence, so it is validated hardest: a bookable person
   with no weekly hours would publish a page that can never offer a slot. */
export async function PUT(req: Request) {
  const staff = await requireCapability(req, "bookings:host");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid availability settings");
  }
  const body = parsed.data;

  if (body.bookable && body.weekly.length === 0) {
    return fail("Add at least one block of weekly hours before making yourself bookable");
  }

  await dbConnect();
  try {
    const availability = await Availability.findOneAndUpdate(
      { admin: staff.id },
      {
        admin: staff.id,
        ...body,
        blackouts: body.blackouts.map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
          reason: b.reason,
        })),
        timezone: EVENT_TZ,
      },
      { upsert: true, new: true }
    );
    await recordAudit({
      actorId: staff.id,
      action: "availability.update",
      target: { type: "availability", id: availability._id.toString(), label: staff.id },
      summary: body.bookable
        ? "Made their calendar bookable by the public"
        : "Updated booking availability",
    });
    return ok({ availability: availabilityView(availability) });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("That booking link is already taken — pick another", 409);
    }
    throw err;
  }
}
