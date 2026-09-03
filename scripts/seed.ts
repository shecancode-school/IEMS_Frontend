/* Seeds the super admin, the (private) graduation event, and the real
   participants parsed from the cohort attendance CSV exports.
   Run: pnpm seed  (idempotent — safe to re-run)

   CSV locations default to ~/Downloads and can be overridden:
     FRONTEND_CSV=/path/to/frontend.csv BACKEND_CSV=/path/to/backend.csv pnpm seed */
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { deflateSync } from "zlib";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall back to already-exported env vars */
}

import type { HydratedDocument } from "mongoose";
import { Admin, Availability, Participant, Event, type EventDoc } from "../src/models";
import { uploadImage } from "../src/lib/cloudinary";

/* Build a deterministic diagonal-gradient PNG cover for an event, entirely in
   memory. Generating the image locally (instead of fetching picsum.photos)
   keeps seeding offline-capable and reproducible — the cover only depends on
   the slug, and there's no external service to time out or go down. */

/* crc32 (needed for PNG chunk checksums) */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/* stable 32-bit hash of the slug, used to pick the gradient hue */
function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  return h >>> 0;
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function makeCoverPng(slug: string, w = 800, h = 450): Buffer {
  const hue = hashSlug(slug) % 360;
  const c1 = hslToRgb(hue, 0.55, 0.52);
  const c2 = hslToRgb((hue + 40) % 360, 0.6, 0.32);
  /* raw scanlines: each row prefixed with a filter byte (0 = none) */
  const raw = Buffer.alloc(h * (1 + w * 3));
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / (w - 1) + y / (h - 1)) / 2;
      raw[p++] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      raw[p++] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      raw[p++] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* Upload the generated cover through the same pipeline as the admin poster
   upload and return the Cloudinary secure URL. Falls back to a locally-served
   data URL if Cloudinary is unreachable, so events still get an image. */
async function uploadEventCover(slug: string): Promise<string> {
  const png = makeCoverPng(slug);
  try {
    const url = await uploadImage(png, "events");
    console.log(`  cover uploaded: ${url}`);
    return url;
  } catch (err) {
    console.warn(`  cloudinary upload failed (${(err as Error).message}), using inline cover`);
    return `data:image/png;base64,${png.toString("base64")}`;
  }
}

/* ensure an event has at least one gallery image (updateOne avoids full-doc
   validation so it's safe on freshly-migrated events) */
async function ensureEventCover(event: HydratedDocument<EventDoc>) {
  const current = event.gallery?.[0];
  /* already has a Cloudinary image — leave it */
  if (current && current.includes("res.cloudinary.com")) return;
  const url = await uploadEventCover(event.slug);
  await Event.updateOne({ _id: event._id }, { gallery: [url] });
}

const FRONTEND_CSV =
  process.env.FRONTEND_CSV ??
  join(homedir(), "Downloads", "Cohort #16 DSE 4 Frontend Class Master Database - Attendance.csv");
const BACKEND_CSV =
  process.env.BACKEND_CSV ??
  join(homedir(), "Downloads", "Cohort #16 DSE 4 Backend Class Master Database - Attendance.csv");

/* the developer's test accounts — both deliver to the same inbox */
const TEST_ROWS: Record<"FRONTEND" | "BACKEND", SeedRow> = {
  FRONTEND: { name: "Derrick Mugisha (Test)", email: "derrickmugisha169@gmail.com", phone: "780000001" },
  BACKEND: { name: "Derrick Mugisha (Backend Test)", email: "derrickmugisha169+backend@gmail.com", phone: "780000002" },
};

type SeedRow = { name: string; email: string; phone: string };

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.]+$/;
const PHONE_RE = /^\+?\d{9,12}$/;

/* minimal CSV line splitter that respects double-quoted fields */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* the sheets are messy (swapped headers, stray rows, pasted terminal
   output) — a row only counts when it carries a valid email address.
   A missing CSV is fine: we just seed the test accounts. */
