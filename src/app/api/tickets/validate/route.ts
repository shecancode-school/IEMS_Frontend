import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Ticket, eventDeadline } from "@/models";
import { requireScanner, verifyQrToken } from "@/lib/auth";
import { ticketIdentity } from "@/lib/tickets";
import { ok, fail, unauthorized } from "@/lib/http";

/* Read-only ticket validity check — unlike /api/scan it does NOT consume the
   pass. Accepts either a raw QR token or a ticket code. Gate staff only. */
const Body = z.object({
  qr: z.string().min(10).optional(),
  code: z.string().min(6).optional(),
});

export async function POST(req: Request) {
  const scanner = await requireScanner(req);
  if (!scanner) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.qr && !parsed.data.code)) {
    return fail("Provide a `qr` token or a ticket `code`");
  }

  let code = parsed.data.code ?? null;
  if (parsed.data.qr) {
    const decoded = await verifyQrToken(parsed.data.qr);
    if (!decoded) return ok({ valid: false, reason: "UNSIGNED", message: "Not a valid pass." });
    code = decoded.code;
  }

  await dbConnect();
  const ticket = code ? await Ticket.findOne({ code }) : null;
  if (!ticket) return ok({ valid: false, reason: "UNKNOWN", message: "Ticket not found." });

  const [event, who] = await Promise.all([Event.findById(ticket.event), ticketIdentity(ticket)]);
  const deadline = event ? eventDeadline(event) : null;
  const expired = deadline ? new Date() > deadline : false;

  const reason =
    ticket.status === "REVOKED"
      ? "REVOKED"
      : ticket.status === "USED"
        ? "ALREADY_USED"
        : expired
          ? "EXPIRED"
          : null;

  return ok({
    valid: reason === null,
    reason,
    ticket: {
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      holderName: who.name,
      holderType: who.type,
      eventName: event?.name ?? null,
      scannedAt: ticket.scannedAt ?? null,
      expiresAt: deadline?.toISOString() ?? null,
    },
  });
}
