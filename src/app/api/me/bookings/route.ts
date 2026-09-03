import { dbConnect } from "@/lib/db";
import { Admin, Booking, Participant } from "@/models";
import { requireAttendee } from "@/lib/auth";
import { ok, unauthorized, notFound } from "@/lib/http";

/* The meetings a signed-in participant has booked with our staff.

   Matched on the email their registration is under, not on Booking.participant:
   public bookings are made by people who are not signed in and never carry that
   link, so keying on it would show an empty list to someone who has a meeting
   tomorrow. The email comes from THEIR OWN participant record on the server —
   never from the request — so this cannot be pointed at somebody else's inbox.

   Cancellation is not offered here. That runs on the single-use token emailed
   at booking time, which is the same door whether or not you have an account,
   and duplicating it against a session would be a second way to cancel that
   could drift from the first. The email carries the link; this links to it. */
export async function GET(req: Request) {
  const participantId = await requireAttendee(req);
  if (!participantId) return unauthorized();

  await dbConnect();
  const participant = await Participant.findById(participantId).select("email");
  if (!participant) return notFound("Registration");

  const bookings = await Booking.find({
    requesterEmail: participant.email.toLowerCase(),
    active: true,
    /* Upcoming only, and filtered HERE rather than in the browser: reading the
       clock during render is impure and the memo would freeze at first paint,
       so a meeting that ended while the tab was open would linger. The server
       reads the clock once, per request. */
    end: { $gte: new Date() },
  })
    .sort({ start: 1 })
    .select("host start end topic status meetLink");

  if (!bookings.length) return ok({ bookings: [] });

  /* one lookup for the host names rather than a populate per row */
  const hosts = await Admin.find({
    _id: { $in: [...new Set(bookings.map((b) => b.host.toString()))] },
  }).select("name title");
  const hostById = new Map(hosts.map((h) => [h._id.toString(), h]));

  return ok({
    bookings: bookings.map((b) => {
      const host = hostById.get(b.host.toString());
      return {
        id: b._id.toString(),
        hostName: host?.name ?? "Igire Rwanda Organization",
        hostTitle: host?.title ?? null,
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        topic: b.topic ?? "",
        status: b.status,
        /* the joining link is theirs — they are on the call */
        meetLink: b.meetLink ?? null,
      };
    }),
  });
}