function parseParticipants(path: string): SeedRow[] {
  const rows: SeedRow[] = [];
  const seen = new Set<string>();
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    console.warn(`CSV not found, skipping: ${path}`);
    return rows;
  }
  for (const line of text.split(/\r?\n/)) {
    const cells = splitCsvLine(line)
      .slice(0, 6)
      .map((c) => c.trim());
    const email = cells.find((c) => EMAIL_RE.test(c))?.toLowerCase();
    if (!email || seen.has(email)) continue;
    const phone = cells.find((c) => PHONE_RE.test(c.replace(/\s/g, ""))) ?? "";
    const name = cells[2] ?? "";
    if (!name) continue;
    seen.add(email);
    rows.push({ name: tidyName(name), email, phone: phone.replace(/\s/g, "") });
  }
  return rows;
}

/* "elyse ISHIMWE " -> "Elyse Ishimwe" */
function tidyName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").replace(/^250/, "");
  return digits ? `+250${digits}` : "";
}

/* reject unset or placeholder secrets so a deploy can't silently boot with the
   values shipped in .env.example */
function requireSecret(name: string, { minLength = 1 }: { minLength?: number } = {}): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  if (value === "change-me") throw new Error(`${name} is still the placeholder "change-me" — set a real value`);
  if (value.length < minLength) throw new Error(`${name} must be at least ${minLength} characters`);
  return value;
}


/* Optional demo staff so the org calendar and the booking pages have more than
   one person in them locally. Opt-in — a production reseed must not invent
   accounts. Set SEED_DEMO_STAFF=1 and DEMO_STAFF_PASSWORD to use it. */
async function seedDemoStaff(createdBy: mongoose.Types.ObjectId) {
  if (process.env.SEED_DEMO_STAFF !== "1") return;
  const password = requireSecret("DEMO_STAFF_PASSWORD", { minLength: 8 });
  const passwordHash = await bcrypt.hash(password, 10);

  const people = [
    { name: "Demo CEO", email: "ceo@example.test", role: "CEO" as const, title: "Chief Executive" },
    {
      name: "Demo Facilitator",
      email: "facilitator@example.test",
      role: "FACILITATOR" as const,
      title: "Lead Facilitator, SheCanCODE",
    },
    {
      name: "Demo Academic",
      email: "academic@example.test",
      role: "ACADEMIC" as const,
      title: "Academic Coordinator",
    },
  ];

  for (const p of people) {
    await Admin.findOneAndUpdate(
      { email: p.email },
      { $setOnInsert: { ...p, passwordHash, createdBy } },
      { upsert: true }
    );
  }
  console.log(`demo staff: ${people.map((p) => p.email).join(", ")}`);
}


/* A bookable profile for the super admin, so /book has something to show on a
   fresh install. $setOnInsert only — a reseed must not undo someone's real
   availability settings. */
