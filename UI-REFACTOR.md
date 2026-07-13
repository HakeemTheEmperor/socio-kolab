# UI Refactor — Theming System, Sidebar Layout & Visual Polish

This document specifies a UI refactor for the existing club portal (built per `SPEC.md` and upgraded per `MULTI-CLUB.md` — implement that plan first; this one builds on its routing). It has three parts: **(A)** a club-configurable theming system, **(B)** a new app shell with sidebar navigation, **(C)** a page-by-page polish pass. Build in that order. Do not change any business logic, server actions, or the database schema except for the one addition in section A6.

Where a visual decision is not specified, choose the simplest option consistent with the design principles in section C1 and note it in `DECISIONS.md`.

---

## Part A — Theming System

### A1. Concept

Each club defines exactly **three colors** (hex): `background`, `primary`, `accent`. From these three, the app **derives a complete design-token scale** at render time. Club execs never pick more than three colors; the system computes everything else (hover states, tints, borders, muted text, surfaces).

All pages under a club's scope render with that club's theme. The platform default (used when a club hasn't customized) is:

```
background: #F8FAFC   (near-white, cool)
primary:    #4F46E5   (indigo 600)
accent:     #F59E0B   (amber 500)
```

### A2. Token scale (what gets derived)

Implement a pure function `generateTheme(background: string, primary: string, accent: string): ThemeTokens` in `lib/theme.ts`. It must output the following tokens as hex/rgb strings:

**Neutrals (derived from `background`):**
- `--bg` — the background color as given
- `--surface` — card/panel background. If background is light: pure or near white, slightly lighter than `--bg`. If dark: slightly lighter than `--bg` (mix ~6% white)
- `--surface-hover` — mix ~4% of the foreground into `--surface`
- `--border` — mix ~12% foreground into `--bg`
- `--border-strong` — mix ~24% foreground into `--bg`
- `--text` — near-black (#0F172A-ish) on light backgrounds, near-white (#F8FAFC-ish) on dark
- `--text-muted` — `--text` at reduced contrast (mix ~45% toward `--bg`)
- `--text-faint` — mix ~65% toward `--bg`

**Primary scale (derived from `primary`):**
- `--primary` — as given
- `--primary-hover` — darken ~8% (light bg) or lighten ~8% (dark bg)
- `--primary-active` — darken/lighten ~14%
- `--primary-tint` — primary mixed ~90% toward `--bg` (used for selected nav items, subtle highlights, badge backgrounds)
- `--primary-fg` — text color that sits ON primary: white or near-black, whichever has higher contrast against `--primary`

**Accent scale (derived from `accent`):** same pattern — `--accent`, `--accent-hover`, `--accent-tint`, `--accent-fg`.

**Light/dark detection:** compute relative luminance (WCAG formula) of `background`. Luminance < 0.35 → treat as dark theme and flip the neutral derivation accordingly. This single mechanism must make a red-on-black club theme fully usable with no special-casing elsewhere.

Use a tiny color utility — either `colord` (preferred, ~2kb) or hand-rolled mix/darken/lighten helpers. No heavy dependencies.

### A3. Semantic colors are FIXED (not themeable)

Success, danger, warning, and info colors do **not** change with club theming — "Unpaid" must always read as red regardless of brand colors:

```
--success: #059669  --success-tint: (success mixed ~88% toward --bg)
--danger:  #DC2626  --danger-tint:  (same treatment)
--warning: #D97706  --warning-tint: (same treatment)
--info:    #0284C7  --info-tint:    (same treatment)
```

The tints ARE recomputed against the club background (so they remain visible on dark themes), but the base hues are constants.

### A4. Injection mechanism

- The `[clubSlug]` layout resolves the club via `getClubBySlug()` (from MULTI-CLUB.md), calls `generateTheme()` with the club's colors (or defaults), and renders a `<style>` tag setting all tokens as CSS variables (server-rendered — no flash of unthemed content, no client JS required for theming). This covers everything under `/{clubSlug}/`, including the club-scoped register page.
- Pages OUTSIDE club scope — `/login`, `/clubs`, `/clubs/new`, `/admin` — render with the platform default theme (`generateTheme` called with the default trio in their layout). Club themes must never leak onto these pages.
- Wire the variables into Tailwind so utilities work naturally: extend the Tailwind config with `colors: { primary: 'var(--primary)', ... }` etc. All components then use `bg-primary`, `text-muted`, `border-border`, `bg-surface` — **never raw hex or default Tailwind palette colors** (`bg-indigo-600`, `text-gray-500` are forbidden after this refactor; sweep and replace all existing usages).
- shadcn/ui components: map their CSS variables (`--background`, `--foreground`, `--primary`, `--muted`, `--destructive`, `--ring`, etc.) to the generated tokens so existing shadcn components inherit the theme automatically.

### A5. Contrast validation

In `lib/theme.ts`, export `validateTheme(background, primary, accent)` returning `{ ok: boolean, warnings: string[] }`:
- `primary` vs `background` contrast ratio must be ≥ 3.0 (WCAG for UI components). Below that → **block saving** with a clear error.
- `accent` vs `background` ≥ 3.0 → same rule.
- `primary` vs `accent` ratio < 1.5 → non-blocking warning ("your primary and accent colors are very similar").
Run this in the settings server action (server-side, not just client).

### A6. Schema & settings UI

- Store colors in the existing `Club.settings` JSON as `theme: { background, primary, accent }`. No migration needed. Absent key = platform defaults.
- On `/settings` (president-only), add a **Appearance** section:
  - Three color inputs (native `<input type="color">` plus a text field accepting hex, kept in sync).
  - A **live preview panel** rendered with the candidate colors (a mini mock: sidebar sliver, a stat card, a primary button, a paid/unpaid badge pair) that updates as the president picks — client-side call to the same `generateTheme()` function.
  - Validation messages from `validateTheme` shown inline; save disabled while blocking errors exist.
  - A "Reset to default" button.

---

## Part B — App Shell with Sidebar

### B1. Layout structure

Replace the current layout with a persistent app shell for all authenticated pages:

```
┌────────────┬──────────────────────────────────┐
│            │  Topbar (page title · user menu) │
│  Sidebar   ├──────────────────────────────────┤
│            │                                  │
│            │  Page content (max-w-6xl,        │
│            │  centered, px-6 py-8)            │
│            │                                  │
└────────────┴──────────────────────────────────┘
```

### B2. Sidebar spec

- Width 260px, background `--surface`, right border `--border`. Full viewport height, sticky.
- **Top:** club identity block — logo (from `Club.logoUrl`, fallback to a colored initial-letter square using `--primary`) + club name + a chevron. Clicking opens a dropdown listing the user's other ACTIVE memberships (each linking to that club's dashboard) and an "All clubs" item linking to `/clubs`. If the user has only one membership, the block links straight to `/clubs` without a dropdown. This is the club-switcher affordance required by MULTI-CLUB.md §3.
- **Nav items** (icon + label, from lucide-react): Dashboard, Members, Dues (exec-only), Events, Settings (president-only), each role-filtered using the existing `can()` helper. Active item: `--primary-tint` background, `--primary` text/icon, medium weight. Inactive: `--text-muted`, hover `--surface-hover`.
- **Badge counts** on nav items where actionable: pending approvals count on Members (execs only).
- **Bottom:** the signed-in user (avatar initials, name, role label) with a dropdown: Profile, Change password, Sign out.

### B3. Responsive behavior

- ≥1024px: sidebar always visible.
- <1024px: sidebar hidden; topbar gains a hamburger that opens it as a slide-over (shadcn Sheet) with a scrim. Close on nav. This is critical — members will primarily use phones.

### B4. Topbar

Slim (56px): current page title on the left (h1 lives here, not duplicated in page body), contextual primary action on the right where pages have one (Members → "Add member" for execs; Events → "Create event"; Dues → "Export CSV"). Background `--bg`, bottom border `--border`.

---

## Part C — Visual Polish Pass

### C1. Design principles (apply everywhere)

- **Spacing rhythm:** 4px base grid. Cards `p-6`, page sections separated by `space-y-8`, form fields `space-y-4`. Generous whitespace is the single cheapest way off the "wireframe" look.
- **Cards:** `bg-surface`, `border border-border`, `rounded-xl`, **no drop shadows** except on overlays (dialogs, dropdowns, the mobile sidebar).
- **Typography scale:** page context title (topbar) 18px/medium; section headings 15px/medium, `--text`; body 14px; supporting text 13px `--text-muted`. Numbers in stat cards 28px/semibold. No other sizes.
- **One primary button per view.** Primary = `bg-primary text-primary-fg`; everything else is secondary (border style) or ghost. Destructive actions use `--danger` and always confirm via dialog.
- **Icons:** lucide-react, 16px inline / 20px in nav, `stroke-width={1.75}`, always paired with text except in the topbar user menu.
- **Copy:** sentence case everywhere (buttons, headings, labels). Buttons say what they do: "Record payment", not "Submit".

### C2. Page-specific upgrades

**Dashboard**
- Stat cards in a responsive grid (2-col mobile, 4-col desktop): value, label, small icon in a `--primary-tint` rounded square. Pending-approvals card uses `--warning-tint` when count > 0.
- "Upcoming events" as compact list cards with date block (day number large, month small) on the left, RSVP buttons inline.
- Member dues status as a single prominent banner: `--success-tint` "Paid for 2026/2027" or `--danger-tint` with a note to see the treasurer.

**Members**
- Table (desktop): avatar initials circle (background `--primary-tint`, text `--primary`), name + email stacked, then department, level, committee, status badge. Row hover `--surface-hover`, row click navigates.
- Mobile: rows collapse to cards (avatar, name, dept, status badge).
- Status badges: ACTIVE `--success-tint/--success`, PENDING `--warning-tint/--warning`, INACTIVE neutral (`--border` bg, `--text-muted`), ALUMNI `--info-tint/--info`.
- Pending approvals: a distinct card section above the table with `--warning` left border (border-radius 0 on that edge), approve/reject buttons inline.
- Member detail: two-column on desktop (profile card left; dues history + attendance history right), stacked on mobile.

**Dues**
- Summary header: three stat cards (paid count/total, unpaid count, total collected formatted as ₦ via existing currency formatting).
- Progress bar under the header: `--primary` fill on `--border` track, percentage label.
- Table rows: paid rows show green check icon + date + method; unpaid rows show a "Record payment" secondary button inline.
- Period selector as a select in the topbar action area.

**Events**
- Upcoming/past as shadcn Tabs.
- Event cards: date block left (as dashboard), title, location + time with icons, RSVP count summary ("14 going"), the user's own RSVP state as a segmented control (Going / Maybe / Not going) with the active segment in `--primary`.
- Event detail: RSVP lists grouped in three columns (desktop) with count headers; check-in view keeps its search but rows get avatar + a clear checked-in state (green check + timestamp) vs a "Check in" button.

**Auth pages**
- Shared treatment: centered card (max-w-md) on `--bg`, single-column fields, primary button full-width.
- `/login` (global): platform default theme, platform name/wordmark above the form — no club branding.
- `/{clubSlug}/register`: the club's theme, with club logo/initial + club name above the form ("Join {Club Name}"). The applications-closed state gets the same centered-card treatment: club identity, a short "Applications are currently closed" message, no form.

**Platform pages** (default theme, no sidebar — simple centered layouts)
- `/clubs`: memberships as a card grid (max-w-2xl): club initial/logo square, club name, the user's role as a subtle badge; PENDING memberships rendered muted with an "awaiting approval" label. "Start a new club" as a secondary action below the grid, sign-out in a slim top-right corner.
- `/clubs/new`: single centered form card; slug field shows live availability feedback (subtle `--success`/`--danger` inline text).
- `/admin`: minimal single-column layout (max-w-4xl) with its own slim header; pending-requests card section above the all-clubs table. Function over beauty — this page is for you only, keep it to clean defaults.

**Empty states** (every list): centered, icon in a muted circle, one-line explanation, and the relevant action button if the viewer's role can act ("No events yet" + "Create event" for execs). No bare "No data" text anywhere.

**Loading states:** skeleton rows matching each table/card layout (shadcn Skeleton), not spinners, for all list pages.

### C3. Sweep checklist

- Remove all default-Tailwind color utilities (`gray-*`, `indigo-*`, `slate-*`, etc.) in favor of token utilities.
- Every interactive element has a visible keyboard focus ring (`--ring` mapped to `--primary`).
- Toasts for every mutation result (already required by SPEC.md — verify styling uses tokens).
- Dark-club-theme test: temporarily set the seed club theme to `background #0A0A0A, primary #DC2626, accent #F97316` and click through every page; fix any hardcoded light-mode assumption found. Revert seed after.

---

## Build order

1. `lib/theme.ts` (`generateTheme`, `validateTheme`) with unit tests covering: light bg, dark bg, low-contrast rejection, `--primary-fg` flip.
2. Token injection in root layout + Tailwind/shadcn variable wiring. App should look identical-ish but now token-driven.
3. Color sweep (C3 item 1) — replace all raw palette classes.
4. App shell: sidebar + topbar + responsive slide-over.
5. Settings → Appearance section with live preview and validation.
6. Polish pass, page by page, in this order: Dashboard, Members, Dues, Events, Auth, platform pages (`/clubs`, `/clubs/new`, `/admin`), empty/loading states.
7. Dark-theme click-through test (C3 last item), fixes, `README.md` update documenting the theming system.

Commit after each numbered step.

## Acceptance checklist

- [ ] With no theme set, the app renders the indigo default and looks materially more polished than before (cards, spacing, sidebar).
- [ ] President sets red/black/orange in Appearance, saves, and every club-scoped page — including `/{clubSlug}/register` — renders the dark club theme with readable text, visible borders, and correct badge colors.
- [ ] `/login`, `/clubs`, and `/admin` always render the platform default indigo theme, regardless of any club's customization; switching between two differently-themed clubs via the sidebar switcher swaps the entire theme correctly.
- [ ] Attempting to save yellow `#FDE047` primary on white background is blocked with a clear contrast error.
- [ ] "Paid" and "Unpaid" badges remain green/red under every club theme.
- [ ] On a 375px viewport: sidebar is a hamburger slide-over, member table renders as cards, all pages usable one-handed.
- [ ] Keyboard: tab through the dues page — every control shows a visible focus ring in the club's primary color.
- [ ] `next build` passes with zero TypeScript errors; no `gray-*`/`indigo-*`/`slate-*` classes remain (`grep` verify).
