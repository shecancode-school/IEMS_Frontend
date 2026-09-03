import { requireAdmin } from "@/lib/auth";
import { uploadImage, InvalidImageError } from "@/lib/cloudinary";
import { ok, fail, unauthorized } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

const MAX_BYTES = 8 * 1024 * 1024;

/* Generic admin image upload → Cloudinary. Used by forms (e.g. the new-event
   poster) that need an image URL before the record exists. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get("image") ?? form?.get("file");
  if (!(file instanceof File)) return fail("Attach an image as the 'image' field");
  if (!file.type.startsWith("image/")) return fail("Only image files are accepted");
  if (file.size > MAX_BYTES) return fail("Image must be under 8MB");

  const folder = typeof form?.get("folder") === "string" ? String(form.get("folder")) : "events";
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const url = await uploadImage(buffer, folder);
    await recordAudit({
      actorId: admin.id,
      req,
      action: "upload.create",
      target: { type: "upload", id: "", label: url },
      summary: "Uploaded an image",
    });
    return ok({ url });
  } catch (err) {
    if (err instanceof InvalidImageError) return fail(err.message);
    throw err;
  }
}
