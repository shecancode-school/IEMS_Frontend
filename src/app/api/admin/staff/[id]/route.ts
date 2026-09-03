import bcrypt from "bcryptjs";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Admin, type AdminDoc } from "@/models";
import { requireCapability } from "@/lib/auth";
import { ADMIN_ROLES, type AdminRole } from "@/types/admin";
import { recordAudit, diff, forgetActor } from "@/lib/audit";
import { ok, fail, unauthorized, forbidden, notFound } from "@/lib/http";

const Body = z
  .object({
    name: z.string().min(2),
    role: z.enum(ADMIN_ROLES),
    active: z.boolean(),
    password: z.string().min(8),
    title: z.string().max(120).nullable(),
    bio: z.string().max(600).nullable(),
    canScan: z.boolean().optional(),
  })
  .partial();

/* Would this change leave the system with no way back in? The console is
   reachable only by ADMIN and CEO, so demoting or deactivating the last one
   locks everybody out permanently — refuse instead. */
async function wouldOrphanConsole(
  target: AdminDoc,
  patch: { role?: AdminRole; active?: boolean }
): Promise<boolean> {
  const nextRole = patch.role ?? target.role;
  const nextActive = patch.active ?? target.active;
  if (nextActive && (nextRole === "ADMIN" || nextRole === "CEO")) return false;

  const others = await Admin.countDocuments({
    _id: { $ne: target._id },
    active: true,
    role: { $in: ["ADMIN", "CEO"] },
  });
  return others === 0;
}

/* Edit a staff account: rename, change role, activate/deactivate, reset
   password, update the calendar profile. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability(req, "staff:manage");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Staff account");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid staff details");
  const patch = parsed.data;

  await dbConnect();
  const target = await Admin.findById(id);
  if (!target) return notFound("Staff account");

  /* self-demotion and self-deactivation are the two ways to lose your own
     console access mid-session, so they're blocked outright */
  const isSelf = target._id.toString() === staff.id;
  if (isSelf && patch.role !== undefined && patch.role !== target.role) {
    return fail("You cannot change your own role — ask another administrator", 409);
  }
  if (isSelf && patch.active === false) {
    return fail("You cannot deactivate your own account", 409);
  }

  if (await wouldOrphanConsole(target, patch)) {
    return fail("This is the last active administrator — promote someone else first", 409);
  }

  const before: Record<string, unknown> = {
    name: target.name,
    role: target.role,
    active: target.active,
    title: target.title,
    bio: target.bio,
    canScan: target.canScan,
  };
  if (patch.name !== undefined) target.name = patch.name;
  if (patch.role !== undefined) target.role = patch.role;
  if (patch.active !== undefined) target.active = patch.active;
  if (patch.title !== undefined) target.title = patch.title;
  if (patch.bio !== undefined) target.bio = patch.bio;
  if (patch.canScan !== undefined) target.canScan = patch.canScan;
  if (patch.password) target.passwordHash = await bcrypt.hash(patch.password, 10);
  await target.save();
  /* drop the cached display name so later ledger entries use the new one */
  forgetActor(target._id.toString());

  const changes = diff(before, { ...patch, password: patch.password ? "••••••" : undefined });
  await recordAudit({
    actorId: staff.id,
    action: "staff.update",
    target: { type: "admin", id: target._id.toString(), label: target.name },
    summary: `Updated staff account "${target.name}"`,
    changes,
  });

  return ok({
    staff: {
      id: target._id.toString(),
      name: target.name,
      email: target.email,
      role: target.role,
      title: target.title ?? null,
      bio: target.bio ?? null,
      active: target.active,
      canScan: target.canScan,
    },
  });
}

/* Deactivate a staff account. Deliberately a soft delete: their name is
   attached to past activities, bookings and created records, and requireStaff
   already rejects an inactive account on the next request. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability(req, "staff:manage");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Staff account");
  if (id === staff.id) return fail("You cannot deactivate your own account", 409);

  await dbConnect();
  const target = await Admin.findById(id);
  if (!target) return notFound("Staff account");

  if (await wouldOrphanConsole(target, { active: false })) {
    return fail("This is the last active administrator — promote someone else first", 409);
  }

  target.active = false;
  await target.save();
  await recordAudit({
    actorId: staff.id,
    action: "staff.deactivate",
    target: { type: "admin", id: target._id.toString(), label: target.name },
    summary: `Deactivated staff account "${target.name}"`,
  });
  return ok({ deactivated: true });
}
