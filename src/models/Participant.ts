import { Schema, model, models, type Model, type Types } from "mongoose";

/* which track / tech stack the participant belongs to */
export const STACKS = ["FRONTEND", "BACKEND", "FULLSTACK", "MOBILE", "DATA", "OTHER"] as const;
export type Stack = (typeof STACKS)[number];

export const GENDERS = ["FEMALE", "MALE", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];

/* PENDING: created, email not yet verified
   VERIFIED: email confirmed via magic link
   COMPLETE: profile photo submitted, ticket issued */
export const PARTICIPANT_STATUSES = ["PENDING", "VERIFIED", "COMPLETE"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

/* admin registration moderation, independent of the verification lifecycle.
   Registrations auto-approve; an admin can reject (and revoke) or re-approve. */
export const REGISTRATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface ParticipantDoc {
  /** 1. id of the participant */
  _id: Types.ObjectId;
  /** 2. id of the event attending */
  event: Types.ObjectId;
  /** 3. name */
  name: string;
  /** 4. email */
  email: string;
  /** 5. phone number */
  phone?: string;
  /** 6. stack */
  stack?: Stack | null;
  /** 7. gender */
  gender?: Gender | null;
  /** 8. profile picture (Cloudinary URL) */
  profilePicture?: string | null;
  /** 9. status */
  status: ParticipantStatus;
  /** admin moderation state (approve/reject) */
  registrationStatus: RegistrationStatus;
  /** 10. plus one id — the guest this participant invited (one per participant) */
  plusOne?: Types.ObjectId | null;
  /** legacy: set by the old "first N to accept get a place" rule. No longer read;
      places are now counted from plus-one guests actually added. Kept so no
      stored data is lost. */
  plusOneAllowed?: boolean | null;
  /** 11. ticket id */
  ticket?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantSchema = new Schema<ParticipantDoc>(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    stack: { type: String, enum: [...STACKS, null], default: null },
    gender: { type: String, enum: [...GENDERS, null], default: null },
    profilePicture: { type: String, default: null },
    status: { type: String, enum: PARTICIPANT_STATUSES, default: "PENDING" },
    registrationStatus: { type: String, enum: REGISTRATION_STATUSES, default: "APPROVED" },
    plusOne: { type: Schema.Types.ObjectId, ref: "Guest", default: null },
    plusOneAllowed: { type: Boolean, default: null },
    ticket: { type: Schema.Types.ObjectId, ref: "Ticket", default: null },
  },
  { timestamps: true }
);

/* one registration per email per event */
ParticipantSchema.index({ event: 1, email: 1 }, { unique: true });

export const Participant: Model<ParticipantDoc> =
  (models.Participant as Model<ParticipantDoc>) ??
  model<ParticipantDoc>("Participant", ParticipantSchema);
