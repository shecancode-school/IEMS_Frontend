import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { createBooking, loadBookableHost } from "@/lib/scheduling/book";
import { ok, fail, notFound } from "@/lib/http";

const Body = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  topic: z.string().max(500).optional(),
  /* an exact slot start; never trusted — createBooking re-checks it */
  start: z.string().datetime(),
});

/* Public: book a slot.
   POST /api/book/<slug>  { name, email, phone?, topic?, start }

   The work is in lib/scheduling/book so this route and the staff-side
   /api/admin/bookings cannot drift apart on the things that matter — the
   availability re-check, the atomic claim, the Google mirror and the emails. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("A name, a valid email address and a chosen time are required");
  }

  await dbConnect();
  const host = await loadBookableHost(slug);
  if (!host) return notFound("Booking page");

  const result = await createBooking(host, parsed.data, { kind: "PUBLIC" });
  if (!result.ok) return fail(result.message, result.status);
  return ok({ booking: result.booking }, 201);
}
