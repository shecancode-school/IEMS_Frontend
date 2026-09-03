import { dbConnect } from "@/lib/db";
import { ApiKey } from "@/models";
import { requireCapability } from "@/lib/auth";
import { API_KEY_STATUSES } from "@/models";
import { ok, unauthorized, forbidden } from "@/lib/http";

/* Requests and issued keys, newest first.

   The key hash is never selected — there is nothing useful an administrator
   could do with it and no reason for it to travel to a browser. */
export async function GET(req: Request) {
  const staff = await requireCapability(req, "staff:manage");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const status = API_KEY_STATUSES.find((s) => s === new URL(req.url).searchParams.get("status"));

  await dbConnect();
  const rows = await ApiKey.find(status ? { status } : {})
    .select("-keyHash")
    .populate<{ approvedBy: { name: string } | null }>("approvedBy", "name")
    .sort({ createdAt: -1 })
    .limit(500);

  return ok({
    keys: rows.map((k) => ({
      id: k._id.toString(),
      label: k.label,
      organisation: k.organisation,
      contactName: k.contactName,
      contactEmail: k.contactEmail,
      website: k.website,
      purpose: k.purpose,
      keyPrefix: k.keyPrefix ?? null,
      scopes: k.scopes,
      status: k.status,
      rateLimitPerMinute: k.rateLimitPerMinute,
      approvedBy: k.approvedBy?.name ?? null,
      approvedAt: k.approvedAt ?? null,
      revokedAt: k.revokedAt ?? null,
      revokedReason: k.revokedReason ?? null,
      lastUsedAt: k.lastUsedAt ?? null,
      requestCount: k.requestCount,
      createdAt: k.createdAt,
    })),
  });
}
