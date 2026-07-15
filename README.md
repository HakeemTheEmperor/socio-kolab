# Club Portal

A **multi-club** web portal for student clubs — member management, dues tracking
(record-keeping only, no payment processing), and events with RSVP + attendance.

Each club lives under its own slug (`/adrian-tech/dashboard`). Accounts are
platform-level: one sign-in reaches every club you belong to, and one person can
be a member of several clubs. Anyone can request a new club; a platform admin
approves it.

See [SPEC.md](./SPEC.md) for the base specification, [MULTI-CLUB.md](./MULTI-CLUB.md)
for the multi-club design, and [DECISIONS.md](./DECISIONS.md) for design decisions
and deviations.

## URL structure

| Route | Who |
|---|---|
| `/login` | Everyone. Global — accounts are not per-club. |
| `/clubs` | Signed in. Your clubs. Auto-forwards if you have exactly one and nothing pending. |
| `/clubs/new` | Signed in. Request a new club. |
| `/admin` | Platform admins only (404 for everyone else). Approve, reject, suspend clubs. |
| `/{clubSlug}/register` | Public. Apply to that club. |
| `/{clubSlug}/events/{id}/register` | Public. Register for that event (see below). |
| `/{clubSlug}/dashboard`, `/members`, `/dues`, `/events`, `/settings`, `/profile` | Members of that club, with an ACTIVE membership. |

Every request re-resolves the club from the slug and verifies the caller's
membership server-side ([`src/lib/club-context.ts`](./src/lib/club-context.ts)).
An id from one club never resolves under another club's slug — it 404s.

## Club lifecycle

A club is `PENDING` → `ACTIVE` → (optionally) `SUSPENDED`, or `PENDING` →
`REJECTED`.

- **Request** (`/clubs/new`): any signed-in user submits a name, slug and
  description. The club is created `PENDING`, and the requester gets a PRESIDENT
  membership straight away — dormant, because a `PENDING` club 404s for everyone,
  its president included.
- **Approve** (`/admin`): the club goes `ACTIVE` and is instantly live at its
  slug; its requester can walk in as president.
- **Reject**: the club goes `REJECTED` and stays invisible.
- **Suspend / reactivate** (`/admin`): a reversible off-switch. A suspended club's
  URLs 404 for all its members. Nothing is deleted.

`PENDING`, `REJECTED`, `SUSPENDED` and never-existed slugs are all the same 404 —
the public can't probe which club names exist.

## Membership applications ("off season" toggle)

Each club's settings carry `membershipOpen` (default `true`), toggled by its
president at `/{clubSlug}/settings` ("Accept new membership applications"):

- **On** — `/{clubSlug}/register` shows the application form. A new visitor
  creates an account; someone already signed in just adds a membership (no second
  account) and appears in that club's pending approvals.
- **Off** — the register page shows "Applications are currently closed", and the
  server actions reject submissions too, so a stale tab or a hand-built POST gets
  nowhere.

Exec manual-add and the CSV importer ignore the toggle by design — it gates
self-service applications, not the club's own roster management.

## Event registration forms

Any event can carry a **custom registration form** that anyone — members,
signed-in non-members, and anonymous visitors — fills in through a public link
clubs share (e.g. on WhatsApp). Members and guests land in the same attendance
list, and execs get a responses table and a CSV export.

**Building the form (exec).** In the create/edit event dialog, a drag-and-drop
"Registration form" builder adds up to 20 custom fields of five types — short
text, paragraph, number, checkbox, dropdown. Fields reorder by mouse or keyboard,
rename inline, and toggle required; the schema saves atomically with the event.
Name and email are always collected and can't be removed. Each field keeps an
immutable id, so responses stay readable when a field is later renamed or deleted
(a deleted field's answers are retained and shown as "(removed field)").

**Intake toggle.** An "Accepting responses" switch (in the builder and the event
header) opens or closes the form instantly, without touching the schema or any
collected responses.

**Registering (public).** `/{clubSlug}/events/{id}/register` needs no login and
renders in the club's theme:

- an **ACTIVE member** of the club has their name and email locked to their
  account;
- anyone else **signed in** is prefilled from their account as a guest;
- an **anonymous** visitor fills everything in.

If intake is closed, or the event is in the past, the page shows a "no longer
accepting responses" card with no form at all. Already-registered visitors see
their submitted answers instead of the form.

**The submit action is the boundary.** Every submission re-resolves the club and
event server-side, re-checks intake (a replayed or hand-built POST to a closed
form is rejected), validates answers against *that event's* schema (an unknown
field or an out-of-range dropdown value is refused, never stored), re-derives
whether the registrant is a member or a guest (a member's identity always wins),
and dedupes — one registration per member and one per guest email, backstopped by
database unique constraints.

**Reporting (exec).** The event page gains a **Responses** view: a count with the
member/guest split, a table (one column per field, plus any "(removed field)"
columns), and a **CSV export**. The CSV opens cleanly in Excel (UTF-8, Africa/Lagos
timestamps) and is formula-injection–safe — a value like `=1+1` exports inert.
Guests also appear in the check-in list with a "Guest" badge.

## Tech stack

- **Next.js 16** (App Router, TypeScript strict, Server Actions for all mutations)
- **PostgreSQL** + **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Auth.js (NextAuth v5)** — Credentials provider, JWT sessions, bcrypt hashing
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitives)
- **Zod** for all input validation

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database (Neon, Supabase, or local)

