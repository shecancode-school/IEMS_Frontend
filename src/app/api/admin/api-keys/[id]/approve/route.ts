import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { ApiKey, API_KEY_SCOPES } from "@/models";
import { requireCapability } from "@/lib/auth";
import { generateApiKey } from "@/lib/apiKey";
import { recordAudit } from "@/lib/audit";
import { ok, fail, unauthorized, forbidden, notFound } from "@/lib/http";

const Body = z.object({
  rateLimitPerMinute: z.number().int().min(1).max(6000).optional(),
  /* Which feeds this key may read. Omitted means the requester keeps what they
     asked for, which is calendar:read by default — approval should never widen
     access silently. */
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
});

/* Approve a request and mint the key.

   The raw key is returned EXACTLY ONCE, in this response, and only its
   SHA-256 is written. There is deliberately no endpoint that can show it
   again — if it is lost, the honest answer is to revoke and reissue, which is
   also the answer that keeps a leaked key from living forever. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability(req, "staff:manage");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("API key request");

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Invalid rate limit");

  await dbConnect();
  const request = await ApiKey.findById(id);
  if (!request) return notFound("API key request");

  /* approving twice would mint a second key and orphan the first */
  if (request.status === "ACTIVE") {
    return fail("That request is already approved — revoke it to issue a new key", 409);
  }
  if (request.status === "REVOKED") {
    return fail("That key was revoked. Ask the integrator to submit a new request.", 409);
  }

  const { raw, hash, prefix } = generateApiKey();
  request.keyHash = hash;
  request.keyPrefix = prefix;
  request.status = "ACTIVE";
  request.approvedBy = staff.id as never;
  request.approvedAt = new Date();
  if (parsed.data.rateLimitPerMinute) request.rateLimitPerMinute = parsed.data.rateLimitPerMinute;
  if (parsed.data.scopes) request.scopes = parsed.data.scopes;
  await request.save();

  await recordAudit({
    actorId: staff.id,
    req,
    action: "apikey.approve",
    target: { type: "apikey", id: request._id.toString(), label: request.label },
    summary:
      `Approved API access for ${request.contactName}` +
      `${request.organisation ? ` (${request.organisation})` : ""}` +
      ` — key ${prefix}…, ${request.rateLimitPerMinute}/min, scopes: ${request.scopes.join(", ")}`,
  });

  return ok({
    /* the one and only time this value exists outside the integrator's hands */
    key: raw,
    keyPrefix: prefix,
    scopes: request.scopes,
    rateLimitPerMinute: request.rateLimitPerMinute,
    warning: "Copy this key now. It cannot be shown again — only revoked and reissued.",
  });
}
