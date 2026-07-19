# Bulk Member Upload — Invite-Link Onboarding (Exec)

Feature: an exec (EXEC / PRESIDENT) bulk-adds members to their club by uploading
a CSV **or** pasting rows. Each imported person is emailed a single-use
**invite link** that both verifies their email and lets them set their own
password — no password is ever generated, shared, or handled by the exec.

Builds on the multi-club portal + auth work (`SPEC.md`, `MULTI-CLUB.md`,
`SIGNUP.MD`). Mandatory conventions for this build:

- Next.js 16 App Router, `src/` layout; the upload UI lives under
  `src/app/[clubSlug]/(member)/members/`; the invite-acceptance page under
  `src/app/(public)/`.
- Prisma 7 — import from `@/generated/prisma/client`, `@prisma/adapter-pg`
  driver adapter. No `url` in the datasource; CLI URL in `prisma.config.ts`.
- All mutations are Server Actions in `actions.ts`, `clubSlug` as first arg,
  each starting with `requireClubAccess(clubSlug)` + a `can()` check. Zod
  validation server-side. Never trust the slug or client role checks.
- Reuse the existing single-use, hashed-at-rest **token slot** machinery in
  [../src/lib/verification.ts](../src/lib/verification.ts) rather than inventing
  a new token mechanism.
- Reuse the Resend/console-mode email sender in
  [../src/lib/email.ts](../src/lib/email.ts).

## Design decisions (log in DECISIONS.md)

