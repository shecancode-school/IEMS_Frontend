import { dbConnect } from "@/lib/db";
import { Participant } from "@/models";
import { requireAttendee } from "@/lib/auth";
import { uploadImage, InvalidImageError } from "@/lib/cloudinary";
import { issueTicket, CapacityError } from "@/lib/tickets";
import { ok, fail, unauthorized, notFound } from "@/lib/http";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const participantId = await requireAttendee(req);
  if (!participantId) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return fail("Attach an image as the 'photo' field");
  if (!file.type.startsWith("image/")) return fail("Only image files are accepted");
  if (file.size > MAX_BYTES) return fail("Image must be under 8MB");

  await dbConnect();
  const participant = await Participant.findById(participantId);
  if (!participant) return notFound("Registration");
  if (participant.status === "PENDING") return fail("Verify your email first", 403);

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    participant.profilePicture = await uploadImage(buffer, "participants");
  } catch (err) {
    if (err instanceof InvalidImageError) return fail(err.message);
    throw err;
  }
  participant.status = "COMPLETE";
  await participant.save();

  try {
    const ticket = await issueTicket({ kind: "Participant", doc: participant });
    return ok({ profilePicture: participant.profilePicture, ticketCode: ticket.code });
  } catch (err) {
    if (err instanceof CapacityError) return fail(err.message, 409);
    throw err;
  }
}
