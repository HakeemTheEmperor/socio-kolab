# Multi-Club Support — Slugs, Club-Scoped Routing & Club Lifecycle

This document specifies the upgrade of the existing single-club portal (built per `SPEC.md`) to full multi-club support. Implement this BEFORE `UI-REFACTOR.md` — the refactor's app shell will build on the routing structure defined here.

Guiding rules:
1. **Slugs in URLs, cuids internally.** Clubs are addressed by a human-readable slug (`/adrian-tech/dashboard`). All database IDs remain cuids and may appear in URLs for sub-resources (`/adrian-tech/events/{cuid}`). No ID encoding/encryption layer.
2. **Authorization is the security boundary, not ID obscurity.** Every request resolves the club from the slug and verifies the session user's membership server-side. Every sub-resource fetch verifies the resource belongs to that club.
3. No business logic changes to dues/events/attendance beyond scoping.

Where a decision is not specified, choose the simplest option consistent with these rules and note it in `DECISIONS.md`.

---

## 1. Schema changes (Prisma migration)

```prisma
model Club {
  // existing fields unchanged, plus:
  slug        String     @unique
  status      ClubStatus @default(PENDING)
  description String?
  requestedById String?  // User.id of the creator
  approvedAt  DateTime?
}

enum ClubStatus {
  PENDING    // requested, awaiting platform admin approval
  ACTIVE
  REJECTED
  SUSPENDED  // reversible off-switch for a club (admin only)
}

model User {
  // existing fields unchanged, plus:
  isPlatformAdmin Boolean @default(false)
}
```

- Membership applications toggle: add `membershipOpen: boolean` (default `true`) to the `Club.settings` JSON — no schema change needed.
- **Slug rules:** lowercase `a-z`, `0-9`, hyphens; 3–30 chars; no leading/trailing/double hyphens. Reserved list (reject as slugs): `login`, `register`, `clubs`, `admin`, `api`, `settings`, `profile`, `dashboard`, `about`, `new`. Implement as `validateSlug()` in `lib/slug.ts` with a suggestion helper `slugify(name)` used to prefill.
- Migration for the existing seed club: derive slug from its name, set status `ACTIVE`.

## 2. Routing restructure

Move all authenticated club pages under a dynamic segment:

```
app/
  (public)/
    login/
    clubs/                    ← club switcher (auth required, not club-scoped)
    clubs/new/                ← request a club
  admin/                      ← platform admin only
  [clubSlug]/
    register/                 ← public, club-scoped
    (member)/                 ← auth + ACTIVE membership required
      dashboard/  members/  dues/  events/  settings/  profile/
```

### 2.1 Club resolution & guards

Create `lib/club-context.ts` with two cached-per-request helpers, used by the `[clubSlug]` layout and by EVERY server action:

- `getClubBySlug(slug)` → returns the club if `status === ACTIVE`, else triggers `notFound()`. PENDING/REJECTED/SUSPENDED clubs are indistinguishable from nonexistent ones to the public.
- `requireMembership(clubId, minRole?)` → resolves session user's membership in this club; not found or not ACTIVE → redirect to `/clubs` with a message; role below `minRole` → throw forbidden. Replaces all current global auth checks in actions.

### 2.2 Cross-club resource guard

Every fetch of a sub-resource by ID (event, membership, dues record, attendance) MUST filter by both id AND clubId in the same query — e.g. `prisma.event.findFirst({ where: { id, clubId: club.id } })`, never `findUnique({ where: { id } })` followed by a check. Missing → `notFound()`. Audit and update every existing query and server action to this pattern. A valid event ID from club A requested under club B's slug must 404.

### 2.3 The `can()` helper

Update signature to `can(membership, action)` operating on the membership resolved by `requireMembership` — verify no call site assumes a single global club.

## 3. Post-login flow & club switcher (`/clubs`)

- After login, redirect to `/clubs`.
- `/clubs` lists the user's memberships as cards: club logo/initial, name, the user's role, membership status. ACTIVE membership → card links to `/{slug}/dashboard`. PENDING → card shows "awaiting approval", not clickable.
- **Auto-forward:** exactly one ACTIVE membership and no PENDING ones → skip the page, redirect straight to that club's dashboard.
- Page footer: "Start a new club" link → `/clubs/new`, and a sign-out control.
- A user with zero memberships sees an empty state: brief explanation + "Start a new club" + note that joining an existing club happens via that club's registration link.
- Add a club-switcher affordance in the authenticated layout (club name in the header/sidebar becomes a link or dropdown → `/clubs`).

## 4. Club creation & approval

