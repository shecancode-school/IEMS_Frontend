import { Admin, Availability, Booking, CalendarActivity, Event, type AdminDoc } from "@/models";
import { dbConnect } from "@/lib/db";
import { connectedAdminIds } from "@/lib/google/tokens";
import { freeBusy } from "@/lib/google/calendar";
import { can } from "@/types/admin";

/* The directory is a "right now" snapshot of the whole team: who is who, who
   is connected to Google, who is bookable, and whether they are currently
   engaged in something.

   "Busy now" is derived, never stored. It is built from the same three sources
   the org calendar uses — ticketed events they host, staff activities they own,
   and confirmed 1:1 bookings — plus, for people who connected Google, their own
   opaque free/busy blocks. Public events with no host are not someone's
   busy-ness, so they are excluded. */

export type DirectoryStatus = "BUSY" | "FREE" | "INACTIVE";

export type DirectoryPerson = {
  id: string;
  name: string;
  photoUrl: string | null;
  role: string;
  title: string | null;
  googleConnected: boolean;
  bookable: boolean;
  status: DirectoryStatus;
  /* what they are doing right now — only when status is BUSY */
  nowLabel: string | null;
};

/* Returns the roster the viewer may see (same rule as the calendar person
   filter: everyone for calendar:viewAll, just themselves otherwise). */
export async function directorySnapshot(
  viewer: { id: string; role: string },
  now: Date = new Date()
): Promise<DirectoryPerson[]> {
  await dbConnect();

  const roster = await Admin.find({ active: true }).sort({ name: 1 });
  const visible = can(viewer.role, "calendar:viewAll")
    ? roster
    : roster.filter((a) => a._id.toString() === viewer.id);
  const ids = visible.map((a) => a._id.toString());

  /* --- what everyone is doing right now ------------------------------ */
  const labelByOwner = new Map<string, string>();

  const [activities, bookings, hostedEvents] = await Promise.all([
    CalendarActivity.find({
      owner: { $in: ids },
      status: { $ne: "CANCELLED" },
      start: { $lte: now },
      end: { $gte: now },
    }).select("owner title"),
    Booking.find({
      host: { $in: ids },
      active: true,
      start: { $lte: now },
      end: { $gte: now },
    }).select("host topic"),
    Event.find({
      archivedAt: null,
      host: { $in: ids },
      startTime: { $lte: now },
      endTime: { $gte: now },
    }).select("host name"),
  ]);

  for (const a of activities) {
    labelByOwner.set(a.owner.toString(), a.title);
  }
  for (const b of bookings) {
    /* an existing label wins so a booking doesn't hide an activity or event */
    if (!labelByOwner.has(b.host.toString())) labelByOwner.set(b.host.toString(), "in a booking");
  }
  for (const e of hostedEvents) {
    if (!labelByOwner.has(e.host!.toString())) labelByOwner.set(e.host!.toString(), e.name);
  }

  /* --- Google free/busy for connected people (best effort) ----------- */
  const connected = await connectedAdminIds(ids);
  const bookable = new Set(
    (await Availability.find({ admin: { $in: ids }, bookable: true }).select("admin")).map((a) =>
      a.admin.toString()
    )
  );

  const busyFromGoogle = new Set<string>();
  await Promise.allSettled(
    [...ids].filter((id) => connected.has(id)).map(async (id) => {
      const blocks = await freeBusy(id, new Date(now.getTime() - 5 * 60 * 1000), new Date(now.getTime() + 5 * 60 * 1000));
      for (const b of blocks) {
        if (b.start <= now && b.end >= now) {
          busyFromGoogle.add(id);
          break;
        }
      }
    })
  );

  return visible.map((a: AdminDoc) => {
    const id = a._id.toString();
    const label = labelByOwner.get(id);
    if (label) return { id, name: a.name, photoUrl: a.photoUrl ?? null, role: a.role, title: a.title ?? null, googleConnected: connected.has(id), bookable: bookable.has(id), status: "BUSY", nowLabel: label };
    if (busyFromGoogle.has(id)) return { id, name: a.name, photoUrl: a.photoUrl ?? null, role: a.role, title: a.title ?? null, googleConnected: connected.has(id), bookable: bookable.has(id), status: "BUSY", nowLabel: "in a Google meeting" };
    return { id, name: a.name, photoUrl: a.photoUrl ?? null, role: a.role, title: a.title ?? null, googleConnected: connected.has(id), bookable: bookable.has(id), status: "FREE", nowLabel: null };
  });
}
