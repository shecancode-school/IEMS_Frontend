import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { uploadImage } from "@/lib/cloudinary";
import { publishContentChange } from "@/lib/scanBus";
import { ok, fail, unauthorized, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get("image") ?? form?.get("poster");
  if (!(file instanceof File)) return fail("Attach an image as the 'image' field");
  if (!file.type.startsWith("image/")) return fail("Only image files are accepted");
  if (file.size > MAX_BYTES) return fail("Image must be under 8MB");

  const { id } = await ctx.params;
  await dbConnect();
  const event = await Event.findById(id);
  if (!event) return notFound("Event");

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadImage(buffer, "events");
  /* the event gallery holds every uploaded image; newest first */
  event.gallery = [url, ...event.gallery];
  await event.save();
  publishContentChange("events");

  await recordAudit({
    actorId: admin.id,
    req,
    action: "event.poster",
    target: { type: "event", id: event._id.toString(), label: event.name },
    summary: `Added an image to "${event.name}"`,
  });

  return ok({ url, gallery: event.gallery });
}
