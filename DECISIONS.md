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

## Multi-club step 1 — Schema, slugs, seed

### Club lifecycle on the schema
- `Club.slug` is `@unique` and carries no separate index: Postgres backs the
  unique constraint with one, and slug lookup is the hot path.
- `Club.requestedById` is a plain `String?`, not a relation, exactly as
  `MULTI-CLUB.md` §1 writes it. A back-relation on `User` would buy nothing —
  the field is informational (shown to the admin on the approval screen) and is
  never traversed as a relation.
- `Club.status` defaults to `PENDING`, so a club created by any path that
  forgets to set it is invisible (404) rather than accidentally live.
- `settings.membershipOpen` lives in the settings JSON (§1), defaulting to
  `true` in `getClubSettings`, so clubs seeded or created before the toggle
  existed accept applications rather than silently rejecting them.

### The migration backfills, it does not assume an empty database
- `slug` is added nullable, backfilled from `name` (lowercased,
  non-alphanumeric runs collapsed to hyphens, trimmed to 30 chars), then made
  `NOT NULL` + `UNIQUE`. Adding it as `NOT NULL` outright would fail on any
  database that already has the seed club.
- The backfill handles the two edge cases the unique index would otherwise trip
  on: a name that collapses to fewer than 3 characters falls back to
  `club-<id prefix>`, and clubs that derive the same slug get a numeric suffix
  (oldest keeps the bare slug).
- Pre-existing clubs predate the approval flow, so the backfill sets them
  `ACTIVE` with `approvedAt = createdAt`.

### Slug rules (`lib/slug.ts`)
- One regex — `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` — enforces the charset and rules
  out leading, trailing, and doubled hyphens, rather than four separate checks.
- `validateSlug` returns `{ ok: false, error }` instead of throwing: every call
  site (the live-validation server action, the create form) wants to *show* the
  reason, not catch an exception.
- `slugify` is a suggestion helper only. It can return a string that
  `validateSlug` rejects (e.g. `slugify("***") === ""`), and the caller is
  expected to validate anyway — server-side validation is the boundary, and a
  prefill that quietly rewrote itself into something valid-but-surprising would
  be worse than an empty field.

### Seed
- Two ACTIVE clubs: **Demo Club** (`demo-club`, applications open, dues ₦2,000)
  and **Beta Club** (`beta-club`, applications closed, dues ₦3,500, different
  departments/committees) — the closed club is what exercises §5's toggle.
- Users are keyed by **email**, so listing the same person in both clubs gives
  them one account and two memberships. `ada.obi@club.test` is in both clubs
  (exercises the switcher); `chidi.okafor@club.test` is in Demo Club only
  (exercises cross-club isolation).
- The memorable logins are preserved and extended:
  `president@club.test` / `exec@club.test` for Demo Club,
  `president@beta.test` / `exec@beta.test` for Beta Club,
  `admin@platform.test` for the platform admin (no memberships), all
  `password123`.

### Interim state
- `getCurrentClub()` is now `@deprecated` and resolves the **oldest ACTIVE**
  club rather than `findFirst()` with no ordering. Step 2 replaces it with
  slug-based resolution; until then, the ordering keeps the still-single-club
  pages deterministically pointed at Demo Club now that two club rows exist.

## Multi-club step 2 — Routing restructure

### Route tree
- `app/[clubSlug]/(member)/…` holds every authenticated club page; `(public)/`
  holds `/login` and `/clubs`; `/{clubSlug}/register` sits outside `(member)`
  because it must be reachable *without* a membership.
- `/login` is global (accounts are platform-level) and no longer names a club.
  Its "Register" link is gone: you don't join "the portal", you join a specific
  club via that club's own registration link.

### Guards (`lib/club-context.ts`)
- `getClubBySlug` resolves only `status: ACTIVE` clubs and calls `notFound()`
  otherwise, so PENDING / REJECTED / SUSPENDED / nonexistent slugs are one
  indistinguishable 404.
- `requireMembership(clubId, minRole?)` redirects a logged-out caller to
  `/login`, and a caller with no ACTIVE membership to `/clubs?error=…`, which
  renders the reason. `minRole` is a hard gate (404). The friendly role checks
  stay with `can()`, which lets a page redirect and an action return a message
  instead of dead-ending on a 404.
