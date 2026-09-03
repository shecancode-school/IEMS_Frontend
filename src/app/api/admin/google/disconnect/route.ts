import { dbConnect } from "@/lib/db";
import { GoogleAccount } from "@/models";
import { requireStaff } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { revokeToken } from "@/lib/google/oauth";
import { invalidateAdmin } from "@/lib/google/cache";
import { recordAudit } from "@/lib/audit";
import { ok, unauthorized } from "@/lib/http";

/* Disconnect: tell Google to forget the grant, then drop our copy.

   Revocation is best-effort — if Google is unreachable we still delete the
   local record, because leaving an undeletable connection in the UI is worse
   than an orphaned grant the user can also remove from their Google account. */
export async function DELETE(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  await dbConnect();
  const account = await GoogleAccount.findOne({ admin: staff.id });
  if (!account) return ok({ disconnected: true });

  try {
    await revokeToken(decryptSecret(account.refreshToken));
  } catch {
    /* a key rotation or an already-dead grant — nothing to revoke */
  }

  await GoogleAccount.deleteOne({ _id: account._id });
  invalidateAdmin(staff.id);
  await recordAudit({
    actorId: staff.id,
    action: "google.disconnect",
    target: { type: "googleAccount", id: account._id.toString(), label: account.email ?? "" },
    summary: `Disconnected their Google Calendar (${account.email ?? ""})`,
  });
  return ok({ disconnected: true });
}
