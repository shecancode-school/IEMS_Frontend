import { Schema, model, models, type Model, type Types } from "mongoose";
import { EVENT_TZ } from "@/lib/time";

/* When a staff member is open to being booked, and the rules the slot engine
   applies. One document per person; absent means "not bookable".

   Times are Kigali wall-clock "HH:mm" strings rather than instants: "I am free
   Mondays 09:00–17:00" is a rule about the clock, not about a moment, and
   storing it as a Date would break the moment anyone edited it. */
export interface WeeklyRule {
  /* 0 = Sunday … 6 = Saturday, matching kigaliWeekday() */
  weekday: number;
  start: string;
  end: string;
}

export interface AvailabilityDoc {
  _id: Types.ObjectId;
  admin: Types.ObjectId;
  bookable: boolean;
  slug: string;
  headline: string;
  bio: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  leadTimeMinutes: number;
  horizonDays: number;
  maxPerDay: number;
  weekly: WeeklyRule[];
  blackouts: { start: Date; end: Date; reason: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const AvailabilitySchema = new Schema<AvailabilityDoc>(
  {
    admin: { type: Schema.Types.ObjectId, ref: "Admin", required: true, unique: true },
    /* opt-in: nobody becomes publicly bookable by having an account */
    bookable: { type: Boolean, default: false },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    headline: { type: String, default: "" },
    bio: { type: String, default: "" },
    timezone: { type: String, default: EVENT_TZ },
    slotMinutes: { type: Number, default: 30, min: 5, max: 480 },
    /* protected gap after each booking, so back-to-back calls don't collide */
    bufferMinutes: { type: Number, default: 10, min: 0, max: 240 },
    /* how much notice is required — stops someone booking you in ten minutes */
    leadTimeMinutes: { type: Number, default: 720, min: 0 },
    horizonDays: { type: Number, default: 30, min: 1, max: 365 },
    /* 0 = unlimited */
    maxPerDay: { type: Number, default: 0, min: 0 },
    weekly: {
      type: [{ weekday: Number, start: String, end: String, _id: false }],
      default: [],
    },
    blackouts: {
      type: [{ start: Date, end: Date, reason: String, _id: false }],
      default: [],
    },
  },
  { timestamps: true }
);

AvailabilitySchema.index({ bookable: 1 });

export const Availability: Model<AvailabilityDoc> =
  (models.Availability as Model<AvailabilityDoc>) ??
  model<AvailabilityDoc>("Availability", AvailabilitySchema);
