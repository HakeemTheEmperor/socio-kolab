# Custom Event Registration Forms — Implementation Plan

Feature: drag-and-drop customizable registration forms per event, with open/close intake control, public (non-member and anonymous) registration, and exec-side response reporting + CSV export.

Builds on the multi-club portal (`SPEC.md`, `MULTI-CLUB.md`, `UI-REFACTOR.md`). Mandatory conventions for this build:
- Next.js 16 App Router, `src/` layout; club-scoped routes under `src/app/[clubSlug]/(member)/...` and `src/app/[clubSlug]/(public)/...`.
- Prisma 7.8 — import from `@/generated/prisma/client`, `@prisma/adapter-pg` driver adapter.
- No client form library. Plain `<form action={serverAction}>` + React 19 `useActionState`. All mutations are Server Actions with server-side Zod validation.
- UI on `@base-ui/react` (use the `render` prop on triggers, never `asChild`) + Tailwind v4, using the theme tokens from UI-REFACTOR.md.
- All event times treated as `Africa/Lagos` wall-clock.
- Every exec-facing server action takes `clubSlug` as its first parameter and verifies via `requireClubAccess(slug, minRole)`. The public submit action is the one deliberate exception (see Phase 4) — it still resolves and scopes by slug but requires no session.
- No hard deletes of core data anywhere in this feature.

---

## Phase 1 — Prisma Schema

### 1.1 Event: form configuration + intake toggle

```prisma
model Event {
  // existing fields unchanged, plus:
  formSchema         Json    @default("[]")
  acceptingResponses Boolean @default(true)
}
```

`formSchema` is an ordered array of field definitions:

```ts
type FormField = {
  id: string;          // stable nanoid, generated client-side when a field is added — NEVER changes after creation
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number';
  label: string;       // 1–100 chars
  required: boolean;
  options?: string[];  // select only; 1–20 options, each 1–100 chars
};
```

Rules:
- **Responses are keyed by field `id`, never by label.** Labels are editable; ids are immutable. This is what keeps historical responses readable after an exec renames or deletes a field.
- Core fields (Name, Email) are NOT stored in `formSchema` — they are hardcoded in the render and the validator, so they can never be deleted or reordered out.
- Array order in `formSchema` = display order (drag-and-drop persists by reordering the array). No separate `order` field needed.
- Max 20 custom fields per event (enforced in Zod).
- JSONB over a relation model: the schema is always read/written as one atomic unit, is never queried field-by-field, and versioning-by-id makes migrations unnecessary. A relation table would add joins for zero benefit at this scale. Document this choice in `DECISIONS.md`.

### 1.2 Attendance: support guests + store responses

`Attendance` remains the single registration record, extended to support non-members:

```prisma
model Attendance {
  // existing fields (eventId, membershipId, rsvp, checkedInAt, checkedInById) with ONE change:
  membershipId  String?      // now optional
  membership    Membership?  @relation(...)
  guestName     String?
  guestEmail    String?
  formResponses Json         @default("{}")   // { [fieldId]: string | number | boolean }

  @@unique([eventId, membershipId])
  @@unique([eventId, guestEmail])
}
```

