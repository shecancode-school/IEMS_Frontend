import { dbConnect } from "@/lib/db";
import { Admin, Availability } from "@/models";
import { connectedAdminIds } from "@/lib/google/tokens";
import { ok } from "@/lib/http";

/* Public: who can be booked. No auth — this is the front door of the booking
   flow. Only name, role and blurb are exposed; never an email address, which
   would turn the page into a scraping target. */
export async function GET() {
  await dbConnect();

  const available = await Availability.find({ bookable: true }).sort({ slug: 1 });
  const admins = await Admin.find({
    _id: { $in: available.map((a) => a.admin) },
    active: true,
  }).select("name title avatarUrl bio role");

  const byId = new Map(admins.map((a) => [a._id.toString(), a]));
  const connected = await connectedAdminIds(admins.map((a) => a._id.toString()));

  const hosts = available.flatMap((a) => {
    const admin = byId.get(a.admin.toString());
    if (!admin) return [];
    return [
      {
        slug: a.slug,
        name: admin.name,
        role: admin.role,
        title: admin.title ?? a.headline ?? null,
        bio: a.bio || admin.bio || "",
        avatarUrl: admin.avatarUrl ?? null,
        slotMinutes: a.slotMinutes,
        /* the page shows an "online meeting" badge only when a Meet link can
           actually be created — an unconnected host still takes bookings, just
           without one */
        online: connected.has(admin._id.toString()),
      },
    ];
  });

  return ok({ hosts });
}
