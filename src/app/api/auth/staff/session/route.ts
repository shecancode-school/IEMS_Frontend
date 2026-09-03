import { dbConnect } from "@/lib/db";
import { Admin, GoogleAccount } from "@/models";
import { requireStaffSession } from "@/lib/auth";
import { capabilitiesFor } from "@/types/admin";
import { ok, unauthorized, notFound } from "@/lib/http";

/* Who is signed in, from the cookie alone.

   The console calls this on load instead of reading a cached identity out of
   localStorage — there is nothing in localStorage to read any more. It is also
   what makes a promotion or a revoked scan grant visible without a re-login. */
export async function GET(req: Request) {
  const staff = await requireStaffSession(req);
  if (!staff) return unauthorized();

  await dbConnect();
  const admin = await Admin.findById(staff.id).select(
    "name email role title photoUrl bio canScan active lastSignInAt"
  );
  if (!admin) return notFound("Account");

  const google = await GoogleAccount.findOne({ admin: admin._id }).select("email status");

  return ok({
    admin: {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      title: admin.title ?? null,
      photoUrl: admin.photoUrl ?? null,
      bio: admin.bio ?? null,
      canScan: admin.canScan,
      active: admin.active,
      lastSignInAt: admin.lastSignInAt ?? null,
    },
    capabilities: capabilitiesFor(admin.role),
    google: {
      connected: google?.status === "CONNECTED",
      email: google?.email ?? null,
      status: google?.status ?? null,
    },
    sessionId: staff.sessionId,
  });
}
