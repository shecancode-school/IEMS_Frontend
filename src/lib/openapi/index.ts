import { components } from "./schemas";
import { calendarSchemas } from "./schemas.calendar";
import { integrationPaths, integrationSchemas } from "./paths.integration";
import { corePaths } from "./paths.core";
import { calendarPaths } from "./paths.calendar";
import { bookingPaths } from "./paths.booking";
import { googlePaths } from "./paths.google";

/* Hand-authored OpenAPI 3.1 description of the IEMS backend.

   Split out of what had grown into a single 1600-line file. `@/lib/openapi`
   still resolves here, so every existing import is unchanged — there is
   deliberately no sibling openapi.ts, because a file and a directory with the
   same name is an ambiguity trap.

   When you add or change a route, update the matching paths.*.ts module. */

const TAGS = [
  { name: "Public", description: "Open endpoints, no authentication." },
  { name: "Auth", description: "Attendee magic-link login and session issuing." },
  { name: "Attendee", description: "The signed-in attendee's own registration and ticket." },
  { name: "Plus-one", description: "Participant guest invitations." },
  { name: "Scanner", description: "Gate check-in — admins and scanner accounts." },
  { name: "Admin", description: "Admin console — full control of the system." },
  {
    name: "Calendar",
    description:
      "The organisation's schedule: ticketed events, staff activities and each person's own " +
      "Google Calendar, merged into one feed.",
  },
  {
    name: "Booking",
    description:
      "Booking time with a staff member. The /api/book/* endpoints are public — this is the " +
      "surface a third party would integrate against.",
  },
  {
    name: "Google",
    description: "Per-user Google Calendar connection and staff administration.",
  },
];

const DESCRIPTION =
  "Igire Event Management System — event registration, magic-link auth, plus-one " +
  "invitations, QR ticketing, the organisation calendar and one-to-one booking.\n\n" +
  "**Staff** authenticate with a short-lived httpOnly session cookie, obtained by signing in " +
  "with Google at `/api/auth/google/start` and renewed at `/api/auth/staff/refresh`. Sign-in " +
  "is restricted to the organisation's Google Workspace domain, and nothing is stored in " +
  "localStorage. **Attendees** still use a JWT bearer token of kind `attendee`, obtained from " +
  "`/api/auth/verify`. Staff endpoints additionally check a capability derived from the " +
  "account's role, so a facilitator reaches the calendar but not the ticketing console.\n\n" +
  "Every wall-clock time in this API is Africa/Kigali (UTC+2, no daylight saving). Instants " +
  "are RFC 3339; calendar days are `YYYY-MM-DD` and always mean a Kigali day.";

export const openApiSpec = {
  openapi: "3.1.0",
  info: { title: "IEMS API", version: "1.1.0", description: DESCRIPTION },
  servers: [{ url: "/", description: "This deployment" }],
  tags: TAGS,
  components: {
    ...components,
    schemas: { ...components.schemas, ...calendarSchemas, ...integrationSchemas },
  },
  paths: {
    ...corePaths,
    ...calendarPaths,
    ...bookingPaths,
    ...googlePaths,
    ...integrationPaths,
  },
} as const;

export type OpenApiSpec = typeof openApiSpec;

/* The integration surface: everything a third party can actually call without
   a staff account. Publishing the full spec would hand an attacker a complete
   map of the private admin surface for nothing in return, so /api/docs stays
   locked down and this narrower document is the public one. */
const PUBLIC_TAGS = new Set(["Public", "Booking"]);

export const publicOpenApiSpec = {
  ...openApiSpec,
  info: {
    ...openApiSpec.info,
    title: "IEMS Public API",
    description:
      "The publicly callable part of the Igire Event Management System: the events feed and " +
      "the booking API. No authentication is required for any endpoint here.\n\n" +
      "All times are Africa/Kigali (UTC+2, no daylight saving).",
  },
  tags: TAGS.filter((t) => PUBLIC_TAGS.has(t.name)),
  paths: Object.fromEntries(
    Object.entries(openApiSpec.paths).filter(([, item]) =>
      /* an operation is public if it has no security requirement and carries a
         public tag — checking both means a future authenticated endpoint
         cannot leak in just because someone tagged it "Booking" */
      Object.values(item as Record<string, unknown>).some((op) => {
        if (!op || typeof op !== "object") return false;
        const operation = op as { tags?: string[]; security?: { [k: string]: unknown }[] };
        if (!(operation.tags ?? []).some((t) => PUBLIC_TAGS.has(t))) return false;

        /* Anonymous operations are public. So is an operation whose ONLY
           requirement is an API key: an integrator has to be able to read
           how the key works before they have one, or the key is useless.
           Anything asking for a session or a bearer token stays private. */
        const requirements = operation.security ?? [];
        if (requirements.length === 0) return true;
        return requirements.every((r) => Object.keys(r).every((scheme) => scheme === "apiKeyAuth"));
      })
    )
  ),
};
