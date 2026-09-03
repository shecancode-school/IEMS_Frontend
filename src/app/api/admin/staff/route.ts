import bcrypt from "bcryptjs";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Admin, GoogleAccount } from "@/models";
import { requireCapability } from "@/lib/auth";
import { ADMIN_ROLES } from "@/types/admin";
import { recordAudit } from "@/lib/audit";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";

/* List staff accounts. Read is gated on calendar:viewAll rather than
   staff:manage — a facilitator needs the roster to filter the org calendar by
   person, but must not be able to create or edit accounts. */
export async function GET(req: Request) {
  const staff = await requireCapability(req, "calendar:viewAll");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  await dbConnect();
  const admins = await Admin.find().sort({ createdAt: 1 });
  const connected = new Set(
    (await GoogleAccount.find({ status: "CONNECTED" }).select("admin")).map((g) =>
      g.admin.toString()
    )
  );

  return ok({
    staff: admins.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      email: a.email,
      role: a.role,
      title: a.title ?? null,
      avatarUrl: a.avatarUrl ?? null,
      bio: a.bio ?? null,
      active: a.active,
      canScan: a.canScan,
      googleConnected: connected.has(a._id.toString()),
      createdAt: a.createdAt,
    })),
  });
}

const Body = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ADMIN_ROLES).default("STAFF"),
  title: z.string().max(120).optional(),
  bio: z.string().max(600).optional(),
  canScan: z.boolean().optional(),
});

/* Create a staff account. */
export async function POST(req: Request) {
  const staff = await requireCapability(req, "staff:manage");
  if (!staff) return unauthorized();
  if (staff === "forbidden") return forbidden();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("Name, valid email, a password of 8+ characters and a role are required");
  }

  await dbConnect();
  try {
    const created = await Admin.create({
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role,
      title: parsed.data.title ?? null,
      bio: parsed.data.bio ?? null,
      canScan: parsed.data.canScan ?? false,
      createdBy: staff.id,
    });
    await recordAudit({
      actorId: staff.id,
      action: "staff.create",
      target: { type: "admin", id: created._id.toString(), label: created.name },
      summary: `Created staff account "${created.name}" with role ${created.role}`,
    });
    return ok(
      {
        staff: {
          id: created._id.toString(),
          name: created.name,
          email: created.email,
          role: created.role,
        },
      },
      201
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("A staff account with that email already exists", 409);
    }
    throw err;
  }
}
