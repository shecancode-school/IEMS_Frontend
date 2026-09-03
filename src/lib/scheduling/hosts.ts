import { Admin, Availability, Booking, type AvailabilityDoc } from "@/models";
import { freeBusy } from "@/lib/google/calendar";
import { GoogleAuthError } from "@/lib/google/errors";
import { getGoogleSession } from "@/lib/google/tokens";
import { kigaliDayEnd, kigaliDayStart } from "@/lib/time";
import { computeFreeSlots, type DaySlots, type Interval } from "./slots";
import { toSlotRules } from "./availabilityView";

/* Shared between the public slot listing and the booking write, so the list a
   requester sees and the check that admits their booking can never disagree. */

export type BookableHost = {
  availability: AvailabilityDoc;
  admin: {
    _id: unknown;
    name: string;
    /* needed to email the host their booking notice */
    email: string;
    title?: string | null;
    avatarUrl?: string | null;
    bio?: string | null;
    role: string;
  };
};

/* Everything already occupying the host's time in this window: their Google
   busy blocks plus bookings already taken through IEMS.

   Google is the slower and more failure-prone of the two, and it must not be
   the thing that silently frees up a slot — if we cannot reach it we say so
   rather than offering times the host may not actually have. */
export async function busyFor(
  adminId: string,
  fromISO: string,
  toISO: string
): Promise<{ busy: Interval[]; googleOk: boolean }> {
  const windowStart = kigaliDayStart(fromISO);
  const windowEnd = kigaliDayEnd(toISO);

  const bookings = await Booking.find({
    host: adminId,
    active: true,
    start: { $lt: windowEnd },
    end: { $gt: windowStart },
  }).select("start end");

  const busy: Interval[] = bookings.map((b) => ({ start: b.start, end: b.end }));

  let googleOk = true;
  try {
    const session = await getGoogleSession(adminId);
    if (session) {
      busy.push(...(await freeBusy(adminId, windowStart, windowEnd)));
    } else {
      /* not connected at all — their IEMS bookings are the whole picture, and
         that is a legitimate configuration rather than a failure */
      googleOk = true;
    }
  } catch (err) {
    googleOk = false;
    if (!(err instanceof GoogleAuthError)) {
      /* a transient Google outage — the caller decides whether to proceed */
    }
  }

  return { busy, googleOk };
}

export async function loadBookableHost(slug: string): Promise<BookableHost | null> {
  const availability = await Availability.findOne({ slug: slug.toLowerCase(), bookable: true });
  if (!availability) return null;

  const admin = await Admin.findById(availability.admin).select("name email title avatarUrl bio role active");
  if (!admin?.active) return null;

  return { availability, admin: admin as unknown as BookableHost["admin"] };
}

/* The same host, found by their account rather than their public slug.

   Reschedule needs this: it starts from a booking, which stores the host's id
   and has no idea what slug they publish under. Kept beside loadBookableHost
   so the two can never disagree about what makes someone bookable. */
export async function loadBookableHostByAdmin(adminId: string): Promise<BookableHost | null> {
  const availability = await Availability.findOne({ admin: adminId, bookable: true });
  if (!availability) return null;

  const admin = await Admin.findById(adminId).select("name email title avatarUrl bio role active");
  if (!admin?.active) return null;

  return { availability, admin: admin as unknown as BookableHost["admin"] };
}

export async function slotsFor(
  host: BookableHost,
  fromISO: string,
  toISO: string,
  now = new Date(),
  /* An interval the caller already owns and is giving up.

     Reschedule is the only caller: a booking being moved is itself busy — in
     the DB and, mirrored, in the host's Google calendar — so without this the
     host would appear unavailable at the very time they are vacating, and
     moving 09:00 to 09:30 would be refused as a clash with itself. Matched on
     exact bounds, which is what both copies of the block carry. */
  release?: Interval
): Promise<{ days: DaySlots[]; googleOk: boolean }> {
  const adminId = String(host.admin._id);
  const { busy, googleOk } = await busyFor(adminId, fromISO, toISO);

  const free = release
    ? busy.filter(
        (b) =>
          b.start.getTime() !== release.start.getTime() ||
          b.end.getTime() !== release.end.getTime()
      )
    : busy;

  const days = computeFreeSlots({
    from: fromISO,
    to: toISO,
    rules: toSlotRules(host.availability),
    busy: free,
    now,
  });

  return { days, googleOk };
}
