import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { EmailLog } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized, notFound } from "@/lib/http";

/* One logged send, including the rendered HTML exactly as delivered — the
   admin page opens it in a sandboxed iframe. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Email");

  await dbConnect();
  const log = await EmailLog.findById(id);
  if (!log) return notFound("Email");

  return ok({
    email: {
      id: log._id,
      kind: log.kind,
      to: log.to,
      subject: log.subject,
      html: log.html,
      status: log.status,
      error: log.error ?? null,
      at: log.createdAt,
    },
  });
}
