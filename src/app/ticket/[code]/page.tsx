import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, Ticket } from "@/models";
import { ticketQrDataUrl } from "@/lib/qr";
import { roleLine, type Holder } from "@/lib/tickets";
import { PortalShell, Panel } from "@/components/portal/ui";
import IdCard from "@/components/portal/IdCard";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await dbConnect();
  const ticket = await Ticket.findOne({ code });
  if (!ticket) {
    return (
      <PortalShell eyebrow="Ticket" title="Not found">
        <Panel>
          <p className="text-sm text-cream-dim">This ticket does not exist.</p>
        </Panel>
      </PortalShell>
    );
  }

  //dep

  /* the live holder record (Participant or Guest); after check-in it's
     deleted and the ticket's holder snapshot fills in instead */
  const [holderDoc, event] = await Promise.all([
    ticket.holderType === "Participant"
      ? Participant.findById(ticket.holderId)
      : Guest.findById(ticket.holderId),
    Event.findById(ticket.event),
  ]);

  let name: string;
  let type: string;
  let photoUrl: string | null;
  let holder: Holder | null = null;
  if (holderDoc && ticket.holderType === "Participant") {
    const p = holderDoc as InstanceType<typeof Participant>;
    holder = { kind: "Participant", doc: p };
    name = p.name;
    type = "PARTICIPANT";
    photoUrl = p.profilePicture ?? null;
  } else if (holderDoc) {
    const g = holderDoc as InstanceType<typeof Guest>;
    holder = { kind: "Guest", doc: g };
    name = g.name;
    type = g.guestType;
    photoUrl = g.profile ?? null;
  } else {
    name = ticket.holder?.name ?? "Attendee";
    type = ticket.holder?.label ?? "GUEST";
    photoUrl = ticket.holder?.photoUrl ?? null;
  }

  const [qr, role] = await Promise.all([
    ticketQrDataUrl(ticket.code, { name, type, eventName: event?.name }),
    holder ? roleLine(holder) : Promise.resolve(undefined),
  ]);

  return (
    <PortalShell eyebrow="Event pass" title={name} wide>
      <IdCard
        name={name}
        role={role}
        type={type === "PARTICIPANT" ? "PARTICIPANT" : "GUEST"}
        photoUrl={photoUrl}
        eventName={event?.name ?? "Event"}
        eventDate={event?.startTime}
        venue={event?.location}
        qrDataUrl={qr}
        code={ticket.code}
        status={ticket.status}
      />
    </PortalShell>
  );
}
