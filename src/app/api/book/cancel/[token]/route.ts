import { dbConnect } from "@/lib/db";
import { Admin, Booking } from "@/models";
import { sha256 } from "@/lib/crypto";
import { deleteEvent } from "@/lib/google/calendar";
import { invalidateAdmin } from "@/lib/google/cache";
import { sendBookingCancelledEmail } from "@/lib/mailer";
import { publishContentChange } from "@/lib/scanBus";
import { formatEventDateTime } from "@/lib/time";
import { recordAudit } from "@/lib/audit";
import { ok, notFound } from "@/lib/http";

/* Cancelling by emailed token. The raw token is never stored — only its
   SHA-256, the same shape VerificationToken and RefreshToken use — so a
   database leak does not hand over the ability to cancel anyone's meetings. */

async function findByToken(token: string) {
  return Booking.findOne({ cancelTokenHash: sha256(token) });
}

/* Public: what am I about to cancel? Powers the confirmation page. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  await dbConnect();
  const booking = await findByToken(token);
  if (!booking) return notFound("Booking");

  const host = await Admin.findById(booking.host).select("name title");

  return ok({
    booking: {
      id: booking._id.toString(),
      hostName: host?.name ?? "",
      hostTitle: host?.title ?? null,
      requesterName: booking.requesterName,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      topic: booking.topic,
      status: booking.status,
      meetLink: booking.meetLink ?? null,
    },
  });
}

/* Public: cancel it. Idempotent — following the link twice is a normal thing
   for a person to do, and the second visit should confirm, not error. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  await dbConnect();
  const booking = await findByToken(token);
  if (!booking) return notFound("Booking");
  if (booking.status === "CANCELLED") return ok({ cancelled: true, alreadyCancelled: true });

  const hostId = booking.host.toString();
  if (booking.googleEventId) {
    /* already gone from Google is fine — the goal is "not on the calendar" */
    await deleteEvent(hostId, booking.googleEventId).catch(() => undefined);
  }

  booking.status = "CANCELLED";
  /* clearing `active` is what releases the slot: the partial unique index only
     covers active bookings, so the time becomes bookable again */
  booking.active = false;
  booking.cancelledAt = new Date();
  booking.cancelledBy = "REQUESTER";
  await booking.save();

  invalidateAdmin(hostId);
  publishContentChange("calendar");

  const host = await Admin.findById(hostId).select("name email");
  const when = `${formatEventDateTime(booking.start)} (Kigali time, UTC+2)`;

  await Promise.allSettled([
    sendBookingCancelledEmail({
      to: booking.requesterEmail,
      name: booking.requesterName,
      otherName: host?.name ?? "your host",
      when,
      cancelledByThem: false,
    }),
    host?.email
      ? sendBookingCancelledEmail({
          to: host.email,
          name: host.name,
          otherName: booking.requesterName,
          when,
          cancelledByThem: true,
        })
      : Promise.resolve(),
  ]);

  await recordAudit({
    actorId: null,
    actorName: booking.requesterName,
    actorEmail: booking.requesterEmail,
    action: "booking.cancel",
    target: { type: "booking", id: booking._id.toString(), label: host?.name ?? "" },
    summary: `Cancelled their booking with ${host?.name ?? "the host"}`,
  });

  return ok({ cancelled: true });
}
