/* Participant list assembly shared by the admin list endpoint and its CSV
   export, so a download always contains exactly the rows the table is showing.

   Two sources are stitched together: live Participant documents, plus the
   holder snapshots left on tickets of participants who already checked in
   (their Participant record is deleted at the gate so they can register
   elsewhere). */

import { dbConnect } from "./db";
import { matchesQuery } from "./csv";
import {
  Guest,
  PARTICIPANT_STATUSES,
  Participant,
  REGISTRATION_STATUSES,
  STACKS,
  Ticket,
  type ParticipantDoc,
  type ParticipantStatus,
  type RegistrationStatus,
  type Stack,
} from "@/models";
import type { QueryFilter } from "mongoose";

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export type ParticipantListFilters = {
  /** event id */
  event?: string;
  stack?: Stack;
  status?: ParticipantStatus;
  registrationStatus?: RegistrationStatus;
  /** "none" = hasn't invited a plus-one yet, "has" = has one */
  plusOne?: "none" | "has";
  /** free-text search, matched the same way the table's search box does */
  q?: string;
};

export function participantFiltersFrom(params: URLSearchParams): ParticipantListFilters {
  return {
    event: params.get("event") || undefined,
    stack: pick<Stack>(params.get("stack"), STACKS),
    status: pick<ParticipantStatus>(params.get("status"), PARTICIPANT_STATUSES),
    registrationStatus: pick<RegistrationStatus>(
      params.get("registrationStatus"),
      REGISTRATION_STATUSES
    ),
    plusOne: pick(params.get("plusOne"), ["none", "has"] as const),
    q: params.get("q") || undefined,
  };
}

type EventRef = { _id: unknown; name?: string; startTime?: Date; status?: string } | null;

export type ParticipantRow = {
  id: string;
  type: "PARTICIPANT";
  name: string;
  email: string;
  phone?: string | null;
  stack?: string | null;
  gender: string | null;
  status: string;
  /** absent on archived (checked-in) snapshots — the record no longer exists */
  registrationStatus?: string;
  profilePicture: string | null;
  event: { id: unknown; name?: string; startTime?: Date; status?: string } | null;
  ticket: {
    code: string;
    number: string;
    status: string;
    sentAt: Date | null;
    scannedAt: Date | null;
  } | null;
};

export async function listParticipantRows(
  f: ParticipantListFilters = {},
  { limit = 500 }: { limit?: number } = {}
): Promise<ParticipantRow[]> {
  const filter: QueryFilter<ParticipantDoc> = {};
  if (f.stack) filter.stack = f.stack;
  if (f.status) filter.status = f.status;
  if (f.registrationStatus) filter.registrationStatus = f.registrationStatus;
  if (f.event) filter.event = f.event;

  await dbConnect();
  /* "none" / "has" is resolved against the Guest.inviter back-link */
  if (f.plusOne) {
    const guestFilter: Record<string, unknown> = { inviter: { $ne: null } };
    if (f.event) guestFilter.event = f.event;
    const inviterIds = await Guest.find(guestFilter).distinct("inviter");
    filter._id = f.plusOne === "has" ? { $in: inviterIds } : { $nin: inviterIds };
  }

  const participants = await Participant.find(filter)
    .sort({ createdAt: 1 })
    .limit(limit)
    .populate("event", "name startTime status");
  const tickets = await Ticket.find({
    holderType: "Participant",
    holderId: { $in: participants.map((p) => p._id) },
  });
  const ticketByHolder = new Map(tickets.map((t) => [t.holderId.toString(), t]));

  const eventOf = (e: EventRef) =>
    e ? { id: e._id, name: e.name, startTime: e.startTime, status: e.status } : null;
  const ticketOf = (t: (typeof tickets)[number] | undefined) =>
    t
      ? {
          code: t.code,
          number: t.ticketNumber,
          status: t.status,
          sentAt: t.sentAt ?? null,
          scannedAt: t.scannedAt ?? null,
        }
      : null;

  const live: ParticipantRow[] = participants.map((p) => ({
    id: p._id.toString(),
    type: "PARTICIPANT",
    name: p.name,
    email: p.email,
    phone: p.phone,
    stack: p.stack,
    gender: p.gender ?? null,
    status: p.status,
    registrationStatus: p.registrationStatus,
    profilePicture: p.profilePicture ?? null,
    event: eventOf(p.event as unknown as EventRef),
    ticket: ticketOf(ticketByHolder.get(p._id.toString())),
  }));

  const holderFilter: Record<string, unknown> = {
    holderType: "Participant",
    "holder.name": { $exists: true },
  };
  if (f.event) holderFilter.event = f.event;
  /* an archived holder is by definition COMPLETE. The plus-one filter works off
     the live Guest link, which checked-in snapshots no longer have — so skip
     them entirely when it's active. */
  const attended =
    f.plusOne || (f.status && f.status !== "COMPLETE") || f.stack || f.registrationStatus
      ? []
      : await Ticket.find(holderFilter)
          .sort({ scannedAt: -1 })
          .limit(limit)
          .populate("event", "name startTime status");

  const archived: ParticipantRow[] = attended.map((t) => {
    const h = t.holder!;
    return {
      id: t._id.toString(),
      type: "PARTICIPANT",
      name: h.name,
      email: h.email,
      phone: h.phone ?? undefined,
      stack: h.label ?? null,
      gender: null,
      status: "COMPLETE",
      profilePicture: h.photoUrl ?? null,
      event: eventOf(t.event as unknown as EventRef),
      ticket: ticketOf(t),
    };
  });

  const rows = [...live, ...archived];
  /* `q` is matched in memory against the same joined string the table searches,
     so multi-word queries ("ada gmail") export exactly the visible rows */
  return f.q
    ? rows.filter((p) => matchesQuery(`${p.name} ${p.email} ${p.phone ?? ""}`, f.q))
    : rows;
}
