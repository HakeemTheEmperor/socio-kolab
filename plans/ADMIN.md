# Admin Portal — Platform Overview, Clubs, and a User Directory

Feature: promote the single-page `/admin` (club approve/reject/suspend) into a
small **platform-operator portal** with a nav shell and three sections —
**Overview** (platform counts), **Clubs** (today's lifecycle tables), and
**Users** (a new read-only directory with a platform-admin grant/revoke toggle).

Builds on the multi-club portal (`SPEC.md`, `MULTI-CLUB.md` §4). This is an
expansion of §4.2, not a departure from it: admins still manage *lifecycle and
platform roles*, never club *contents*. Mandatory conventions for this build:

- Next.js 16 App Router, `src/` layout; pages under `src/app/admin/`.
- Prisma 7 — import from `@/generated/prisma/client`; no `url` in the
  datasource; CLI URL in `prisma.config.ts`. **No migration** — every field
  this feature needs (`User.isPlatformAdmin`, `Club.status`) already exists.
- The area is guarded by `requirePlatformAdmin()` (`src/lib/admin.ts`), which
  **404s** signed-out users and ordinary members alike — the app never confirms
  the admin area exists to people who can't use it.
- Every mutation is a Server Action that **re-checks `requirePlatformAdmin()`
  server-side**: the page/layout guard protects pages, not entry points. This
  is the pattern the existing `approveClub` etc. already follow.
- shadcn on Base UI: `render` prop, not `asChild`; Select `onValueChange`
  yields `string | null`.

## Design decisions (log in DECISIONS.md)

- **Admins gain a role lever, not a data lever.** The Users view is read-only
  except for one write: toggling `isPlatformAdmin`. Admins still cannot see or
  edit any club's members, dues, events, or settings — the "referees, not
  players" line (§4.3) holds. What changes is that the *referee bench* is now
  managed from the UI instead of the seed/DB only.
- **Granting admin refuses a user who holds any membership.** §4.3's invariant
  is "admins hold no memberships." Promoting a current member would break it the
  instant it took effect (and let them referee a club they play in). The grant
  action rejects such a caller with a message: the person must leave their clubs
  (or use a separate account) first. Enforced in the action, not the UI.
- **You cannot revoke your own admin, and cannot revoke the last admin.** Either
  would risk locking every operator out of `/admin`. Both are checked
  server-side against a live DB count, not the session.
- **The guard moves up into `layout.tsx`.** With three routes it is wasteful and
  error-prone to repeat `requirePlatformAdmin()` in each `page.tsx`. The layout
  runs it once for the whole segment; the actions keep their own independent
  checks. This revises the earlier "deliberately plain, no shell" note on the
  single admin page (DECISIONS.md, multi-club step 6) — recorded there as a
  superseding decision, with the reason: the page grew a second and third
  section and needed navigation.
- **Overview stats are counts only, computed per request.** No new tables, no
  cached aggregates, no time-bucketed charts. `count()` / `groupBy` over clubs,
  users, and memberships is cheap at this scale and cannot drift. Richer stats
  (growth over time, per-club rollups) are explicitly deferred — the latter also
  borders on "club internals" and is left out on purpose.
- **No suspend-user, no admin-triggered password reset.** Both were considered
  and dropped for v1: a user off-switch is a new schema field + auth-check
  wiring, and an admin reset lever hands operators power over individual
  accounts. Neither is needed to view users and manage the admin bench.

## 1. Schema

None. `User.isPlatformAdmin: Boolean @default(false)` and the `ClubStatus` enum
already exist (MULTI-CLUB §1). This feature is reads plus one boolean flip.

## 2. Routing restructure

```
app/admin/
  layout.tsx        ← requirePlatformAdmin() once; nav shell + sign-out
  page.tsx          ← Overview: platform counts (moves OUT the club tables)
  clubs/
    page.tsx        ← the two existing tables, lifted verbatim
  users/
    page.tsx        ← new: directory + admin toggle
  actions.ts        ← existing club transitions — UNCHANGED
  club-actions.tsx  ← existing client bits — UNCHANGED
  user-actions.ts   ← new: grantPlatformAdmin / revokePlatformAdmin
```

- **`layout.tsx`** — `const admin = await requirePlatformAdmin();` then renders
  the shell: a heading ("Platform admin"), the signed-in admin's email + "club
  lifecycle & platform roles", a nav (`Overview` · `Clubs` · `Users`) as `Link`s
  with active styling from `usePathname` (small client nav component, or plain
  links with `aria-current`), the sign-out `form action`, and `{children}`. The
  `doSignOut` server action moves here from `page.tsx`.
- **`page.tsx` (Overview)** — no longer holds club tables; renders the stat
  cards (§4). Keeps the `requirePlatformAdmin()` call is *not* needed here
  because the layout already ran it, but the data queries are safe reads either
  way; the actions are what carry the real guard.
- **`clubs/page.tsx`** — the current `page.tsx` club-request + all-clubs tables
  moved as-is, including `ClubStatusBadge`, the requester lookup, and the
  `RequestDecision` / `SuspensionToggle` imports from `../club-actions`.

## 3. Users directory (`users/page.tsx`)

One query:

```ts
const users = await prisma.user.findMany({
  orderBy: [{ createdAt: "desc" }],
  select: {
    id: true, name: true, email: true, emailVerified: true,
    isPlatformAdmin: true, createdAt: true,
    _count: { select: { memberships: true } },
  },
});
```

Table columns: **Name**, **Email**, **Verified** (badge yes/no),
**Memberships** (`_count`), **Role** (an "Admin" badge when `isPlatformAdmin`,
else "—"), **Joined** (`formatDate`), and a right-aligned **admin toggle**
(§5.1). Collapses to cards on small screens; `EmptyState` if there are somehow
no users. Read-only otherwise — no edit, no delete, no per-user drill-in.

The toggle control is disabled (with a tooltip/hint) in exactly the cases the
action would refuse, so the UI matches the server truth:

- the row is the signed-in admin themselves (can't revoke self),
- the user has ≥1 membership and is not yet an admin (can't grant a member),
- the user is the last remaining admin (can't revoke last).

The last-admin case needs the admin count; compute it once on the page
(`users.filter(u => u.isPlatformAdmin).length`) and pass down. **The disabled
states are a courtesy; the action re-derives every one of them.**

## 4. Overview stats (`page.tsx`)

Counts only, a handful of cheap queries run in parallel:

```ts
const [clubsByStatus, userCount, membershipCount] = await Promise.all([
  prisma.club.groupBy({ by: ["status"], _count: true }),
  prisma.user.count(),
  prisma.membership.count(),
]);
```

Derive per-status club counts from `clubsByStatus` (default missing statuses to
0). Render as stat cards:

- **Clubs** — total, with a breakdown line: Active / Pending / Rejected /
  Suspended.
- **Pending requests** — the Pending count; the card links to `/admin/clubs`
  (the queue lives there).
- **Users** — total user count.
- **Memberships** — total across all clubs (a platform-volume number, not any
  one club's roster).

Plain stat cards reusing the existing `Card` primitives — no chart library, no
`dataviz` (there is no series to plot yet).

## 5. Server actions — `admin/user-actions.ts`

`"use server"`. Shared `ActionResult = { ok: boolean; error?: string }` (mirror
`admin/actions.ts`). Both actions call `await requirePlatformAdmin()` first and
capture the returned admin (its `id` is the "self" reference).

### 5.1 `grantPlatformAdmin(userId: string)`
1. `const me = await requirePlatformAdmin();`
2. Load the target `user` (`findUnique`, select `id`, `isPlatformAdmin`, and
   `_count.memberships`). Missing → `{ ok:false, error:"User not found." }`.
3. Already an admin → no-op `{ ok:true }`.
4. **`_count.memberships > 0` → refuse:** `{ ok:false, error:"This user belongs
   to a club. A platform admin can't hold a membership — they must leave their
   clubs (or use a separate account) first." }` (§4.3 invariant).
5. `update({ where:{ id }, data:{ isPlatformAdmin:true } })`.
6. `revalidatePath("/admin/users"); revalidatePath("/admin");`

### 5.2 `revokePlatformAdmin(userId: string)`
1. `const me = await requirePlatformAdmin();`
2. **`userId === me.id` → refuse:** "You can't revoke your own admin access."
3. Load target; not an admin → no-op `{ ok:true }`.
4. **Last-admin guard:** `prisma.user.count({ where:{ isPlatformAdmin:true } })`
   — if `<= 1`, refuse: "At least one platform admin must remain." (Redundant
   with the self-check when there's a single admin, but correct when a second
   admin tries to demote the only *other* one down to a single remaining admin —
   the count is the real invariant.)
5. `update({ data:{ isPlatformAdmin:false } })`.
6. Revalidate `/admin/users` and `/admin`.

A single client component (`admin/user-actions.tsx`, akin to
`club-actions.tsx`) renders the per-row toggle with a confirm dialog for grant
(promotion is consequential) and calls the right action, surfacing `error`.

## 6. Tests (Vitest, co-located)

Extend the existing `src/app/admin-separation.test.ts` model (mock `@/auth`,
`@/lib/admin`, `@/lib/prisma`; import the action; assert refusal + no write):

- **`grantPlatformAdmin`**
  - refuses a user with `_count.memberships > 0`; asserts `user.update` never
    called and the error names the membership rule.
  - promotes a membership-free user; asserts `update` called with
    `isPlatformAdmin: true`.
- **`revokePlatformAdmin`**
  - refuses when `userId === me.id` (self); no `update`.
  - refuses when the admin count is `<= 1` (last admin); no `update`.
  - demotes when another admin remains.
- **Guard on the entry points** — invoking either action as a non-admin (mock
  `requirePlatformAdmin` to `notFound()`/throw) never reaches `update`, mirroring
  the existing `approveClub`-as-member test.

No new page-render tests; the guard behavior (404 for non-admins) is already
covered for the segment and unchanged.

## 7. Docs

- **MULTI-CLUB.md §4.2** — extend the `/admin` bullet list: the portal now has
  Overview/Clubs/Users sections; Users is a read-only directory with an
  admin-role grant/revoke governed by the §4.3 invariants.
- **DECISIONS.md** — the decisions block above, filed under a new
  "Phase — Admin portal" heading; explicitly note it *supersedes* the earlier
  "deliberately plain, no shell" line from multi-club step 6.
- **README.md** — one line in the admin section: `/admin` has Overview, Clubs,
  and a Users directory where platform-admin access is granted/revoked.

## Build order (commit-sized)

1. **Shell + move.** Add `layout.tsx` (guard + nav + sign-out); split the club
   tables out of `page.tsx` into `clubs/page.tsx`; make `page.tsx` the stats
   overview. `next build` green, `/admin` and `/admin/clubs` behave as before.
2. **Users directory.** `users/page.tsx` (read-only table + disabled-state
   logic) with no working toggle yet.
3. **Admin toggle.** `user-actions.ts` + `user-actions.tsx`; wire the toggle;
   the guards and revalidation.
4. **Tests + docs.** `admin-separation`-style action tests; MULTI-CLUB /
   DECISIONS / README updates; `npx vitest run` + lint + `next build`.

## Verification

- `npx vitest run` green; `next build` zero TS errors.
- Ordinary member and signed-out visitor get **404** at `/admin`,
  `/admin/clubs`, and `/admin/users` alike; the admin gets 200 on all three.
- Overview counts match the seed (two clubs both ACTIVE, the seeded user/
  membership totals); the Pending card links to the Clubs queue.
- Clubs section still approves/rejects/suspends/reactivates exactly as before.
- Users directory lists every seeded user with correct membership counts and the
  Admin badge only on `admin@platform.test`.
- **Grant** a membership-free user → they gain the badge and reach `/admin`;
  **grant** attempted on a club member is refused server-side (verified by direct
  action call, not just the disabled control) with the membership-rule message.
- **Revoke** self is refused; revoking the sole admin is refused; with two
  admins, one can demote the other.
