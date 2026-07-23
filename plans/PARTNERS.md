# Partners — Exec Partner Registry with Interaction Log

Feature: a club-scoped registry of external partners (sponsors, vendors, sister
organizations) so the relationship survives the person who currently holds it.
Execs manage the registry; each partner has a **liaison officer** (a club
member) and an **append-only interaction log**. A non-exec member who is a
liaison can see *their* partners and add log entries — nothing else.

Builds on the multi-club portal (`SPEC.md`, `MULTI-CLUB.md`). Mandatory
conventions for this build:

- Next.js 16 App Router, `src/` layout; pages under
  `src/app/[clubSlug]/(member)/partners/`.
- Prisma 7 — import from `@/generated/prisma/client`; no `url` in the
  datasource; CLI URL in `prisma.config.ts`.
- All mutations are Server Actions in `actions.ts`, `clubSlug` as first arg,
  each starting with `requireClubAccess(clubSlug)` + a `can()` /
  ownership check. Zod validation server-side. Never trust the slug or
  client role checks.
- Cross-club fetches follow the step-3 audit rule: sub-resources are fetched
  by id **and** club in the same query via `find…InClub` / `require…InClub`
  helpers in `src/lib/club-context.ts` — never `findUnique` + an `if`.
- shadcn on Base UI: `render` prop, not `asChild`; Select `onValueChange`
  yields `string | null`.

## Design decisions (log in DECISIONS.md)

- **The liaison is a relation to `Membership`, not free text.** The module
  exists to de-risk "one person holds the relationship"; that only works if
  the app can *see* who the person is. A nullable FK lets the partners list
  flag "liaison inactive / unassigned — reassign", which is the feature's
  real mitigation. Nullable because a partner can exist before a liaison is
  chosen or after one leaves.
- **Interaction log, not a mutable notes blob.** A single `notes` field
  becomes one person's scratchpad — the exact failure mode being designed
  against. `PartnerNote` rows are append-only (no edit, no delete),
  matching SPEC §3.5's immutable-history rule. A successor reads "last
  contacted 3 months ago by X about Y" instead of an undated wall of text.
- **Liaison access is ownership-scoped, per the existing "own only"
  pattern.** `can()` covers role-gated actions; ownership rows in the
  matrix are enforced at the call site with an explicit id comparison
  (see the header comment in `permissions.ts` and the member-detail
  precedent). A MEMBER-role liaison can view partners where
  `liaisonId === their membership id` and append notes to them — they
  cannot edit partner fields, reassign the liaison, archive, or see any
  other partner.
- **Archive, never delete** (`archivedAt: DateTime?`), per SPEC §3.5.
  Archived partners are hidden by default, visible to execs via a filter,
  and restorable. Notes cannot be added to an archived partner (the
  relationship is closed; restoring reopens it).
- **`PartnerNote` carries no `clubId`**, following the `Attendance`
  precedent: it is only ever reached through its partner, and
  `findPartnerInClub` is the club boundary. Adding a redundant `clubId`
  would create a second source of truth that could drift.

## 1. Prisma schema (`prisma/schema.prisma`)

```prisma
model Partner {
  id            String       @id @default(cuid())
  club          Club         @relation(fields: [clubId], references: [id])
  clubId        String
  name          String       // organization or person
  email         String
  phone         String?
  contactPerson String?      // who at the partner org the club talks to
  liaison       Membership?  @relation("PartnerLiaison", fields: [liaisonId], references: [id])
  liaisonId     String?
  archivedAt    DateTime?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  notes         PartnerNote[]

  @@index([clubId, archivedAt])
  @@index([liaisonId])
}

model PartnerNote {
  id        String     @id @default(cuid())
  partner   Partner    @relation(fields: [partnerId], references: [id])
  partnerId String
  author    Membership @relation("PartnerNoteAuthor", fields: [authorId], references: [id])
  authorId  String
  body      String
  createdAt DateTime   @default(now())

  @@index([partnerId, createdAt])
}
```

