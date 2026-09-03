import { Schema, model, models, type Model, type Types } from "mongoose";
import { BOOKING_STATUSES, type BookingStatus } from "@/types/admin";

export { BOOKING_STATUSES };
export type { BookingStatus };

/* A one-to-one slot someone booked with a staff member. */
export interface BookingDoc {
  _id: Types.ObjectId;
  host: Types.ObjectId;
  participant?: Types.ObjectId | null;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  topic: string;
  start: Date;
  end: Date;
  status: BookingStatus;
  /* Mirrors status !== "CANCELLED". It exists only so the double-booking
     unique index can use a partialFilterExpression — Mongo partial filters do
     not support $ne or $in, so the condition has to be a plain equality. */
  active: boolean;
  googleEventId?: string | null;
  meetLink?: string | null;
  /* the raw token is emailed once and never stored, exactly like
     VerificationToken and RefreshToken */
  cancelTokenHash: string;
  cancelledAt?: Date | null;
  cancelledBy?: "REQUESTER" | "HOST" | "SYSTEM" | null;
  source: "PUBLIC" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<BookingDoc>(
  {
    host: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    participant: { type: Schema.Types.ObjectId, ref: "Participant", default: null },
    requesterName: { type: String, required: true, trim: true },
    requesterEmail: { type: String, required: true, lowercase: true, trim: true },
    requesterPhone: { type: String, default: "" },
    topic: { type: String, default: "" },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: { type: String, enum: BOOKING_STATUSES, default: "CONFIRMED" },
    active: { type: Boolean, default: true },
    googleEventId: { type: String, default: null },
    meetLink: { type: String, default: null },
    cancelTokenHash: { type: String, required: true, unique: true },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ["REQUESTER", "HOST", "SYSTEM", null], default: null },
    source: { type: String, enum: ["PUBLIC", "ADMIN"], default: "PUBLIC" },
  },
  { timestamps: true }
);

/* The double-booking guard. Two concurrent requests for the same slot produce
   one 201 and one E11000, which the route turns into a 409 — the same shape as
   the slug-collision handling on events. Checking in application code instead
   would leave a window between the check and the write. */
BookingSchema.index({ host: 1, start: 1 }, { unique: true, partialFilterExpression: { active: true } });
BookingSchema.index({ host: 1, start: -1 });
BookingSchema.index({ start: 1 });

export const Booking: Model<BookingDoc> =
  (models.Booking as Model<BookingDoc>) ?? model<BookingDoc>("Booking", BookingSchema);