- `requireClubAccess(slug, minRole?)` is the workhorse both pages and actions
  call: one function returns the club and the caller's membership in it. Both
  lookups are `cache()`d, so a layout + page + action in one request share them.
- The guards live in the **layout**, so cross-club access is denied before any
  page renders. Verified against a running server: a Demo Club president asking
  for `/beta-club/dashboard` gets `307 → /clubs?error=no-membership`, and an
  unknown slug gets a real `404`.

### Server actions take the club slug as their first argument
- Every action is now `action(clubSlug, …)` and re-resolves the club and the
  caller's membership server-side. The slug is not a trusted input: it is
  resolved through `getClubBySlug` + `requireClubAccess` exactly like a page, so
  passing another club's slug just fails that club's membership check.
- Client components read the slug from `useParams()` rather than accepting it as
  a prop. It is already in the URL, so prop-drilling it through every dialog and
  button would add a parameter that could drift from the route.

### Status codes under `loading.tsx`
- `notFound()` / `redirect()` *inside a page* now commit a **200** with the
  not-found (or redirected) UI, not a 404/307: each route has a `loading.tsx`,
  whose Suspense boundary flushes the shell before the page body runs, and the
  status is already sent by then. No data leaks — the page component throws
  before rendering anything — but MULTI-CLUB §8 wants the *response* to be 404.
  Guards that live in the layout (unknown club, non-member) are unaffected and
  return true 404/307. Making the in-page cases return real status codes is
  step 3's job, where the cross-club resource guard is the whole point.

### Interim
- `/clubs` exists in a minimal form (list memberships, ACTIVE ones link to their
  dashboard) because `requireMembership` needs somewhere to send people. Step 4
  adds the auto-forward, the empty state, "Start a new club", and the header
  switcher.
- `scripts/import-members.ts` gained its `--club <slug>` argument here rather
  than in step 6, because the single-club lookup it used (`club.findFirst()`)
  died with `getCurrentClub`.

## Multi-club step 3 — Cross-club audit