Back-relations on `Membership`: `liaisonFor Partner[] @relation("PartnerLiaison")`
and `partnerNotes PartnerNote[] @relation("PartnerNoteAuthor")`. Add
`partners Partner[]` to `Club`.

Migration: `npx prisma migrate dev --name partners` (purely additive).
Regenerate the client.

## 2. Permissions (`src/lib/permissions.ts`)

Two new actions in the `Action` union and `PERMISSIONS` map:

- `"partner:view"` — `EXECS`. Gates the all-partners view.
- `"partner:manage"` — `EXECS`. Create, edit, archive/restore, assign
  liaison. Nothing here is president-only: the point of the module is
  *more* exco members holding the knowledge, not fewer.

Liaison access is **not** a `can()` action — it is the ownership check
`partner.liaisonId === me.id`, applied at each call site alongside
`me.status === "ACTIVE"` (which `can()` already enforces for the exec
paths). Add a small helper in the partners `actions.ts` /
`club-context.ts`:

```ts
const canSeePartner = (me: Membership, partner: Partner) =>
  can(me, "partner:view") ||
  (me.status === "ACTIVE" && partner.liaisonId === me.id);
```

SPEC §5 matrix rows to add:

| Action | MEMBER | EXEC | PRESIDENT |
|---|---|---|---|
| View all partners | ❌ | ✅ | ✅ |
| Create/edit/archive partners, assign liaison | ❌ | ✅ | ✅ |
| View partners they liaise for + add log entries | liaison only | ✅ | ✅ |

## 3. Club-context guards (`src/lib/club-context.ts`)

Following the step-3 pattern exactly:

- `findPartnerInClub(partnerId, clubId)` → `partner ?? null`
  (`findFirst({ where: { id, clubId } })`, including `liaison` +
  `notes` with authors as needed). Server actions turn null into
  `{ error: "Partner not found." }`.
