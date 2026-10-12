import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, ScanLog, Ticket } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  await dbConnect();
  const events = await Event.find().sort({ startTime: -1 });

  const stats = await Promise.all(
    events.map(async (event) => {
      const [
        participantCount,
        guestCount,
        confirmedCount,
        plusOneCount,
        ticketsSent,
        byStack,
        tickets,
        participantFaces,
        guestFaces,
        holderFaces,
        archivedCount,
      ] = await Promise.all([
        Participant.countDocuments({ event: event._id }),
        Guest.countDocuments({ event: event._id }),
        Participant.countDocuments({ event: event._id, registrationStatus: "APPROVED" }),
        Guest.countDocuments({ event: event._id, guestType: "PLUS_ONE" }),
        Ticket.countDocuments({ event: event._id, sentAt: { $ne: null } }),
        Participant.aggregate([
          { $match: { event: event._id } },
          { $group: { _id: { stack: "$stack", status: "$status" }, n: { $sum: 1 } } },
        ]),
        Ticket.aggregate([
          { $match: { event: event._id } },
          { $group: { _id: "$status", n: { $sum: 1 } } },
        ]),
        /* a handful of faces for the avatar stack */
        Participant.find({ event: event._id, profilePicture: { $nin: [null, ""] } })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select("name profilePicture"),
        Guest.find({ event: event._id, profile: { $nin: [null, ""] } })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select("name profile"),
        /* checked-in people whose live record was deleted at the gate live on
           as holder snapshots on their tickets */
        Ticket.find({ event: event._id, "holder.photoUrl": { $nin: [null, ""] } })
          .sort({ scannedAt: -1 })
          .limit(5)
          .select("holder.name holder.photoUrl"),
        Ticket.countDocuments({ event: event._id, "holder.name": { $exists: true } }),
      ]);

      const ticketCounts = Object.fromEntries(tickets.map((t) => [t._id, t.n]));
      const issued = (ticketCounts.VALID ?? 0) + (ticketCounts.USED ?? 0);
      const checkedIn = ticketCounts.USED ?? 0;
      const attendancePercentage = issued ? Math.round((checkedIn / issued) * 100) : 0;
      const faces = [
        ...participantFaces.map((f) => ({ name: f.name, photoUrl: f.profilePicture! })),
        ...guestFaces.map((f) => ({ name: f.name, photoUrl: f.profile! })),
        ...holderFaces.map((t) => ({ name: t.holder!.name, photoUrl: t.holder!.photoUrl! })),
      ].slice(0, 5);

      return {
        event: {
          id: event._id,
          name: event.name,
          slug: event.slug,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          category: event.category,
          type: event.type,
          price: event.price,
          gallery: event.gallery,
          status: event.status,
          maxAttendees: event.maxAttendees,
          isPublished: event.isPublished,
        },
        fullness: { issued, capacity: event.maxAttendees },
        checkedIn,
        totalAttendees: participantCount + guestCount + archivedCount,
        participants: participantCount,
        guests: guestCount,
        confirmed: confirmedCount,
        plusOneCount,
        totalGuestsIncludingPlusOnes: participantCount + guestCount + archivedCount,
        ticketsSent,
        ticketsPending: Math.max(0, issued - ticketsSent),
        ticketsScanned: checkedIn,
        attendancePercentage,
        remainingCapacity: event.maxAttendees > 0 ? Math.max(0, event.maxAttendees - issued) : null,
        faces,
        byStack,
        tickets: ticketCounts,
      };
    })
  );

  /* the most recent gate activity, for the dashboard's live feed */
  const recentLogs = await ScanLog.find().sort({ createdAt: -1 }).limit(8);
  const recentScans = recentLogs.map((log) => ({
    at: log.createdAt.toISOString(),
    result: log.result,
  }));

  return ok({ stats, recentScans });
}
