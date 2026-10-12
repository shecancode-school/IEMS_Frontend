import { Schema, model, models, type Model, type Types } from "mongoose";

export const TICKET_STATUSES = ["VALID", "USED", "REVOKED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/* a ticket belongs to either a Participant or a Guest */
export const TICKET_HOLDER_TYPES = ["Participant", "Guest"] as const;
export type TicketHolderType = (typeof TICKET_HOLDER_TYPES)[number];

/* Snapshot copied off the holder the moment their ticket is accepted at the
   gate, so attendance history / stats survive if the holder record is later
   removed (freeing the person to register for other events). */
export interface TicketHolder {
  name: string;
  email: string;
  phone?: string | null;
  /** PARTICIPANT stack or the GUEST type, for the badge */
  label?: string | null;
  photoUrl?: string | null;
}

export interface TicketDoc {
  _id: Types.ObjectId;
  /** the QR secret — signed and embedded in the QR image */
  code: string;
  /** short human-readable unique reference, e.g. "WTN-000042" */
  ticketNumber: string;
  event: Types.ObjectId;
  /** which collection the holder lives in */
  holderType: TicketHolderType;
  /** id of the Participant or Guest that owns this ticket */
  holderId: Types.ObjectId;
  holder?: TicketHolder | null;
  status: TicketStatus;
  issuedAt: Date;
  /** when the ticket email was last successfully sent */
  sentAt?: Date | null;
  /** how many times the ticket has been reset (code rotated) */
  resetCount: number;
  scannedAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TicketSchema = new Schema<TicketDoc>(
  {
    code: { type: String, required: true, unique: true },
    ticketNumber: { type: String, required: true, unique: true },
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    holderType: { type: String, enum: TICKET_HOLDER_TYPES, required: true },
    holderId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      refPath: "holderType",
    },
    holder: {
      type: new Schema<TicketHolder>(
        {
          name: { type: String, required: true },
          email: { type: String, default: "" },
          phone: { type: String, default: null },
          label: { type: String, default: null },
          photoUrl: { type: String, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    status: { type: String, enum: TICKET_STATUSES, default: "VALID" },
    issuedAt: { type: Date, default: () => new Date() },
    sentAt: { type: Date, default: null },
    resetCount: { type: Number, default: 0 },
    scannedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/* `code` and `holderId` are already unique-indexed. These cover the admin list
   filters (event + status) and the archived-holder lookups (holderType + event)
   that otherwise scan the whole collection as ticket volume grows. */
TicketSchema.index({ event: 1, status: 1 });
TicketSchema.index({ holderType: 1, event: 1 });

export const Ticket: Model<TicketDoc> =
  (models.Ticket as Model<TicketDoc>) ?? model<TicketDoc>("Ticket", TicketSchema);
