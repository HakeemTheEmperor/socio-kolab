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

### Deps: `colord` + `vitest` (step 1)
`colord` (~2kb, the spec's preferred option) with its `a11y` (WCAG luminance and
contrast) and `mix` plugins. The project had **no test runner** at all, so step 1's
"with unit tests" requirement adds **vitest** as a dev dependency (`npm test`).
26 tests cover: light background, dark background (red-on-black), the `--primary-fg`
flip in both directions, semantic constancy, tint re-mixing, invalid input, and each
validation branch.

## UI refactor step 2 — Token injection and shadcn wiring

### Tailwind v4 has no config file, so the tokens live in `@theme`
§A4 says "extend the Tailwind config with `colors: {…}`". There is no
`tailwind.config.js` in this project — Tailwind v4 declares its scale in CSS. The
equivalent is an `@theme inline` block in `globals.css` mapping `--color-*` to the
generated tokens, which produces exactly the utilities the spec asks for
(`bg-primary`, `bg-surface`, `border-border`).

### shadcn's names keep their meaning; the club's accent becomes `brand-*`
The token names in §A2 collide with shadcn's, and two of the collisions are traps:
shadcn's `--accent` is its *hover/active surface* (used by 26 components) and its
`--muted` is a *surface*, not muted text. Re-pointing `bg-accent` at the club's
amber would have turned every dropdown hover amber.

So the mapping preserves shadcn's semantics and the club's accent is exposed under
a different **utility** prefix (the CSS variable is still `--accent`, per spec):

