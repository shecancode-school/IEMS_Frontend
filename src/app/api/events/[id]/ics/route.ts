import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { eventDeadline } from "@/models/Event";
import { buildIcs, icsResponse } from "@/lib/calendar/ics";
import { appUrl } from "@/lib/appUrl";
import { isValidObjectId } from "mongoose";
import { notFound } from "@/lib/http";

/* Public: "add to my calendar" for a single published event. Downloaded once
   rather than subscribed, so no token is involved — this is the same
   information already on the public event page. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  await dbConnect();
  const event = await Event.findOne({
    ...(isValidObjectId(id) ? { $or: [{ _id: id }, { slug: id }] } : { slug: id }),
    status: { $ne: "DRAFT" },
    isPublished: true,
    archivedAt: null,
  });
  if (!event) return notFound("Event");

  const ics = buildIcs(
    [
      {
        uid: `event-${event._id.toString()}@iems.igirerwanda.org`,
        start: event.startTime,
        end: event.endTime ?? eventDeadline(event),
        title: event.name,
        description: [
          event.details?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
          event.meetLink ? `Join online: ${event.meetLink}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        location: event.meetLink || event.location,
        url: appUrl(`/events/${event.slug}`),
        /* updatedAt as the sequence means an edited event supersedes the copy
           already sitting in someone's calendar */
        sequence: Math.floor(event.updatedAt.getTime() / 1000),
      },
    ],
    event.name
  );

  return icsResponse(ics, `${event.slug}.ics`);
}
