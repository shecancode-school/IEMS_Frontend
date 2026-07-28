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
} from "@/types/admin";

/* Form validation schemas (React Hook Form + zodResolver). Datetimes are the
   raw <input type="datetime-local"> strings; the API coerces them. */

/* blank rows from the rules editor are trimmed away before submit */
const rules = z.array(z.string()).default([]);
const gallery = z.array(z.string().url("Each gallery entry must be a valid URL")).default([]);

export const eventCreateSchema = z.object({
  name: z.string().min(2, "Name is required"),
  slug: z
    .string()
    .min(2, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  category: z.enum(EVENT_CATEGORIES),
  type: z.enum(EVENT_TYPES),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().optional(),
  gallery,
  organiser: z.string().min(2, "Organiser is required"),
  maxAttendees: z.coerce.number().int().min(0, "0 or more (0 = uncapped)"),
  details: z.string().default(""),
  rules,
  price: z.string().default("Free"),
  location: z.string().default(""),
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
export const eventFormSchema = eventCreateSchema.extend({
  status: z.enum(EVENT_STATUSES).default("DRAFT"),
});
export type EventFormValues = z.output<typeof eventFormSchema>;
export type EventFormInput = z.input<typeof eventFormSchema>;

/* PATCH body: any subset of the editable fields; endTime may be nulled, and an
   archive toggle rides along. */
export type EventUpdateBody = Partial<Omit<EventEditValues, "endTime">> & {
  endTime?: string | null;
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
