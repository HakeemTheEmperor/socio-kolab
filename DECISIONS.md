# Decisions

Choices made where SPEC.md left a decision open, or where reality diverged from
the spec's assumptions. Per the spec, the rule is "choose the simplest option
consistent with the conventions and note it here."

## Phase 1 — Scaffold, schema, seed

### Versions
- **Next.js 16** (latest stable), not 14. The spec's "Next.js 14+" is a minimum;
  the user confirmed they want the latest stable. This brings React 19, Tailwind
  v4, and Turbopack by default.
- **`src/` directory** layout (user preference). App code lives under `src/app`,
  shared code under `src/lib`, components under `src/components`.

### Prisma 7 specifics (differs from most tutorials)
- Prisma **7.8** uses the new **`prisma-client` generator**, which emits the
  client to `src/generated/prisma` (gitignored, regenerated on `postinstall`).
  Import it via `@/generated/prisma/client`, **not** `@prisma/client`.
- Prisma 7 **removed `url` from the datasource block**. The connection URL is
  configured in `prisma.config.ts` for the CLI (migrate/seed) and passed to
  `PrismaClient` at runtime via a **driver adapter**.
- Driver adapter: **`@prisma/adapter-pg`** (with `pg`). It works with any
  Postgres host (Neon, Supabase, local), so it satisfies the spec's
  "Neon or Supabase" requirement without host-specific code. See
  `src/lib/prisma.ts`.
- Seeding is configured in `prisma.config.ts` under `migrations.seed`
  (`tsx prisma/seed.ts`), the Prisma 7 location.

### Passwords / hashing
- **`bcryptjs`** (pure JS) instead of native `bcrypt`. The spec says "bcrypt
  hashing"; bcryptjs is API-compatible, needs no native build step, and deploys
  cleanly to Vercel. Cost factor 10.

### Forms
- The shadcn **`form`** component (react-hook-form based) is **not** used. The
  spec mandates Server Actions + server-side Zod for all mutations, so forms are
  plain `<form action={serverAction}>` with server-side validation. This avoids
  a client-side form library the spec doesn't call for.

### Seed data (SPEC §7)
- Departments: Computer Science, Electrical Engineering, Mechanical Engineering,
  Economics. Committees: Welfare, Publicity, Events. (Spec said "4 sample
  departments, 3 sample committees" without naming them.)
- All seeded accounts use password `password123`. President is
  `president@club.test`; other seeded emails are derived from names
  (e.g. `ada.obi@club.test`).
- "~60% of active members paid" is computed as `round(activeCount * 0.6)`.
- The seed **clears all tables first** for a deterministic dataset. This is a
  dev/demo convenience only; it does not reflect the app's runtime
  "immutable history / soft-delete" rules.

### CSV import (SPEC §7)
- `scripts/import-members.ts` scopes new members to the single seeded club via
  `club.findFirst()` (single-tenant v1). Default password `changeme123`
  (overridable as the 2nd CLI arg), `mustChangePassword=true`. Existing emails
  are skipped so re-runs are idempotent. A sample CSV lives at
  `scripts/members.sample.csv`.

### Misc
- `create-next-app` generated its own `CLAUDE.md` and `AGENTS.md`; left in place
  for now, to be reconciled with the project README in the Phase 7 polish pass.
