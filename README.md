# IEMS — Igire Rwanda Event Management System

Event registration, ticketing, and QR check-in platform for Igire Rwanda Organization, built with Next.js 16 (App Router, React 19), MongoDB/Mongoose, Nodemailer (Gmail), and Cloudinary.

## How it works

- **Participants** are pre-registered (name, email, phone, stack/cohort). They enter their email at `/verify`, receive a magic link (30-min, single-use), verify, add a photo, and get a QR-code ticket by email and on their `/dashboard`. Sessions use a short-lived access token plus a rotating httpOnly refresh cookie.
- **Plus-ones** — each participant may bring exactly one. The participant either fills the plus-one's details on the dashboard, or shares an invite link (`/plus-one/<token>`, 72h) for the guest to complete themselves. The plus-one gets their own pass after verifying and adding a photo.
- **Guests** are added directly by an admin (VIP, speaker, sponsor, media, partner, general) and get a ticket immediately.
- **Staff** sign in with Google at `/admin` — there are no passwords. Sign-in is restricted to the organisation's Google Workspace domain, and the session is an httpOnly cookie (nothing is kept in localStorage). The address in `ROOT_ADMIN_EMAIL` is always `ADMIN`; everyone else starts as `STAFF` and is promoted from inside the console. Roles are `ADMIN`, `CEO`, `FACILITATOR`, `ACADEMIC`, `STAFF`, and each route checks a capability rather than a role name.
- **Signing in also connects your calendar.** The same consent covers Google Calendar, so your real commitments appear on your schedule and nobody can book you when you are already busy.
- **Gate check-in** happens at `/scan`. Scanning is a duty an administrator grants to a staff account, so whoever works the door signs in as themselves and every check-in is attributed to a real person. Every ticket admits once; the claim is atomic and every scan is logged.
- **Booking** — staff can publish a `/book/<slug>` page. Free slots are computed from their weekly hours minus their live Google free/busy, and a confirmed booking creates a Google Meet link on the host's calendar.
- **Audit log** — every write and every auth event is recorded with who, what, when and from where, readable at `/admin/audit`.

## Roles at a glance

| Role | Auth | Where | Session |
| --- | --- | --- | --- |
| Participant / plus-one | Passwordless magic link | `/verify` → `/dashboard` | 15-min access token in memory + rotating httpOnly refresh cookie |
| Staff (`ADMIN`, `CEO`, `FACILITATOR`, `ACADEMIC`, `STAFF`) | Google sign-in, domain-restricted | `/admin` | Short-lived httpOnly access cookie + rotating httpOnly refresh cookie |

Nothing is stored in `localStorage`. Google `id_token`s are verified against Google's JWKS (issuer + audience + Workspace domain) before a session is opened.

## Setup

1. Copy `.env.example` to `.env.local` and fill in **every** required value (the seed refuses to run with unset or `change-me` secrets):
   - `MONGODB_URI` — e.g. `mongodb://localhost:27017/iems`
   - `JWT_SECRET` — `openssl rand -hex 32` (≥32 chars, required)
   - `SMTP_HOST` / `SMTP_PORT` and either `MAIL_ACCOUNTS` (a JSON array of senders) or `GMAIL_USER` / `GMAIL_APP_PASSWORD` — see `.env.example`
   - `CLOUDINARY_*` — from your Cloudinary dashboard
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_SIGNIN_REDIRECT_URI` / `GOOGLE_TOKEN_KEY` — staff sign-in and calendar; see [docs/google-calendar.md](docs/google-calendar.md)
   - `ALLOWED_SIGNIN_DOMAIN` / `ROOT_ADMIN_EMAIL` — who may sign in, and who is the administrator
   - `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` — only used by `pnpm seed` to create a bootstrap record; staff sign in with Google
2. Start MongoDB, e.g. `podman run -d --name iems-mongo -p 27017:27017 docker.io/library/mongo:7`
3. Install and seed:

```bash
pnpm install
pnpm seed     # bootstrap admin record, the seeded event, and pre-registered participants
pnpm dev
```

Scripts: `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm test` · `pnpm seed` · `pnpm health`.

## Deployment note (important)

IEMS is currently a **single-instance** application. The live scan feed, admin notifications, the auth rate limiter, and the public-events cache all live in-process (`globalThis`). Running more than one instance behind a load balancer will drop live updates and weaken rate limiting. See `docs/` for the path to horizontal scale (Redis-backed pub/sub + shared cache/limiter).

## Integrating the calendar into another site

The organisation's calendar is available as a versioned, key-authenticated feed:

```bash
curl -H "x-api-key: iro_live_..." \
  "https://events.igirerwanda.org/api/v1/calendar?from=2026-09-01&to=2026-12-31"
```

It returns published events **and** the staff sessions someone marked public, in one
chronological list. `kind` distinguishes them: `EVENT` is a ticketed event with a price,
capacity and a page to link to; `ACTIVITY` is a class, mentorship slot or office hours with
a `host` and nothing to register for. Sessions left at the default `ORG` visibility never
appear.

`/docs` is not linked from the public site — it is an internal handout. Staff open it from
**API keys** in the console and send the URL to an integrator, who uses the form there to
request access. The key is then issued by an administrator under the same screen. They are read-only, rate limited per key,
and stored only as a hash — a lost key is revoked and reissued, never recovered.

`/api/events` stays anonymous and unversioned: the marketing site renders itself with it,
and its shape follows whatever that page needs.

## Key paths

| Path | Purpose |
| --- | --- |
| `src/models/` | Mongoose schemas: `Admin`, `Event`, `Participant`, `Guest`, `Ticket`, `Scanner`, `ScanLog`, `Notification`, `VerificationToken`, `RefreshToken`, `Counter`, `HealthSample` |
| `src/app/api/` | Route handlers (`auth`, `me`, `plus-one`, `scan`, `scanner`, `tickets`, `events`, `admin/*`) |
| `src/lib/` | db connection, JWT auth, session/refresh tokens, mailer, Cloudinary, QR, ticket issuance, SSE bus |
| `src/proxy.ts` | Edge rate limiter for auth/login endpoints |
| `scripts/seed.ts` | Idempotent seed (participants parsed from cohort CSVs) |
| `/verify`, `/dashboard`, `/ticket/[code]` | Participant flow |
| `/admin`, `/admin/*` | Admin panel |
| `/scan` | Gate check-in |

## Review & release docs

A full production-readiness assessment lives in [`docs/`](docs/README.md): system assessment, security, performance, UI/UX, technical debt, the release-readiness checklist, the changelog, and the post-v1 roadmap.
