import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { ApiKey } from "@/models";
import { notifyAdmins } from "@/lib/notify";
import { auditContext } from "@/lib/audit";
import { ok, fail } from "@/lib/http";

/* Ask for an API key.

   Public and unauthenticated by necessity — the whole point is that someone
   outside the organisation can ask. It creates a PENDING request and NEVER
   returns a key: issuing happens only when an administrator approves, which
   is what keeps "who is reading our calendar" a decision rather than an
   accident. Rate limited in src/proxy.ts. */

const Body = z.object({
  label: z.string().min(2).max(80),
  organisation: z.string().max(120).optional(),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  website: z.string().max(200).optional(),
  purpose: z.string().min(10).max(1000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ??
        "Tell us your name, a valid email, what you are building and what you need the data for"
    );
  }
  const body = parsed.data;

  await dbConnect();

  /* One open request per address. Without this, a refresh-happy visitor files
     ten identical requests and an administrator has to triage them all. */
  const existing = await ApiKey.findOne({
    contactEmail: body.contactEmail.toLowerCase(),
    status: "PENDING",
  });
  if (existing) {
    return ok({
      requested: true,
      message: "You already have a request awaiting review — we will be in touch by email.",
    });
  }

  const request = await ApiKey.create({
    label: body.label,
    organisation: body.organisation ?? "",
    contactName: body.contactName,
    contactEmail: body.contactEmail.toLowerCase(),
    website: body.website ?? "",
    purpose: body.purpose,
    status: "PENDING",
    requestedIp: auditContext(req).ip,
  });

  await notifyAdmins({
    kind: "SYSTEM",
    severity: "info",
    title: "New API key request",
    body: `${body.contactName}${body.organisation ? ` (${body.organisation})` : ""} asked for calendar access — review it under API keys.`,
  });

  return ok(
    {
      requested: true,
      id: request._id.toString(),
      message:
        "Request received. An administrator reviews each one, and we will email your key to " +
        `${body.contactEmail} once it is approved.`,
    },
    201
  );
}
