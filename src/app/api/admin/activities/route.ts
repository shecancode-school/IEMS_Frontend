import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Admin, CalendarActivity } from "@/models";
import { requireCapability, requireStaff } from "@/lib/auth";
import { insertEvent } from "@/lib/google/calendar";
import { GoogleAuthError } from "@/lib/google/errors";
import { getGoogleSession } from "@/lib/google/tokens";
import { activityView } from "@/lib/calendar/activityView";
import { parseRange } from "@/lib/calendar/query";
import { publishContentChange } from "@/lib/scanBus";
import {
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  EVENT_MODES,
  can,
} from "@/types/admin";
import { kigaliDayEnd, kigaliDayStart } from "@/lib/time";
import { recordAudit } from "@/lib/audit";
import { ok, fail, forbidden, unauthorized } from "@/lib/http";

/* List activities in a date window. Without calendar:viewAll you get your own;
   with it you also get everyone's non-PRIVATE ones. PRIVATE activities belong
   to their owner alone, whatever the caller's role. */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  const params = new URL(req.url).searchParams;
  const range = parseRange(params);
  if (typeof range === "string") return fail(range);

  await dbConnect();
  /* `as const` keeps the enum literal from widening to string, which Mongoose 9's
     strict filter types reject */
  const scope = can(staff.role, "calendar:viewAll")
    ? { $or: [{ owner: staff.id }, { visibility: { $ne: "PRIVATE" as const } }] }
    : { owner: staff.id };

  const owner = params.get("owner");
  /* validate against the enum rather than passing the raw query through — an
     unknown value should mean "no filter", not a cast */
  const rawType = params.get("type");
  const type = ACTIVITY_TYPES.find((t) => t === rawType);

  const activities = await CalendarActivity.find({
    ...scope,
    ...(owner ? { owner } : {}),
    ...(type ? { type } : {}),
    status: { $ne: "CANCELLED" as const },
    start: { $lte: kigaliDayEnd(range.to) },
    end: { $gte: kigaliDayStart(range.from) },
  })
    .populate<{ owner: { _id: unknown; name: string; role: "ADMIN" } }>("owner", "name role")
    .sort({ start: 1 });

  return ok({
    activities: activities.map((a) =>
      activityView(a as never, a.owner as never)
    ),
  });
}

const Body = z
  .object({
    title: z.string().min(2),
    description: z.string().max(4000).default(""),
    type: z.enum(ACTIVITY_TYPES).default("MEETING"),
    /* ISO instants — the form converts Kigali wall-clock input with
       kigaliInputToISO before sending, same as the event form */
    start: z.string().datetime(),
    end: z.string().datetime(),
    mode: z.enum(EVENT_MODES).default("IN_PERSON"),
    location: z.string().max(300).default(""),
    /* public-first, matching the model — a caller that omits the field is
       creating something the organisation is happy to show */
    visibility: z.enum(ACTIVITY_VISIBILITY).default("PUBLIC"),
    attendees: z
      .array(z.object({ email: z.string().email(), name: z.string().default("") }))
      .max(50)
      .default([]),
    eventId: z.string().optional(),
    /* only ADMIN|CEO may schedule on someone else's calendar */
    ownerId: z.string().optional(),
  })
  .refine((v) => new Date(v.end) > new Date(v.start), {
    message: "The end time must be after the start time",
    path: ["end"],
  });

export async function POST(req: Request) {
  const staff = await requireCapability(req, "calendar:write");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid activity details");
  }
  const body = parsed.data;

  await dbConnect();

  /* scheduling into another person's calendar is a privileged act — it puts an
     entry in their day and, if online, creates an event in their Google */
  let ownerId = staff.id;
  if (body.ownerId && body.ownerId !== staff.id) {
    if (!can(staff.role, "staff:manage")) {
      return fail("Only an administrator can schedule on someone else's calendar", 403);
    }
    const target = await Admin.findById(body.ownerId).select("_id active");
    if (!target?.active) return fail("That staff member does not exist", 404);
    ownerId = body.ownerId;
  }

  const start = new Date(body.start);
  const end = new Date(body.end);

  /* Mirror to Google first when it's an online activity: if Google refuses we
     still want the activity, but we want to know the Meet link is missing
     rather than promising one that does not exist. */
  let googleEventId: string | null = null;
  let meetLink: string | null = null;
  let googleWarning: string | null = null;

  const wantsGoogle = body.mode !== "IN_PERSON" || body.attendees.length > 0;
  if (wantsGoogle) {
    try {
      const session = await getGoogleSession(ownerId);
      if (!session) {
        googleWarning =
          "No Meet link — that calendar is not connected to Google yet.";
      } else {
        const created = await insertEvent(ownerId, {
          title: body.title,
          description: body.description,
          location: body.location,
          start,
          end,
          attendees: body.attendees,
          withMeet: body.mode !== "IN_PERSON",
          /* staff expect a native Google invite for internal sessions */
          sendUpdates: "all",
        });
        googleEventId = created.id;
        meetLink = created.meetLink;
        if (body.mode !== "IN_PERSON" && !meetLink) {
          googleWarning = "Google is still generating the Meet link — it will appear shortly.";
        }
      }
    } catch (err) {
      googleWarning =
        err instanceof GoogleAuthError
          ? "No Meet link — that Google connection needs to be reconnected."
          : "No Meet link — Google Calendar could not be reached.";
    }
  }

  const activity = await CalendarActivity.create({
    owner: ownerId,
    title: body.title,
    description: body.description,
    type: body.type,
    start,
    end,
    mode: body.mode,
    location: body.location,
    visibility: body.visibility,
    attendees: body.attendees,
    event: body.eventId ?? null,
    googleEventId,
    meetLink,
    createdBy: staff.id,
  });

  publishContentChange("calendar");
  await recordAudit({
    actorId: staff.id,
    action: "activity.create",
    target: { type: "activity", id: activity._id.toString(), label: activity.title },
    summary: `Scheduled activity "${activity.title}"${ownerId === staff.id ? "" : " on another staff member's calendar"}`,
  });
  return ok({ activity: activityView(activity), warning: googleWarning }, 201);
}
