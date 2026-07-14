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

The app runs with only these two variables. Copy `.env.example` to `.env` and
fill them in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. For **Supabase**, use the direct (port 5432) connection for migrations, not the pooled one. |
| `AUTH_SECRET` | Secret for Auth.js JWT/session signing. Generate with `npx auth secret` or `openssl rand -base64 32`. |

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

## Deployment (Vercel)

1. Push to a Git repository and import the project into Vercel.
2. Set `DATABASE_URL` and `AUTH_SECRET` in the Vercel project's environment
   variables.
3. Deploy. `postinstall` runs `prisma generate`; run `npm run db:deploy`
   (`prisma migrate deploy`) against the production database as part of your
   release process.

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
      (member)/        # ACTIVE membership required (gated layout + nav shell)
        dashboard/ members/ dues/ events/ settings/ profile/
  lib/
    prisma.ts          # Prisma client (pg driver adapter)
    club-context.ts    # getClubBySlug / requireClubAccess / cross-club guards
    club.ts            # club settings parsing
    admin.ts           # requirePlatformAdmin
    slug.ts            # validateSlug / slugify (+ reserved slugs)
    permissions.ts     # can(membership, action) — SPEC §5 matrix
    format.ts          # currency (₦) + Africa/Lagos date formatting
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
