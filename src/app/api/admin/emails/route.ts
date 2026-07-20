import { dbConnect } from "@/lib/db";
import { EmailLog, Event, Participant, Ticket, EMAIL_KINDS } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

/* The admin Emails report: what went out, what's still coming, and where
   applicants drop out of the funnel before a ticket is ever emailed. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  await dbConnect();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 200);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const logFilter: Record<string, unknown> = {};
  if (kind) logFilter.kind = kind;
  if (status) logFilter.status = status;

  const [
    sentTotal,
    failedTotal,
    sentLast7d,
    byKindAgg,
    logs,
    ticketQueued,
    statusAgg,
    reminderPool,
    events,
  ] = await Promise.all([
    EmailLog.countDocuments({ status: "SENT" }),
    EmailLog.countDocuments({ status: "FAILED" }),
    EmailLog.countDocuments({ status: "SENT", createdAt: { $gte: weekAgo } }),
    EmailLog.aggregate([
      { $group: { _id: { kind: "$kind", status: "$status" }, n: { $sum: 1 } } },
    ]),
    EmailLog.find(logFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("kind to subject status error createdAt"),
    /* passes issued whose email hasn't gone out yet (background send pending
       or the send bounced) */
    Ticket.countDocuments({ status: "VALID", sentAt: null }),
    /* the application funnel, per event */
    Participant.aggregate([
      { $group: { _id: { event: "$event", status: "$status" }, n: { $sum: 1 } } },
    ]),
    /* everyone registered to a future event — the recipients of the next
       reminder blast */
    Event.find({ startTime: { $gt: new Date() }, archivedAt: null }).select("_id").then(
      (upcoming) =>
        upcoming.length
          ? Participant.countDocuments({ event: { $in: upcoming.map((e) => e._id) } })
          : 0
    ),
    Event.find().select("name slug startTime").sort({ startTime: -1 }),
  ]);

  /* sent/failed counts per template kind */
  const byKind = Object.fromEntries(
    EMAIL_KINDS.map((k) => [k, { sent: 0, failed: 0 }])
  ) as Record<string, { sent: number; failed: number }>;
  for (const row of byKindAgg as { _id: { kind: string; status: string }; n: number }[]) {
    const bucket = byKind[row._id.kind];
    if (bucket) bucket[row._id.status === "SENT" ? "sent" : "failed"] += row.n;
  }

  /* funnel: PENDING = clicked apply but never verified their email;
     VERIFIED = verified but never finished the profile (no ticket yet);
     COMPLETE = finished, pass issued. */
  const eventName = new Map(events.map((e) => [e._id.toString(), e.name]));
  const funnelRows: {
    eventId: string;
    eventName: string;
    started: number;
    neverVerified: number;
    verifiedNotCompleted: number;
    completed: number;
  }[] = [];
  const rowByEvent = new Map<string, (typeof funnelRows)[number]>();
  for (const row of statusAgg as { _id: { event: { toString(): string }; status: string }; n: number }[]) {
    const id = row._id.event?.toString() ?? "unknown";
    let r = rowByEvent.get(id);
    if (!r) {
      r = {
        eventId: id,
        eventName: eventName.get(id) ?? "Deleted event",
        started: 0,
        neverVerified: 0,
        verifiedNotCompleted: 0,
        completed: 0,
      };
      rowByEvent.set(id, r);
      funnelRows.push(r);
    }
    r.started += row.n;
    if (row._id.status === "PENDING") r.neverVerified += row.n;
    else if (row._id.status === "VERIFIED") r.verifiedNotCompleted += row.n;
    else if (row._id.status === "COMPLETE") r.completed += row.n;
  }
  funnelRows.sort((a, b) => b.started - a.started);

  const overall = funnelRows.reduce(
    (acc, r) => ({
      started: acc.started + r.started,
      neverVerified: acc.neverVerified + r.neverVerified,
      verifiedNotCompleted: acc.verifiedNotCompleted + r.verifiedNotCompleted,
      completed: acc.completed + r.completed,
    }),
    { started: 0, neverVerified: 0, verifiedNotCompleted: 0, completed: 0 }
  );

  /* emails that are still coming, derived from where people sit in the flow */
  const awaitingTicketEmail = overall.verifiedNotCompleted; // ticket email fires when they finish
  const confirmationQueued = overall.neverVerified; // confirmation fires when they verify

  return ok({
    report: {
      totals: { sent: sentTotal, failed: failedTotal, sentLast7d, byKind },
      upcoming: {
        ticketQueued,
        awaitingTicketEmail,
        confirmationQueued,
        reminderPool,
        total: ticketQueued + awaitingTicketEmail + confirmationQueued,
      },
      funnel: {
        overall: {
          ...overall,
          abandoned: overall.neverVerified + overall.verifiedNotCompleted,
          completionRate: overall.started
            ? Math.round((overall.completed / overall.started) * 100)
            : 0,
        },
        perEvent: funnelRows,
      },
    },
    logs: logs.map((l) => ({
      id: l._id,
      kind: l.kind,
      to: l.to,
      subject: l.subject,
      status: l.status,
      error: l.error ?? null,
      at: l.createdAt,
    })),
  });
}
