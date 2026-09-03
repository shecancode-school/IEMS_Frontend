import { z } from "zod";
import {
  EVENT_CATEGORIES,
  EVENT_TYPES,
  EVENT_STATUSES,
  STACKS,
  GENDERS,
  GUEST_TYPES,
  RELATIONSHIPS,
  REGISTRATION_STATUSES,
  ADMIN_ROLES,
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  EVENT_MODES,
} from "@/types/admin";

/* Form validation schemas (React Hook Form + zodResolver). Datetimes are the
   raw <input type="datetime-local"> strings; the API coerces them. */

/* blank rows from the rules editor are trimmed away before submit */
const rules = z.array(z.string()).default([]);
/* An event is a thing people are asked to turn up to, so the poster is not
   decoration — the public card, the event page and the emailed pass all render
   it, and an event without one ships a grey box to every registrant. */
const gallery = z
  .array(z.string().url("Each gallery entry must be a valid URL"))
  .min(1, "Add at least one image — the first is the event poster");

/* The details field is a rich-text editor, so "empty" is not "" — it is
   "<p></p>", or a paragraph holding one &nbsp;. Length has to be measured on
   the text, not on the markup, or the required check passes on nothing. */
export function richTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export const eventCreateSchema = z.object({
  name: z.string().min(2, "Name is required"),
  slug: z
    .string()
    .min(2, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  category: z.enum(EVENT_CATEGORIES),
  type: z.enum(EVENT_TYPES),
  startTime: z.string().min(1, "Start time is required"),
  /* Required. It was optional, and the consequence was public event cards that
     said when a thing began and never when it ended — the single most common
     question an attendee has after "where". */
  endTime: z.string().min(1, "End time is required"),
  gallery,
  organiser: z.string().min(2, "Organiser is required"),
  maxAttendees: z.coerce.number().int().min(0, "0 or more (0 = uncapped)"),
  details: z
    .string()
    .refine((v) => richTextLength(v) >= 20, "Describe the event in a sentence or two"),
  rules,
  price: z.string().min(1, "Price is required — write Free if it is free"),
  location: z.string().min(2, "Location is required"),
  /* ONLINE and HYBRID events carry a Google Meet link, generated on the host's
     own calendar and emailed to registrants with their pass */
  mode: z.enum(EVENT_MODES).default("IN_PERSON"),
  /* The one field that stays genuinely optional. An organisation-wide event
     often has no single person running it, the model stores `host: null` for
     exactly that, and the calendar already renders an unowned event. Forcing a
     name here would mean picking one arbitrarily and putting a Google Meet on
     a colleague's calendar without asking. */
  host: z.string().optional(),
  isPublished: z.boolean().default(false),
});
export type EventCreateInput = z.input<typeof eventCreateSchema>;
export type EventCreateValues = z.output<typeof eventCreateSchema>;

export const eventEditSchema = eventCreateSchema
  .omit({ slug: true })
  .extend({ status: z.enum(EVENT_STATUSES) });
export type EventEditValues = z.output<typeof eventEditSchema>;

/* one schema the shared EventForm binds to (slug + status both present); each
   page sends the relevant subset to the API. */
export const eventFormSchema = eventCreateSchema
  .extend({
    status: z.enum(EVENT_STATUSES).default("DRAFT"),
  })
  /* Cross-field rules live here rather than on the base object: a refinement
     turns a ZodObject into a ZodEffects, which can no longer be .omit()ed or
     .extend()ed, and eventEditSchema derives from the base. This is the last
     schema in the chain, so it is the one that can carry them.

     An event that ends before it starts was accepted by every layer of this
     application — the form, the API and the model — and produced a negative
     duration on the calendar grid. */
  .superRefine((v, ctx) => {
    if (v.startTime && v.endTime && v.endTime <= v.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "The end must be after the start",
      });
    }
  });
export type EventFormValues = z.output<typeof eventFormSchema>;
export type EventFormInput = z.input<typeof eventFormSchema>;

/* PATCH body: any subset of the editable fields; endTime may be nulled, and an
   archive toggle rides along. */
export type EventUpdateBody = Partial<Omit<EventEditValues, "endTime" | "host">> & {
  endTime?: string | null;
  /* null clears the host, undefined leaves it alone */
  host?: string | null;
  archived?: boolean;
};

export const participantCreateSchema = z.object({
  eventId: z.string().min(1, "Choose an event"),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(6).optional().or(z.literal("")),
  stack: z.enum(STACKS).optional(),
  gender: z.enum(GENDERS).optional(),
});
export type ParticipantCreateValues = z.output<typeof participantCreateSchema>;

export const participantEditSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email("Valid email required").optional(),
  phone: z.string().min(6).optional().or(z.literal("")),
  stack: z.enum(STACKS).optional(),
  gender: z.enum(GENDERS).optional(),
  registrationStatus: z.enum(REGISTRATION_STATUSES).optional(),
});
export type ParticipantEditValues = z.output<typeof participantEditSchema>;

/* Admin form for assigning (or reassigning) a participant's plus-one. */
export const plusOneAssignSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  gender: z.enum(GENDERS).optional(),
  relationship: z.enum(RELATIONSHIPS).optional(),
});
export type PlusOneAssignValues = z.output<typeof plusOneAssignSchema>;

export const guestCreateSchema = z.object({
  eventId: z.string().min(1, "Choose an event"),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  guestType: z.enum(GUEST_TYPES),
});
export type GuestCreateValues = z.output<typeof guestCreateSchema>;

export const guestEditSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  guestType: z.enum(GUEST_TYPES).optional(),
});
export type GuestEditValues = z.output<typeof guestEditSchema>;

export const scannerCreateSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "At least 8 characters"),
});
export type ScannerCreateValues = z.output<typeof scannerCreateSchema>;

export const scannerEditSchema = z.object({
  name: z.string().min(2).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional().or(z.literal("")),
});
export type ScannerEditValues = z.output<typeof scannerEditSchema>;

/* ------------------------------------------------------------------ Staff */
export const staffCreateSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(ADMIN_ROLES),
  title: z.string().max(120).optional(),
  bio: z.string().max(600).optional(),
  canScan: z.boolean().optional(),
});
export type StaffCreateValues = z.output<typeof staffCreateSchema>;

export const staffEditSchema = z.object({
  name: z.string().min(2, "Name is required"),
  role: z.enum(ADMIN_ROLES),
  active: z.boolean(),
  title: z.string().max(120).nullable().optional(),
  bio: z.string().max(600).nullable().optional(),
  canScan: z.boolean().optional(),
  password: z.string().min(8, "At least 8 characters").optional().or(z.literal("")),
});
export type StaffEditValues = z.output<typeof staffEditSchema>;

/* --------------------------------------------------------------- Activity */
/* start/end are <input type="datetime-local"> strings in Kigali wall clock;
   the dialog converts them with kigaliInputToISO before sending, exactly like
   eventFormSchema does. */
export const activityFormSchema = z
  .object({
    title: z.string().min(2, "Give it a name"),
    description: z.string().max(4000).optional(),
    type: z.enum(ACTIVITY_TYPES),
    start: z.string().min(1, "Pick a start time"),
    end: z.string().min(1, "Pick an end time"),
    mode: z.enum(EVENT_MODES),
    location: z.string().max(300).optional(),
    visibility: z.enum(ACTIVITY_VISIBILITY),
    attendeeEmails: z.string().optional(),
    ownerId: z.string().optional(),
  })
  .refine((v) => !v.start || !v.end || v.end > v.start, {
    message: "The end time must be after the start time",
    path: ["end"],
  });
export type ActivityFormValues = z.output<typeof activityFormSchema>;