- Invariant (enforced in the server action, since Prisma can't express XOR): a row has EITHER `membershipId` OR (`guestName` + `guestEmail`), never both, never neither.
- Postgres treats NULLs as distinct in unique constraints, so `@@unique([eventId, membershipId])` still dedups members while allowing many guest rows, and `@@unique([eventId, guestEmail])` dedups guests (store emails lowercased/trimmed).
- Closing a form, editing the schema, or deleting a field never deletes or mutates existing `formResponses` (no-hard-delete rule). Orphaned response keys (field removed from schema) are retained and surfaced in reporting as "(removed field)".
- Migration is additive only; existing attendance rows are untouched (`formResponses` defaults to `{}`).

### 1.3 Shared validation module

Create `src/lib/event-forms.ts` — single source of truth used by both the builder save action and the public submit action:
- `FormFieldSchema` / `FormSchemaSchema` (Zod) validating the builder's output: id format, label length, type enum, select requires 1–20 non-empty options, ≤20 fields, unique ids.
- `buildResponseValidator(formSchema)` — see Phase 4.
- `parseFormSchema(json)` — safe parse of DB value with graceful fallback to `[]`.

---

## Phase 2 — Drag-and-Drop Form Builder (Exec)

### 2.1 Library

Use **`@dnd-kit/core` + `@dnd-kit/sortable`**. Rationale: actively maintained, first-class keyboard accessibility (space to lift, arrows to move, space to drop — announce via its screen-reader announcements API), no wrapper-DOM opinions (plays cleanly with Tailwind v4), works with React 19. `@hello-pangea/dnd` is heavier and list-only; native HTML5 DnD has poor keyboard/touch support and is disqualified by the accessibility requirement.

### 2.2 Placement & state model

The builder is a client component (`FormBuilder`) embedded in both `/[clubSlug]/(member)/events/new` and `/[clubSlug]/(member)/events/[id]/edit`, below the core event fields, in a bordered section titled "Registration form".

Since there is no form library, the builder holds its state in `useState<FormField[]>` (initialized from the event's `formSchema` on edit) and serializes to the surrounding plain `<form>` via a single `<input type="hidden" name="formSchema" value={JSON.stringify(fields)} />` kept in sync. The page's existing create/edit server action gains one more field to validate and persist — no separate save flow, no partial saves: the schema is saved atomically with the event.

UI structure:
- **Pinned core section** (top, visually distinct, no drag handles): Name and Email rows, badged "Always included", with a lock icon — not draggable, not deletable, not editable.
- **Sortable custom-field list**: each row = drag handle (grip icon, `aria-label="Reorder {label}"`), inline label input, type indicator, required toggle (Base UI Switch), overflow actions (edit options for selects, delete).
- **"Add field" menu** (Base UI Menu, trigger via `render` prop): the five types. Adding appends a field with a fresh nanoid and default label ("Untitled question"), focused for immediate rename.
- **Select options editor**: expanding panel within the row — list of option text inputs, add/remove option, min 1 enforced in-UI.
- **Delete**: Base UI AlertDialog confirm, copy warns that already-collected responses for this field will be kept but shown as "(removed field)". Delete removes it from the array only (responses untouched, per no-hard-delete).
- **Live preview** (optional but recommended, cheap): a collapsed "Preview form" disclosure rendering the same `DynamicForm` component from Phase 3 in disabled mode — guarantees builder/renderer parity.

### 2.3 Intake toggle

"Accepting responses" Base UI Switch in the same section (edit page and event detail header for quick access). Wired to a dedicated `setEventFormStatusAction(clubSlug, eventId, accepting)`:
- `requireClubAccess(clubSlug, 'EXEC')`, event fetched via compound `{ id, clubId }`, toggle persisted, `revalidatePath` on the event detail + register routes.
- Toggling off is instant and does not touch `formSchema` or existing responses.

### 2.4 Builder save validation (server)

The event create/edit action parses the hidden `formSchema` input with `FormSchemaSchema`. Reject on: invalid JSON, >20 fields, duplicate ids, empty labels, select without options. On edit, ids present in the previous schema keep their ids (the client never regenerates ids for existing fields — verify in review).

---

## Phase 3 — Public Registration Page & Closed State

Route: `src/app/[clubSlug]/(public)/events/[id]/register/page.tsx` — inside the club slug segment (club theme applies per UI-REFACTOR.md) but in the `(public)` group: **no auth requirement, no membership requirement**.

### 3.1 Resolution ladder (server component)

1. `getClubBySlug(slug)` — non-ACTIVE club → `notFound()`.
2. `prisma.event.findFirst({ where: { id, clubId: club.id } })` — compound scope, missing → `notFound()`.
3. `acceptingResponses === false` → render the **closed screen**: centered card, club identity, event title, calendar-off icon in a muted circle, "This form is no longer accepting responses." No input elements are rendered at all (not disabled inputs — none). Same treatment for events whose `startsAt` is in the past (auto-closed), with copy "This event has already taken place." (Compare using Lagos wall-clock.)
4. Otherwise render the event summary (title, date/time in `Africa/Lagos`, location) + `DynamicForm`.

### 3.2 Viewer states

Resolve the session (if any) and, if present, the viewer's membership in THIS club:

| Viewer | Name/Email fields | Registration will link to |
|---|---|---|
| ACTIVE member of this club | Prefilled from user + membership, rendered read-only with a note "Registering as {name}" | `membershipId` |
| Signed-in, no membership here | Prefilled from user account, editable | guest fields |
| Anonymous | Empty, editable, required | guest fields |

- Already registered (member row exists, or a guest row matches a signed-in user's email): render a "You're registered ✓" card with their submitted responses instead of the form. Members' existing RSVP controls elsewhere in the app are unaffected.
- No viewer state is trusted client-side — the table above is re-derived inside the server action.

### 3.3 Dynamic rendering

`DynamicForm` (server-rendered markup, client wrapper only for `useActionState`) maps `formSchema` → native inputs, all named `custom_{fieldId}`:
- `text` → `<input type="text" maxLength={500}>`; `textarea` → `<textarea maxLength={5000} rows={4}>`; `number` → `<input type="number" inputMode="decimal">`; `checkbox` → single `<input type="checkbox">` with the label; `select` → native `<select>` with a disabled placeholder option first.
- `required` fields get the `required` attribute (UX only — server revalidates) and a visible marker.
- Labels/options are user-authored strings — rendered as React text nodes only, never `dangerouslySetInnerHTML`.
- Submit button: club `--primary`, full-width, pending state via `useActionState`'s pending flag. Field-level errors from the action state render under each input.
- Add a honeypot field (visually hidden text input; non-empty → silently accept-and-drop) as cheap anonymous-spam deterrence.

### 3.4 Sharing

On the exec event detail page, show the public register URL (`/{clubSlug}/events/{id}/register`) with a copy button — this is the link clubs blast to WhatsApp, which is the whole point of the feature.

---

## Phase 4 — Server Action & Dynamic Validation

`submitEventRegistrationAction(clubSlug: string, eventId: string, prevState: ActionState, formData: FormData)` — `clubSlug` and `eventId` bound via `.bind()` at render, `prevState`/`formData` supplied by `useActionState`.

Ordered flow (each step fails closed):

1. **Resolve club** by slug, ACTIVE only → generic failure state if not.
2. **Resolve event** via compound `{ id, clubId }` → generic failure if not.
3. **Intake gate FIRST:** `acceptingResponses === false` OR event in the past (Lagos time) → return `{ error: "This form is no longer accepting responses." }` before reading any fields. This is the hard server-side boundary — the UI banner is cosmetic; this check is the actual control against replayed/scripted POSTs.
4. **Honeypot** check → silently return success without writing.
5. **Build the dynamic validator** with `buildResponseValidator(event.formSchema)`:
   - For each field id → `text`: `z.string().trim().max(500)`; `textarea`: `.max(5000)`; `number`: `z.coerce.number().finite()`; `checkbox`: presence → boolean; `select`: `z.enum(event.formSchema options)` — a value outside the configured options is rejected, not stored.
   - `required` → min(1)/refine non-empty; optional fields absent → omitted from the stored object.
   - **Unknown `custom_*` keys in the payload are rejected** (strict mode) — nothing not in the schema is ever persisted.
   - Core: `name` `z.string().trim().min(1).max(120)`, `email` `z.string().email().max(254)` → lowercased.
6. **Re-derive viewer state server-side** (session → membership in this club). Member → ignore submitted name/email entirely, use their own; write with `membershipId`. Otherwise → guest row.
7. **Duplicate gate**: member with an existing row for this event, or guest email already registered → `{ error: "You're already registered for this event." }` (the unique constraints backstop a race; catch P2002 and return the same message).
8. **Write** `Attendance` with `rsvp: GOING`, `formResponses` keyed by field id. `revalidatePath` for the event detail. Return success state → page swaps to the "You're registered ✓" card.

Zod schemas and the validator builder live in `src/lib/event-forms.ts` (Phase 1.3) so the builder and submitter can never drift.

## Phase 5 — Exec Reporting & CSV Export

### 5.1 Responses view

On `/[clubSlug]/(member)/events/[id]` (exec-only section, `requireClubAccess(slug, 'EXEC')`), add a "Responses" tab alongside the existing RSVP/check-in views:

- Header: response count, member/guest split, the intake toggle (same action as 2.3), copy-link button.
- **Column derivation**: Name, Email, Registered at, Member/Guest badge, then one column per field in current `formSchema` order, then any orphaned field ids found across responses appended last with header "(removed field)". Checkbox values render as Yes/—.
- Desktop: horizontally scrollable table (custom fields can be many), sticky first column. Mobile: collapse to cards — name + badge as card header, responses as label/value rows (per UI-REFACTOR.md responsive conventions).
- Empty state per UI-REFACTOR.md: "No responses yet" + copy-link action.
- Guests appear in the existing check-in list too (they attend the event like anyone else) — check-in rows render `guestName` with a "Guest" badge when `membershipId` is null. Audit the existing check-in and RSVP-count queries for null-membership safety.

### 5.2 CSV export

`exportEventResponsesAction(clubSlug, eventId)` (or a route handler returning `text/csv`; prefer the route handler so the browser downloads natively — it must run the same `requireClubAccess` + compound-scope checks):

- Header row mirrors 5.1's column derivation exactly (shared helper `deriveResponseColumns(formSchema, responses)` used by both table and CSV).
- Proper CSV escaping: wrap fields containing `"`, `,`, or newlines in quotes, double inner quotes. **Formula-injection guard**: prefix cell values starting with `=`, `+`, `-`, or `@` with `'` (responses are attacker-controlled text landing in execs' Excel).
- Timestamps formatted in `Africa/Lagos`. Filename: `{event-slugified-title}-responses.csv`.

---

## Build order

1. Schema migration + `src/lib/event-forms.ts` with unit tests (schema validation, validator builder incl. strict unknown-key rejection, select-enum enforcement, required/optional paths).
2. Builder UI in create/edit + save-path validation. Verify keyboard DnD.
3. Intake toggle (action + switch placements).
4. Public register page: resolution ladder, closed states, viewer states, dynamic render.
5. Submit action end-to-end.
6. Responses tab + guest-safe check-in audit.
7. CSV export.
8. README section + click-through.

Commit after each step.

## Acceptance checklist

- [ ] Exec adds all five field types, reorders via mouse AND keyboard only, renames a field, saves; reopening edit shows the exact order and the renamed field with its original id.
- [ ] Deleting a field that already has responses: existing responses remain in the Responses tab/CSV under "(removed field)".
- [ ] Anonymous visitor registers via the public link; response appears in the tab with a Guest badge and in check-in.
- [ ] Same guest email registering twice → friendly duplicate error, one row in DB.
- [ ] Signed-in club member opens the register link → name/email locked to their identity; a second submission attempt shows "already registered".
- [ ] Toggle off → page shows the closed banner with zero input elements, AND a direct POST replay of a previously-valid payload is rejected server-side.
- [ ] Submitting a select value not in the configured options, or an unknown `custom_x` key → validation error; nothing persisted.
- [ ] A registration link from club A's event opened under club B's slug → 404.
- [ ] CSV opens correctly in Excel with all custom columns; a response of `=1+1` exports inert (leading `'`).
- [ ] `next build` passes with zero TypeScript errors.
