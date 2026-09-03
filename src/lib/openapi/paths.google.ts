import { bearer, errorResponse, jsonResponse, str, strEnum, ADMIN_ROLES } from "./shared";

/* Per-user Google OAuth and staff administration. */

export const googlePaths = {
  "/api/auth/staff/session": {
    get: {
      tags: ["Google"],
      summary: "Who am I",
      description:
        "The authoritative identity, role and capability list for the signed-in staff member, " +
        "plus their Google connection state. The console caches name and role at login; this is " +
        "what makes a promotion or demotion visible without a re-login.",
      security: bearer,
      responses: {
        200: jsonResponse("Your identity", {
          type: "object",
          properties: {
            admin: { $ref: "#/components/schemas/StaffMember" },
            capabilities: { type: "array", items: str() },
            google: {
              type: "object",
              properties: {
                connected: { type: "boolean" },
                email: str({ nullable: true }),
                status: str({ nullable: true }),
              },
            },
          },
        }),
        401: errorResponse("Not a staff account"),
      },
    },
  },

  "/api/auth/google/start": {
    get: {
      tags: ["Google"],
      summary: "Begin signing in with Google",
      description:
        "A plain redirect into Google's consent screen — the visitor has no session yet, so " +
        "there is no bearer token a navigation could fail to carry. CSRF protection is a nonce " +
        "signed into `state` and mirrored in an httpOnly cookie; the callback requires both to " +
        "agree. PKCE is used as well.\n\nSign-in and calendar access are one consent: a " +
        "successful sign-in leaves the account already connected.",
      responses: {
        302: { description: "Redirect to Google" },
        503: errorResponse("Google sign-in is not configured on this deployment"),
      },
    },
  },

  "/api/auth/callback/google": {
    get: {
      tags: ["Google"],
      summary: "Google sign-in callback",
      description:
        "Runs every check in order — signed state matches the nonce cookie, the code exchanges " +
        "with the PKCE verifier, the returned id_token verifies against Google's JWKS " +
        "(issuer + audience), the address is verified and on the allowed Workspace domain — " +
        "and only then opens a session. Always redirects; never returns JSON.\n\n" +
        "On success it sets two httpOnly cookies: a short-lived access cookie and a rotating " +
        "refresh cookie. Nothing is written to localStorage.",
      parameters: [
        { name: "code", in: "query", schema: str() },
        { name: "state", in: "query", schema: str() },
        { name: "error", in: "query", schema: str() },
      ],
      responses: { 302: { description: "Redirect to the console or back to sign-in with a reason" } },
    },
  },

  "/api/auth/staff/refresh": {
    post: {
      tags: ["Google"],
      summary: "Renew the staff session",
      description:
        "Exchanges the refresh cookie for a new access cookie. Rotation is single-use: " +
        "presenting a token that has already been rotated means it was captured, so the whole " +
        "session chain is revoked rather than renewed. Same-origin only.",
      responses: {
        200: jsonResponse("Renewed", { type: "object", properties: { ok: { type: "boolean" } } }),
        401: errorResponse("Missing, expired or replayed refresh cookie — cookies are cleared"),
        403: errorResponse("Cross-origin request"),
      },
    },
  },

  "/api/auth/staff/signout": {
    post: {
      tags: ["Google"],
      summary: "Sign out",
      description:
        "Always succeeds and always clears the cookies, even when the session was already " +
        "gone. `?all=1` ends every session for this person rather than just this device.",
      parameters: [
        {
          name: "all",
          in: "query",
          schema: strEnum(["1"]),
          description: "End every session, not just this one.",
        },
      ],
      responses: {
        200: jsonResponse("Signed out", {
          type: "object",
          properties: { signedOut: { type: "boolean" } },
        }),
      },
    },
  },

  "/api/admin/google/connect": {
    post: {
      tags: ["Google"],
      summary: "Start connecting a Google account",
      description:
        "Returns the Google consent URL for the browser to navigate to, and sets an httpOnly " +
        "PKCE cookie scoped to `/api/admin/google`.\n\n" +
        "This is a POST returning a URL rather than a redirecting GET on purpose: the admin " +
        "session cookie is scoped to /api and not carried by a cross-site redirect, so a top-level " +
        "navigation would arrive with no Authorization header and the server could not tell who " +
        "was connecting.",
      security: bearer,
      responses: {
        200: jsonResponse("The consent URL", {
          type: "object",
          properties: { authUrl: str({ format: "uri" }) },
        }),
        401: errorResponse("Not a staff account"),
        503: errorResponse("Google is not configured on this deployment"),
      },
    },
  },

  "/api/admin/google/callback": {
    get: {
      tags: ["Google"],
      summary: "Google OAuth callback",
      description:
        "Where Google sends the browser back. Public by necessity — a cross-site GET carries no " +
        "Authorization header — so identity and CSRF protection come from a signed 10-minute " +
        "state token with its own `kind` (never accepted as a session token) plus the matching " +
        "PKCE cookie. Always redirects to `/admin/settings/google` with `?connected=1` or " +
        "`?error=<code>`; it never returns JSON.",
      parameters: [
        { name: "code", in: "query", schema: str() },
        { name: "state", in: "query", schema: str() },
        { name: "error", in: "query", schema: str(), description: "Set when consent was declined." },
      ],
      responses: {
        302: { description: "Redirect back to the settings page" },
      },
    },
  },

  "/api/admin/google/status": {
    get: {
      tags: ["Google"],
      summary: "Google connection state",
      security: bearer,
      responses: {
        200: jsonResponse("Connection state", {
          type: "object",
          properties: {
            available: {
              type: "boolean",
              description: "False when the deployment has no Google credentials at all.",
            },
            connected: { type: "boolean" },
            needsReconnect: {
              type: "boolean",
              description: "The grant was revoked — the UI should offer to reconnect.",
            },
            email: str({ nullable: true }),
            scopes: { type: "array", items: str() },
            status: str({ nullable: true }),
            lastError: str({ nullable: true }),
            connectedAt: str({ format: "date-time", nullable: true }),
            lastUsedAt: str({ format: "date-time", nullable: true }),
          },
        }),
        401: errorResponse("Not a staff account"),
      },
    },
  },

  "/api/admin/google/disconnect": {
    delete: {
      tags: ["Google"],
      summary: "Disconnect Google",
      description:
        "Revokes the grant at Google, then deletes the stored tokens. Revocation is best effort " +
        "— an unreachable Google does not leave an undeletable connection in the UI. Nothing " +
        "already on the Google Calendar is removed.",
      security: bearer,
      responses: {
        200: jsonResponse("Disconnected", {
          type: "object",
          properties: { disconnected: { type: "boolean" } },
        }),
        401: errorResponse("Not a staff account"),
      },
    },
  },

  "/api/admin/staff": {
    get: {
      tags: ["Google"],
      summary: "List staff accounts",
      description:
        "Gated on `calendar:viewAll` rather than `staff:manage` — a facilitator needs the roster " +
        "to filter the org calendar, but must not be able to create or edit accounts.",
      security: bearer,
      responses: {
        200: jsonResponse("Staff", {
          type: "object",
          properties: {
            staff: { type: "array", items: { $ref: "#/components/schemas/StaffMember" } },
          },
        }),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Missing the calendar:viewAll capability"),
      },
    },
    post: {
      tags: ["Google"],
      summary: "Create a staff account",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "password"],
              properties: {
                name: str({ minLength: 2 }),
                email: str({ format: "email" }),
                password: str({ minLength: 8 }),
                role: strEnum(ADMIN_ROLES),
                title: str({ maxLength: 120 }),
                bio: str({ maxLength: 600 }),
              },
            },
          },
        },
      },
      responses: {
        201: jsonResponse("Created", {
          type: "object",
          properties: { staff: { $ref: "#/components/schemas/StaffMember" } },
        }),
        400: errorResponse("Invalid details"),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Missing the staff:manage capability"),
        409: errorResponse("That email is already in use"),
      },
    },
  },

  "/api/admin/staff/{id}": {
    patch: {
      tags: ["Google"],
      summary: "Edit a staff account",
      description:
        "Refuses changes that would lock everyone out: you cannot change your own role or " +
        "deactivate yourself, and the last active ADMIN or CEO cannot be demoted or disabled.",
      security: bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: str({ minLength: 2 }),
                role: strEnum(ADMIN_ROLES),
                active: { type: "boolean" },
                password: str({ minLength: 8 }),
                title: str({ nullable: true }),
                bio: str({ nullable: true }),
              },
            },
          },
        },
      },
      responses: {
        200: jsonResponse("Updated", {
          type: "object",
          properties: { staff: { $ref: "#/components/schemas/StaffMember" } },
        }),
        400: errorResponse("Invalid details"),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Missing the staff:manage capability"),
        404: errorResponse("Not found"),
        409: errorResponse("Would leave the console with no administrator"),
      },
    },
    delete: {
      tags: ["Google"],
      summary: "Deactivate a staff account",
      description:
        "A soft delete — their name stays attached to past activities and bookings, and the " +
        "per-request active check ends their session on their next request.",
      security: bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      responses: {
        200: jsonResponse("Deactivated", {
          type: "object",
          properties: { deactivated: { type: "boolean" } },
        }),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Missing the staff:manage capability"),
        404: errorResponse("Not found"),
        409: errorResponse("Would leave the console with no administrator"),
      },
    },
  },

  "/api/admin/events/{id}/meet": {
    post: {
      tags: ["Google"],
      summary: "Generate the Google Meet link for an event",
      description:
        "Only for ONLINE or HYBRID events, and only when the event has a host: Google will not " +
        "mint a conference on a calendar the token does not own, so the link lives on the host's " +
        "own Google Calendar and they are the organiser of the call. Conference creation is " +
        "asynchronous — a `pending: true` response means the link is still being made and the " +
        "call should be retried in a moment.",
      security: bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      responses: {
        200: jsonResponse("The link, or a pending marker", {
          type: "object",
          properties: {
            meetLink: str({ nullable: true }),
            pending: { type: "boolean" },
            message: str(),
          },
        }),
        400: errorResponse("Not an online event, or no host chosen"),
        401: errorResponse("Not an administrator"),
        404: errorResponse("Not found"),
        409: errorResponse("The host has not connected Google, or needs to reconnect"),
        502: errorResponse("Google Calendar could not be reached"),
      },
    },
  },
} as const;