## Environment variables

Locally the app runs on two variables. Copy `.env.example` to `.env` and fill
them in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, used by the app at runtime. On Supabase, the **pooled** URL — see below. |
| `AUTH_SECRET` | Secret for Auth.js JWT/session signing. Generate with `npx auth secret` or `openssl rand -base64 32`. |

Two more exist for Supabase only. Leave them unset locally and nothing changes:

| Variable | Description |
|---|---|
| `IS_SUPABASE` | Set to `"true"` to switch the Prisma CLI over to `DIRECT_URL`. Unset, the CLI uses `DATABASE_URL`. |
| `DIRECT_URL` | Required when `IS_SUPABASE=true`: where migrations and seeds run. |

Supabase splits into two connection strings because the app and the Prisma CLI
want opposite things:

- **The app** (`DATABASE_URL`) wants a **pooler**. Serverless opens a connection
  per cold start, and a pooler is what survives that churn — the transaction
  pooler (port 6543) on Vercel/Netlify, the session pooler (5432) on a
  long-lived server. Supabase's direct connection is IPv6-only unless you buy
  the IPv4 add-on, so it usually can't be reached from Vercel at all.
- **Migrations** (`DIRECT_URL`) want a **real session**: they take advisory locks
  and run DDL. Pointed at the transaction pooler they hang on the lock rather
  than failing cleanly, so `prisma.config.ts` rejects a `DIRECT_URL` on port
  6543 outright.

```bash
cp .env.example .env
# then edit .env
```

## Setup

```bash
npm install            # also runs `prisma generate` (postinstall)
npm run db:migrate     # apply migrations to your database
npm run db:seed        # seed demo data (see credentials below)
npm run dev            # start the dev server at http://localhost:3000
```

To build for production:

```bash
npm run build
npm start
```

## Default seed credentials

`npm run db:seed` creates **two clubs** and a platform admin. All passwords are
`password123`.

| Account | Email | Notes |
|---|---|---|
| Platform admin | `admin@platform.test` | Holds no memberships. Sees `/admin`. |
| Demo Club president | `president@club.test` | `/demo-club` — applications **open** |
| Demo Club exec | `exec@club.test` | |
| Beta Club president | `president@beta.test` | `/beta-club` — applications **closed** |
| Beta Club exec | `exec@beta.test` | |
| Member of **both** clubs | `ada.obi@club.test` | Exercises the club switcher |
| Member of Demo Club **only** | `chidi.okafor@club.test` | Exercises club isolation |
| Other members | `<first.last>@club.test` | |
| Awaiting approval | `tunde.alabi@club.test`, `rita.okon@club.test` | PENDING memberships |

Each club gets its own departments, committees, dues amount and events; dues are
recorded for ~60% of active members for the current period (`2026/2027`), with 2
upcoming + 1 past event, RSVPs and check-ins.

Signing in as a user with exactly one club (e.g. the Demo Club president) forwards
straight to that club's dashboard; `ada.obi@club.test` lands on `/clubs` and picks.

> The seed clears existing data first for a deterministic dataset — do not run it
> against a database with real data.

## Bulk-importing members (CSV)

Import members from a CSV with header `name,email,phone,department,level`. The
club is named by slug and is **required** — there is no "current" club:

```bash
npm run import:members -- --club <slug> path/to/members.csv [defaultPassword]
```

