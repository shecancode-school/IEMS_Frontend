import { dbConnect } from "@/lib/db";
import { AuditLog } from "@/models";
import { requireCapability } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";

/* Read the audit ledger. Append-only and privileged: only an administrator
   (staff:manage) may inspect who did what, and filters are whitelisted to
   keep the surface small. */

const MAX_PAGE = 200;

export async function GET(req: Request) {
  const staff = await requireCapability(req, "staff:manage");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const params = new URL(req.url).searchParams;
  const limit = Math.min(Number(params.get("limit") ?? 50) || 50, MAX_PAGE);
  const category = params.get("category");
  const actorId = params.get("actor");
  const search = params.get("q");

  const filter: Record<string, unknown> = {};
  if (category && ["AUTH", "STAFF", "CALENDAR", "BOOKING", "EVENT", "TICKET", "SYSTEM"].includes(category)) {
    filter.category = category;
  }
  if (actorId) filter.actor = actorId;
  if (search) {
    filter.$or = [
      { summary: { $regex: search, $options: "i" } },
      { actorName: { $regex: search, $options: "i" } },
      { targetLabel: { $regex: search, $options: "i" } },
    ];
  }

  await dbConnect();
  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  return ok({
    logs: logs.map((l) => ({
      id: String(l._id),
      actorName: l.actorName,
      actorEmail: l.actorEmail,
      action: l.action,
      category: l.category,
      targetLabel: l.targetLabel,
      targetType: l.targetType,
      targetId: l.targetId,
      summary: l.summary,
      changed: l.changes ? Object.keys(l.changes) : [],
      at: l.createdAt,
    })),
  });
}
