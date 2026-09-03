import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { ApiKey } from "@/models";
import { requireCapability } from "@/lib/auth";
import { forgetApiKeyBucket } from "@/lib/apiKey";
import { recordAudit } from "@/lib/audit";
import { ok, fail, unauthorized, forbidden, notFound } from "@/lib/http";

const Body = z.object({ reason: z.string().max(300).optional() });

/* Revoke a key, or reject a request that was never approved.

   The hash is cleared as well as the status changed: a revoked credential
   should stop existing, not sit in the database waiting for a future bug to
   accept it again. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability(req, "staff:manage");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("API key");

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Invalid reason");

  await dbConnect();
  const key = await ApiKey.findById(id);
  if (!key) return notFound("API key");
  if (key.status === "REVOKED" || key.status === "REJECTED") {
    return ok({ revoked: true, alreadyRevoked: true });
  }

  const wasActive = key.status === "ACTIVE";
  key.status = wasActive ? "REVOKED" : "REJECTED";
  key.keyHash = null;
  key.revokedAt = new Date();
  key.revokedReason = parsed.data.reason ?? null;
  await key.save();
  forgetApiKeyBucket(key._id.toString());

  await recordAudit({
    actorId: staff.id,
    req,
    action: wasActive ? "apikey.revoke" : "apikey.reject",
    target: { type: "apikey", id: key._id.toString(), label: key.label },
    summary: wasActive
      ? `Revoked API key ${key.keyPrefix ?? ""}… for ${key.contactName}${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`
      : `Rejected the API access request from ${key.contactName}${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`,
  });

  return ok({ revoked: true });
}
