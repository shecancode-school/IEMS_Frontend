import { dbConnect } from "@/lib/db";
import { GoogleAccount } from "@/models";
import { requireStaff } from "@/lib/auth";
import { googleConfigured } from "@/lib/google/config";
import { ok, unauthorized } from "@/lib/http";

/* Is this staff member's Google Calendar connected, and is it still healthy? */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  await dbConnect();
  const account = await GoogleAccount.findOne({ admin: staff.id }).select(
    "email scopes status lastError connectedAt lastUsedAt"
  );

  return ok({
    /* false when the deployment has no Google credentials at all — the UI
       shows "not set up on this deployment" instead of a dead Connect button */
    available: googleConfigured(),
    connected: account?.status === "CONNECTED",
    needsReconnect: account?.status === "REVOKED",
    email: account?.email ?? null,
    scopes: account?.scopes ?? [],
    status: account?.status ?? null,
    lastError: account?.lastError ?? null,
    connectedAt: account?.connectedAt ?? null,
    lastUsedAt: account?.lastUsedAt ?? null,
  });
}