| shadcn variable | token | | club accent |
|---|---|---|---|
| `--background` | `--bg` | | `bg-brand` |
| `--card`, `--popover` | `--surface` | | `bg-brand-tint` |
| `--muted`, `--secondary`, `--accent` | `--surface-hover` | | `text-brand-fg` |
| `--muted-foreground` | `--text-muted` | | |
| `--destructive` | `--danger` | | |
| `--ring` | `--primary` (C3's focus-ring rule, for free) | | |

The payoff: the 93 existing `text-muted-foreground` and 33 `bg-muted` usages became
token-driven with no edit at all, which is most of the step-3 sweep already done.
`bg-accent` in a component still means "hover surface" and is correct as written.

### There is no `.dark` class any more
Dark mode used to be a `.dark` variant block (shadcn's default, driven by
`next-themes`). It is deleted: light vs. dark is now a *property of the club's
background luminance*, computed inside `generateTheme`, so the same tokens serve
both and a `dark:` variant would fight the theme rather than serve it. The
`@custom-variant dark` declaration stays only so the handful of leftover `dark:`
classes still compile until the step-3 sweep removes them; nothing sets the class.

### Injection: root layout defaults, `[clubSlug]` layout overrides
Rather than adding a `generateTheme` call to each of `/login`, `/clubs`,
`/clubs/new` and `/admin` (§A4), the **root** layout injects the platform default
once, and the new `app/[clubSlug]/layout.tsx` injects the club's tokens. Layouts
nest, so the club block lands after the default in document order and wins the
cascade at equal specificity. The guarantee the spec wants holds by construction:
a club's `<style>` only ever exists inside `/{clubSlug}/`, so it cannot leak onto a
platform page — and any *future* non-club route is themed correctly by default
rather than by remembering to add a call.

`app/[clubSlug]/layout.tsx` is new (only `(member)/layout.tsx` existed). It sits
*above* `(member)`, which is what themes the public `/{clubSlug}/register` page.
`getClubBySlug` is `cache()`d, so it adds no query.

### `globals.css` carries a static copy of the default tokens
The `:root` block duplicates `generateTheme`'s default output as a fallback for
anything that renders outside a layout. To stop the copy drifting, a unit test
parses `globals.css` and asserts every token equals the function's output.

### Verified against a running server
With Demo Club's theme set to `#0A0A0A / #DC2626 / #F97316` in its settings JSON:
`/demo-club/register` (a *public*, club-scoped page) serves `--bg:#0a0a0a`,
`--text:#f8fafc`, `--primary:#dc2626` — and the platform default block still
precedes it, so the cascade order is right. `--danger` stays `#dc2626` while
`--danger-tint` re-mixes to `#24140f` for the dark background. `/login` serves the
indigo default regardless. Removing the `theme` key returns the club to the default
immediately.

### One environment note, not an app issue
Killing the Next dev server mid-write on Windows can leave `.next` corrupt; the
symptom is every route (including `/api/auth/*`) 404ing, or a Turbopack panic
(`0xc0000142`). `rm -rf .next` and restart. Production builds were unaffected
throughout.

## UI refactor step 3 — Color sweep

### The spec's badge colors fail WCAG, so the tints grew an ink token
§C2 specifies badges as the semantic color drawn on its own tint
(`--success-tint` / `--success`). Measured, that is **3.15:1** for success and
**2.70:1** for warning on a light background — badge text is 12px, so AA wants
4.5:1. Shipping it as written would mean unreadable "Pending" chips.

`generateTheme` now derives a companion **`--{x}-tint-fg`** for each tint (primary,
accent, and the four semantics): the same hue, deepened on a light theme or
lightened on a dark one, stepwise until it clears 4.5:1 against its own tint. The
hue barely moves — a deepened `#dc2626` is still red — so §A3's "Unpaid must read
as red" holds, it just becomes legible. On the dark club theme the ink lightens
instead (`--danger-tint-fg: #e35252`), and where the base hue already clears the
bar it is left alone (`--success-tint-fg` on dark is just `--success`).

A test asserts every tint/ink pair clears 4.5:1 under a light theme, a dark theme,
and a club whose brand collides with the semantic hues (a red club).

### One badge, five variants — not six copies of the same class string
The same green "Paid"/"Checked in" class string was pasted in six files, and
`StatusBadge` and the admin's `ClubStatusBadge` each carried their own palette map.
`badge.tsx` gains `success` / `warning` / `danger` / `info` / `neutral` variants and
every call site now names a meaning (`<Badge variant="success">`) instead of
restating a color. The two status maps collapse to status → variant lookups.

### "Unpaid" was a neutral outline badge; it is red now
It rendered as `variant="outline"` — grey. The acceptance checklist requires Paid
and Unpaid to read green/red under every club theme, so the three Unpaid badges
(dashboard, dues table, member table) are now `variant="danger"`.

### `dark:` variants are gone from app code; the vendored shadcn files keep theirs
Every `dark:*` class in `src/app` and `src/components` (outside `ui/`) is deleted —
they paired with the palette classes that just died, and nothing sets a `.dark`
class any more (step 2). The shadcn primitives in `src/components/ui/` still carry
a few (`dark:bg-destructive/20`); they are vendor files, reference only token
variables, and are inert without the class. Rewriting them would only make the next
`shadcn add` conflict.

### Verified
`grep` for every default-Tailwind palette utility (`gray|zinc|slate|red|amber|
green|blue|indigo|…`-`[0-9]+`) across `src/**/*.tsx|ts|css` returns **nothing**
outside the vendored primitives, which are themselves clean. The compiled CSS shows
the badge utilities resolving to the token variables
(`.bg-success-tint{background-color:var(--success-tint)}`), and a running server
serves the deepened inks for a dark club. `next build`, `npm run lint` and 46 unit
tests are green.

## UI refactor step 4 — App shell (sidebar, topbar, slide-over)

### The page's action lives in the topbar, so the page portals it there
§B4 puts each page's contextual primary action in the topbar, but the topbar is in
the layout and the action needs the *page's* data — the dues period list and the
CSV rows are fetched by `dues/page.tsx`. Hoisting the controls into the layout
would mean the layout re-fetching each page's data just to render a button.

So the topbar renders an empty `#topbar-actions` div and pages portal into it
(`components/app-shell/topbar-actions.tsx`). Pages stay server components; only
the action itself is client-side. The cost: the action mounts on hydration rather
than appearing in the server HTML — fine for a button nobody can click before
hydration, but it is the one part of the shell that HTML inspection cannot verify,
so it has a **jsdom test** asserting the children land in the slot and nowhere
else. Without it, a silent regression would cost an exec the "Create event" button.

`useSyncExternalStore` marks the client-only render, not `useState` in an effect —
the React Compiler's lint rules reject the latter, correctly.

### Titles: the topbar owns the h1
Every page's `<h1>` moved to the topbar, derived from the route (`nav.ts`
`pageTitle`). The supporting line each page had under its heading (member count,
"x of y paid", the user's email) stays in the body, demoted to 13px muted text per
§C1. Detail pages (`members/[id]`, `events/[id]`) keep their own `<h1>` — it is the
member's or event's *name*, which the topbar's section title ("Members") does not
duplicate.

### No "Add member" action, because there is no such feature
§B4 lists Members → "Add member" for execs. The app has no manual add-member flow —
members arrive by self-service registration or the CSV importer — and this refactor
is explicitly not allowed to add business logic. The Members topbar therefore has no
action. Events ("Create event") and Dues (period selector + "Export CSV") do.

### Profile left the nav for the user menu
§B2's nav is Dashboard / Members / Dues / Events / Settings; Profile is an item in
the bottom user dropdown, next to "Change password" (which links to the same page's
password card, now anchored `#password`) and "Sign out". The sign-out server action
is passed from the layout into the client sidebar as a prop.

### Badge counts are exec-only, and cost nothing for everyone else
The Members nav badge counts PENDING applications. Only execs can act on them
(`can(membership, "member:approve")`), so the layout only runs the count query for
execs — a member's dashboard does not pay for a number they will never see.

### Verified against a running server
Signed in over the real credentials endpoint:
- **President** (single club): all five nav items including Settings; the club block
  is a plain link to `/clubs` (a dropdown with nothing to switch to would be a menu
  that says nothing); pending badge shows 2.
- **Exec**: no Settings item; badge shows 2.
- **Member with two clubs** (`ada.obi@club.test`): no Dues, no Settings; the club
  block is a dropdown listing Beta Club and "All clubs"; no pending badge.
- Topbar renders `<h1>Dashboard</h1>`, the sidebar is 260px, the active nav item
  carries `bg-primary-tint text-primary-tint-fg`, and the old horizontally-scrolling
  header nav is gone.

## UI refactor step 5 — Settings → Appearance

### A separate action, not a bigger `settingsSchema`
`updateTheme(clubSlug, colors | null)` sits alongside `updateSettings` rather than
folding three colors into the settings form. They validate differently (colors go
through `validateTheme`'s contrast rules, not just a shape check) and they
revalidate differently — a theme change invalidates *every* page under the club,
including the public register page, so it calls `revalidatePath(/{clubSlug},
"layout")` where `updateSettings` names the four pages that read settings.

### "Reset to default" deletes the key; it does not write today's default
Passing `null` removes `settings.theme` entirely, so the club *follows* the platform
default rather than freezing the current indigo into its row. If the platform
default ever changes, clubs that never customized move with it — which is what
"absent key = platform defaults" (§A6) means.

### The preview is the real components, not a mock of them
`Preview` sets the generated tokens as CSS variables on its own wrapper and renders
ordinary token utilities (`bg-surface`, `bg-primary-tint`, the real `<Badge
variant="success">`) inside it. Because the tokens cascade, the miniature is styled
by exactly the same rules as the live pages — there is no preview-specific styling
that could drift from the app it is previewing. It calls the same `generateTheme`
the server calls.

### Blocking errors and soft warnings are one list, distinguished by color
`validateTheme` returns both in `warnings` (§A5 fixes the signature), so the form
renders the list in danger ink when `ok` is false and warning ink when it is true,
and only disables the save button in the former case. A half-typed hex shows "must
be a hex color", not a contrast complaint — there is nothing to judge yet.

### Verified against a running server, by calling the action directly
The client disables its own save button, so the real test is a request that ignores
it. Invoking `updateTheme` over the server-action endpoint:
- yellow `#FDE047` primary on white → refused: *"Your primary color does not stand
  out enough against the background (contrast 1.3:1, needs at least 3:1)"*
  (acceptance checklist item 4);
- a malformed hex (`"red"`) → refused by the schema;
- `#0A0A0A / #DC2626 / #F97316` → saved, and `/demo-club/dashboard` **and the public
  `/demo-club/register`** immediately serve `--bg:#0a0a0a` while `/login` stays
  indigo;
- the same call as an ordinary member → *"Not authorized."*, and the club's theme is
  unchanged;
- reset (`null`) → the club returns to indigo and `settings.theme` is `undefined` in
  the database, not a copy of the default.

## Event forms step 1 — Schema, validation module

### `formSchema` is JSONB on `Event`, not a relation table
Each event's form is an ordered array of field definitions stored in a single
`Event.formSchema` JSONB column (defaulting to `[]`), not a `FormField` relation.
The schema is always read and written as one atomic unit (saved together with the
event, no partial saves), is never queried field-by-field, and field identity is
carried by an immutable client-generated id rather than a row PK. A relation table
would add a join and an ordering column for zero benefit at this scale (≤20 fields
per event), and versioning-by-id makes field-rename/-delete migrations unnecessary.
Responses live in `Attendance.formResponses` (also JSONB), keyed by that field id.

### `Attendance` absorbs guests rather than a new `Guest` model
A registration is one `Attendance` row whether it comes from a member or a guest.
`membershipId` became nullable and `guestName`/`guestEmail`/`formResponses` were
added alongside it. The member-or-guest XOR (exactly one identity, never both,
never neither) cannot be expressed in Prisma/Postgres, so it is enforced in the
submit server action (Phase 4). Deduplication rides on Postgres treating NULLs as
distinct in unique indexes: `@@unique([eventId, membershipId])` keeps one row per
member while allowing many guest rows, and `@@unique([eventId, guestEmail])` keeps
one row per guest email (stored lowercased/trimmed) while allowing many member rows.
The migration is additive — existing attendance rows keep their `membershipId` and
default `formResponses` to `{}`.

### One validation module feeds both the builder and the submitter
`src/lib/event-forms.ts` owns `FormSchemaSchema` (validates the builder's output:
id charset, 1–100-char labels, the five-type enum, selects require 1–20 non-empty
options, ≤20 fields, unique ids) *and* `buildResponseValidator(formSchema)` (the
per-event schema the public submit action runs). Colocating them is what stops the
builder and submitter drifting: a field the builder can save is a field the
submitter knows how to validate. The response validator is **strict** — unknown
`custom_*` keys are rejected, select values outside the configured options are
rejected (not stored), optional blanks are omitted, and the output is re-keyed by
field id ready for `formResponses`. `parseFormSchema` degrades a malformed DB value
to `[]` rather than throwing, so a hand-corrupted blob can't 500 the register page.

### `z.coerce.number().refine(Number.isFinite)` over `.finite()`
The plan sketched `z.coerce.number().finite()`, but Zod 4 reworked the number API;
`.refine(Number.isFinite, …)` rejects `NaN`/`±Infinity` and is stable across the
version, matching the repo's existing Zod-4 usage.

### Existing RSVP list made null-safe now, full guest treatment deferred
Making `membershipId` nullable surfaced two `a.membership.user.name` reads on the
event detail RSVP list. They fall back to `guestName` now so the build stays green;
the Guest badge and the full null-membership audit of the check-in/RSVP-count
queries are Phase 6's job (EVENT-FORMS.md §5.1).

## Event forms step 2 — Drag-and-drop form builder

### The builder lives in the existing event dialog, not on `/new` + `/[id]/edit` pages
EVENT-FORMS.md §2.2 assumed dedicated create/edit **pages** with a plain
`<form action={serverAction}>`, `useActionState`, and a hidden `formSchema` input.
Reality (built in the events phase) is a single **`EventFormDialog`** modal that
holds each field in `useState` and calls the typed `createEvent`/`updateEvent`
server actions with a plain object — no FormData, no hidden inputs. Rather than
migrate event editing to pages (a large, regression-prone change well beyond this
feature), the builder is embedded in that dialog: `FormBuilder` is a **controlled**
component (`fields` + `onChange`) whose array the dialog owns and submits as one
more field on the action's input object. The plan's essential guarantees are
preserved — the form is saved atomically with the event, there is no separate save
flow, and the server re-validates it with `FormSchemaSchema` — only the transport
(object field vs. hidden input) differs. The dialog is widened to `sm:max-w-2xl`
and made vertically scrollable to fit the builder.

### `formSchema` rides `eventSchema`; `acceptingResponses` does not
`FormSchemaSchema.default([])` was added to `eventSchema`, so the create/edit
action validates and persists the form in the same parse as the rest of the event
(§2.4). The intake flag is deliberately kept **out** of that schema: per §2.3 it
toggles instantly through its own `setEventFormStatusAction` and must never be
coupled to a form save (closing intake can't wait for, or be reverted by, an
unsaved title edit). Ids are minted client-side with `nanoid` on add and never
regenerated, so an edit round-trips existing fields by id.

### `@dnd-kit` with a plain `<button>` drag handle and live announcements
`@dnd-kit/core` + `/sortable` (+ `/utilities` for the transform helper), per §2.1.
`PointerSensor` (4px activation distance, so a click on the handle isn't a drag) +
`KeyboardSensor` with `sortableKeyboardCoordinates` give mouse and keyboard
reordering; custom `Announcements` name the moved field for screen readers. The
grip is a bare `<button>` (not the Base UI `Button`) so dnd-kit's `listeners`/
`attributes` attach to the DOM node directly.

### Field delete is an inline confirm, not a nested AlertDialog
§2.2 specified a Base UI `AlertDialog` for the delete confirmation, but the project
has no `alert-dialog` primitive and nesting a modal inside the already-open event
dialog is fragile. Delete instead reveals an inline confirm strip on the row,
carrying the same warning (responses are kept and shown as "(removed field)").
Deleting only removes the field from the array — collected responses are untouched,
per the no-hard-delete rule.

### Live preview deferred to the phase that builds the renderer
§2.2's optional "Preview form" disclosure is intentionally not built yet: it is
meant to render the **same** `DynamicForm` the public page uses (the whole point is
builder/renderer parity), and that component lands in Phase 3. Adding a throwaway
preview now would defeat the parity guarantee; it will reuse `DynamicForm` once it
exists.

### The intake toggle appears in two places
`IntakeToggle` (optimistic Base UI `Switch` → `setEventFormStatusAction`) sits both
in the dialog's "Registration form" section (edit only — a not-yet-created event
has nothing to toggle) and in the event detail header for quick access, exactly as
§2.3 asks.

## Event forms step 3 — Public registration page

### The route is a `(public)` group under `[clubSlug]`, per the plan
`app/[clubSlug]/(public)/events/[id]/register/page.tsx`. The club's own theme
applies (the `[clubSlug]` layout injects it above every group and does no auth),
while the `(public)` group keeps the page out of `(member)` and its
`requireClubAccess` gate — no login, no membership required. `next build`
confirms `/[clubSlug]/events/[id]/register` and `/[clubSlug]/events/[id]` (the
exec detail, in `(member)`) coexist without a route-group collision: each URL has
exactly one page. This differs cosmetically from the plan's literal path only in
that the repo's existing `(public)` group is top-level; the club-scoped one is new.

### `useActionState` here, matching the existing public register form
Unlike the internal event dialog (imperative `useTransition` + typed-object
actions), the public flow follows the club-join `RegisterForm` pattern the plan
assumes: a plain `<form action={formAction}>` with `useActionState` and the action
bound to `clubSlug` + `eventId` via `.bind(null, …)`. The client reads both from
`useParams()` (repo convention) rather than accepting them as props.

### Resolution ladder and viewer states are entirely server-side
The page runs the §3.1 ladder — `getClubBySlug` (ACTIVE-or-404) → compound
`{ id, clubId }` event fetch (404) → intake gate. A closed or past event renders a
card with **no input elements at all** (not disabled inputs — none), so there is
nothing to re-enable from a console. "Past" compares instants (`startsAt` already
encodes Lagos wall-clock at write time), read through a `new Date()` const to
satisfy the React-compiler purity rule. Viewer identity (§3.2) is derived in
`resolveViewer`: an ACTIVE member of *this* club is locked to their account
identity ("Registering as …"); anyone else signed in is a guest prefilled from
their account; anonymous is empty. An existing registration (member row, or a guest
row matching the signed-in email) swaps the form for the "You're registered ✓" card
showing their answers, with schema-removed keys shown as "(removed field)". None of
this is trusted client-side — Phase 4 re-derives the same table in the action.

### The submit action is a fixed-signature placeholder until Phase 4
`submitEventRegistrationAction` exists with its final `RegistrationState` contract
and bound `clubSlug`/`eventId` signature, but a fail-closed placeholder body — the
page renders and the form wires up, while the ordered validation + write flow lands
in Phase 4 without the client changing. A live click-through of the states also
needs the Phase 1 migration applied to the database first.

### Sharing
`CopyRegisterLink` (exec detail header) copies `origin + /{slug}/events/{id}/register`
— the WhatsApp-blast link (§3.4). The optional builder live-preview stays deferred
as non-essential polish; it can now reuse `DynamicForm` whenever it's wanted.

## Event forms step 4 — Submit action end-to-end

### The action resolves the club itself instead of `getClubBySlug`
`getClubBySlug` 404s (throws) on a missing/unapproved slug — right for a page,
wrong for an action that must return a state. `submitEventRegistrationAction`
therefore does its own `club.findFirst({ slug, status: ACTIVE })` and returns a
deliberately vague `GENERIC` message on any club/event miss: this action answers
to forged and replayed POSTs, which should learn nothing about what exists. The
event is fetched compound-scoped (`{ id, clubId }`), so a club A event id POSTed
under club B's slug simply doesn't resolve.

### The intake gate is step 3, before any answer is read
`acceptingResponses === false` OR past (instant compare — `startsAt` already
encodes Lagos wall-clock) returns the closed message before the form fields are
touched. This is the real control against replayed/scripted POSTs; the register
page's closed screen is cosmetic. The honeypot (`company`) is step 4 — a non-empty
value returns `{ ok: true }` and writes nothing, so a bot sees success.

### Viewer identity is re-derived server-side; a member's account wins
Step 6 re-resolves the session → membership in THIS club. An ACTIVE member writes
with `membershipId` and their submitted `name`/`email` are ignored entirely (the
locked form doesn't even render them, but a forged POST can't override their
identity). Everyone else is a guest, and only then is the core `name`/`email`
validated with `coreRegistrantSchema` (lowercased/trimmed email). Response
(`custom_*`) validation happens independently at step 5; the two error sets are
merged so the registrant sees every problem at once. An unrecognised `custom_*`
key has no input to attach to, so it becomes a form-level message, not a field
error — and nothing is written.

### Duplicates: check then rely on the constraints for the race
Step 7 looks up the existing row (member by `eventId_membershipId`, guest by
`eventId_guestEmail`) and returns the friendly duplicate message. The write is
still wrapped in a `try/catch` for `P2002` returning the same message, because two
concurrent submits pass the check together and only the unique index can arbitrate.
The row is built as EITHER a member OR a guest payload — the XOR the schema can't
express, enforced here by construction.

### A required number must not coerce blank to 0 (bug found while wiring the action)
`z.coerce.number()` turns `""` into `0`, which would let a **required** number
field pass empty on a forged/JS-off POST. `fieldValidator` now runs
`blankToUndefined` *before* coercion for numbers, so blank → `undefined` → `NaN` →
fails `required` (and is omitted when optional). Covered by a new unit test.

### Verified live against the local dev database
The migration was applied (`migrate deploy`) and a throwaway script drove the exact
validators + Prisma writes/constraints the action depends on, against a real
seeded club — then deleted its own rows. All 15 checks green: schema columns
round-trip; a valid submission stores `{fieldId: value}` with checkbox→true and a
blank optional omitted; select-out-of-options, unknown `custom_*`, blank-required-
number and blank-required-text are all rejected (nothing written); core email is
normalised; duplicate guest email and duplicate member both raise `P2002` (one row
each); a second distinct guest is allowed (NULLs distinct); guest rows carry
`guestEmail`/null `membershipId` and member rows the reverse; the intake flag
round-trips. The action's own orchestration (auth/`revalidatePath`, which need
Next's request scope) is covered by `tsc` + `next build` + review, since it can't
run outside the server.

## Event forms step 5 — Exec responses view + CSV export

### Responses is a stacked exec card, not a literal "tab"
§5.1 says "add a Responses tab alongside the existing RSVP/check-in views", but the
event detail page has never used tabs — RSVPs and Check-in are stacked `Card`s, and
RSVPs is member-visible while Check-in is exec-only, so a shared tab strip would mix
audiences. Responses is therefore a third **exec-only card** (between RSVPs and
Check-in), consistent with the page. Its header carries the count + member/guest
split, the copy-link, and Export CSV; the intake toggle already lives in the page
header (Phase 2), so it isn't duplicated here.

### "Responses" = every Attendance row, because that IS the registration record
There is no stored flag distinguishing a public-form registration from an internal
RSVP or a check-in — they are all `Attendance` (§1.2, "the single registration
record"). Rather than guess intent from empty `formResponses`, the table lists every
attendance row, with custom columns showing "—" where a member never answered them.
Guests (no membership) are always form registrations; members may be either. The
member/guest split counts `membershipId` null vs. set.

### One column-derivation helper for the table and the CSV
`deriveResponseColumns(formSchema, responsesList)` (`lib/event-responses.ts`) returns
the columns — current-schema fields in order, then each orphaned response key once as
"(removed field)" — and is called by both the on-screen table and the CSV route, so
their headers can't drift. Cell formatting differs by medium on purpose:
`responseCellText` renders checkbox as Yes/— (blank → —) for the table;
`responseCellCsv` renders Yes/No (blank → empty) so a spreadsheet gets data, not an
em-dash. Both live in the same module and are unit-tested.

### CSV is a route handler, not a server action
`events/[id]/responses/route.ts` (`GET`) so the browser downloads natively via
`Content-Disposition`. Route handlers bypass the `(member)` layout guard, so it
re-runs the checks itself: `requireClubAccess` (redirects a logged-out or non-member
caller) + `can(event:manage)` (403 for a non-exec) + a compound `{ id, clubId }`
fetch (404 for another club's event id). `csvCell` applies the §5.2 formula-injection
guard — a value starting with `=`, `+`, `-`, or `@` is prefixed with `'` — then
RFC-4180 quoting; a `String.fromCharCode(0xFEFF)` BOM makes Excel read it as UTF-8;
timestamps are Africa/Lagos; the filename is `slugify(title)-responses.csv`.

### Guests join the check-in list; a guest is checked in by Attendance id
§5.1 wants guests in check-in too. `CheckInMember` became `CheckInEntry` with a
`kind` ("member" | "guest") and a `targetId` (membershipId or Attendance id), and the
list renders a "Guest" badge. Members keep the `toggleCheckIn` upsert-by-membership
path; guests use a new `toggleGuestCheckIn` that `updateMany`s the row filtered by
`{ id, eventId, membershipId: null }` — the null filter guarantees it can never
touch a member row (verified live: the same filter against a member id matches zero
rows), and a guest with no registration simply has no row to check in.

### Null-membership audit
The RSVP-count queries were already null-safe (they filter on `rsvp`/compare
`membershipId` to a real id, so guest NULLs never match); the detail RSVP list was
fixed in step 1; the check-in map is now built only from member rows and guests are
added explicitly. No query dereferences a possibly-null membership.

### Verified live against the local dev database
A throwaway script created a member and a guest registration (one value with a comma,
a nickname of `=SUM(9)`, and an orphaned `oldfield` key) on a real club, then built
the rows + CSV through the exact route code path and asserted: columns end in
"(removed field)"; guest row uses guestName/guestEmail and member row the account's;
the comma value is quoted, the checkbox exports Yes/No, and `=SUM(9)` exports inert
as `'=SUM(9)`; the filename slugifies to `frosh-week-mixer-responses.csv`; and guest
check-in updates exactly one guest row while the member-scoped filter touches none.
9/9 green, rows cleaned up after.

## Event forms step 6 — Docs + acceptance click-through

### The public event-register route needed a proxy exemption
The edge proxy (`auth.config.ts`) treats every matched route as auth-required
except an explicit allowlist, which only covered `/{slug}/register`. The new
`/{slug}/events/{id}/register` was therefore 307-redirecting anonymous visitors to
`/login` — the whole point of the feature is that it's public. Added a second regex
(`^/[^/]+/events/[^/]+/register/?$`) alongside the club-join one. This was a
Phase-3 miss surfaced only by the live click-through (the page and action were
correct; the proxy in front of them wasn't). Membership/club scoping is still
decided server-side per request, as for every route — the proxy only waves the
page through.

### README
Added an "Event registration forms" section (builder, intake toggle, the three
public viewer states, the server-side submit boundary, and exec responses + CSV),
a URL-table row for `/{clubSlug}/events/{id}/register`, and the two new `lib/`
modules + route locations in the project-structure tree.

### Acceptance checklist — verified
Driven against a running dev server on a seeded database (public pages over HTTP)
plus the Phase-4/5 live DB scripts and `next build`:

- **Closed intake** → the register page returns a card with **zero** `<input>`,
  `<select>`, or `<textarea>` elements and the "no longer accepting" copy; the
  open form renders name, email, the `custom_*` fields, and the honeypot. A
  replayed POST to a closed form is rejected server-side (Phase-4 intake gate).
- **Cross-club** → club A's event id under club B's slug is a **404**; so are a
  missing event id and an unknown slug (one indistinguishable 404).
- **Duplicate** guest email / repeat member → friendly error, one row (`P2002`).
- **Select-out-of-options / unknown `custom_*`** → rejected, nothing persisted.
- **Removed field** → prior answers retained under "(removed field)" in the table
  and CSV.
- **CSV** → `=1+1`-style values export inert (`'` prefix); UTF-8 BOM + Lagos
  timestamps; slugified filename.
- **`next build`** → passes with zero TypeScript errors.

## Platform signup, email verification, password reset & session revocation

Full plan in [SIGNUP.MD](./SIGNUP.MD); the load-bearing choices are recorded here.

### Hard gate, not soft
An unverified account **cannot sign in at all** — the check lives in
`authorize()` (`src/auth.ts`), so an unverified user never mints a JWT and no
per-request `emailVerified` check is needed anywhere downstream (the proxy stays
untouched). The alternative — letting them in but nagging — was rejected: a hard
gate is one check in one place, and the payoff is that verification status is a
login-time concern only. The cost is that deliverability becomes load-bearing, so
the migration **backfills every pre-existing user as verified** and seeds/import
set `emailVerified` at creation, or the gate would lock out the whole seeded and
imported roster on the day it ships.

### Tokens: hashed at rest, single-use, two separate slots
The email carries a raw `randomBytes(32)` token; the DB stores only its
`sha256`, so a leaked row can't verify or reset anything. Consuming is one
guarded `updateMany` (match hash **and** unexpired, clear the columns in the same
statement), which makes double-consume impossible without an explicit
transaction. Verification and reset get **separate column trios** on `User`, so a
verification resend can't silently kill a pending reset link. Issuing overwrites
the slot, so one live token per user per slot with no delete-then-insert.

### Verification consumes on view; reset consumes on POST
`/verify-email` burns the token in the page's server render — a verification link
is a formality (24h life), so a mail prefetcher spending it is acceptable.
`/reset-password` does **not** consume on view (a reset link is a credential, 1h
life); the token rides a hidden field and is spent only on the form POST, so a
prefetcher can't dead-end a real reset.

### A completed reset also verifies the email
Clicking a link mailed to the address is exactly the proof verification wants, so
a successful reset stamps `emailVerified` — **but only if it was still null**, to
preserve an already-verified account's original timestamp. Without this, an
unverified user who resets stays locked out by the hard gate with no way forward.
Reset therefore doubles as the unverified-account recovery path.

### Disclosure is asymmetric on purpose
Signup and resend **disclose** whether an email already exists ("sign in
instead") — it helps a returning user and matches the existing per-club register
behaviour, which already discloses. Password reset **never** discloses: every
outcome (no account, throttled, sent) returns an identical response, because a
reset request is the classic account-enumeration oracle.

### Login distinguishes "unverified" from "wrong password" — belt and suspenders
`authorize()` throws a `CredentialsSignin` subclass carrying
`code: "email_not_verified"`, but the next-auth v5 **beta** may not preserve a
custom code through to the server action, so `loginAction` also **re-checks
server-side** (re-query + bcrypt compare + `emailVerified`). Only a *correct*
password on an unverified account shows the "verify first" state; a wrong
password stays a generic failure, so the distinction never becomes an oracle.

### Email: Resend over `fetch`, console fallback
No SDK dependency — `sendEmail` POSTs to Resend's REST API directly. With
`RESEND_API_KEY` unset it logs the link to the console instead, so dev and CI
never require a mail provider (mirrors the no-op session store).

### Session revocation: Redis allowlist, one session per user, fail-open
Stateless JWTs can't be revoked, so each JWT carries a `jti` recorded in Upstash
Redis under **one key per user** (`user_token:${userId}`), checked in the `jwt`
callback on every request. Consequences, all deliberate:
- **One session per user** — a new login overwrites the key, so signing in on a
  second device logs out the first. If multi-device is ever wanted, the key flips
  to per-session (`session:${jti}`) with no change to the JWT shape.
- **Edge-safe client** — the check runs in the proxy (edge runtime), so it uses
  `@upstash/redis` (REST/fetch); `ioredis`/`node-redis` (raw TCP) would not run
  there. `src/lib/session-store.ts` imports no Prisma/bcrypt, the same rule
  `auth.config.ts` follows.
- **Fail-open** — a Redis error logs a `[session-store]` warning and treats the
  session as valid. Fail-closed would turn any Upstash blip into a sitewide
  lockout; pausing revocation during an outage is the better trade at this scale.
- **No-op without config** — both env vars unset (dev/CI) disables the check
  entirely, so revocation is only truly exercised against a real Upstash instance.
- Logout and a completed password reset both delete the key, so a credential
  change signs out every existing session — the gap the plan originally deferred.

### Minor deviations from the plan
- `forgotPasswordSchema` (§8) would be byte-identical to the `emailOnlySchema`
  already added for resend, so that one schema serves both rather than duplicating.
- `LoginForm` reads `?verified=1` / `?reset=1` via `useSearchParams`, which the
  App Router requires under a `Suspense` boundary — so the form is wrapped in one
  on the login page.

### Verified
- **Unit** — token lib (hash round-trip, expiry, single-use, throttle) and the
  session store (no-op, match/mismatch/missing-jti, fail-open, TTL'd write/delete)
  are covered by vitest; `tsc` and `eslint` clean.
- **Against the live dev database** — an end-to-end token round-trip on a
  throwaway user: verification and reset both issue with only the hash stored
  (never the raw), consume once, clear the slot, mark/preserve `emailVerified`,
  and reject replays.
- **Manual click-through** (running server) still owns the full HTTP flow: signup
  → console link → verify → login; unverified login blocked with resend;
  expired/reused token; throttle; forgot → reset → login; second login kills the
  first session; logout/revoked-session bounce to `/login`; existing seeded users
  still log in.

The two interactive-only items — keyboard-only drag-reorder of fields, and opening
the CSV in Excel — follow the documented dnd-kit keyboard-sensor path and the
BOM/escaping rules respectively, and want a final human eyeball in the browser.

## The club switcher is always a dropdown now (reachable "Start a new club")

Multi-club step 4 made the sidebar club block a plain link to `/clubs` for a
single-club user, on the grounds that "a dropdown holding a single item would be a
menu that says nothing." That left a gap: the only link to `/clubs/new` lived on
the `/clubs` page, which a user with exactly one live club and nothing pending is
**auto-forwarded past** (`clubs/page.tsx` redirects straight to their dashboard).
So the users most likely to want a second club had no in-app way to reach the
create-club flow (only typing `/clubs/new` by hand).

`ClubSwitcher` is therefore always a dropdown now. It carries "Start a new club"
(→ `/clubs/new`) and "All clubs" (→ `/clubs`), plus the "Switch club" group when
the user has other memberships — so even the single-club menu says something
useful, which retires the original objection. Creating additional clubs was always
allowed server-side (`requestClub` has no per-user cap); this only adds the missing
front door.

# Phase — Elections

Elections was a v1 non-goal (SPEC §1); this phase adds the full lifecycle —
create → apply → review → vote → results — planned in [ELECTIONS.md](./ELECTIONS.md).
The load-bearing decisions and their reasons:

## Anonymous ballot: no voter link, and no timestamps on `Vote`

A cast ballot writes two rows in one `$transaction`: a `Vote` (positionId +
candidacyId + clubId, **no membership**) and a `VoteReceipt` (positionId +
membershipId). The receipt records *that* you voted; the vote records *what* for;
nothing joins them. Crucially `Vote` also has **no `createdAt`/`updatedAt`** —
deliberately breaking the repo-wide timestamp convention — because a
`Vote.createdAt` would sit microseconds from the same-transaction
`VoteReceipt.createdAt` and let anyone with DB access re-pair voter to choice by
sorting on time. Anonymity is a schema property here, not a query-time promise.
Consequence: votes can't be changed or withdrawn once cast (there is nothing to
address), which is stated in the ballot UI.

## The receipt's unique index is the one-vote guard

`@@unique([positionId, membershipId])` on `VoteReceipt` is the authority for
"one vote per member per position". `castVote` validates the candidacy and phase,
then relies on the constraint (catch `P2002` → "already voted") rather than a
read-then-write check — two concurrent casts both pass the checks and only the
index can arbitrate, exactly as the event-registration submit does for duplicates.

## Hybrid lifecycle: president-controlled status × clock-derived phase

`Election.status` (`DRAFT | PUBLISHED | CLOSED | CANCELLED`) is set by the
president; the fine-grained phase (`scheduled → applications → review → voting →
closed`) is **derived on read** from four window datetimes while PUBLISHED, by the
pure `getElectionPhase` in `src/lib/elections.ts`. DRAFT hides the election from
non-presidents and is the only editable state; CLOSED/CANCELLED override the clock
so a president can close early or abort. No cron, no scheduled jobs — phase is a
function of `now`, evaluated wherever it's needed (page, action, tallies route)
and re-checked server-side in every mutation. Windows must validate in order
(applications before voting) via cross-field zod refinements.

## One application per (position, member); multi-position allowed

`@@unique([positionId, membershipId])` on `Candidacy`. A member may stand for
several positions in one election — the president's review is the filter, not the
schema. A withdrawn application is re-opened to PENDING on re-apply (during the
applications window) rather than blocked by the unique constraint. Only APPROVED
candidacies appear on the ballot or in tallies.

## Live results: polled GET route, not `router.refresh()`

Requirement was ≤10s-fresh tallies for all members during voting. There is no
realtime infra in this codebase and Upstash REST isn't a pub/sub transport, so the
choice was polling. `router.refresh()` every 7s would re-render the entire RSC
tree (candidacy joins, membership lookups) just to move a number; instead a GET
route handler at `elections/[id]/tallies` returns JSON (`vote.groupBy` +
distinct-receipt turnout through the shared `buildTallies`), and `LiveResults`
polls it every 7s, pausing while the tab is hidden and stopping once the payload
reports the election closed (then refreshing into the closed view). The route
re-runs `requireClubAccess` + a compound `{ id, clubId }` fetch because route
handlers bypass the `(member)` layout guard — same precedent as the event
responses CSV route.

## Results CSV mirrors the event-responses export

`elections/[id]/results` is a GET route (native `Content-Disposition` download,
UTF-8 BOM) reusing `toCsv`/`csvCell` from `event-responses.ts` (formula-injection
escaping + RFC-4180 already solved there). Results are member-visible, so the gate
is `election:vote` rather than a manage check, and only a CLOSED election exports.

## President-only management

New actions `election:manage` (PRESIDENT_ONLY), `election:apply` / `election:vote`
(ALL). Execs are the likely candidates, so keeping the whole election — creation,
candidate review, close/cancel — with the president avoids the conflict of
interest of an exec administering their own race. `toLagosDate`/`optionalText`
were extracted from `validations/events.ts` into `validations/shared.ts` so the
elections schema reuses the identical Africa/Lagos datetime-local handling.