- **Invite link, not a generated password.** The reset flow was already built
  to double as imported-member onboarding (see `SIGNUP.MD` §9.2 and the comment
  in `reset-password/actions.ts`: clearing `mustChangePassword` means "prove you
  chose your own password"). We extend that: bulk upload issues an invite token
  and the member sets their own password on first click. Rejected alternatives:
  emailing a generated password (a real credential travels in plaintext mail,
  rarely rotated) and handing passwords to the exco (exco learns every member's
  secret — breaks the "nobody but the account holder learns a secret" property
  the token lib is built around, and members are still blocked by the hard gate
  until the email is verified anyway).
- **Dedicated `INVITE_SLOT`, separate from verification/reset.** An invite sits
  unopened in an inbox for days, so its TTL is **7 days** (vs verification 24h,
  reset 1h). A separate slot means a real password-reset request and a pending
  invite never clobber each other — same rationale `SIGNUP.MD` §1.2 gives for
  keeping verification and reset apart.
- **Imported members are created `ACTIVE`, `emailVerified` set at creation.**
  An exec vouching for an address is the same trust the CLI importer and seeds
  rely on (`SIGNUP.MD` §1.3), so no separate approval step. The account still
  can't be used until the invite is accepted: its `passwordHash` is random and
  unknown, and `mustChangePassword` is `true`. Pre-verifying is safe — a wrong
  address yields an account nobody can log into, not an open door.
- **Dedicated `member:import` permission** (EXEC + PRESIDENT) rather than
  overloading `member:approve`. Importing is a distinct capability; a distinct
  action keeps the authorization matrix legible.
- **Users are global; memberships are per-club.** An imported email that already
  has a `User` (e.g. a member of another club) reuses that `User` and only adds
  a `Membership` for this club. An existing membership in this club is reported
  as skipped, never duplicated or downgraded.

## 1. Prisma schema (`prisma/schema.prisma`)

Add a third token slot to `User`, mirroring the verification/reset trios:

```prisma
model User {
  // ...existing fields
  inviteTokenHash   String?   @unique // sha256(raw); raw is never stored
  inviteTokenSentAt DateTime?
  inviteTokenExpiry DateTime?
}
```

Migration: `npx prisma migrate dev --name member_invites` (additive, three
nullable columns; `@unique` on a nullable column is fine in Postgres — NULLs
don't collide). Regenerate the client.

## 2. Token lifecycle (`src/lib/verification.ts`)

Add alongside `VERIFICATION_SLOT` / `RESET_SLOT`:

```ts
export const INVITE_SLOT: TokenSlot = {
  hash: "inviteTokenHash",
  sentAt: "inviteTokenSentAt",
  expiry: "inviteTokenExpiry",
  ttlMs: 7 * 24 * HOUR,
};
```

- `createInviteToken(userId)` → `issueToken(INVITE_SLOT, userId)`.
- `consumeInviteToken(raw, passwordHash)` → `consumeToken(INVITE_SLOT, raw, { passwordHash, mustChangePassword: false, emailVerified: <now-if-null> })`.
  Same atomic single-use guarantee as the other slots (guarded `updateMany`,
  single-use by construction). Because import pre-sets `emailVerified`, the
  `?? now` keeps the original vouch time; it still self-heals if a future flow
  imports with `emailVerified: null`.

Unit-test in `src/lib/verification.test.ts`: invite issue/consume round-trip,
expiry, single-use, and that a consumed invite clears all three columns.

## 3. Parser + validation

### 3.1 Parser — `src/lib/members-import.ts` (new, pure)

One parser feeds **both** file upload and paste (the two input modes the user
chose), so they can never diverge:

- `parseMemberRows(raw: string): ParsedRow[]` — accepts CSV or pasted text;
  auto-detects comma vs tab delimiter; treats an optional header row
  (`name,email,phone,department,level`, case-insensitive) as such and skips it;
  trims cells; ignores blank lines.
- Columns: `name, email` required; `phone, department, level` optional.
- Returns per-row `{ lineNumber, raw, values }` so the action can report errors
  against the row the exec actually sees. **Row-level, not batch-level** — one
  bad email doesn't sink the whole upload.
- Reuse the CSV-parsing care already proven in
  [../src/lib/event-responses.ts](../src/lib/event-responses.ts) (RFC-4180
  quoting) — extract a shared `parseCsv` helper if the quoting logic is
  non-trivial, rather than hand-rolling a second parser.

### 3.2 Validation — `src/lib/validations/members.ts`

Reuse the shared `nameField` / `emailField` / `optionalText` pieces (extracted
per `ELECTIONS.md` §5 into `src/lib/validations/shared.ts`; move the name/email
pieces there too if still private to `auth.ts`):

- `importRowSchema` — `{ name, email (lowercased), phone?, department?, level? }`.
- `bulkImportSchema` — `z.array(importRowSchema).min(1).max(500)` (a sane batch
  cap; document it).
- **In-batch dedupe by email**: collapse duplicate emails within one upload,
  reporting the collision rather than issuing two invites.

## 4. Permissions (`src/lib/permissions.ts`)

Add `"member:import"` to the `Action` union and `PERMISSIONS` map, granted to
`EXECS` (`["EXEC", "PRESIDENT"]`). `can()` already rejects non-ACTIVE members.
Add the row to the SPEC authorization matrix.

## 5. Server action — `members/actions.ts`

`bulkImportMembers(clubSlug, rows: ImportRowInput[]): Promise<ImportSummary>`:

1. `requireClubAccess(clubSlug)` → `can(me, "member:import")` else `{ error }`.
2. `bulkImportSchema.safeParse(rows)`; collect field errors per row index.
3. For each valid, deduped row, in a per-row `$transaction`:
   - Find `User` by email (global lookup — users span clubs).
     - **Exists** + already a `Membership` in this club → **skip**, report
       "already a member".
     - **Exists**, no membership here → create `Membership` (ACTIVE) only;
       optionally (re)issue an invite only if the user has never set a password
       (`mustChangePassword` still true). An established user of another club
       already has working credentials — do **not** reset them; just add the
       membership.
     - **New** → create `User` with a random unusable `passwordHash`
       (`bcrypt.hash(randomBytes)`), `emailVerified: new Date()`,
       `mustChangePassword: true`; create `Membership` (ACTIVE); issue an invite
       token; send the invite email.
4. Send emails **outside** the DB transaction (a mail failure must not roll back
   a created membership); collect send failures into the summary.
5. `revalidatePath(/${clubSlug}/members)`.
6. Return `ImportSummary`: `{ created, addedExisting, skipped, errors: {row, message}[] }`.

Idempotency: re-running the same file re-issues invites only for still-unclaimed
new users and reports the rest as skipped — safe to retry.

## 6. Invite email (`src/lib/email.ts`)

Add `sendInviteEmail(to, name, clubName, inviteUrl)` following the existing
`linkEmailHtml` pattern: intro "You've been added to {clubName}. Set your
password to get started.", CTA "Set your password", link
`${APP_URL}/accept-invite?token=<raw>` (build the URL in the action via the
existing `app-url` helper, pass the formed URL in — same contract as the other
senders). Console-mode fallback is inherited for free.

## 7. Accept-invite page — `src/app/(public)/accept-invite/`

Mirror [../src/app/(public)/reset-password/](../src/app/(public)/reset-password/):

- `page.tsx` — `await searchParams` (Promise in Next 16), render a
  set-password + confirm form with the token in a hidden field. **Token is not
  consumed on GET** (mail-client prefetchers must not burn it).
- Reuse the `reset-password-form` component (or a thin shared set-password form)
  — same fields, same `useActionState` shape.
- `actions.ts` — `acceptInviteAction`: validate with `resetPasswordSchema`
  (token + password + confirm), `consumeInviteToken(token, bcrypt.hash(pw))`;
  `count === 1` → success, else "This link is invalid or has expired." On
  success `clearSession(userId)` (harmless; consistent with reset) and
  `redirect("/login?invited=1")`. **No auto-login** (same rationale as
  `/verify-email` and `/reset-password`).
- Proxy allowlist: add `/accept-invite` to the public paths in
  `src/auth.config.ts` (same list as `/reset-password`).
- Login page: show a success notice for `?invited=1`.

## 8. Upload UI — `src/app/[clubSlug]/(member)/members/`

- `bulk-upload-dialog.tsx` (client, exec-only) — opened from an "Import members"
  action in the Members topbar (`#topbar-actions` portal / the members page
  header, exec-gated with `can`). Base UI `DialogTrigger render={<Button/>}`.
  Two input modes in one dialog:
  - **File**: `<input type="file" accept=".csv,text/csv">`, read client-side
    with the File API into text.
  - **Paste**: a `<textarea>` for tab/comma-separated rows.
  Both feed the same `parseMemberRows` for a **preview/confirm step**: a table
  of parsed rows with inline per-row validation errors before anything is sent.
- On confirm → call `bulkImportMembers` via `useTransition`; render the
  `ImportSummary` (created / added / skipped / errors) with a sonner toast and
  `router.refresh()`.
- Wire an "Import members" entry point on
  [../src/app/[clubSlug]/(member)/members/page.tsx](../src/app/[clubSlug]/(member)/members/page.tsx),
  visible only to execs.

## 9. Tests (Vitest, co-located)

- `src/lib/members-import.test.ts` — delimiter detection, header skip, quoted
  cells, blank-line handling, missing required columns, in-batch dedupe.
- `src/lib/validations/members.test.ts` — row schema (bad email, name too
  short), batch min/max, email lowercasing.
- `src/lib/verification.test.ts` — `INVITE_SLOT` issue/consume/expiry/single-use.

## 10. Docs

- SPEC.md: add the `member:import` matrix row; note bulk upload under Members.
- DECISIONS.md: log the invite-link-over-generated-password choice, the
  dedicated `INVITE_SLOT` + 7-day TTL, ACTIVE + pre-verified imports, and the
  global-user / per-club-membership reuse rule.
- README.md: document the in-app bulk upload (CSV columns + paste), how it
  relates to the existing `scripts/import-members.ts` CLI, and the invite email
  env requirements (already covered by `RESEND_API_KEY` / `EMAIL_FROM` /
  `APP_URL`).

## Build order (commit-sized)

1. Schema + migration + regenerate client; `INVITE_SLOT` + token helpers + tests.
2. Parser + validation module + tests; `member:import` permission.
3. `bulkImportMembers` action + invite email sender.
4. `/accept-invite` page + action + proxy allowlist + login notice.
5. Upload dialog UI (file + paste + preview + summary) wired into Members.
6. Docs (SPEC/DECISIONS/README) + `npm test` + lint pass.

## Verification

- `npx vitest run` — parser, validation, and `INVITE_SLOT` tests green.
- Dev walkthrough (console-mode email): as an exec, upload a small CSV mixing a
  brand-new email, an email already a member of this club, and an email
  belonging to a user of another club → summary shows created / skipped /
  added-existing correctly; grab the invite link from the server console →
  open `/accept-invite?token=…` → set a password → land on `/login?invited=1`
  → log in as the new member (ACTIVE). Re-upload the same file → all reported
  skipped, no duplicate memberships, no second invite to the claimed account.
- Paste mode: same rows pasted (tab-separated) produce an identical preview.
- Authorization: a MEMBER-role session calling `bulkImportMembers` directly is
  rejected; a club-B exec importing under club A's slug is scoped/blocked.
- Cross-club: an imported email that is a user elsewhere keeps its existing
  password (no reset), only gains the new membership.
