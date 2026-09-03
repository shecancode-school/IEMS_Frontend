import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Admin, Booking } from "@/models";
import { requireStaff } from "@/lib/auth";
import { BOOKING_STATUSES, can } from "@/types/admin";
import { kigaliDayEnd, kigaliDayStart } from "@/lib/time";
import { createBooking, loadBookableHost } from "@/lib/scheduling/book";
import { ok, fail, forbidden, notFound, unauthorized } from "@/lib/http";

/* Bookings you host. calendar:viewAll additionally lets you pass ?host=<id>
   to look at someone else's — otherwise the filter is ignored rather than
   rejected, so a stale bookmark degrades to "your own" instead of a 403. */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();
  if (!can(staff.role, "bookings:host") && !can(staff.role, "calendar:viewAll")) {
    return forbidden();
  }

  const params = new URL(req.url).searchParams;
  const requestedHost = params.get("host");
  const host =
    requestedHost && can(staff.role, "calendar:viewAll") ? requestedHost : staff.id;

  const status = BOOKING_STATUSES.find((s) => s === params.get("status"));
  const from = params.get("from");
  const to = params.get("to");

  await dbConnect();
  const bookings = await Booking.find({
    host,
    ...(status ? { status } : {}),
    ...(from || to
      ? {
          start: {
            ...(from ? { $gte: kigaliDayStart(from) } : {}),
            ...(to ? { $lte: kigaliDayEnd(to) } : {}),
          },
        }
      : {}),
  })
    .sort({ start: -1 })
    .limit(500);

  const hostDoc = await Admin.findById(host).select("name");

  return ok({
    hostName: hostDoc?.name ?? null,
    bookings: bookings.map((b) => ({
      id: b._id.toString(),
      requesterName: b.requesterName,
      requesterEmail: b.requesterEmail,
      requesterPhone: b.requesterPhone ?? "",
      topic: b.topic,
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      status: b.status,
      meetLink: b.meetLink ?? null,
      source: b.source,
      createdAt: b.createdAt.toISOString(),
      cancelledAt: b.cancelledAt?.toISOString() ?? null,
      cancelledBy: b.cancelledBy ?? null,
    })),
  });
}

const CreateBody = z.object({
  /* the host's public booking slug — the same identifier /book/<slug> uses,
     so the console and the public page can never mean different people */
  slug: z.string().min(1).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  topic: z.string().max(500).optional(),
  start: z.string().datetime(),
});

/* Take a booking from inside the console — the walk-in standing at the desk,
   or someone who called.

   Booking.source has always had an ADMIN value and nothing could ever set it:
   staff could list and cancel bookings but not make one, so a person in front
   of you had to be sent to the public page to book themselves. This is that
   missing door.

   It is deliberately NOT a privileged shortcut. The slot is re-checked against
   the host's real availability and live free/busy exactly as a public booking
   is, because working here is not a reason to be allowed to double-book a
   colleague. What staff get is the ability to act for someone else — and the
   audit line says so. */
export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();
  /* the same permission that lets you see the bookings board */
  if (!can(staff.role, "bookings:host") && !can(staff.role, "calendar:viewAll")) {
    return forbidden();
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("A host, a name, a valid email address and a chosen time are required");
  }
  const { slug, ...body } = parsed.data;

  await dbConnect();
  const host = await loadBookableHost(slug);
  if (!host) return notFound("That person is not taking bookings");

  const result = await createBooking(host, body, { kind: "ADMIN", staffId: staff.id });
  if (!result.ok) return fail(result.message, result.status);
  return ok({ booking: result.booking }, 201);
}
