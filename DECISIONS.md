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

## Phase 2 — Auth (register, login, session, pending gate)

### Config split for the edge
- Auth.js config is split per the official v5 pattern: `src/auth.config.ts` is
  edge-safe (no Prisma/bcrypt) and used by the proxy; `src/auth.ts` adds the
  Credentials provider (Prisma + bcrypt) and is used only by the Node handlers.

### `middleware.ts` → `proxy.ts`
- Next 16 deprecated the `middleware` filename in favour of `proxy`. The route
  protection lives in `src/proxy.ts` (same API, new convention).

### JWT carries identity only; authz resolved per request
- The JWT stores only the user id (`sub`). Role and status are **not** baked into
  the token — `getCurrentMembership()` loads them fresh from the DB on every
  request. This means an approval or role change takes effect immediately
  without forcing the user to log out and back in. The pending/inactive gate is
  therefore enforced in the authenticated `(app)` layout (a server component with
  DB access), not in the edge proxy (which can't reach the DB).

### Registration UX
- After a successful `/register`, the user is **auto signed-in** and lands on
  `/dashboard`, where the gate immediately shows the "awaiting approval" screen.
  This matches the spec's "PENDING members who log in see only the awaiting
  screen" without a separate static success page.

### `can()` requires ACTIVE
- `can()` returns false for any non-ACTIVE membership, so PENDING/INACTIVE/ALUMNI
  members can perform no privileged actions even if a code path is reached.
- INACTIVE and ALUMNI members who log in see a short "account not active" notice
  (spec only specified the PENDING screen; this is the simplest consistent
  treatment for the other non-active states).

### Route group
- Authenticated pages live under the `src/app/(app)/` route group so a single
  layout enforces the gate and renders the nav shell. Members/Dues/Events/
  Settings nav links are added as those pages land in later phases.

## Phase 3 — Members (directory, detail, approvals, status/role editing)

### Directory columns
- Everyone sees name / department / level / committee / status. Execs
  additionally see email, phone, and dues status. This reconciles the §5 matrix
  ("directory: name, dept, committee only") with the §6 table (which also lists
  level and status) — level and status are treated as non-sensitive; contact
  info and dues are exec-only.
- The directory table excludes PENDING members — they appear only in the
  exec-only "Pending approvals" section. The status filter therefore offers
  ACTIVE / INACTIVE / ALUMNI.

### Reject semantics
- "Reject" a pending applicant sets status to **INACTIVE** (soft), honouring
  §3's no-hard-delete rule. The `MemberStatus` enum is fixed by the spec (no
  REJECTED value), so INACTIVE is the closest soft outcome. A rejected/inactive
  user who logs in sees the "account not active" notice.

### Self-guards (lockout prevention)
- An exec/president cannot change their **own** status or role (the action
  rejects it and the UI disables those controls). This prevents an accidental
  self-lockout (e.g. the only president demoting themselves).

### Committee editing
- Editing a member's committee is gated the same as status (exec+). A submitted
  committee must be one of the club's configured committees (or empty to clear).

### Member detail authorization
- Full details (contact info, dues history, attendance history) render only for
  exec+ **or** the member viewing their own profile; everyone else gets a
  limited view (public profile fields only), per §5 "view full details: own
  only". Verified over HTTP: president→other = full, member→other = limited,
  member→self = full.

### Responsive tables
- Tables render as a bordered table on `md+` and collapse to a card list on
  small screens (SPEC §8). Rows navigate to the detail page via the name link
  (desktop) or a full-card link (mobile).

### Instant-apply edit controls
- Status/committee/role edits use shadcn Selects that call the server action on
  change (optimistic local state, revert + toast on failure) rather than a
  submit button — simpler than a dialog for single-field changes.
