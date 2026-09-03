import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Admin, Availability, Booking } from "@/models";
import { requireStaff } from "@/lib/auth";
import { deleteEvent } from "@/lib/google/calendar";
import { invalidateAdmin } from "@/lib/google/cache";
import { sendBookingCancelledEmail } from "@/lib/mailer";
import { publishContentChange } from "@/lib/scanBus";
import { can } from "@/types/admin";
import { formatEventDateTime } from "@/lib/time";
import { recordAudit } from "@/lib/audit";
import { rescheduleBooking } from "@/lib/scheduling/book";
import { ok, fail, forbidden, notFound, unauthorized } from "@/lib/http";

/* Hosting it, or being an administrator, is what grants the right to read or
   change one. Merely being able to see the org calendar is not — the org
   calendar shows other people's bookings as anonymous busy blocks precisely
   because the requester's name, email and topic are not everyone's business. */
async function loadForStaff(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req);
  if (!staff) return { error: unauthorized() } as const;

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return { error: notFound("Booking") } as const;

  await dbConnect();
  const booking = await Booking.findById(id);
  if (!booking) return { error: notFound("Booking") } as const;

  const hostId = booking.host.toString();
  if (hostId !== staff.id && !can(staff.role, "staff:manage")) {
    return { error: forbidden() } as const;
  }
  return { staff, booking, hostId } as const;
}

/* One booking, for the calendar's detail panel. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const found = await loadForStaff(req, ctx);
  if ("error" in found) return found.error;
  const { booking, hostId } = found;

  const host = await Admin.findById(hostId).select("name email");
  /* the panel offers new times from the SAME public slots endpoint the
     visitor-facing page uses, and that is addressed by slug */
  const availability = await Availability.findOne({ admin: hostId }).select("slug bookable");

  return ok({
    booking: {
      id: booking._id.toString(),
      hostId,
      hostName: host?.name ?? null,
      hostSlug: availability?.bookable ? availability.slug : null,
      requesterName: booking.requesterName,
      requesterEmail: booking.requesterEmail,
      requesterPhone: booking.requesterPhone ?? "",
      topic: booking.topic,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      status: booking.status,
      meetLink: booking.meetLink ?? null,
      source: booking.source,
      createdAt: booking.createdAt.toISOString(),
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      cancelledBy: booking.cancelledBy ?? null,
    },
  });
}

const PatchBody = z.object({ start: z.string().datetime() });

/* Move a booking to another time. The availability re-check, the atomic claim,
   the Google patch and both emails live in lib/scheduling/book so this path and
   the public one can never disagree about what a valid slot is. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const found = await loadForStaff(req, ctx);
  if ("error" in found) return found.error;
  const { staff, booking } = found;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("A new start time is required");

  const result = await rescheduleBooking(booking, parsed.data.start, { staffId: staff.id });
  if (!result.ok) return fail(result.message, result.status);
  return ok({ booking: result.booking });
}

/* The host cancelling their own booking. Same end state as the requester's
   emailed link: Google entry removed, slot released, both sides told. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const found = await loadForStaff(req, ctx);
  if ("error" in found) return found.error;
  const { staff, booking, hostId } = found;

  if (booking.status === "CANCELLED") return ok({ cancelled: true, alreadyCancelled: true });

  if (booking.googleEventId) {
    await deleteEvent(hostId, booking.googleEventId).catch(() => undefined);
  }

  booking.status = "CANCELLED";
  booking.active = false;
  booking.cancelledAt = new Date();
  booking.cancelledBy = "HOST";
  await booking.save();

  invalidateAdmin(hostId);
  publishContentChange("calendar");

  const host = await Admin.findById(hostId).select("name");
  await sendBookingCancelledEmail({
    to: booking.requesterEmail,
    name: booking.requesterName,
    otherName: host?.name ?? "your host",
    when: `${formatEventDateTime(booking.start)} (Kigali time, UTC+2)`,
    cancelledByThem: true,
  }).catch(() => undefined);

  await recordAudit({
    actorId: staff.id,
    action: "booking.cancel_by_host",
    target: { type: "booking", id: booking._id.toString(), label: `${bookRequester(booking)}` },
    summary: `Host cancelled a booking with ${booking.requesterName}`,
  });

  return ok({ cancelled: true });
}

function bookRequester(booking: { topic?: string; requesterName: string }): string {
  return booking.topic ? `${booking.requesterName} — ${booking.topic}` : booking.requesterName;
}
