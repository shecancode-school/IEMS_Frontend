import { z } from "zod";
import { dbConnect } from "@/lib/db";
import {
  Event,
  Guest,
  Participant,
  ScanLog,
  Ticket,
  VerificationToken,
  eventDeadline,
  type TicketDoc,
} from "@/models";
import { requireScanner, verifyQrToken } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishScan, type ScanEvent } from "@/lib/scanBus";
import { notifyAdmins } from "@/lib/notify";
import { ok, fail, unauthorized } from "@/lib/http";

const Body = z.object({ qr: z.string().min(10) });

const timeOf = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

/* load the holder record (Participant or Guest) that owns a ticket */
async function loadHolder(ticket: TicketDoc) {
  if (ticket.holderType === "Participant") {
    const p = await Participant.findById(ticket.holderId);
    return p
      ? {
          who: { fullName: p.name, type: "PARTICIPANT", photoUrl: p.profilePicture ?? null },
          snapshot: {
            name: p.name,
            email: p.email,
            phone: p.phone ?? null,
            label: p.stack ?? null,
            photoUrl: p.profilePicture ?? null,
          },
          remove: async () => {
            await Promise.all([
              Participant.deleteOne({ _id: p._id }),
              Guest.deleteMany({ inviter: p._id }),
              VerificationToken.deleteMany({ participant: p._id }),
            ]);
          },
          badge: p.stack ?? null,
        }
      : null;
  }
  const g = await Guest.findById(ticket.holderId);
  return g
    ? {
        who: { fullName: g.name, type: g.guestType, photoUrl: g.profile ?? null },
        snapshot: {
          name: g.name,
          email: g.email,
          phone: null,
          label: g.guestType,
          photoUrl: g.profile ?? null,
        },
        remove: async () => {
          await Guest.deleteOne({ _id: g._id });
        },
        badge: g.guestType,
      }
    : null;
}

export async function POST(req: Request) {
  const scanner = await requireScanner(req);
  if (!scanner) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("QR payload is required");

  await dbConnect();
  /* scannedByScanner is only ever set on rows written before standalone
     scanner accounts were retired; new scans are always attributed to a
     staff account. */
  const scannedBy = { scannedByAdmin: scanner.adminId, scannedByScanner: null };

  const broadcast = (event: ScanEvent) => {
    publishScan(event);
    return event;
  };
  const now = new Date();
  const at = now.toISOString();

  /* handshake: the QR must carry a token we signed — it also tells us who
     the holder claims to be before we even touch the database */
  const qr = await verifyQrToken(parsed.data.qr);
  if (!qr) {
    await ScanLog.create({ ...scannedBy, result: "INVALID" });
    void notifyAdmins({
      kind: "SCAN_ALERT",
      severity: "error",
      title: "Invalid QR presented at the gate",
      body: "A code that isn't one of our signed tickets was scanned.",
    });
    return ok(broadcast({ at, result: "INVALID" }));
  }

  const known = await Ticket.findOne({ code: qr.code });
  const holder = known ? await loadHolder(known) : null;
  const event = known ? await Event.findById(known.event) : null;
  const who = holder
    ? holder.who
    : known?.holder
      ? {
          fullName: known.holder.name,
          type: known.holder.label ?? "GUEST",
          photoUrl: known.holder.photoUrl ?? null,
        }
      : qr.name
        ? { fullName: qr.name, type: qr.type ?? "GUEST", photoUrl: null }
        : null;
  const eventName = event?.name ?? qr.eventName ?? null;
  const deadline = event ? eventDeadline(event) : null;
  const expiresAt = deadline?.toISOString() ?? null;

  /* a signed code we've never issued, or a revoked pass */
  if (!known || known.status === "REVOKED") {
    const result = !known ? "INVALID" : "REVOKED";
    await ScanLog.create({ ...scannedBy, ticket: known?._id ?? null, result });
    void notifyAdmins({
      kind: "SCAN_ALERT",
      severity: "error",
      title: result === "REVOKED" ? "Revoked ticket presented" : "Unknown ticket scanned",
      body: who ? `${who.fullName}${eventName ? ` · ${eventName}` : ""}` : "",
      eventId: event?._id ?? null,
    });
    return ok(broadcast({ at, result, attendee: who, eventName, expiresAt }));
  }

  /* second scan of the same pass — tell the gate when it was first used */
  if (known.status === "USED") {
    await ScanLog.create({ ...scannedBy, ticket: known._id, result: "ALREADY_USED" });
    const usedAt = known.scannedAt?.toISOString() ?? null;
    void notifyAdmins({
      kind: "SCAN_ALERT",
      severity: "warning",
      title: "Ticket scanned twice",
      body: `${who?.fullName ?? "Unknown"}${eventName ? ` · ${eventName}` : ""} — first used at ${
        known.scannedAt ? timeOf(known.scannedAt) : "an unknown time"
      }.`,
      eventId: event?._id ?? null,
    });
    return ok(broadcast({ at, result: "ALREADY_USED", attendee: who, eventName, usedAt, expiresAt }));
  }

  /* the ticket dies with its event — past the deadline nothing gets in */
  if (deadline && now > deadline) {
    await ScanLog.create({ ...scannedBy, ticket: known._id, result: "EXPIRED" });
    void notifyAdmins({
      kind: "SCAN_ALERT",
      severity: "warning",
      title: "Expired ticket presented",
      body: `${who?.fullName ?? "Unknown"}${eventName ? ` · ${eventName}` : ""} — the event ended ${deadline.toLocaleString(
        "en-US",
        { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      )}.`,
      eventId: event?._id ?? null,
    });
    return ok(broadcast({ at, result: "EXPIRED", attendee: who, eventName, expiresAt }));
  }

  /* atomic claim: two gates scanning the same ticket can't both accept it */
  const ticket = await Ticket.findOneAndUpdate(
    { code: qr.code, status: "VALID" },
    { status: "USED", scannedAt: now },
    { new: true }
  );
  if (!ticket) {
    /* lost the race to another gate a moment ago */
    await ScanLog.create({ ...scannedBy, ticket: known._id, result: "ALREADY_USED" });
    return ok(
      broadcast({ at, result: "ALREADY_USED", attendee: who, eventName, usedAt: at, expiresAt })
    );
  }

  await ScanLog.create({ ...scannedBy, ticket: ticket._id, result: "ACCEPTED" });
  /* Only the accepted scan goes in the audit ledger: it is the one that
     actually consumes a pass. Rejected attempts are already recorded in full
     by ScanLog, and mirroring them here would double every gate event. */
  void recordAudit({
    actorId: scanner.adminId,
    req,
    action: "scan.checkin",
    target: { type: "ticket", id: ticket._id.toString(), label: ticket.ticketNumber },
    summary: `Checked in ${who} at ${eventName}`,
  });

  /* the pass is consumed — archive the holder on the ticket, then delete the
     holder record so the same person is free to register for any other event */
  if (holder) {
    ticket.holder = holder.snapshot;
    await ticket.save();
    await holder.remove();
  }

  void notifyAdmins({
    kind: "CHECK_IN",
    severity: "success",
    title: `${who?.fullName ?? "A guest"} checked in`,
    body: `${eventName ?? "Event"} · ${timeOf(now)}`,
    eventId: event?._id ?? null,
  });
  return ok({
    ...broadcast({ at, result: "ACCEPTED", attendee: who, eventName, usedAt: at, expiresAt }),
    stack: holder?.badge ?? null,
  });
}
