import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import * as attendees from "@/app/api/admin/attendees/route";
import * as attendeesExport from "@/app/api/admin/attendees/export/route";
import * as guests from "@/app/api/admin/guests/route";
import * as guestsExport from "@/app/api/admin/guests/export/route";
import * as tickets from "@/app/api/admin/tickets/route";
import * as ticketsExport from "@/app/api/admin/tickets/export/route";
import { staffCookie, clearTestSessions } from "../staffAuth";

/* The CSV exports exist so an admin can download "what I'm looking at" — the
   table's filters, applied to the same data the list endpoint returns. These
   tests pin that contract: same filters in, same row count out. */

const ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL ?? "admin@igirerwanda.org").toLowerCase();

const authGet = (path: string, cookie?: string) =>
  new Request(`http://localhost${path}`, {
    headers: cookie ? { cookie } : {},
  });

/* staff auth is an httpOnly cookie now, not a bearer token */
let cookie = "";

beforeAll(async () => {
  const c = await staffCookie(ADMIN_EMAIL);
  expect(c, "no active administrator — run `pnpm seed` first").toBeTruthy();
  cookie = c!;
});

afterAll(async () => {
  await clearTestSessions();
  await mongoose.disconnect().catch(() => {});
});

/* rows in the CSV body, excluding the header */
async function csvRows(res: Response): Promise<string[]> {
  const text = await res.text();
  return text
    .replace(/^\uFEFF/, "")
    .split("\n")
    .slice(1)
    .filter(Boolean);
}

const EXPORTS = [
  { name: "attendees", GET: attendeesExport.GET, path: "/api/admin/attendees/export", first: "Name" },
  { name: "guests", GET: guestsExport.GET, path: "/api/admin/guests/export", first: "Name" },
  { name: "tickets", GET: ticketsExport.GET, path: "/api/admin/tickets/export", first: "Ticket Number" },
] as const;

describe("admin CSV exports", () => {
  for (const e of EXPORTS) {
    it(`${e.name}: rejects an unauthenticated request`, async () => {
      expect((await e.GET(authGet(e.path))).status).toBe(401);
    });

    it(`${e.name}: serves a downloadable CSV with a header row`, async () => {
      const res = await e.GET(authGet(e.path, cookie));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=".+\.csv"/);
      const text = await res.text();
      expect(text.replace(/^\uFEFF/, "").split("\n")[0].split(",")[0]).toBe(e.first);
    });
  }

  /* the point of the feature: a filtered download matches the filtered table */
  const PARITY = [
    { name: "participants", list: attendees.GET, key: "attendees", GET: attendeesExport.GET,
      listPath: "/api/admin/attendees", exportPath: "/api/admin/attendees/export",
      queries: ["", "?registrationStatus=APPROVED", "?status=COMPLETE", "?stack=FRONTEND"] },
    { name: "guests", list: guests.GET, key: "guests", GET: guestsExport.GET,
      listPath: "/api/admin/guests", exportPath: "/api/admin/guests/export",
      queries: ["", "?type=VIP", "?type=PLUS_ONE"] },
    { name: "tickets", list: tickets.GET, key: "tickets", GET: ticketsExport.GET,
      listPath: "/api/admin/tickets", exportPath: "/api/admin/tickets/export",
      queries: ["", "?status=VALID", "?status=USED"] },
  ] as const;

  for (const p of PARITY) {
    it(`${p.name}: every filter exports exactly the rows the list returns`, async () => {
      for (const q of p.queries) {
        const listed = await p.list(authGet(`${p.listPath}${q}`, cookie));
        const exported = await p.GET(authGet(`${p.exportPath}${q}`, cookie));
        expect(listed.status).toBe(200);
        expect(exported.status).toBe(200);
        const rows = (await listed.json())[p.key] as unknown[];
        expect(await csvRows(exported), `${p.name}${q}`).toHaveLength(rows.length);
      }
    });
  }

  it("guests: an unknown type is ignored rather than exporting nothing", async () => {
    const all = await csvRows(await guestsExport.GET(authGet("/api/admin/guests/export", cookie)));
    const bogus = await csvRows(
      await guestsExport.GET(authGet("/api/admin/guests/export?type=NOPE", cookie))
    );
    expect(bogus).toHaveLength(all.length);
  });

  it("tickets: the search term narrows the export the way the table does", async () => {
    const all = await csvRows(await ticketsExport.GET(authGet("/api/admin/tickets/export", cookie)));
    const searched = await csvRows(
      await ticketsExport.GET(authGet("/api/admin/tickets/export?q=zzzznomatch", cookie))
    );
    expect(all.length).toBeGreaterThan(0);
    expect(searched).toHaveLength(0);
  });
});