- Creates `User` + `Membership` (ACTIVE) rows in that club.
- Each imported user is flagged `mustChangePassword` and must change their
  password on first login (they see a banner prompting them to).
- `defaultPassword` is optional (defaults to `changeme123`).
- Existing emails are skipped, so re-running is safe. An existing user simply
  gains a membership in the named club.
- Works whether or not the club's applications toggle is on — importing is roster
  management, not a self-service application.

A sample file is provided at [`scripts/members.sample.csv`](./scripts/members.sample.csv):

```bash
npm run import:members -- --club demo-club scripts/members.sample.csv
```

## Deployment (Vercel + Supabase)

1. Push to a Git repository and import the project into Vercel.
2. In Supabase, open **Connect** and copy both connection strings.
3. Set these in the Vercel project's environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | **Transaction pooler** (port 6543) — what the app connects through |
   | `DIRECT_URL` | **Direct connection** (port 5432) — migrations only |
   | `IS_SUPABASE` | `true` |
   | `AUTH_SECRET` | `npx auth secret` |

4. Deploy. `postinstall` runs `prisma generate`; run `npm run db:deploy`
   (`prisma migrate deploy`) against the production database as part of your
   release process — with `IS_SUPABASE=true` it goes through `DIRECT_URL`
   automatically.

Running migrations from your own machine against production works the same way:
set `IS_SUPABASE`, `DATABASE_URL` and `DIRECT_URL` in the shell, then
`npm run db:deploy`.

## npm scripts

| Script | Purpose |
|---|---|
| `dev` | Start the dev server |
| `build` / `start` | Production build / serve |
| `lint` | Run ESLint |
| `db:migrate` | Create + apply a migration (dev) |
| `db:deploy` | Apply migrations (production) |
| `db:seed` | Seed demo data |
| `db:reset` | Reset the database and re-run migrations + seed |
| `db:generate` | Regenerate the Prisma client |
| `import:members` | Bulk-import members from CSV |

## Project structure

```
prisma/
  schema.prisma        # data model (SPEC §4, MULTI-CLUB §1)
  seed.ts              # two-club demo seed + platform admin
scripts/
  import-members.ts    # CSV importer (--club <slug>)
src/
  auth.config.ts       # edge-safe Auth.js config (used by proxy)
  auth.ts              # Auth.js instance (Credentials + Prisma + bcrypt)
  proxy.ts             # route protection (Next 16 middleware)
  app/
    (public)/
      login/           # global sign-in
      clubs/           # club switcher + /clubs/new (request a club)
    admin/             # platform admin (club lifecycle only)
    [clubSlug]/
      register/        # public, club-scoped application
      (public)/
        events/[id]/register/   # public event registration form + submit action
      (member)/        # ACTIVE membership required (gated layout + nav shell)
        dashboard/ members/ dues/ settings/ profile/
        events/        # list, detail (RSVP / responses / check-in), form builder
          [id]/responses/       # CSV export route handler
  lib/
    prisma.ts          # Prisma client (pg driver adapter)
    club-context.ts    # getClubBySlug / requireClubAccess / cross-club guards
    club.ts            # club settings parsing
    admin.ts           # requirePlatformAdmin
    slug.ts            # validateSlug / slugify (+ reserved slugs)
    permissions.ts     # can(membership, action) — SPEC §5 matrix
    format.ts          # currency (₦) + Africa/Lagos date formatting
    event-forms.ts     # form schema + response validation (builder + submit)
    event-responses.ts # response columns + CSV serialisation
    validations/       # Zod schemas
  components/ui/       # shadcn/ui components
```

## Notes

- **Prisma 7**: the client is generated to `src/generated/prisma` (gitignored,
  regenerated on `postinstall`) and imported via `@/generated/prisma/client`.
  The connection URL lives in `prisma.config.ts` for the CLI and is passed to
  `PrismaClient` via the `@prisma/adapter-pg` driver adapter at runtime.
- **Authorization is the boundary, not id obscurity.** All mutations are Server
  Actions taking `clubSlug` as their first argument; each re-resolves the club
  and the caller's membership server-side, then checks `can()`. The slug from the
  client is never trusted, and client-side role checks never are either.
- **Cross-club queries are compound.** Any resource fetched by id filters on the
  id *and* the club in the same query, so an event or membership id from one club
  simply doesn't resolve under another's slug.
- Currency is formatted with the club's currency setting; dates display in the
  `Africa/Lagos` timezone.