async function seedAvailability(admin: { _id: mongoose.Types.ObjectId; name: string }) {
  await Availability.findOneAndUpdate(
    { admin: admin._id },
    {
      $setOnInsert: {
        admin: admin._id,
        bookable: false,
        slug: admin.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "admin",
        headline: "",
        bio: "",
        weekly: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "17:00" })),
      },
    },
    { upsert: true }
  );
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  /* the app signs every token with this — fail loudly if it's weak/missing */
  requireSecret("JWT_SECRET", { minLength: 32 });
  await mongoose.connect(uri);

  /* super admin from env */
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL ?? "admin@igirerwanda.org").toLowerCase();
  const adminPassword = requireSecret("SUPER_ADMIN_PASSWORD", { minLength: 8 });
  const superAdmin = await Admin.findOneAndUpdate(
    { email: adminEmail },
    {
      $setOnInsert: {
        name: process.env.SUPER_ADMIN_NAME ?? "Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  /* NOTE: the role is deliberately NOT normalised on reseed. Roles are now
     meaningful (ADMIN | CEO | FACILITATOR | ACADEMIC | STAFF) and a reseed
     must not demote an account that was promoted in the console. */
  console.log(`super admin: ${superAdmin.email} (${superAdmin.role})`);
  await seedDemoStaff(superAdmin._id);
  await seedAvailability(superAdmin);

  /* No gate-device account is seeded any more. Sign-in is Google-only, and
     scanning is a duty an administrator grants to a staff account (canScan),
     so whoever works the door signs in as themselves and every check-in is
     attributed to a real person in the audit log. */

  /* the graduation — participants only, so it stays off the public calendar */
  const event = await Event.findOneAndUpdate(
    { slug: "shecancode-graduation" },
    {
      /* $set (not $setOnInsert) so events created under the old schema get
         migrated to the current fields on reseed */
      $set: {
        name: "SheCanCODE Graduation",
        slug: "shecancode-graduation",
        category: "SheCanCODE",
        type: "CONFERENCE",
        startTime: new Date("2026-08-09T17:00:00"),
        endTime: new Date("2026-08-09T20:00:00"),
        organiser: "Igire Rwanda Organization",
        location: "Kigali",
        price: "Invitation only",
        details:
          "Cohort #16 graduation ceremony — project showcases, certificates, and stories from the cohort.",
        isPublished: false,
        rules: ["Bring a valid ID", "Doors open one hour before start"],
        maxAttendees: 200,
        status: "OPEN",
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  console.log(`event: ${event.name} (${event.slug}, ${event.isPublished ? "published" : "draft"})`);
  await ensureEventCover(event);

  /* a public event with demanding entry rules — good for exercising the
     whole flow: calendar → terms popup → verify → pass → plus-one */
  const womenTech = await Event.findOneAndUpdate(
    { slug: "women-in-tech-night" },
    {
      $set: {
        name: "Women in Tech Night",
        slug: "women-in-tech-night",
        category: "SheCanCODE",
        type: "MEETUP",
        startTime: new Date("2026-07-18T18:00:00"),
        endTime: new Date("2026-07-18T21:00:00"),
        organiser: "Igire Rwanda Organization",
        location: "Main Hall, Kigali",
        price: "Free entry",
        details:
          "An evening of lightning talks, live demos, and mentoring circles with women building Rwanda's tech scene.",
        isPublished: true,
        rules: [
          "Bring a valid government ID — names are checked letter by letter at the gate",
          "Dress code: wear at least one item that is orange, white, or green",
          "Doors open at 5:15 PM and seal shut at 6:00 PM sharp — no late entry, no exceptions",
          "Phones on silent, but charged: everyone demos one app they love at their table",
          "Bring one tech question nobody at your table can answer",
          "Your pass is personal — the QR code is scanned once and matched to your photo",
          "Every guest must name one woman in tech who inspires them before entering",
        ],
        maxAttendees: 150,
        status: "OPEN",
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  console.log(`event: ${womenTech.name} (${womenTech.slug}, ${womenTech.isPublished ? "published" : "draft"})`);
  await ensureEventCover(womenTech);

  /* test accounts join the public event too, so the full journey can be
     tested end to end from the public calendar */
  for (const row of Object.values(TEST_ROWS)) {
    await Participant.updateOne(
      { event: womenTech._id, email: row.email },
      {
        $setOnInsert: {
          event: womenTech._id,
          name: row.name,
          email: row.email,
          phone: normalizePhone(row.phone),
          stack: null,
          status: "PENDING",
        },
      },
      { upsert: true }
    );
  }

  let created = 0;
  for (const [cohort, csvPath] of [
    ["FRONTEND", FRONTEND_CSV],
    ["BACKEND", BACKEND_CSV],
  ] as const) {
    const rows = [TEST_ROWS[cohort], ...parseParticipants(csvPath)];
    console.log(`${cohort}: ${rows.length - 1} participants parsed from CSV (+1 test account)`);
    for (const { name, email, phone } of rows) {
      const res = await Participant.updateOne(
        { event: event._id, email },
        {
          $setOnInsert: {
            event: event._id,
            name,
            email,
            phone: normalizePhone(phone),
            stack: cohort,
            status: "PENDING",
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) created++;
    }
  }

  const counts = await Participant.aggregate([
    { $match: { event: event._id } },
    { $group: { _id: "$stack", n: { $sum: 1 } } },
  ]);
  console.log(`participants created this run: ${created}`);
  for (const c of counts) console.log(`  ${c._id}: ${c.n}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
