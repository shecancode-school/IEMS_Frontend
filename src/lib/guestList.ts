/* Guest list assembly shared by the admin list endpoint and its CSV export, so
   a download always contains exactly the rows the table is showing.

   The list is two sources stitched together: live Guest documents, plus the
   holder snapshots left behind on tickets of guests who already checked in
   (their Guest record is deleted at the gate). */

import { dbConnect } from "./db";
import { matchesQuery } from "./csv";
import { Guest, Ticket, GUEST_TYPES, type GuestType } from "@/models";

export type GuestListFilters = {
  /** event id */
  event?: string;
  guestType?: GuestType;
  /** free-text search, matched the same way the table's search box does */
  q?: string;
};

export function guestFiltersFrom(params: URLSearchParams): GuestListFilters {
  const type = params.get("type");
  return {
    event: params.get("event") || undefined,
    guestType: (GUEST_TYPES as readonly string[]).includes(type ?? "")
      ? (type as GuestType)
      : undefined,
    q: params.get("q") || undefined,
  };
}

export type GuestRow = {
  id: string;
  name: string;
  email: string;
  guestType: string;
  invitedBy: string | null;
  eventId: string | null;
  eventName: string | null;
  addedAt: Date;
  ticket: {
    code: string;
    number: string;
    status: string;
    sentAt: Date | null;
    scannedAt: Date | null;
  } | null;
};

type Named = { _id?: unknown; name?: string } | null;

export async function listGuestRows(
  f: GuestListFilters = {},
  { limit = 1000 }: { limit?: number } = {}
): Promise<GuestRow[]> {
  await dbConnect();

  const guestFilter: Record<string, unknown> = {};
  if (f.event) guestFilter.event = f.event;
  if (f.guestType) guestFilter.guestType = f.guestType;

  const guests = await Guest.find(guestFilter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("event", "name")
    .populate("inviter", "name");
  const tickets = await Ticket.find({
    holderType: "Guest",
    holderId: { $in: guests.map((g) => g._id) },
  });
  const ticketByHolder = new Map(tickets.map((t) => [t.holderId.toString(), t]));

  /* guests who already checked in live on as ticket holder snapshots */
  const snapshotFilter: Record<string, unknown> = {
    holderType: "Guest",
    "holder.name": { $exists: true },
  };
  if (f.event) snapshotFilter.event = f.event;
  /* snapshots without a label are shown as GENERAL, so match those too */
  if (f.guestType) {
    snapshotFilter["holder.label"] =
      f.guestType === "GENERAL" ? { $in: ["GENERAL", null] } : f.guestType;
  }
  const attended = await Ticket.find(snapshotFilter)
    .sort({ scannedAt: -1 })
    .limit(limit)
    .populate("event", "name");

  const rows: GuestRow[] = [
    ...guests.map((g) => {
      const event = g.event as unknown as Named;
      const t = ticketByHolder.get(g._id.toString());
      return {
        id: g._id.toString(),
        name: g.name,
        email: g.email,
        guestType: g.guestType,
        invitedBy: (g.inviter as unknown as Named)?.name ?? null,
        eventId: event?._id ? String(event._id) : null,
        eventName: event?.name ?? null,
        addedAt: g.createdAt,
        ticket: t
          ? {
              code: t.code,
              number: t.ticketNumber,
              status: t.status,
              sentAt: t.sentAt ?? null,
              scannedAt: t.scannedAt ?? null,
            }
          : null,
      };
    }),
    ...attended.map((t) => {
      const event = t.event as unknown as Named;
      return {
        id: t._id.toString(),
        name: t.holder!.name,
        email: t.holder!.email,
        guestType: t.holder!.label ?? "GENERAL",
        invitedBy: null,
        eventId: event?._id ? String(event._id) : null,
        eventName: event?.name ?? null,
        addedAt: t.issuedAt,
        ticket: {
          code: t.code,
          number: t.ticketNumber,
          status: t.status,
          sentAt: t.sentAt ?? null,
          scannedAt: t.scannedAt ?? null,
        },
      };
    }),
  ];

  return f.q ? rows.filter((g) => matchesQuery(`${g.name} ${g.email}`, f.q)) : rows;
}
