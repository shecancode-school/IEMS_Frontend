import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import * as stats from "@/app/api/admin/stats/route";
import * as dashboard from "@/app/api/admin/dashboard/route";
import * as adminEvents from "@/app/api/admin/events/route";
import * as attendees from "@/app/api/admin/attendees/route";
import * as guests from "@/app/api/admin/guests/route";
import * as tickets from "@/app/api/admin/tickets/route";
import * as notifications from "@/app/api/admin/notifications/route";
import * as validate from "@/app/api/tickets/validate/route";
import * as requestLink from "@/app/api/auth/request-link/route";
import { staffCookie, clearTestSessions } from "../staffAuth";

/* Authenticated / write-path coverage against real Atlas. Opens a staff
   session for an active administrator the same way the Google callback does,
   then drives the protected read endpoints and the auth gates. No rosters are
   mutated and no emails are sent (the request-link tests use the validation +
   unregistered paths, which never call the mailer). */

const ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL ?? "admin@igirerwanda.org").toLowerCase();
/* staff auth is a cookie now — Google sign-in replaced the password login */

/* `cookie` carries the staff session; `token` is still a bearer, for the
   attendee endpoints that have not moved to cookies. */
const jsonReq = (path: string, body: unknown, auth?: { token?: string; cookie?: string }) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth?.token ? { authorization: `Bearer ${auth.token}` } : {}),
      ...(auth?.cookie ? { cookie: auth.cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const authGet = (path: string, auth?: { token?: string; cookie?: string }) =>
  new Request(`http://localhost${path}`, {
    headers: {
      ...(auth?.token ? { authorization: `Bearer ${auth.token}` } : {}),
      ...(auth?.cookie ? { cookie: auth.cookie } : {}),
    },
  });

let adminCookie = "";

beforeAll(async () => {
  const cookie = await staffCookie(ADMIN_EMAIL);
  expect(cookie, "no active administrator — run `pnpm seed` first").toBeTruthy();
  adminCookie = cookie!;

});

afterAll(async () => {
  await clearTestSessions();
  await mongoose.disconnect().catch(() => {});
});

describe("staff session", () => {
  it("opens a session for the seeded admin", () => {
    expect(adminCookie).toContain("iems_staff=");
  });

  it("rejects a forged session cookie", async () => {
    const res = await stats.GET(authGet("/api/admin/stats", { cookie: "iems_staff=not-a-real-token" }));
    expect(res.status).toBe(401);
  });
});

/* each protected list endpoint: 401 anonymous, 200 + expected key with a token */
const adminEndpoints: { name: string; get: (r: Request) => Promise<Response>; key: string }[] = [
  { name: "admin/stats", get: stats.GET, key: "stats" },
  { name: "admin/dashboard", get: dashboard.GET, key: "global" },
  { name: "admin/events", get: adminEvents.GET, key: "events" },
  { name: "admin/attendees", get: attendees.GET, key: "attendees" },
  { name: "admin/guests", get: guests.GET, key: "guests" },
  { name: "admin/tickets", get: tickets.GET, key: "tickets" },
  { name: "admin/notifications", get: notifications.GET, key: "notifications" },
];

describe.each(adminEndpoints)("GET /api/$name", ({ get, key }) => {
  it("rejects anonymous access with 401", async () => {
    const res = await get(authGet("/x"));
    expect(res.status).toBe(401);
  });

  it("returns data for an authenticated admin", async () => {
    const res = await get(authGet("/x", { cookie: adminCookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty(key);
  });
});

describe("POST /api/tickets/validate", () => {
  it("rejects an unauthenticated caller with 401", async () => {
    const res = await validate.POST(jsonReq("/api/tickets/validate", { code: "ABC123" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty body from an authorised scanner with 400", async () => {
    const res = await validate.POST(jsonReq("/api/tickets/validate", {}, { cookie: adminCookie }));
    expect(res.status).toBe(400);
  });

  it("reports an unsigned QR as invalid (not consumed)", async () => {
    const res = await validate.POST(
      jsonReq("/api/tickets/validate", { qr: "definitely-not-a-real-token" }, { cookie: adminCookie })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });
});

describe("POST /api/auth/request-link", () => {
  it("rejects an invalid email with 400 (no email sent)", async () => {
    const res = await requestLink.POST(jsonReq("/api/auth/request-link", { email: "nope" }));
    expect(res.status).toBe(400);
  });

  it("returns a neutral response for an unregistered email (no email sent)", async () => {
    const res = await requestLink.POST(
      jsonReq("/api/auth/request-link", { email: "no-such-person-xyz@example.com" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/verification link/i);
  });
});
