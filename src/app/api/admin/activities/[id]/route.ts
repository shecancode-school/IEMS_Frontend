import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { CalendarActivity } from "@/models";
import { requireStaff } from "@/lib/auth";
import { deleteEvent, patchEvent } from "@/lib/google/calendar";
import { activityView } from "@/lib/calendar/activityView";
import { publishContentChange } from "@/lib/scanBus";
import { ACTIVITY_TYPES, ACTIVITY_VISIBILITY, EVENT_MODES, can } from "@/types/admin";
import { recordAudit, diff } from "@/lib/audit";
import { ok, fail, forbidden, notFound, unauthorized } from "@/lib/http";

/* Who may touch this activity: its owner always, plus ADMIN|CEO. Note that
   `calendar:viewAll` grants reading the org calendar — it does not grant
   editing someone else's entries, which is staff:manage. */
async function load(id: string, staff: { id: string; role: string }, forWrite: boolean) {
  if (!isValidObjectId(id)) return "not-found" as const;
  const activity = await CalendarActivity.findById(id).populate<{
    owner: { _id: unknown; name: string; role: "ADMIN" };
  }>("owner", "name role");
  if (!activity) return "not-found" as const;

  const ownerId = String((activity.owner as unknown as { _id: unknown })._id);
  const isOwner = ownerId === staff.id;
  if (forWrite && !isOwner && !can(staff.role, "staff:manage")) return "forbidden" as const;
  /* a PRIVATE activity is readable only by its owner, whatever the role */
  if (!forWrite && !isOwner && activity.visibility === "PRIVATE") return "forbidden" as const;
  if (!forWrite && !isOwner && !can(staff.role, "calendar:viewAll")) return "forbidden" as const;

  return activity;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  await dbConnect();
  const activity = await load((await ctx.params).id, staff, false);
  if (activity === "not-found") return notFound("Activity");
  if (activity === "forbidden") return forbidden();

  return ok({ activity: activityView(activity as never, activity.owner as never) });
}

const Body = z
  .object({
    title: z.string().min(2),
    description: z.string().max(4000),
    type: z.enum(ACTIVITY_TYPES),
    start: z.string().datetime(),
    end: z.string().datetime(),
    mode: z.enum(EVENT_MODES),
    location: z.string().max(300),
    visibility: z.enum(ACTIVITY_VISIBILITY),
    attendees: z
      .array(z.object({ email: z.string().email(), name: z.string().default("") }))
      .max(50),
  })
  .partial();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid activity details");
  const patch = parsed.data;

  await dbConnect();
  const activity = await load((await ctx.params).id, staff, true);
  if (activity === "not-found") return notFound("Activity");
  if (activity === "forbidden") return forbidden();

  const before: Record<string, unknown> = {
    title: activity.title,
    description: activity.description,
    type: activity.type,
    start: activity.start,
    end: activity.end,
    mode: activity.mode,
    location: activity.location,
    visibility: activity.visibility,
  };

  if (patch.title !== undefined) activity.title = patch.title;
  if (patch.description !== undefined) activity.description = patch.description;
  if (patch.type !== undefined) activity.type = patch.type;
  if (patch.start !== undefined) activity.start = new Date(patch.start);
  if (patch.end !== undefined) activity.end = new Date(patch.end);
  if (patch.mode !== undefined) activity.mode = patch.mode;
  if (patch.location !== undefined) activity.location = patch.location;
  if (patch.visibility !== undefined) activity.visibility = patch.visibility;
  if (patch.attendees !== undefined) activity.attendees = patch.attendees;

  if (activity.end <= activity.start) {
    return fail("The end time must be after the start time");
  }

  const ownerId = String((activity.owner as unknown as { _id: unknown })._id);

  /* keep the Google copy in step. A failure here is not fatal — the IEMS
     record is the source of truth — but it does mean the two have diverged,
     which is exactly what DESYNCED is for. */
  if (activity.googleEventId) {
    try {
      await patchEvent(ownerId, activity.googleEventId, {
        summary: activity.title,
        description: activity.description,
        location: activity.location,
        start: activity.start,
        end: activity.end,
      });
      if (activity.status === "DESYNCED") activity.status = "SCHEDULED";
    } catch {
      activity.status = "DESYNCED";
    }
  }

  await activity.save();
  publishContentChange("calendar");
  const changes = diff(before, patch);
  await recordAudit({
    actorId: staff.id,
    action: "activity.update",
    target: { type: "activity", id: activity._id.toString(), label: activity.title },
    summary: `Updated activity "${activity.title}"`,
    changes,
  });
  return ok({ activity: activityView(activity as never, activity.owner as never) });
}

/* Cancel rather than erase: the entry stays in the record, disappears from the
   calendar, and the mirrored Google event is removed so nobody turns up. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  await dbConnect();
  const activity = await load((await ctx.params).id, staff, true);
  if (activity === "not-found") return notFound("Activity");
  if (activity === "forbidden") return forbidden();

  if (activity.googleEventId) {
    const ownerId = String((activity.owner as unknown as { _id: unknown })._id);
    /* already gone from Google is a success — the goal is "not on the calendar" */
    await deleteEvent(ownerId, activity.googleEventId).catch(() => undefined);
  }

  activity.status = "CANCELLED";
  await activity.save();
  publishContentChange("calendar");
  await recordAudit({
    actorId: staff.id,
    action: "activity.cancel",
    target: { type: "activity", id: activity._id.toString(), label: activity.title },
    summary: `Cancelled activity "${activity.title}"`,
  });
  return ok({ cancelled: true });
}