### 4.1 Request (`/clubs/new`, any signed-in user)
Form: club name, slug (prefilled via `slugify`, editable, validated live via server action for format + uniqueness), description (optional). Submit → creates Club (status PENDING, `requestedById`) + a Membership for the creator (role PRESIDENT, status ACTIVE — dormant until the club is approved since PENDING clubs resolve as 404). Confirmation screen: "Request submitted — you'll get access once it's approved." The pending request also appears on the user's `/clubs` page as a "pending approval" card.

### 4.2 Platform admin (`/admin`)
- Guard: `isPlatformAdmin` only; others → `notFound()`.
- Pending requests table: club name, slug, description, requester name/email, requested date; Approve / Reject buttons. Approve → status ACTIVE + `approvedAt`; the club immediately resolves at its slug. Reject → status REJECTED.
- All-clubs table: name, slug, status, member count, created date; action to SUSPEND / reactivate an ACTIVE/SUSPENDED club (confirm dialog).
- No admin editing of club internals — admins manage club lifecycle, not club data.
- Seed: set `isPlatformAdmin: true` on a dedicated `admin@platform.test` user (password `password123`), who has no memberships.

## 5. Club-scoped registration & the applications toggle

- `/{clubSlug}/register` replaces the old global `/register`. Same form and behavior (creates User if the email is new + PENDING membership in THIS club), plus:
  - If the visitor is already signed in, skip the account fields — just collect the membership profile fields and create the PENDING membership for the existing user. (An existing user joining a second club must not need a second account.)
  - Duplicate guard: an existing membership in this club (any status) → friendly message instead of a new application.
- **Applications toggle ("off season"):** `settings.membershipOpen`.
  - `false` → `/{clubSlug}/register` renders an "Applications are currently closed" page (club name + logo shown, no form). The server action must also reject submissions independently of the UI.
  - Control lives in `/{clubSlug}/settings` (extend the existing settings page): a labeled switch "Accept new membership applications" — exec-editable per the existing settings permission (president-only), effective immediately.
  - Exec manual-add and the CSV import script work regardless of the toggle — it gates self-service applications only.
- `/login` remains global and unchanged (accounts are platform-level).

## 6. Seed & scripts

- Seed TWO clubs: the existing demo club and a second club ("Beta Club", different departments/dues amount, `membershipOpen: false`) with its own president/exec/members. At least one user must hold memberships in BOTH clubs (to exercise the switcher), and one seeded club-A member must NOT belong to club B (to exercise isolation tests).
- `scripts/import-members.ts`: add a required `--club <slug>` argument.
- Update `README.md`: new URL structure, club lifecycle, admin credentials, toggle behavior.

## 7. Build order

1. Schema migration + slug utilities + seed updates (two clubs, platform admin).
2. Routing restructure: move pages under `[clubSlug]`, implement `getClubBySlug` / `requireMembership`, update layout guards. App should work exactly as before at `/{demo-club-slug}/...`.
3. Cross-club audit: sweep every query and server action for the compound `{ id, clubId }` pattern. This is the security-critical step — do it as its own commit with a list of touched call sites in the commit message.
4. `/clubs` switcher + auto-forward + post-login redirect.
5. Club-scoped registration + applications toggle (settings switch + closed page + server-side rejection).
6. `/clubs/new` request flow + `/admin` approval/suspend pages.
7. README, final click-through.

Commit after each step.

## 8. Acceptance checklist

- [ ] Visiting `/{slug}` for a PENDING, REJECTED, SUSPENDED, or nonexistent slug returns 404 — all four indistinguishable.
- [ ] A logged-in ACTIVE member of club A visiting club B's dashboard URL is redirected to `/clubs` (no club B data rendered, verified via response, not just UI).
- [ ] A valid event cuid from club A requested under club B's slug (by a club B exec) returns 404.
- [ ] A club B exec cannot invoke a server action against a club A resource (test by direct action call with club A IDs).
- [ ] User with memberships in both seeded clubs sees both on `/clubs` and can switch; user with one ACTIVE membership is auto-forwarded past `/clubs`.
- [ ] With applications closed: the register page shows the closed message, AND a direct POST/action submission is rejected server-side; flipping the toggle re-enables both.
- [ ] An existing signed-in user of club A can apply to club B without creating a second account, and appears in club B's pending approvals.
- [ ] Non-admin visiting `/admin` gets 404. Admin approves a requested club and its creator can immediately access `/{slug}/dashboard` as PRESIDENT.
- [ ] Reserved slugs (`admin`, `login`, etc.) and malformed slugs are rejected at `/clubs/new`.
- [ ] `next build` passes with zero TypeScript errors.
