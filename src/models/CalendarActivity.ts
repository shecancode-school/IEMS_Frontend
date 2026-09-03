import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  EVENT_MODES,
  type ActivityStatus,
  type ActivityType,
  type ActivityVisibility,
  type EventMode,
} from "@/types/admin";

export { ACTIVITY_STATUSES, ACTIVITY_TYPES, ACTIVITY_VISIBILITY };
export type { ActivityStatus, ActivityType, ActivityVisibility };

/* Anything a staff member schedules that is not a ticketed Event: a class, a
   mentorship session, a code review, a meeting, office hours. This is what
   fills the org calendar between events and answers "what is this person
   doing today".

   When the owner has connected Google, the activity is mirrored onto their
   Google Calendar (googleEventId) and can carry a Meet link. The IEMS document
   stays the source of truth; Google is a projection of it. */
export interface CalendarActivityDoc {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  title: string;
  description: string;
  type: ActivityType;
  start: Date;
  end: Date;
  mode: EventMode;
  location: string;
  visibility: ActivityVisibility;
  attendees: { email: string; name: string }[];
  event?: Types.ObjectId | null;
  googleEventId?: string | null;
  meetLink?: string | null;
  status: ActivityStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarActivitySchema = new Schema<CalendarActivityDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: { type: String, enum: ACTIVITY_TYPES, default: "MEETING" },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    mode: { type: String, enum: EVENT_MODES, default: "IN_PERSON" },
    location: { type: String, default: "" },
    /* PUBLIC by default: the calendar is meant to be an open, social record of
       what the organisation is doing, so a new session is visible on the public
       schedule unless its owner narrows it. ORG keeps it to colleagues; PRIVATE
       hides the details from everyone but the owner, who still shows as busy.

       Only NEW activities get this default — anything already stored keeps the
       visibility it was created with. */
    visibility: { type: String, enum: ACTIVITY_VISIBILITY, default: "PUBLIC" },
    attendees: {
      type: [{ email: String, name: String, _id: false }],
      default: [],
    },
    event: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    googleEventId: { type: String, default: null },
    meetLink: { type: String, default: null },
    /* DESYNCED means someone moved or deleted the mirrored copy in Google —
       the reconcile pass flags it rather than silently overwriting either side */
    status: { type: String, enum: ACTIVITY_STATUSES, default: "SCHEDULED" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
  },
  { timestamps: true }
);

/* the calendar feed always queries a date window, usually per person */
CalendarActivitySchema.index({ owner: 1, start: 1 });
CalendarActivitySchema.index({ start: 1 });
CalendarActivitySchema.index({ event: 1 });

export const CalendarActivity: Model<CalendarActivityDoc> =
  (models.CalendarActivity as Model<CalendarActivityDoc>) ??
  model<CalendarActivityDoc>("CalendarActivity", CalendarActivitySchema);
