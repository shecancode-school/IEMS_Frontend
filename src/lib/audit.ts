import { Admin, AuditLog, type AuditCategory } from "@/models";
import { dbConnect } from "./db";

/* Writing to the ledger.

   Two rules, both deliberate:
     1. It never throws. An audit write must not be able to fail the action it
        is describing — a failed log is a monitoring problem, not a reason to
        refuse someone's booking.
     2. It never records a secret. Callers pass a summary and a set of changed
        fields; anything password-, token- or key-shaped is stripped here so a
        careless call site cannot leak one into a table built to be read. */

const SECRET_FIELDS = /password|token|secret|hash|refresh|key/i;

/* the category is derivable from the verb, so call sites do not repeat it */
function categoryFor(action: string): AuditCategory {
  const domain = action.split(".")[0];
  switch (domain) {
    case "auth":
      return "AUTH";
    case "staff":
      return "STAFF";
    case "activity":
    case "calendar":
      return "CALENDAR";
    case "booking":
    case "availability":
      return "BOOKING";
    case "event":
      return "EVENT";
    case "ticket":
    case "scan":
      return "TICKET";
    case "apikey":
      return "SYSTEM";
    default:
      return "SYSTEM";
  }
}

function redact(
  changes?: Record<string, { from: unknown; to: unknown }> | null
): Record<string, { from: unknown; to: unknown }> | null {
  if (!changes) return null;
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, value] of Object.entries(changes)) {
    out[field] = SECRET_FIELDS.test(field)
      ? { from: "[redacted]", to: "[redacted]" }
      : value;
  }
  return Object.keys(out).length ? out : null;
}

/* Who did it, resolved once and remembered.

   Call sites pass only an id; a ledger line that reads "System" because nobody
   looked the name up is useless to the person reading it. Staff names change
   rarely and the map is tiny, so a per-process cache keeps this from adding a
   lookup to every write. */
const actorCache = new Map<string, { name: string; email: string }>();

async function resolveActor(id: string): Promise<{ name: string; email: string }> {
  const hit = actorCache.get(id);
  if (hit) return hit;

  const admin = await Admin.findById(id).select("name email");
  const resolved = { name: admin?.name ?? "Unknown", email: admin?.email ?? "" };
  if (admin) actorCache.set(id, resolved);
  return resolved;
}

/* a rename has to show up in future entries */
export function forgetActor(id: string): void {
  actorCache.delete(id);
}

/* Pull the caller's IP and user agent straight off the request, so call sites
   do not each have to remember to. */
export function auditContext(req: Request): { ip: string; userAgent: string } {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? ""),
    userAgent: req.headers.get("user-agent") ?? "",
  };
}

export type AuditInput = {
  actorId?: string | null;
  actorName?: string;
  actorEmail?: string;
  /** pass the request and IP/user-agent are filled in automatically */
  req?: Request;
  action: string;
  target?: { type: string; id: string; label?: string };
  summary: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  ip?: string;
  userAgent?: string;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await dbConnect();

    /* an id alone is enough — the name and address are looked up here so every
       line in the ledger names a person rather than saying "System" */
    let actorName = input.actorName;
    let actorEmail = input.actorEmail;
    if (input.actorId && (!actorName || !actorEmail)) {
      const resolved = await resolveActor(input.actorId);
      actorName ??= resolved.name;
      actorEmail ??= resolved.email;
    }

    const ctx = input.req ? auditContext(input.req) : null;

    await AuditLog.create({
      actor: input.actorId ?? null,
      actorName: actorName ?? "System",
      actorEmail: actorEmail ?? "",
      action: input.action,
      category: categoryFor(input.action),
      targetType: input.target?.type ?? "",
      targetId: input.target?.id ?? "",
      targetLabel: input.target?.label ?? "",
      summary: input.summary,
      changes: redact(input.changes),
      ip: input.ip ?? ctx?.ip ?? "",
      userAgent: input.userAgent ?? ctx?.userAgent ?? "",
    });
  } catch (err) {
    /* deliberately swallowed — see rule 1 above */
    console.error("audit write failed", err);
  }
}

/* Compare two snapshots and keep only what actually moved, so a PATCH that
   touched one field does not produce a line listing every field. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const prev = before[key];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changes[key] = { from: prev ?? null, to: next };
    }
  }
  return Object.keys(changes).length ? changes : null;
}
