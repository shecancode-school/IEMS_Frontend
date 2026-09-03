import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Admin, Event } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { insertEvent, patchEvent } from "@/lib/google/calendar";
import { GoogleAuthError } from "@/lib/google/errors";
import { getGoogleSession } from "@/lib/google/tokens";
import { publishContentChange } from "@/lib/scanBus";
import { eventDeadline } from "@/models/Event";
import { recordAudit } from "@/lib/audit";
import { ok, fail, notFound, unauthorized } from "@/lib/http";

/* Generate (or refresh) the Google Meet link for an online or hybrid event.

   A Meet link can only be minted on a calendar the token owns, which is why
   the event needs a host: the link lives on that person's Google Calendar and
   they are the organiser of the call. There is no way to create one "for the
   organisation" without a real Google account behind it. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Event");

  await dbConnect();
  const event = await Event.findById(id);
  if (!event) return notFound("Event");

  if (event.mode === "IN_PERSON") {
    return fail("Set the event to online or hybrid before generating a meeting link");
  }

  const hostId = event.host?.toString();
  if (!hostId) {
    return fail(
      "Choose a host for this event first — the meeting link is created on their Google Calendar"
    );
  }

  const host = await Admin.findById(hostId).select("name active");
  if (!host?.active) return fail("The chosen host is no longer an active staff account");

  try {
    const session = await getGoogleSession(hostId);
    if (!session) {
      return fail(
        `${host.name} has not connected their Google Calendar yet, so no meeting link can be created`,
        409
      );
    }

    const end = event.endTime ?? eventDeadline(event);

    /* refresh in place when a link already exists, so the URL people were
       emailed keeps working rather than being replaced by a second one */
    if (event.googleEventId) {
      await patchEvent(hostId, event.googleEventId, {
        summary: event.name,
        description: event.details,
        location: event.location,
        start: event.startTime,
        end,
      });
    } else {
      const created = await insertEvent(hostId, {
        title: event.name,
        description: event.details,
        location: event.location,
        start: event.startTime,
        end,
        withMeet: true,
        sendUpdates: "none",
      });
      event.googleEventId = created.id;
      event.meetLink = created.meetLink ?? "";
      await event.save();

      if (!created.meetLink) {
        return ok({
          meetLink: null,
          pending: true,
          message: "Google is still creating the meeting link — try again in a moment.",
        });
      }
    }

    publishContentChange("events");
    publishContentChange("calendar");
    await recordAudit({
      actorId: admin.id,
      action: "event.meet",
      target: { type: "event", id: event._id.toString(), label: event.name },
      summary: event.googleEventId
        ? `Refreshed the meeting link for "${event.name}"`
        : `Created the meeting link for "${event.name}"`,
    });
    return ok({ meetLink: event.meetLink || null, pending: false });
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return fail(`${host.name}'s Google connection needs to be reconnected`, 409);
    }
    return fail("Google Calendar could not be reached just now — try again shortly", 502);
  }
}