- `requirePartnerInClub(partnerId, clubId)` → 404s. Used by the
  `partners/[id]/layout.tsx` guard so a cross-club id is a **real 404**
  (layout runs above the segment's `loading.tsx`).

Writes re-assert the club in the same statement:
`partner.update({ where: { id, clubId }, … })`.

## 4. Validation (`src/lib/validations/partners.ts`)

Reuse shared pieces from `src/lib/validations/shared.ts`:

- `partnerSchema` — `{ name (1–100), email (lowercased), phone?,
  contactPerson?, liaisonId? (nullable) }`.
- `partnerNoteSchema` — `{ body: 1–2000 chars, trimmed, non-empty }`.

## 5. Server actions — `partners/actions.ts`

All `action(clubSlug, …)` → `requireClubAccess(clubSlug)` first.

- `createPartner(clubSlug, input)` — `can(me, "partner:manage")`. If
  `liaisonId` given, verify it via `findMemberInClub` and require the
  target membership be `ACTIVE` (any role — an exec liaison is fine, and a
  MEMBER liaison is the case this feature explicitly supports).
- `updatePartner(clubSlug, partnerId, input)` — `partner:manage`; same
  liaison verification; `update({ where: { id, clubId } })`. Refuse when
  archived (restore first).
- `archivePartner` / `restorePartner(clubSlug, partnerId)` —
  `partner:manage`; sets/clears `archivedAt` with
  `updateMany({ where: { id, clubId } })`.
- `addPartnerNote(clubSlug, partnerId, body)` — fetch via
  `findPartnerInClub`; authorize with `canSeePartner(me, partner)`
  (exec **or** that partner's liaison); refuse if `archivedAt` is set;
  create the note with `authorId: me.id`. **No edit/delete note actions
  exist** — the log is append-only by construction.

Each revalidates `/${clubSlug}/partners` (+ the detail path).

## 6. Pages — `src/app/[clubSlug]/(member)/partners/`

### 6.1 List (`page.tsx`)

- Execs (`partner:view`): all non-archived partners — name, contact
  person, email, liaison (name + a **warning marker when the liaison is
  unassigned or the liaison's membership is not ACTIVE** — this reassign
  prompt is the point of the module), last-note date. An
  "Include archived" filter. "Add partner" in the topbar via the
  `#topbar-actions` portal, exec-gated.
- Non-exec: only partners where `liaisonId === me.id` (query filtered
  server-side — not the full list filtered in UI). No add/archive
  controls, no archived filter.
- A non-exec with **zero** liaison partners: redirect to
  `/${clubSlug}/dashboard` (the `/dues` precedent).
- Table collapses to cards on small screens; empty + loading states via
  a `<Suspense>` inside the page (the step-3 pattern — the route gets no
  route-level `loading.tsx` because `[id]` needs real 404s).

### 6.2 Detail (`[id]/`)

- `layout.tsx` — `requireClubAccess` + `requirePartnerInClub`, then
  `canSeePartner` else `notFound()` (a member should not learn a partner
  exists; matches the admin-guard philosophy). Real 404 for cross-club
  ids and unauthorized members alike.
- `page.tsx` — partner details; exec-only "Edit" (dialog) and
  Archive/Restore controls; the interaction log as a timeline (author
  name, Africa/Lagos timestamp, body), newest first; an add-note form
  (visible to execs and the liaison) hidden when archived.
- If a note's author membership is INACTIVE/ALUMNI, still render their
  name — history is history.

### 6.3 Navigation (`nav.ts` / sidebar)

"Partners" nav item: shown to execs always; shown to a non-exec member
only when they liaise for ≥1 non-archived partner (a cheap layout count
query, run only for non-execs — the pending-badge precedent: nobody pays
for a query whose result they can't use). `pageTitle` entry for the
topbar h1.

## 7. Seed (`prisma/seed.ts`)

Two partners for Demo Club (one liaised by the exec, one by an ordinary
MEMBER — exercises the liaison-visibility path), each with 2–3 log
entries; one archived partner. One partner for Beta Club (exercises
cross-club isolation). One Demo partner with an INACTIVE liaison
(exercises the reassign warning).

## 8. Tests (Vitest, co-located)

- `src/lib/validations/partners.test.ts` — schema bounds, email
  lowercasing, empty-body note rejection.
- A permissions test covering the two new actions and, if a pure
  `canSeePartner` helper is extracted, its exec/liaison/other matrix.

## 9. Docs

- SPEC.md — the three matrix rows (§5); a Partners section under §6.
- DECISIONS.md — the decisions block above.
- README.md — one paragraph: what Partners is, who sees what.

## Build order (commit-sized)

1. Schema + migration + regenerate; permissions actions; validation
   module + tests; `find/requirePartnerInClub`.
2. Server actions (CRUD + archive + note).
3. List + detail pages, nav item, topbar action, dialogs.
4. Seed data; docs (SPEC/DECISIONS/README); `npm test` + lint +
   `next build`.

## Verification

- `npx vitest run` green; `next build` zero TS errors.
- Dev walkthrough: exec creates a partner, assigns the MEMBER liaison →
  that member's sidebar gains "Partners", the list shows exactly their
  partner, they add a note; they cannot see the other partner's detail
  page (**404**), and invoking `updatePartner` / `archivePartner`
  directly as that member is refused.
- Exec view shows the reassign warning for the unassigned/INACTIVE-liaison
  partners; archiving hides a partner from its liaison's list and blocks
  `addPartnerNote` (verified by direct action call).
- Cross-club: a Beta partner id under `/demo-club/partners/…` 404s; a
  Beta exec calling `addPartnerNote("beta-club", <demo partner id>, …)`
  gets "Partner not found."
- A member with no liaison partners hitting `/…/partners` is redirected
  to the dashboard.
