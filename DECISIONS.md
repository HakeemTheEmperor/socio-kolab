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

## Phase 4 — Dues (dashboard, record payment, CSV export)

### shadcn is on Base UI, not Radix
- The installed shadcn components are built on `@base-ui/react`, not Radix.
  Consequence: composition uses the `render` prop, not `asChild`
  (e.g. `<DialogTrigger render={<Button />}>`), and Select `onValueChange`
  yields `string | null`. Applies to all dialogs/menus in later phases too.

### Record vs. edit (immutable-history reconciliation)
- `DuesRecord` has `@@unique([membershipId, period])`, so there is at most one
  record per member per period. `recordPayment` therefore **upserts**: create =
  a new payment; update = a correction. On correction, `paidAt` (the original
  payment date) is preserved and `note` serves as the audit trail. This is the
  pragmatic reading of §3's "corrections create new records or update with an
  audit field" given the unique constraint (multiple rows per member/period
  aren't possible).

### Period selection + guard
- The dashboard shows ACTIVE members for a selected period (default: the club's
  `currentPeriod`). Period options are the current period plus any period that
  already has recorded history. `recordPayment` only accepts the current period
  or a period with existing history, preventing arbitrary period injection.
- Switching to a period with no records shows everyone Unpaid while preserving
  other periods' history — verified over HTTP (current: 8/12 paid; empty
  period: 0/12).

### Access + totals
- `/dues` is exec-only; non-exec sessions are redirected to `/dashboard`.
  `recordPayment` re-checks `can(me, "dues:record")` server-side.
- "Total collected" sums the selected period's records across the displayed
  ACTIVE members.

### CSV export
- Generated client-side (SPEC allows this): a Blob download of
  name/department/level/status/amount/date/method. Amounts are plain numbers
  (not currency-formatted) for clean spreadsheet parsing; dates use Africa/Lagos.

## Phase 5 — Events (CRUD, RSVP, check-in)

### Event times are interpreted as Africa/Lagos
- `datetime-local` inputs have no timezone. Since the display timezone is
  Africa/Lagos (a fixed UTC+01:00, no DST), the event schema parses input
  strings as Lagos wall-clock time (appends `+01:00`) so storage is correct
  regardless of the server timezone (UTC on Vercel). Edit dialogs round-trip via
  `toDateTimeLocal()`, which renders a stored Date back to Lagos wall time.

### RSVP / check-in rules
- RSVP is allowed only on **upcoming** events (rejected once `startsAt` has
  passed) and for any ACTIVE member; it upserts the Attendance row.
- Check-in (exec-only) can mark **any** ACTIVE member present, even one who
  never RSVP'd (creates the Attendance row); toggling off clears
  `checkedInAt`/`checkedInById`. The check-in list shows all ACTIVE members with
  RSVP'd members sorted to the top and a client-side name search.

### Delete cascades in the app layer
- The schema has no `onDelete: Cascade` on Attendance→Event, so `deleteEvent`
  removes attendance rows and the event together in a `$transaction`. Chosen
  over adding a cascade to avoid another migration; the effect is the same.

### Navigation
- Events is a nav link for everyone (RSVP is all-active). Create/Edit/Delete are
  exec-only (buttons gated by role and re-checked in the server actions).

## Phase 6 — Dashboard, settings, profile

### Dashboard
- Everyone sees: their dues status for the current period, the next 3 upcoming
  events with inline RSVP buttons (reusing the events `RsvpButtons`), and a
  profile summary. Execs additionally get four stat cards: active members,
  pending approvals (links to /members), % dues paid, and next-event RSVPs.
- "% dues paid" is computed over ACTIVE members
  (`paidActive / activeCount`) for the current period.

### Settings (president-only)
- `/settings` redirects non-presidents to /dashboard; `updateSettings`
  re-checks `can(settings:edit)`. It writes club name + the settings JSON and
  revalidates /dues, /members, /dashboard, /profile (all read settings).
- Departments and committees are edited with a reusable tag-style
  `ListEditor` (add via input/Enter, remove via chip ×); entries are
  de-duplicated on save.
- Verified end-to-end (acceptance #5): changing `currentPeriod` makes the dues
  dashboard show everyone unpaid for the new period (0/12) while the previous
  period's history is preserved (7/12).

### Profile
- Editing splits across tables in a transaction: `name` on User;
  `phone`/`department`/`level` on Membership. Department uses a Select seeded
  from club settings.
- `changePassword` verifies the current password (bcrypt), sets the new hash,
  and clears `mustChangePassword`.

### mustChangePassword: banner, not a hard gate
- Users flagged `mustChangePassword` (from CSV import) see a persistent banner
  in the app shell linking to /profile; the flag clears when they change their
  password. A hard redirect gate was avoided because the edge proxy has no DB
  access and a server layout can't reliably read the current path — the banner
  is the pragmatic v1 treatment.

## Phase 7 — Polish (responsive, loading/empty states, README)

### Responsive header
- The app shell header is two rows: brand + user/role/sign-out on top, and the
  primary nav below in a horizontally-scrollable strip (`overflow-x-auto`,
  `whitespace-nowrap`). This keeps all six links usable on phones without a
  hamburger menu.

### Loading states
- A `Skeleton` primitive (`components/ui/skeleton.tsx`) plus shared
  `ListSkeleton`/`DetailSkeleton` back a `loading.tsx` in each data route
  (dashboard, members, members/[id], dues, events, events/[id], settings,
  profile), satisfying §8's "loading states for every table/list". Empty states
  were already present on every list; audited and confirmed.

### Docs
- Replaced the create-next-app `README.md` with project docs (env vars, setup,
  migrate, seed, CSV import, default credentials, deploy, structure).
- Kept the generated `AGENTS.md` (its Next 16 warning is apt) and appended
  project-specific gotchas (Base UI vs Radix, Prisma 7 adapter, proxy, Auth.js
  split, Server-Action authorization). `CLAUDE.md` re-exports it.

### Lint clean-up (React Compiler rules)
- Next 16 ships the React Compiler and stricter `eslint-plugin-react-hooks`
  purity/immutability rules. Fixed the two flagged Server Components: the dues
  page now derives `paidCount`/`collected` via pure `filter`/`reduce` instead of
  mutating counters inside `map`, and the event detail page reads `new Date()`
  into a const rather than calling `Date.now()` inline. `npm run lint`,
  `tsc --noEmit`, and `next build` are all clean.
