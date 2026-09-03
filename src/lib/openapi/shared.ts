/* Shorthands and enum values shared by every path module.

   The enums are IMPORTED from @/types/admin rather than redeclared here. They
   used to be a third copy alongside the models and the UI types, which meant a
   new enum value had to be added in three places and silently drifted when it
   was not. types/admin.ts has no imports of its own, so pulling it into a
   server-only module is safe. */

import {
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  ADMIN_ROLES,
  BOOKING_STATUSES,
  EVENT_CATEGORIES,
  EVENT_MODES,
  EVENT_STATUSES,
  EVENT_TYPES,
  GENDERS,
  GUEST_TYPES,
  PARTICIPANT_STATUSES,
  STACKS,
  TICKET_STATUSES,
} from "@/types/admin";
import { SCAN_RESULTS } from "@/models/ScanLog";
import { NOTIFICATION_KINDS, NOTIFICATION_SEVERITIES } from "@/models/Notification";

export {
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  ADMIN_ROLES,
  BOOKING_STATUSES,
  EVENT_CATEGORIES,
  EVENT_MODES,
  EVENT_STATUSES,
  EVENT_TYPES,
  GENDERS,
  GUEST_TYPES,
  NOTIFICATION_KINDS,
  NOTIFICATION_SEVERITIES,
  PARTICIPANT_STATUSES,
  SCAN_RESULTS,
  STACKS,
  TICKET_STATUSES,
};

/* short-hands to keep the paths readable */
export const str = (extra: Record<string, unknown> = {}) => ({ type: "string", ...extra });
export const strEnum = (values: readonly string[]) => ({ type: "string", enum: [...values] });
export const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});
export const jsonBody = (schema: unknown, required = true) => ({
  required,
  content: { "application/json": { schema } },
});
export const jsonResponse = (description: string, schema: unknown) => ({
  description,
  content: { "application/json": { schema } },
});

export const bearer = [{ bearerAuth: [] }];

/* a path-level {id} parameter, which nearly every detail route needs */
export const pathId = (name = "id", description = "Resource id") => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
  description,
});

/* a ?from&to date-range query pair, used by every calendar endpoint */
export const rangeQuery = [
  {
    name: "from",
    in: "query",
    schema: { type: "string", format: "date" },
    description: "First Kigali calendar day, YYYY-MM-DD. Defaults to today.",
  },
  {
    name: "to",
    in: "query",
    schema: { type: "string", format: "date" },
    description: "Last Kigali calendar day, inclusive. At most 92 days after `from`.",
  },
];