### The rule
Every fetch of a sub-resource by id filters on the id **and** the club in the
same query. `findUnique({ where: { id } })` followed by an `if (row.clubId !==
club.id)` is one forgotten `if` away from a leak, so the pattern is gone from the
codebase: `lib/club-context.ts` exposes `findEventInClub` / `findMemberInClub`
(returning null — server actions turn that into "not found") and
`requireEventInClub` / `requireMemberInClub` (404ing — pages and layouts). Writes
re-assert the club in the same statement (`update({ where: { id, clubId } })`,
Prisma's extended where-unique) rather than trusting the preceding read.

The only surviving `findUnique` on a club-scoped model is the membership lookup
in `club-context.ts`, keyed on `clubId_userId` — already compound.

### Real 404s: why the guard lives in a layout, and why two `loading.tsx` files died
`notFound()` from inside a *page* cannot set the response status: the nearest
Suspense boundary has already flushed the shell, so the response is committed as
200 and the 404 only lands on the client. MULTI-CLUB §8 wants the *response* to
be a 404 for a cross-club id, so:

- `events/[id]/layout.tsx` and `members/[id]/layout.tsx` resolve the resource
  before their segment renders. A layout sits *above* its own segment's
  `loading.tsx`, so it runs before anything is flushed.
- But a parent segment's `loading.tsx` wraps its nested segments too — so
  `events/loading.tsx` and `members/loading.tsx` were flushing the shell before
  the `[id]` layouts ran, which is exactly what made the first attempt at this
  return 200. They are replaced by a `<Suspense fallback={<ListSkeleton />}>`
  *inside* `events/page.tsx` and `members/page.tsx`, which bounds only the page's
  own data fetch. The skeletons are unchanged; the detail routes keep their
  `loading.tsx` (those sit below the guard and are harmless).

Leaf routes with no nested resources (`dashboard`, `dues`, `profile`,
`settings`) keep their route-level `loading.tsx`. The role gate on `/dues` and
`/settings` still `redirect()`s from inside the page, so it commits a 200 and
redirects on the client — no data is rendered (the component throws first) and
no acceptance criterion covers it, so it stays as it was.

### Verified against a running server
- Demo president: Beta's event id and Beta's membership id under `/demo-club/…`
  both **404**; Demo's own ids still **200**. Beta president: mirror image.
- Beta president invoking `approveMember("beta-club", <Demo pending id>)` over
  the real server-action endpoint gets `{"ok":false,"error":"Member not found."}`
  and the Demo member is still `PENDING` afterwards. Pointing the same action at
  `"demo-club"` instead redirects (303) — he has no membership there.
- Positive control: the same action against Beta's own pending member returns
  `{"ok":true}` and flips the status, so the guard denies rather than the action
  being broken.

## Multi-club step 4 — The club switcher (/clubs)

### Auto-forward, except when we owe the user an explanation
§3 says: exactly one ACTIVE membership and no PENDING ones → skip the page and
go straight to that club's dashboard. Implemented, with one carve-out the spec
doesn't cover: **no auto-forward when `/clubs` was reached with an `?error=`**.
`requireClubAccess` sends people here precisely to tell them something ("you're
not a member of that club"), and a single-club user would otherwise be bounced
onward instantly with the message dropped — they'd click a club B link and
silently land on club A's dashboard with no idea why. One extra click beats a
silent redirect.

### Membership status drives the card, not the club
Cards show the club's initial (or `logoUrl` when set), name, the user's role,
and their membership status. Only ACTIVE memberships link anywhere; a PENDING
one renders as an unclickable card reading "Awaiting approval by a club exec",
which is where the old in-club "awaiting approval" screen (deleted in step 2)
now lives.

`logoUrl` is rendered with a plain `<img>`, not `next/image`: club logos are
arbitrary external URLs and `next/image` would need every host allow-listed in
`next.config`.

### The switcher affordance is the club name
In the club header the club name now links to `/clubs` (with a chevron and a
"Switch club" label), rather than to its own dashboard — the nav row directly
below already has a Dashboard link, so pointing it there was a wasted target.

### /clubs/new is linked but not built
The "Start a new club" link (empty state and page footer) 404s until step 6
builds `/clubs/new`. That is the build order's own sequencing, not an oversight.

### Verified against a running server
Auto-forward (`/clubs` → 307 → `/demo-club/dashboard`) for the single-club
president; no forward and both cards for the dual-club user; the PENDING-only
user sees the awaiting-approval card with no dashboard link (and the club still
refuses them); the platform admin, with no memberships, gets the empty state.

## Multi-club step 5 — Club-scoped registration & the applications toggle

### Two actions, not one form with a branch
`/{clubSlug}/register` renders one of four states, chosen server-side:
applications closed; signed out (create an account + a PENDING membership);
signed in and already on this club's books (a message, no form); signed in and
new to this club (profile fields only — "Apply to join").

The signed-in path is a separate action (`joinClubAction`) rather than a flag on
`registerAction`. They authenticate differently — one *creates* the identity, the
other *reads* it from the session — and folding both into one action would mean a
code path where `name`/`email`/`password` are sometimes present and sometimes
must be ignored. An existing user applying to a second club never sends account
fields at all, so they cannot be used to overwrite the account they're signed in
with.

### The toggle is enforced in the action, not the page
`settings.membershipOpen` gates both actions through one helper
(`clubAcceptingApplications`), which also re-resolves the club by slug. Hiding
the form is presentation; a stale tab, a replayed form, or a hand-built POST must
still be refused. Verified by doing exactly that (see below).

Exec manual-add and the CSV import deliberately ignore the toggle — it gates
self-service applications, not the club's own roster management.

### One membership per (club, user), no re-applying
An existing membership in this club — ACTIVE, PENDING, INACTIVE, or ALUMNI —
blocks a new application (the DB's `@@unique([clubId, userId])` says the same
thing). Re-applying must not be a way to launder a rejected or alumni membership
back into PENDING; that decision belongs to an exec.

### `registerSchema` still owns the account fields
The signed-in path validates with a separate `joinClubSchema` (phone,
department, level). Reusing `registerSchema` with the account fields made
optional would have weakened the sign-up path's guarantees to serve the join path.

### Verified against a running server
- Beta Club (seeded closed) shows "Applications are currently closed", club name
  and logo, no form; Demo Club still shows the form.
- Flipping the switch through the real `updateSettings` action opens the register
  page immediately; flipping it back closes it.
- **Server-side rejection, no UI involved:** a hand-built POST that replays Demo's
  registration form with the bound club slug forged to `beta-club` is refused —
  "Beta Club is not accepting new members right now." — and no user row is
  created. The identical replay against open Demo Club *succeeds* (PENDING
  membership created), so the guard denies rather than the action being broken.
  The same holds for `joinClubAction` submitted from a stale open form.
- **Second club, one account:** `chidi.okafor@club.test` (Demo only) applies to
  open Beta from a signed-in session → Beta gains a PENDING membership, the user
  count does not change, and he appears in Beta's pending approvals.
- **Duplicate guard:** he then sees "awaiting approval" instead of a form, and
  submitting a valid join form captured from another user's session under his
  own cookie returns "You already have a membership in Beta Club."

## Multi-club step 6 — Club requests (/clubs/new) and platform admin (/admin)

### The president's membership is created with the club, not with the approval
`requestClub` writes the club (PENDING) *and* an ACTIVE PRESIDENT membership for
the requester in one create. The membership is harmless while it waits: a PENDING
club 404s for everyone via `getClubBySlug`, its president included. Approval is
then a single status flip rather than a second write (club + membership) that
could half-fail and leave a live club with no president.

### Slug availability is checked twice on purpose
The live check (`checkSlug`, called from the form) is advisory. `requestClub`
re-validates format and relies on the unique index to settle races — two people
can be typing the same slug at the same time, and the DB is the only thing that
can actually arbitrate. A slug is taken whatever the club's status: a rejected or
suspended club still owns its URL.

### Admins manage lifecycle, never club contents
`src/app/admin/actions.ts` exposes exactly four transitions —
PENDING→ACTIVE (with `approvedAt`), PENDING→REJECTED, ACTIVE→SUSPENDED,
SUSPENDED→ACTIVE — through one `transition()` helper that refuses any other
move. There is deliberately no admin action that touches a club's members, dues,
events, or settings.

Reactivating keeps the original `approvedAt`: it records when the club was first
approved, not the last time an admin toggled it.

### The admin guard 404s, and lives in the actions too
`requirePlatformAdmin` (`lib/admin.ts`) calls `notFound()` for signed-out users
and ordinary members alike — the app doesn't confirm that an admin area exists to
people who can't use it. It reads `isPlatformAdmin` from the database on every
call rather than trusting a claim in the JWT, so revoking admin takes effect at
once. Every admin action calls it: the page guard protects the page, not the
entry points, as verified by invoking `approveClub` directly as an ordinary member.

### /clubs shows PENDING clubs, and never forwards into one
The switcher now includes memberships whose club is PENDING, rendered as an
"Awaiting review by a platform admin" card. Auto-forward requires an ACTIVE
membership in an ACTIVE club and nothing else outstanding — otherwise a user with
one live club plus a club request would be forwarded past the page and never see
that their request exists. REJECTED and SUSPENDED clubs are omitted entirely: to
their members they are as gone as they are to the router.

### Verified against a running server
Ordinary member and signed-out visitor both get 404 at `/admin`; the admin gets
200. A member requests "Chess Society" → confirmation screen; while PENDING, its
dashboard and its public register page 404 *even for its own president*, and it
shows as an awaiting-review card on his `/clubs`. Reserved (`admin`, `login`),
malformed (`Bad Slug`, `ab`, `double--hyphen`) and duplicate (`demo-club`) slugs
are all refused. An ordinary member invoking `approveClub` directly is refused
and the club stays pending. The admin approves → the requester immediately reaches
`/chess-society/dashboard` and `/chess-society/settings` as PRESIDENT, and the
club's register page opens to the public. Suspend → both 404 again, for the
president too. Reactivate → live again.

## Multi-club step 7 — Docs and final click-through

### README
Rewritten around multi-club: the URL table (global `/login`, `/clubs`,
`/clubs/new`, `/admin`, `/{clubSlug}/…`), the club lifecycle
(PENDING → ACTIVE → SUSPENDED, or REJECTED, with all invisible states collapsing
to one 404), the applications toggle and what it does *not* gate (exec add, CSV
import), the two-club seed with its admin and switcher/isolation accounts, and the
importer's required `--club <slug>`.

### Final click-through (against a running server, on a freshly seeded database)
All of MULTI-CLUB §8, 21 checks, green:

- an unknown slug 404s (PENDING / REJECTED / SUSPENDED were each driven live in
  step 6 and share the single `getClubBySlug` gate);
- a Demo Club president asking for Beta's dashboard gets 307 → `/clubs`, and the
  response body contains no Beta data;
- a Beta event id and a Beta membership id both 404 under `/demo-club`, and vice
  versa;
- the dual-club user sees both clubs on `/clubs`; the single-club user is
  auto-forwarded to their dashboard;
- Beta (closed) shows the closed page with no form, Demo (open) shows the form;
- an existing member is told he's already a member instead of getting a form;
- `/admin` is 404 for a member and 200 for the admin, listing both clubs;
- `/clubs/new` is reachable when signed in.

The action-level equivalents (a club B exec invoking an action against a club A
resource; a forged POST at a club with applications closed; reserved, malformed
and duplicate slugs; approve/suspend/reactivate) were each driven live in steps
3, 5 and 6 respectively.

`next build` passes with zero TypeScript errors, and `npm run lint` is clean.

### CSV importer
Verified: it refuses a missing `--club`, refuses an unknown slug, and imports into
Beta Club *while Beta's applications are closed* — the toggle gates self-service
applications, not roster management.

## UI refactor step 1 — `lib/theme.ts`

### The accent contrast rule contradicted the default accent, so the floor moved
UI-REFACTOR §A5 blocks any accent scoring under **3.0:1** against the background,
but §A1's own default accent (amber `#F59E0B`) scores **2.05:1** against its own
default background (`#F8FAFC`). Taken literally, the platform default is a theme
the settings form would refuse to save — a president could not type the defaults
back in by hand.

Resolved (user's call) by splitting the rule rather than changing the colors:
- **Primary** keeps the hard `≥ 3.0` block. It carries links, icons and text drawn
  directly on the background, which is exactly what WCAG 1.4.11 is about. The
  spec's acceptance case (yellow `#FDE047` primary on white) is still blocked.
- **Accent** blocks only below `1.8`, and *warns* between 1.8 and 3.0. An accent is
  used as a filled chip or a tint, with text on top colored by `--accent-fg` (which
  is contrast-picked), so it does not need to be perceivable against the raw
  background the way primary does. The default amber therefore saves, with a
  non-blocking "avoid relying on it for text or icons" note.

### `validateTheme` puts blocking errors in `warnings` too
The spec fixes the signature as `{ ok, warnings }` with no separate `errors` array,
so blocking reasons are pushed into `warnings` and `ok: false` is what marks them
blocking. Callers show the list either way; only `ok` gates the save.

### Invalid colors degrade instead of throwing
`generateTheme` falls back to the platform default for any color it cannot parse: a
malformed hex hand-edited into a club's `settings` JSON should not 500 every page in
that club. `validateTheme` is the boundary that *rejects* bad input — it is the one
that runs on save.

### Tokens are lowercase hex; semantic hues are constants
Every token is normalized through `colord().toHex()` so `--primary-fg` (picked from
two fixed constants) cannot come out in a different case than the derived tokens.
Success/danger/warning/info base hues are frozen; only their tints are re-mixed
against the club background, so "Unpaid" is red on white and on near-black alike.

### Deps: `colord` + `vitest`
`colord` (~2kb, the spec's preferred option) with its `a11y` (WCAG luminance and
contrast) and `mix` plugins. The project had **no test runner** at all, so step 1's
"with unit tests" requirement adds **vitest** as a dev dependency (`npm test`).
26 tests cover: light background, dark background (red-on-black), the `--primary-fg`
flip in both directions, semantic constancy, tint re-mixing, invalid input, and each
validation branch.

### One environment note, not an app issue
Killing the Next dev server mid-write on Windows can leave `.next` corrupt; the
symptom is every route (including `/api/auth/*`) 404ing, or a Turbopack panic
(`0xc0000142`). `rm -rf .next` and restart. Production builds were unaffected
throughout.
