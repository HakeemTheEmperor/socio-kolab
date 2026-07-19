# Elections feature — full lifecycle (create → apply → review → vote → results)

## Context

The club portal needs elections: presidents create an election listing electable positions, members apply for positions (with a manifesto) during an application window, the president reviews applications, approved candidates go on the ballot, members vote during a voting window with live tallies (≤10s latency), and final results are viewable and exportable to CSV.

Note: SPEC.md currently lists voting/elections as a v1 **non-goal** — this plan deliberately extends scope, so SPEC.md gets updated as part of the work. There is no existing election code, no real-time infra, and no polling pattern in the codebase; live tallies introduce a new (but minimal) polling pattern.

**Decisions confirmed with user:** anonymous ballots · live tallies visible to all ACTIVE members during voting · scheduled phase windows (clock-derived, no cron) with manual president overrides · president-only management.

## Design decisions (log in DECISIONS.md)

- **Hybrid lifecycle**: `Election.status: DRAFT | PUBLISHED | CLOSED | CANCELLED` is president-controlled; fine-grained phase is derived on read from four window datetimes, only while PUBLISHED. DRAFT invisible to non-presidents; CLOSED/CANCELLED override the clock (early close / cancel, no cron needed).
- **Anonymity**: `Vote` has **no voter link and no timestamps** (deviating from the repo's createdAt/updatedAt convention deliberately — a Vote.createdAt would correlate 1:1 with the receipt written in the same transaction, deanonymizing ballots to anyone with DB access). A separate `VoteReceipt` (unique per position+member) enforces one-vote and provides turnout. **No vote changes after cast** (impossible to attribute anyway).
- **Race guard**: the receipt's unique constraint is the authoritative one-vote guard — catch P2002 in `castVote`, no TOCTOU pre-check reliance.
- One application per member **per position** (`@@unique([positionId, membershipId])`); applying to multiple positions in one election is allowed (president review filters). Self-vote allowed.
- Per-position vote casting (partial ballots OK).
- Live tallies via **GET route handler + client setInterval polling (7s)** — `router.refresh()` every 7s would re-render the whole RSC tree for one number; a GET JSON handler matches the existing route-handler precedent and is curl-testable.

## 1. Prisma schema (`prisma/schema.prisma`)

Migration: `npx prisma migrate dev --name elections`. No cascades (repo rule — app-layer `$transaction` deletes). Add backrefs `elections Election[]` to Club; `candidacies Candidacy[]`, `voteReceipts VoteReceipt[]` to Membership.

```prisma
enum ElectionStatus { DRAFT PUBLISHED CLOSED CANCELLED }
enum CandidacyStatus { PENDING APPROVED REJECTED WITHDRAWN }

model Election {
  id                  String         @id @default(cuid())
  club                Club           @relation(fields: [clubId], references: [id])
  clubId              String
  title               String
  description         String?
  status              ElectionStatus @default(DRAFT)
  applicationsStartAt DateTime
  applicationsEndAt   DateTime
  votingStartAt       DateTime
  votingEndAt         DateTime
  closedAt            DateTime?      // early-close audit
  createdById         String         // membership id, no FK (recordedById pattern)
  positions           Position[]
  receipts            VoteReceipt[]
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
  @@index([clubId, status])
}

model Position {
  id          String      @id @default(cuid())
  election    Election    @relation(fields: [electionId], references: [id])
  electionId  String
  title       String
  order       Int         @default(0)
  candidacies Candidacy[]
  votes       Vote[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  @@unique([electionId, title])
}

model Candidacy {
  id           String          @id @default(cuid())
  position     Position        @relation(fields: [positionId], references: [id])
  positionId   String
  membership   Membership      @relation(fields: [membershipId], references: [id])
  membershipId String
  statement    String          // manifesto
  status       CandidacyStatus @default(PENDING)
  reviewedById String?         // president's membership id, no FK
  reviewedAt   DateTime?
  votes        Vote[]
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  @@unique([positionId, membershipId])
  @@index([positionId, status])
}

// Anonymous: NO voter link, NO timestamps (see design decisions).
model Vote {
  id          String    @id @default(cuid())
  clubId      String    // denormalized scope guard for tally queries
  position    Position  @relation(fields: [positionId], references: [id])
  positionId  String
  candidacy   Candidacy @relation(fields: [candidacyId], references: [id])
  candidacyId String
  @@index([positionId, candidacyId]) // tally groupBy
}

model VoteReceipt {
  id           String     @id @default(cuid())
  election     Election   @relation(fields: [electionId], references: [id])
  electionId   String
  positionId   String     // plain string — uniqueness is the point, not a relation
  membership   Membership @relation(fields: [membershipId], references: [id])
  membershipId String
  createdAt    DateTime   @default(now())
  @@unique([positionId, membershipId]) // the one-vote guarantee
  @@index([electionId, membershipId])  // turnout + "positions I've voted"
}
```

## 2. Pure helpers — `src/lib/elections.ts` (new)

- `type ElectionPhase = "draft" | "scheduled" | "applications" | "review" | "voting" | "closed" | "cancelled"`
- `getElectionPhase(election, now): ElectionPhase` — CANCELLED→cancelled, CLOSED→closed, DRAFT→draft; PUBLISHED maps clock → scheduled / applications / review (gap between appsEnd and votingStart) / voting / closed. Boundaries: start inclusive, end exclusive.
- `buildTallies(positions, candidates, groupRows)` — input shape matches `prisma.vote.groupBy({ by: ["positionId", "candidacyId"], _count: true })`; zero-fills candidates with no votes, computes totals/percent, marks leaders (ties = multiple leaders).
- `buildResultsCsvRows(tallies, turnout): string[][]` — header `Position, Candidate, Votes, Share, Outcome` + turnout summary rows. Feeds the existing `toCsv`/`csvCell` from [src/lib/event-responses.ts](../src/lib/event-responses.ts) (already formula-injection-safe + RFC-4180 — reuse, don't duplicate).

## 3. Permissions — `src/lib/permissions.ts`

Add to `Action` union + `PERMISSIONS`:
- `"election:manage"` → `PRESIDENT_ONLY` (create/edit/delete/publish/close/cancel/review)
- `"election:apply"` → `ALL`
- `"election:vote"` → `ALL`

(`can()` already rejects non-ACTIVE members.)

## 4. Guards — `src/lib/club-context.ts`

Add `findElectionInClub(clubId, electionId)` / `requireElectionInClub` mirroring `findEventInClub` (compound `{ id, clubId }` filter, `cache()`-wrapped, `notFound()` variant).

## 5. Validation — `src/lib/validations/elections.ts` (new)

First **extract `toLagosDate`** (private in [src/lib/validations/events.ts:17-23](../src/lib/validations/events.ts#L17-L23)) plus `optionalText` into a shared `src/lib/validations/shared.ts`; update events.ts imports. Then:

- `electionSchema`: title (trim 2–200), description optionalText(2000), `positions: array({ title: trim 2–100 }).min(1).max(20)` + case-insensitive duplicate-title refine; four `z.preprocess(toLagosDate, z.coerce.date())` window fields; cross-field refines: appsStart < appsEnd ≤ votingStart < votingEnd (each with `path`).
- `applicationSchema`: statement trim 20–5000.
- `reviewDecisionSchema`: `z.enum(["APPROVED", "REJECTED"])`.
- Export `z.input` types.

## 6. Server actions — `src/app/[clubSlug]/(member)/elections/actions.ts` (new)

Events pattern throughout: `"use server"`, clubSlug first arg, `requireClubAccess` → `can()` → `safeParse` → compound fetch → mutate → `revalidatePath`, return `{ ok, error? }`.

- `createElection(clubSlug, input)` — nested-create positions with `order: i`; `createdById: me.id`; DRAFT.
- `updateElection(clubSlug, electionId, input)` — **DRAFT only** (windows/positions lock after publish); position sync = delete-and-recreate in `$transaction` (safe: DRAFT has no candidacies/votes).
- `deleteElection` — DRAFT only; `$transaction([positions.deleteMany, election.delete])`.
- `publishElection` — DRAFT→PUBLISHED; reject if `votingEndAt < now`.
- `closeElection` — PUBLISHED→CLOSED, sets `closedAt`.
- `cancelElection` — DRAFT/PUBLISHED→CANCELLED.
- `applyForPosition(clubSlug, electionId, positionId, { statement })` — phase must be `applications`; position must belong to election; create Candidacy, catch P2002 → "already applied"; a WITHDRAWN row is re-opened to PENDING with the new statement.
- `withdrawApplication(clubSlug, electionId, candidacyId)` — own row only, until votingStartAt; → WITHDRAWN.
- `reviewApplication(clubSlug, electionId, candidacyId, decision)` — `election:manage`; phase applications/review; sets status + `reviewedById`/`reviewedAt`.
- `castVote(clubSlug, electionId, positionId, candidacyId)` — phase re-derived server-side must be `voting`; validate candidacy in one query (`{ id, positionId, status: "APPROVED", position: { electionId, election: { clubId } } }`); then:
  ```ts
  await prisma.$transaction([
    prisma.vote.create({ data: { clubId, positionId, candidacyId } }),
    prisma.voteReceipt.create({ data: { electionId, positionId, membershipId: me.id } }),
  ]);
  // catch P2002 → "You have already voted for this position."
  ```

## 7. Pages — `src/app/[clubSlug]/(member)/elections/`

- `page.tsx` (server) — list with phase badges; DRAFT hidden from non-presidents; "Create election" via `#topbar-actions` portal like events.
- `election-form-dialog.tsx` (client, Pattern A: useState + useTransition + sonner + `router.refresh()`, Base UI `DialogTrigger render={<Button/>}`, slug from `useParams()`) — title/description, dynamic position rows (add/remove), four `datetime-local` inputs.
- `delete-election-button.tsx` + lifecycle control buttons (publish/close/cancel with confirm).
- `[id]/page.tsx` (server) — compound fetch incl. positions (ordered) + candidacies + membership.user; `phase = getElectionPhase(election, new Date())`; 404 DRAFT for non-presidents. Phase-dependent render:
  - **draft/scheduled**: overview + president edit/publish/delete.
  - **applications**: `apply-dialog.tsx` per position; own application card + withdraw; president `review-list.tsx` (approve/reject PENDING).
  - **review**: president review UI; members see approved slates.
  - **voting**: `ballot.tsx` (client) — radio list of APPROVED candidates per un-voted position (server passes user's receipts); voted positions show "Ballot cast". Below: `live-results.tsx` poller.
  - **closed**: server-rendered final results (buildTallies + turnout) + "Export CSV" `<a>` link to results route. **cancelled**: banner.
- `[id]/tallies/route.ts` — GET JSON tallies.
- `[id]/results/route.ts` — GET CSV.

## 8. Nav — `src/components/app-shell/nav.ts`

Add Elections nav item (lucide `Vote` icon, after Events) + `elections` entry in the pageTitle map.

## 9. Live tallies

`tallies/route.ts`: re-run `requireClubAccess` (route handlers bypass the layout guard, per the responses-route precedent), compound election fetch, serve only when phase is voting/closed; `vote.groupBy` + receipt turnout → `buildTallies`; `Response.json(payload, { headers: { "Cache-Control": "no-store" } })`, payload includes current phase.

`live-results.tsx`: initial tallies from server props (no flash); `setInterval(fetch, 7000)`; pause on `visibilitychange` hidden; stop when payload phase is closed; silent error tolerance (next tick retries); cleanup on unmount. Meets the ≤10s budget.

## 10. Results CSV — `[id]/results/route.ts`

Mirror [src/app/[clubSlug]/(member)/events/[id]/responses/route.ts](../src/app/[clubSlug]/(member)/events/[id]/responses/route.ts): `requireClubAccess`, member-visible (no exec gate — results are public to members), compound fetch, serve only when phase closed; `buildResultsCsvRows` → `toCsv` from `@/lib/event-responses`; UTF-8 BOM; filename `slugify(title)-results.csv`; `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment`.

## 11. Tests (Vitest, co-located)

- `src/lib/elections.test.ts` — `getElectionPhase` (every status override + each clock boundary + apps/voting gap); `buildTallies` (zero votes, zero-fill, percentages, ties); `buildResultsCsvRows` composed with `toCsv` (formula-hostile candidate name survives).
- `src/lib/validations/elections.test.ts` — window-ordering refines (each violation), duplicate position titles, statement bounds, datetime-local parsing.

## 12. Docs

- SPEC.md: remove elections from v1 non-goals (line 15), add Elections section.
- DECISIONS.md: new phase section logging the design decisions above (especially Vote anonymity/no-timestamps, hybrid lifecycle, receipt-constraint race guard, polling choice).
- README.md: feature list mention.

## Implementation order (commit-sized)

1. Schema + migration + regenerate client.
2. `src/lib/elections.ts` helpers + tests.
3. Extract shared validation helpers; `validations/elections.ts` + tests; permissions actions; club-context guards.
4. `elections/actions.ts` management actions (create/update/delete/publish/close/cancel).
5. List page + form dialog + nav wiring.
6. `[id]` detail page skeleton with phase rendering + lifecycle controls; apply/withdraw/review actions + UIs.
7. `castVote` + ballot UI.
8. Tallies route + live-results poller.
9. Closed results UI + CSV route.
10. Docs updates; `npm test` + lint pass.

## Verification

- `npx vitest run` — all new schema/phase/tally tests green.
- Dev-server walkthrough with two browser sessions (president + member): create DRAFT election with 2 positions and near-future windows → publish → member applies → president approves/rejects → clock enters voting window → both cast votes → confirm live tally updates within ~7s in the other session → one member re-vote attempt fails cleanly → close election → results page + `curl -OJ` the CSV route, open CSV to check headers/BOM/turnout rows.
- Cross-club check: hit `/{otherClubSlug}/elections/{id}` for an election from another club → 404.
