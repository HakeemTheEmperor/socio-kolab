# Club Portal

A web portal for managing a single student club — member management, dues
tracking (record-keeping only, no payment processing), and events with RSVP +
attendance. Built multi-tenant-ready but single-tenant-deployed: every domain
row carries a `clubId` and all queries are scoped through a `getCurrentClub()`
helper.

See [SPEC.md](./SPEC.md) for the full specification and [DECISIONS.md](./DECISIONS.md)
for design decisions and deviations.

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

`npm run db:seed` creates a **Demo Club** and these accounts (all password
`password123`):

| Role | Email |
|---|---|
| President | `president@club.test` |
| Exec | `kunle.exec@club.test` |
| Members (×10) | `<first.last>@club.test` (e.g. `ada.obi@club.test`) |
| Pending (×2) | `tunde.alabi@club.test`, `rita.okon@club.test` |

The seed also records dues for ~60% of active members for the current period
(`2026/2027`) and creates 2 upcoming + 1 past event with RSVPs and check-ins.

> The seed clears existing data first for a deterministic dataset — do not run it
> against a database with real data.

## Bulk-importing members (CSV)

Import members from a CSV with header `name,email,phone,department,level`:

```bash
npm run import:members -- path/to/members.csv [defaultPassword]
```

- Creates `User` + `Membership` (ACTIVE) rows scoped to the seeded club.
- Each imported user is flagged `mustChangePassword` and must change their
  password on first login (they see a banner prompting them to).
- `defaultPassword` is optional (defaults to `changeme123`).
- Existing emails are skipped, so re-running is safe.

A sample file is provided at [`scripts/members.sample.csv`](./scripts/members.sample.csv):

```bash
npm run import:members -- scripts/members.sample.csv
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
  schema.prisma        # data model (SPEC §4)
  seed.ts              # demo seed (SPEC §7)
scripts/
  import-members.ts    # CSV importer (SPEC §7)
src/
  auth.config.ts       # edge-safe Auth.js config (used by proxy)
  auth.ts              # Auth.js instance (Credentials + Prisma + bcrypt)
  proxy.ts             # route protection (Next 16 middleware)
  app/
    login/ register/   # auth pages
    (app)/             # authenticated area (gated layout + nav shell)
      dashboard/ members/ dues/ events/ settings/ profile/
  lib/
    prisma.ts          # Prisma client (pg driver adapter)
    club.ts            # getCurrentClub / settings
    session.ts         # getCurrentMembership / requireMembership
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
- All mutations are **Server Actions** that start with a session → membership →
  role check via `can()`; client-side role checks are never trusted.
- Currency is formatted with the club's currency setting; dates display in the
  `Africa/Lagos` timezone.
