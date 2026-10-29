# SocioKolab — measured frontend numbers

Every figure in this file comes from a run recorded in `metrics/results/`. Nothing is estimated.
Raw per-run data (all 5 runs of every measurement) is in `metrics/results/raw/*.json`; the tables below are
generated from it by `node metrics/report.mjs`.

## 0. Where the brief did not match the app

| Brief assumed | What the app does | What I did |
|---|---|---|
| The theme validator blocks every palette that produces unreadable text. | `validateTheme` only checked primary and accent against the background. Derived text (body, muted, button labels, badge ink) was never checked. On 10,000 random palettes **1,589 palettes with sub-AA text were accepted** (2,106 of the "brand-like" set). | Fixed in `src/lib/theme.ts` (see §5). After the fix: 0 false passes. |
| `next build` prints first-load JS per route. | Next 16 with Turbopack no longer prints that table. | Used Next's own `.next/diagnostics/route-bundle-stats.json` (first-load JS per route, raw bytes) and gzipped the listed chunks myself. |
| Streaming is used on routes with Suspense. | Only 4 routes use an in-page `<Suspense>` (events, members, partners, elections list pages). 7 more use `loading.tsx` (dashboard, dues, events/[id], members/[id], partners/[id], settings, profile). The rest have neither. | Measured all 11. |
| Form builder "stores fields and responses" so edits could lose responses. | `Event.formSchema` is one JSONB array of fields with immutable nanoid ids. Each registration stores `Attendance.formResponses` as `{ fieldId: value }`. A schema edit never rewrites responses; the exec table and CSV join them by id at read time. | Property test goes through the real reporting code (`deriveResponseColumns`, `responseCellCsv`) and the real submit validator. The edit operators copy what `form-builder.tsx` does to the array; the React component is not driven by this test (the Playwright run in §4 does that part). |
| Mobile TTFB under throttling includes network latency. | Chrome's DevTools throttling delays the response *body*, not the request: TTFB in §1a is server time only (document `responseEnd` shows the 150 ms). | Reported as measured; use FCP/LCP for user-perceived timing. |
| Every route can be measured the same way. | `/clubs` redirects to the dashboard for a user with one club (Lighthouse follows the redirect). There is no elections data in the seed, so the elections list is the empty state. | Noted in the tables. |
| Coverage is one number. | Vitest only counts files the tests import. | Reported both: 76.8% of the files the tests load, 16.6% of all of `src/`. |

## 1. Codebase summary

**Routes** (Next 16 App Router, `src/proxy.ts` guards them; club pages live under `app/[clubSlug]`):
public `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/accept-invite`;
signed-in `/clubs`, `/clubs/new`; per club `/{slug}/register`, `/{slug}/events/{id}/register` (public) and, for active members,
`/{slug}/dashboard`, `members`, `members/[id]`, `dues`, `events`, `events/[id]`, `elections`, `elections/[id]`, `partners`, `partners/[id]`,
`settings`, `profile`; platform admin `/admin`, `/admin/clubs`, `/admin/users`. All mutations are Server Actions that re-resolve the club from the slug and check `can()`.

**Form builder.** `form-builder.tsx` (client) edits a `FormField[]` held by `EventFormDialog`; @dnd-kit `PointerSensor` + `KeyboardSensor`, custom screen-reader announcements.
The array is saved with the event (`updateEvent`, validated by `FormSchemaSchema`: ≤20 fields, unique ids, select needs options). Public submissions are validated per event by
`buildResponseValidator(schema)` and stored keyed by field id; removed fields' answers stay and show as "(removed field)".

**Theming.** A club stores three colours (`settings.theme`). `generateTheme()` derives ~35 CSS variables with `colord` (surface, borders, muted text, hover/active, tints, ink on tints, button label colour).
`ThemeStyle` is a server component that writes `:root{--bg:…}` into the HTML, so tokens are in the first byte stream with no client JS. `validateTheme()` runs in the settings action (server) and in the live preview.

## 2. Environment

| | |
|---|---|
| Machine | Linux 6.18 (cloud VM), Intel Xeon @ 2.80 GHz, 4 logical cores, 16.9 GB RAM. Browser, Next server and Postgres share it. |
| Software | Node v22.22.0, Next 16.2.10 (Turbopack), React 19.2.4, Postgres 16 (local, unix socket/localhost), Playwright 1.63.0, Chromium 153.0.8010.12 headless, axe-core 4.14.0, Lighthouse 13.6.0, fast-check 4.10.2, Vitest 4.1.10 |
| Browser profile | Playwright "Pixel 5": 412×915 CSS px, DPR 2.625, touch, mobile UA. A fresh browser context for every run (cold HTTP cache); only the login cookie is carried over. |
| Throttling | CDP `Network.emulateNetworkConditions`: 150 ms latency, 1638.4 Kbps down, 750 Kbps up (Lighthouse's "Slow 4G"); `Emulation.setCPUThrottlingRate` 4×. Lighthouse used its own simulated throttling with the same parameters. |
| Server | `next build` then `next start` (production). A second `next start` on :3101 reaches Postgres through a TCP proxy that adds 40 ms each way (80 ms round trip) to emulate a hosted database. |
| Data | `npm run db:seed` (2 clubs, 22 memberships, 6 events, 5 partners, 0 elections) plus `metrics/fixture.sql`: a 5-field registration form on demo-club "General Meeting" with 25 guest registrations, and a dark custom theme on beta-club. The seed is small; list pages here hold ≤ 22 rows. |
| Runs | 5 per measurement unless stated; tables give median (min–max). |
| "Before" build | The unmodified app (`src/` identical to commit `f5c997c`). "After" = the build before the last commit (`e7608c9`, an announcement-text change); only the form-builder keyboard/announcement run (§3.4) was repeated on the final build. |

## 3. Results

### 3.1 Core Web Vitals and Lighthouse

CLS is split: *at load* (before any input) and *after interaction* (my scripted tab switch / typing / dialog open). INP is the worst scripted interaction per run; routes with nothing to click show "no interaction".
INP and CLS-after-interaction come from a handful of scripted inputs per run, so read them as a rough guide only.

| Route | TTFB ms | FCP ms | LCP ms | CLS at load | INP ms | CLS after interaction |
|---|---|---|---|---|---|---|
| /login (before) | 9 (7–11) | 844 (836–856) | 844 (836–856) | 0.074 (0.074–0.074) | no interaction | 0.074 (0.074–0.074) |
| /login (after) | 18 (16–20) | 864 (840–884) | 864 (840–884) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /signup (before) | 7 (7–9) | 844 (836–872) | 844 (836–872) | 0.000 (0.000–0.000) | 32 (24–32) | 0.000 (0.000–0.000) |
| /signup (after) | 10 (7–12) | 860 (836–888) | 860 (836–888) | 0.000 (0.000–0.000) | 32 (32–40) | 0.000 (0.000–0.000) |
| /[club]/register (before) | 29 (19–65) | 816 (796–840) | 816 (796–840) | 0.000 (0.000–0.000) | 48 (32–56) | 0.000 (0.000–0.000) |
| /[club]/register (after) | 26 (20–88) | 828 (820–852) | 828 (820–852) | 0.000 (0.000–0.000) | 40 (32–56) | 0.000 (0.000–0.000) |
| /[club]/events/[id]/register (before) | 25 (21–34) | 816 (800–836) | 816 (800–836) | 0.000 (0.000–0.000) | 16 (16–16) | 0.000 (0.000–0.000) |
| /[club]/events/[id]/register (after) | 27 (23–44) | 824 (808–848) | 824 (808–848) | 0.000 (0.000–0.000) | 16 (16–16) | 0.000 (0.000–0.000) |
| /clubs (before) | 196 (190–201) | 1064 (1020–1076) | 1064 (1020–1076) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /clubs (after) | 216 (196–240) | 1072 (1036–1088) | 1072 (1036–1088) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/dashboard (before) | 50 (38–58) | 908 (904–964) | 908 (904–964) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/dashboard (after) | 43 (37–48) | 924 (872–960) | 924 (872–960) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/members (before) | 44 (36–48) | 884 (876–928) | 884 (876–928) | 0.000 (0.000–0.000) | 56 (56–80) | 0.110 (0.000–0.110) |
| /[club]/members (after) | 34 (28–48) | 908 (848–924) | 908 (848–924) | 0.000 (0.000–0.000) | 48 (40–72) | 0.110 (0.000–0.110) |
| /[club]/members/[id] (before) | 43 (38–54) | 916 (884–920) | 916 (884–920) | 0.000 (0.000–0.000) | 16 (16–16) | 0.000 (0.000–0.000) |
| /[club]/members/[id] (after) | 47 (31–59) | 912 (868–944) | 912 (868–944) | 0.000 (0.000–0.000) | 16 (16–16) | 0.000 (0.000–0.000) |
| /[club]/dues (before) | 55 (47–68) | 872 (856–920) | 872 (856–920) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/dues (after) | 48 (41–60) | 884 (872–908) | 884 (872–908) | 0.000 (0.000–0.000) | 16 (16–16) | 0.000 (0.000–0.000) |
| /[club]/events (before) | 47 (39–54) | 888 (868–904) | 888 (868–904) | 0.000 (0.000–0.000) | 160 (104–168) | 0.000 (0.000–0.000) |
| /[club]/events (after) | 44 (37–47) | 896 (864–912) | 896 (864–912) | 0.000 (0.000–0.000) | 144 (128–152) | 0.000 (0.000–0.000) |
| /[club]/events/[id] (before) | 35 (31–43) | 864 (844–916) | 1380 (1364–1420) | 0.000 (0.000–0.000) | 440 (400–552) | 0.000 (0.000–0.000) |
| /[club]/events/[id] (after) | 39 (38–45) | 872 (864–880) | 1380 (1372–1444) | 0.000 (0.000–0.000) | 360 (352–528) | 0.000 (0.000–0.000) |
| /[club]/elections (before) | 36 (31–55) | 844 (812–856) | 2560 (2532–2784) | 0.000 (0.000–0.000) | 264 (256–408) | 0.000 (0.000–0.000) |
| /[club]/elections (after) | 37 (27–60) | 852 (812–856) | 2720 (2616–2916) | 0.000 (0.000–0.000) | 296 (296–336) | 0.000 (0.000–0.000) |
| /[club]/partners (before) | 35 (32–79) | 852 (840–888) | 852 (840–888) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/partners (after) | 34 (28–46) | 868 (844–876) | 868 (844–876) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/partners/[id] (before) | 35 (30–47) | 888 (848–912) | 888 (848–912) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/partners/[id] (after) | 35 (31–38) | 884 (856–896) | 884 (856–896) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /[club]/settings (before) | 45 (30–66) | 924 (904–960) | 924 (904–960) | 0.000 (0.000–0.000) | 40 (32–56) | 0.000 (0.000–0.000) |
| /[club]/settings (after) | 35 (32–97) | 920 (916–944) | 920 (916–944) | 0.000 (0.000–0.000) | 32 (32–56) | 0.000 (0.000–0.000) |
| /[club]/profile (before) | 36 (32–47) | 876 (832–896) | 876 (832–896) | 0.000 (0.000–0.000) | 40 (32–56) | 0.000 (0.000–0.000) |
| /[club]/profile (after) | 33 (32–51) | 892 (860–912) | 892 (860–912) | 0.000 (0.000–0.000) | 40 (32–48) | 0.000 (0.000–0.000) |
| /admin (before) | 32 (25–39) | 808 (792–824) | 808 (792–824) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /admin (after) | 31 (23–35) | 828 (808–832) | 828 (808–832) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /admin/clubs (before) | 33 (28–37) | 816 (796–864) | 816 (796–864) | 0.000 (0.000–0.000) | 224 (208–288) | 0.000 (0.000–0.000) |
| /admin/clubs (after) | 39 (30–75) | 812 (792–844) | 812 (792–844) | 0.000 (0.000–0.000) | 208 (176–224) | 0.000 (0.000–0.000) |
| /admin/users (before) | 34 (26–45) | 828 (800–888) | 828 (800–888) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |
| /admin/users (after) | 41 (37–48) | 860 (820–900) | 860 (820–900) | 0.000 (0.000–0.000) | no interaction | 0.000 (0.000–0.000) |

**Reading the vitals.** Every route's FCP sits at 0.8–1.1 s, set by the render-blocking CSS and fonts over the throttled link, not by the server (server TTFB is 7–216 ms). The only layout shift at load was `/login` (0.074 → 0.000, identical on all 5 runs).
The bundle cuts in §3.2 did not visibly move FCP: before/after medians differ by at most 32 ms (`/admin/users`), inside the run-to-run ranges, because the large chunks are async scripts that do not gate first paint.
Two routes have a late LCP: `/elections` (median 2.56 s before, 2.72 s after; the ranges overlap) and `/events/[id]` (1.38 s). On `/elections` the LCP element is the "Create election" button, which mounts after hydration (`TopbarActions` portals into the top bar on the client by design, see `topbar-actions.tsx`); measured with `metrics/browser/lcp-element.mjs`. On `/events/[id]` it is the event header text, which arrives after the loading skeleton.

| Route | Performance before | after | Accessibility before | after | LCP ms after | TBT ms after | CLS after |
|---|---|---|---|---|---|---|---|
| /admin | 100 (96–100) | 100 (98–100) | 100 (100–100) | 100 (100–100) | 676 | 78 | 0.000 |
| /admin/clubs | 96 (95–100) | 100 (100–100) | 100 (100–100) | 100 (100–100) | 679 | 58 | 0.000 |
| /admin/users | 99 (95–100) | 100 (99–100) | 100 (100–100) | 100 (100–100) | 812 | 78 | 0.000 |
| /login | 99 (98–99) | 100 (100–100) | 100 (100–100) | 100 (100–100) | 766 | 60 | 0.000 |
| /signup | 100 (99–100) | 100 (100–100) | 100 (100–100) | 100 (100–100) | 764 | 62 | 0.000 |
| /[club]/register | 99 (98–100) | 99 (98–99) | 100 (100–100) | 100 (100–100) | 669 | 118 | 0.000 |
| /[club]/events/[id]/register | 97 (95–98) | 98 (98–100) | 100 (100–100) | 100 (100–100) | 674 | 165 | 0.000 |
| /clubs (redirects to /demo-club/dashboard) | 99 (91–99) | 98 (98–99) | 96 (96–96) | 100 (100–100) | 967 | 167 | 0.000 |
| /[club]/dashboard | 98 (92–99) | 99 (92–100) | 96 (96–96) | 100 (100–100) | 812 | 114 | 0.000 |
| /[club]/members | 98 (86–99) | 91 (89–98) | 96 (96–96) | 100 (100–100) | 3481 | 129 | 0.000 |
| /[club]/members/[id] | 100 (99–100) | 99 (95–100) | 94 (94–94) | 100 (100–100) | 788 | 148 | 0.000 |
| /[club]/dues | 90 (87–92) | 98 (85–99) | 94 (94–94) | 100 (100–100) | 845 | 177 | 0.000 |
| /[club]/events | 95 (94–99) | 99 (98–100) | 96 (96–96) | 100 (100–100) | 651 | 135 | 0.000 |
| /[club]/events/[id] | 84 (81–85) | 88 (86–90) | 97 (97–97) | 100 (100–100) | 3477 | 190 | 0.000 |
| /[club]/elections | 98 (96–99) | 99 (97–99) | 100 (100–100) | 100 (100–100) | 678 | 111 | 0.000 |
| /[club]/partners | 99 (93–100) | 99 (99–100) | 100 (100–100) | 100 (100–100) | 652 | 99 | 0.000 |
| /[club]/partners/[id] | 99 (97–99) | 100 (96–100) | 96 (96–96) | 100 (100–100) | 812 | 86 | 0.000 |
| /[club]/settings | 96 (88–99) | 96 (95–99) | 96 (96–96) | 100 (100–100) | 690 | 239 | 0.000 |
| /[club]/profile | 98 (96–99) | 97 (95–99) | 100 (100–100) | 100 (100–100) | 689 | 192 | 0.000 |

Lighthouse LCP flips between about 0.8–1.0 s and about 3.3–3.9 s from run to run on `/members`, `/dues` and `/events/[id]` (e.g. members before: 3863, 963, 959, 970, 959 ms; after: 963, 3481, 3581, 3498, 967 ms), in both the before and after runs, so the performance-score differences on those routes (members 98 → 91, dues 90 → 98) are this switching, not the code changes. Total Blocking Time is steadier: events 267 → 135 ms median, events/[id] 280 → 190 ms.
The accessibility score moved from 94–97 to 100 on all 9 routes that were below 100 (one of them, `/clubs`, redirects to the dashboard).

### 3.2 Bundle size (production build)

First-load JS comes from Next's `route-bundle-stats.json`; gzip is my own `gzip -9` of the same chunks. "Client share" is the static import graph from the route's `page.tsx` and layouts: a module counts as client if it has `"use client"` or is imported by one; `"use server"` modules count as server (they become RPC stubs). It measures source bytes, not shipped bytes; the shipped JS is mostly React, Next and library code.

| Route | First-load JS before (raw KB / gzip KB) | after (raw / gzip) | Client modules / server modules (after) | Client share of route source bytes (after) |
|---|---|---|---|---|
| / | 540.8 / 154.3 | 540.8 / 154.3 | 1 / 5 | 5.9% |
| /[clubSlug]/dashboard | 787.2 / 235.9 | 787.2 / 235.9 | 13 / 42 | 3.3% |
| /[clubSlug]/dues | 855.5 / 259.0 | 855.5 / 259.1 | 21 / 39 | 4.9% |
| /[clubSlug]/elections | 815.7 / 245.5 | 815.7 / 245.5 | 17 / 43 | 4.2% |
| /[clubSlug]/elections/[id] | 830.7 / 250.2 | 830.7 / 250.2 | 24 / 42 | 5.4% |
| /[clubSlug]/events | 1281.6 / 363.3 | 897.8 / 274.1 | 23 / 41 | 5.7% |
| /[clubSlug]/events/[id] | 1271.0 / 360.2 | 887.1 / 270.9 | 27 / 41 | 6.3% |
| /[clubSlug]/events/[id]/register | 998.2 / 268.6 | 614.3 / 179.3 | 8 / 37 | 1.3% |
| /[clubSlug]/members | 1244.1 / 349.5 | 860.1 / 260.2 | 24 / 43 | 5.8% |
| /[clubSlug]/members/[id] | 834.6 / 251.7 | 834.7 / 251.7 | 16 / 46 | 4.2% |
| /[clubSlug]/partners | 854.1 / 258.1 | 854.1 / 258.1 | 18 / 41 | 4.7% |
| /[clubSlug]/partners/[id] | 856.2 / 259.4 | 856.2 / 259.4 | 20 / 40 | 4.9% |
| /[clubSlug]/profile | 846.9 / 256.2 | 846.9 / 256.2 | 17 / 36 | 4.2% |
| /[clubSlug]/register | 762.7 / 229.3 | 762.7 / 229.3 | 9 / 40 | 1.8% |
| /[clubSlug]/settings | 833.0 / 251.5 | 834.2 / 251.9 | 20 / 35 | 5.6% |
| /accept-invite | 614.3 / 179.7 | 614.3 / 179.7 | 6 / 30 | 0.7% |
| /admin | 585.1 / 169.5 | 585.1 / 169.5 | 3 / 33 | 0.2% |
| /admin/clubs | 673.4 / 198.3 | 673.4 / 198.3 | 7 / 36 | 1.4% |
| /admin/users | 672.4 / 198.0 | 672.4 / 198.0 | 7 / 36 | 1.3% |
| /clubs | 557.5 / 160.8 | 557.5 / 160.8 | 1 / 36 | 0.1% |
| /clubs/new | 618.2 / 180.9 | 618.2 / 180.9 | 8 / 33 | 1.2% |
| /forgot-password | 614.7 / 179.9 | 614.7 / 179.9 | 6 / 31 | 0.7% |
| /login | 616.9 / 180.5 | 616.6 / 180.4 | 7 / 35 | 0.9% |
| /reset-password | 614.4 / 179.8 | 614.4 / 179.8 | 6 / 30 | 0.7% |
| /signup | 617.7 / 180.7 | 617.7 / 180.7 | 7 / 31 | 1% |
| /verify-email | 613.8 / 179.6 | 613.8 / 179.6 | 6 / 31 | 0.7% |

About 94–99.9% of each route's source is server components (client share 0.1–6.3% after the fixes). First-load JS is dominated by the framework: the static `/` page with no app code is 540.8 KB raw / 154.3 KB gzip.
After the fixes (raw, first-load): events −383.9 KB (−29.95%), events/[id] −383.9 KB (−30.2%), public event register −383.9 KB (−38.5%), members −384.0 KB (−30.9%); gzip −89.3 KB on each of the four. Every other route changed by at most 1.2 KB.

### 3.3 Streaming

Skeleton = first `[data-slot=skeleton]` painted (two animation frames after it enters the DOM). Full content = first paint after the last skeleton is gone. Times are from navigation start.
I did not build a non-streamed variant, so "what streaming saves" is the measured gap: the time the visitor sees the page shell and a placeholder instead of nothing. Without streaming the first paint would wait for the data, but that comparison was not measured.

| Route | TTFB | Skeleton painted | Full content painted | Gap (full − skeleton) | Gap after fixes |
|---|---|---|---|---|---|
| /[club]/events (in-page Suspense) | 41 (40–45) | 869 (856–927) | 879 (863–933) | 7 (5–10) | 10 (9–46) |
| /[club]/members (in-page Suspense) | 35 (32–47) | 926 (910–1009) | 935 (917–1030) | 11 (7–21) | 19 (8–64) |
| /[club]/partners (in-page Suspense) | 44 (33–55) | 883 (845–945) | 888 (857–953) | 5 (1–12) | 9 (5–18) |
| /[club]/elections (in-page Suspense) | 40 (32–46) | 818 (814–922) | 833 (826–927) | 11 (5–16) | 12 (2–14) |
| /[club]/dashboard (loading.tsx) | 36 (33–90) | 920 (912–932) | 930 (919–941) | 8 (6–15) | 6 (5–7) |
| /[club]/dues (loading.tsx) | 41 (32–47) | 914 (893–937) | 923 (901–941) | 8 (4–12) | 11 (7–12) |
| /[club]/events/[id] (loading.tsx) | 42 (33–45) | 875 (826–1259) | 1401 (1297–1458) | 522 (39–548) | 513 (476–636) |
| /[club]/members/[id] (loading.tsx) | 41 (38–55) | 911 (904–980) | 917 (909–1013) | 6 (5–33) | 8 (7–17) |
| /[club]/partners/[id] (loading.tsx) | 36 (29–52) | 871 (868–927) | 878 (869–937) | 5 (1–13) | 8 (0–15) |
| /[club]/settings (loading.tsx) | 44 (29–67) | 932 (922–1064) | 963 (930–1141) | 13 (7–218) | 10 (4–38) |
| /[club]/profile (loading.tsx) | 48 (39–52) | 876 (846–886) | 883 (854–891) | 6 (6–9) | 7 (4–8) |
| Route | TTFB | Skeleton painted | Full content painted | Gap (full − skeleton) | Gap after fixes |
|---|---|---|---|---|---|
| /[club]/events (in-page Suspense) | 34 (29–41) | 128 (95–213) | 175 (102–220) | 8 (7–67) | 58 (7–341) |
| /[club]/members (in-page Suspense) | 29 (26–36) | 127 (97–151) | 430 (202–450) | 315 (52–320) | 70 (50–316) |
| /[club]/partners (in-page Suspense) | 28 (22–30) | 106 (79–118) | 153 (87–198) | 42 (6–92) | 58 (44–323) |
| /[club]/elections (in-page Suspense) | 30 (22–66) | 109 (94–143) | 168 (140–190) | 47 (44–59) | 57 (5–64) |
| /[club]/dashboard (loading.tsx) | 27 (23–30) | 107 (99–160) | 156 (143–169) | 44 (9–61) | 45 (44–69) |
| /[club]/dues (loading.tsx) | 30 (26–72) | 137 (108–169) | 251 (180–500) | 82 (44–334) | 321 (46–325) |
| /[club]/events/[id] (loading.tsx) | 28 (24–31) | 105 (95–125) | 463 (442–484) | 347 (339–379) | 341 (327–349) |
| /[club]/members/[id] (loading.tsx) | 30 (22–34) | 121 (109–144) | 173 (155–190) | 48 (46–64) | 44 (42–61) |
| /[club]/partners/[id] (loading.tsx) | 26 (21–34) | 96 (91–137) | 158 (136–200) | 55 (45–63) | 16 (5–67) |
| /[club]/settings (loading.tsx) | 27 (22–30) | 116 (114–215) | 180 (159–223) | 45 (8–72) | 55 (13–320) |
| /[club]/profile (loading.tsx) | 27 (24–35) | 117 (83–192) | 182 (88–203) | 9 (5–67) | 13 (5–48) |
| Route | TTFB | Skeleton painted | Full content painted | Gap (full − skeleton) | Gap after fixes |
|---|---|---|---|---|---|
| /[club]/events (in-page Suspense) | 466 (449–593) | 1197 (1150–1296) | 1201 (1154–1305) | 6 (4–9) | 6 (3–8) |
| /[club]/members (in-page Suspense) | 447 (440–453) | 1132 (1117–1164) | 1511 (1484–1523) | 359 (353–389) | 351 (339–368) |
| /[club]/partners (in-page Suspense) | 442 (437–456) | 1119 (1116–1143) | 1129 (1120–1148) | 5 (4–10) | 6 (4–10) |
| /[club]/elections (in-page Suspense) | 443 (439–462) | 1102 (1090–1151) | 1111 (1101–1153) | 6 (1–11) | 6 (1–15) |
| /[club]/dashboard (loading.tsx) | 445 (440–456) | 1163 (1131–1202) | 1168 (1148–1209) | 7 (5–18) | 6 (3–6) |
| /[club]/dues (loading.tsx) | 445 (440–447) | 1226 (1186–1294) | 1237 (1195–1308) | 10 (8–13) | 12 (5–15) |
| /[club]/events/[id] (loading.tsx) | 444 (435–446) | 1100 (1086–1117) | 2538 (2515–2611) | 1446 (1399–1516) | 1423 (1395–1572) |
| /[club]/members/[id] (loading.tsx) | 445 (435–460) | 1193 (1145–1207) | 1198 (1149–1216) | 6 (4–9) | 11 (8–13) |
| /[club]/partners/[id] (loading.tsx) | 524 (518–528) | 1221 (1208–1237) | 1227 (1217–1242) | 6 (4–13) | 5 (2–7) |
| /[club]/settings (loading.tsx) | 445 (441–456) | 1215 (1184–1264) | 1223 (1193–1311) | 8 (6–47) | 10 (7–15) |
| /[club]/profile (loading.tsx) | 454 (446–492) | 1185 (1148–1199) | 1187 (1151–1202) | 4 (3–12) | 12 (6–26) |
| Route | TTFB | Skeleton painted | Full content painted | Gap (full − skeleton) | Gap after fixes |
|---|---|---|---|---|---|
| /[club]/events (in-page Suspense) | 447 (443–449) | 519 (511–533) | 598 (570–881) | 80 (52–361) | 54 (4–64) |
| /[club]/members (in-page Suspense) | 439 (435–443) | 510 (486–567) | 826 (816–835) | 316 (268–329) | 318 (314–331) |
| /[club]/partners (in-page Suspense) | 440 (432–449) | 501 (476–516) | 819 (813–829) | 315 (312–337) | 316 (309–344) |
| /[club]/elections (in-page Suspense) | 444 (434–447) | 500 (489–506) | 532 (514–820) | 43 (14–323) | 42 (7–52) |
| /[club]/dashboard (loading.tsx) | 439 (434–441) | 535 (508–549) | 832 (815–853) | 304 (266–324) | 326 (258–334) |
| /[club]/dues (loading.tsx) | 441 (436–443) | 510 (507–516) | 841 (837–853) | 334 (321–341) | 320 (267–335) |
| /[club]/events/[id] (loading.tsx) | 442 (439–445) | 504 (479–578) | 919 (899–1095) | 395 (334–616) | 402 (385–526) |
| /[club]/members/[id] (loading.tsx) | 446 (439–448) | 502 (500–521) | 820 (818–849) | 318 (312–328) | 321 (308–325) |
| /[club]/partners/[id] (loading.tsx) | 522 (516–536) | 587 (568–641) | 906 (873–918) | 313 (277–326) | 321 (266–327) |
| /[club]/settings (loading.tsx) | 439 (435–447) | 522 (516–532) | 567 (533–605) | 46 (7–74) | 48 (46–68) |
| /[club]/profile (loading.tsx) | 437 (433–444) | 513 (502–523) | 568 (520–828) | 56 (6–314) | 50 (46–73) |

Readings:
- With the local database the server finishes so fast that skeleton and content arrive together: on mobile throttling the gap is under 20 ms on 10 of 11 routes, because first paint waits on CSS, not data. The exception is `/events/[id]` (513–522 ms), the heaviest page (366 KB of HTML with the fixture's 25 responses and 47 check-in rows).
- With an 80 ms round trip to the database and no network throttling, the skeleton is painted at 500–587 ms. The content follows 300–395 ms later on 7 of 11 routes (members, partners, dashboard, dues, events/[id], members/[id], partners/[id]) and 43–80 ms later on the other 4 (events, elections, settings, profile).
- Under both network throttling and the slow database, 9 of 11 routes have a gap of only 4–12 ms; members (351–359 ms) and events/[id] (1,423–1,446 ms) are the exceptions.
- TTFB goes from 26–35 ms to 437–524 ms when the database is 80 ms away: about 410 ms more before the first byte. The club layout awaits its lookups before anything is flushed; I did not count the queries. Not changed here.
- The "after" gap columns differ from "before" within each row's run-to-run range; the fixes do not touch streaming. The throttled local-database "before" run overlapped with a `tsc` and a Vitest run I started by mistake, for about a minute; its ranges look like the others, but treat it as slightly less clean.

### 3.4 Accessibility (axe-core, WCAG 2.0/2.1/2.2 A + AA rules)

Counts are affected elements by impact. Moderate and minor were 0 everywhere. The counts were identical on all 5 repeats of every route.

| Viewport / route | Before: critical / serious / moderate / minor | After | Rules after |
|---|---|---|---|
| desktop /login | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /signup | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/register | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/events/[id]/register | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /clubs | 0 / 3 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/dashboard | 0 / 3 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/members | 0 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/members/[id] | 3 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/dues | 1 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/events | 0 / 2 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/events/[id] | 0 / 52 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/elections | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/partners | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/partners/[id] | 0 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/settings | 0 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /[club]/profile | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /admin | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /admin/clubs | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| desktop /admin/users | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /login | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /signup | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/register | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/events/[id]/register | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /clubs | 0 / 3 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/dashboard | 0 / 3 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/members | 0 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/members/[id] | 3 / 2 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/dues | 1 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/events | 0 / 2 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/events/[id] | 0 / 51 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/elections | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/partners | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/partners/[id] | 0 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/settings | 0 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /[club]/profile | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /admin | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /admin/clubs | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| mobile /admin/users | 0 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | none |
| **Total** | **8 / 128 / 0 / 0** | **0 / 0 / 0 / 0** | |

Counts identical across the 5 repeats on every route: yes.

Form builder, axe scoped to the dialog, at rest, with fields added and while dragging:

| State | Before: crit/serious/mod/minor | After |
|---|---|---|
| desktop: builder empty | 0/1/0/0 color-contrast | 0/0/0/0  |
| desktop: builder with 4 fields | 0/1/0/0 color-contrast | 0/0/0/0  |
| desktop: dropdown options open | 0/1/0/0 color-contrast | 0/0/0/0  |
| desktop: mid keyboard drag | 0/2/0/0 color-contrast,target-size | 0/1/0/0 target-size |
| desktop: mid pointer drag | 0/0/0/0  | 0/0/0/0  |
| mobile: builder empty | 0/1/0/0 color-contrast | 0/0/0/0  |
| mobile: builder with 4 fields | 0/5/0/0 aria-toggle-field-name,color-contrast | 0/0/0/0  |
| mobile: dropdown options open | 0/5/0/0 aria-toggle-field-name,color-contrast | 0/0/0/0  |
| mobile: mid keyboard drag | 0/5/0/0 aria-toggle-field-name,color-contrast | 0/0/0/0  |

Keyboard-only build + reorder + save, and screen-reader announcements:

- **before**: {"orderAfterBuild":[],"orderAfterReorder":[],"savedOrder":null,"keystrokes":250,"mouseUsed":false,"elapsedMs":22604,"expectedFinalOrder":["Gamma","Alpha","Beta"],"pass":false}; focus steps {"openDialog":true,"titleFocus":true,"startsFocus":true,"addShort text":true,"addNumber":true,"addCheckbox":true,"reorderHandleFocus":false,"createFocus":false}; announcements: pickedUp=false, movedOver=false, dropped=false; captured: []
- **after**: {"orderAfterBuild":["Alpha","Beta","Gamma"],"arrowPressesToMoveTwoPlaces":3,"orderAfterReorder":["Gamma","Alpha","Beta"],"savedOrder":["Gamma","Alpha","Beta"],"keystrokes":145,"mouseUsed":false,"elapsedMs":5501,"expectedFinalOrder":["Gamma","Alpha","Beta"],"pass":true}; focus steps {"openDialog":true,"titleFocus":true,"startsFocus":true,"addShort text":true,"addNumber":true,"addCheckbox":true,"reorderHandleFocus":true,"createFocus":true}; announcements: pickedUp=true, movedOver=true, dropped=true; captured: ["Picked up Gamma.","Gamma was moved over Beta.","Gamma was moved over Alpha.","Gamma was dropped onto Alpha.","Event created."]

One serious issue remains: `target-size` (WCAG 2.2, 24 px targets) on the desktop keyboard-drag state, where the lifted row overlaps a neighbouring switch. It appears only mid-drag.

**Keyboard-only and screen reader.** The Playwright flow uses only `keyboard.press/type` (no mouse): Tab to Create event, Enter, fill title and start date, add three fields through the Add field menu (Short text "Alpha", Number "Beta", Checkbox "Gamma"), Tab to "Reorder Gamma", Space, ArrowUp until the live region says it is over Alpha, Space, Tab to Create event, Enter, then read `Event.formSchema` from the database.
Before the fixes the flow could not add a field at all (the Add field menu items ignored Enter and Space, `orderAfterBuild: []`). After: the saved order was Gamma, Alpha, Beta in 145 keystrokes, and the live region carried "Picked up Gamma.", "Gamma was moved over Beta.", "Gamma was moved over Alpha.", "Gamma was dropped onto Alpha." (dnd-kit's `role=status`, `aria-live=assertive` region).
Dnd-kit needed 3 ArrowUp presses for 2 moves: one press is ignored while the previous move settles. Not fixed.

### 3.5 Theming validation

Palettes are drawn with a seeded PRNG (seed 20260101). "Text fails" means any of the 12 text pairs the UI draws (body and muted text on background and card, button label on primary and accent, badge ink on the primary, accent and four semantic tints) is below 4.5:1 (WCAG AA, normal text), measured on the emitted hex values. `--text-faint` is excluded: no component uses it for text.
Two populations of 10,000: uniform random RGB, and "brand-like" (random hue, saturation 25–100 %, lightness 15–85 %).

| | Uniform RGB before fix | after fix | Brand-like before | after |
|---|---|---|---|---|
| Palettes whose derived text fails AA | 9,937 | 1,699 | 9,971 | 1,549 |
| …of those, accepted by `validateTheme` (false passes) | **1,589** | **0** | **2,106** | **0** |
| …of those, rejected | 8,348 | 1,699 | 7,865 | 1,549 |
| Palettes accepted by `validateTheme` | 1,634 | 1,386 | 2,126 | 1,824 |

The default theme still validates (`ok: true`; its only message is the existing low-contrast-accent warning). After the fix, every palette whose text still fails is rejected (0 false passes in 20,000). `validateTheme` also rejects palettes whose text is readable (6,915 of the uniform set and 6,627 of the brand-like set after the fix, up from 18 and 9): mostly palettes that now have readable text but were already refused by the older primary/accent contrast rules, which I did not change.
Regression check (`theme-regression.check.ts`, uniform set): of the 63 palettes that were already readable before the fix, 0 changed any token; of the 9,937 that were not, 8,238 are now readable and 1,699 stay unreadable and are blocked.

**Flash of unthemed content.** 5 cold loads per page, mobile + Slow 4G, recording every painted frame (CDP screencast) and the `--bg`/`--primary` tokens on every animation frame before first paint:

| Page | Frames painted from FCP on | …not in the expected theme | rAF frames before FCP with wrong tokens | CLS (median) before → after | JS-disabled load themed |
|---|---|---|---|---|---|
| beta-club register (public, themed) | 11 | 0 | 0 | 0.000 → 0.000 | true |
| beta-club dashboard (member, themed) | 14 | 0 | 0 | 0.000 → 0.000 | true |
| demo-club register (default theme) | 11 | 0 | 0 | 0.000 → 0.000 | true |
| /login (must NOT take a club theme) | 6 | 0 | 0 | 0.074 → 0.000 | true |

The screencast also emits one blank white frame about 8 ms after navigation starts, before the document paints anything (the browser's default surface); the table counts frames from first contentful paint on. Every frame from FCP on has the club background colour, no animation frame before FCP had the wrong tokens, and with JavaScript disabled the tokens are still in the HTML. Screenshots of the first painted frame are in `metrics/results/screenshots/` (e.g. `theming-fouc-after-beta-club-register-public-themed--first-frame.png`: dark background and red logo at first paint, in the fallback serif font because the web font has not arrived; text swapping to Geist caused no layout shift, CLS 0).

### 3.6 Form builder data safety

`metrics/unit/form-builder-safety.check.ts`: fast-check, seed 20260101. Each run applies 40–120 random operations (add, remove, rename, reorder, toggle required, edit options, save, submit a response) to a form whose responses keep arriving.
A rename to an empty label is sometimes generated; the real `FormSchemaSchema` rejects the save and the stored schema stays as it was. After each save the check builds the exec table through the real `deriveResponseColumns` and `responseCellCsv` and looks up each answer by the *header text* of its question, not by id, so it does not share the code under test.

| | |
|---|---|
| Forms (sequences) | 2,000 |
| Edits applied | 126,962 (add 15,814 · remove 15,939 · rename 15,907 · reorder 15,719 · required 15,924 · options 15,881 · save 15,876 · respond 15,902) |
| Saves accepted / rejected by the real schema validator | 11,999 / 3,877 |
| Responses submitted through the real validator | 15,647 (0 wrongly rejected) |
| Answers checked | 124,683, in 9,112 rendered tables |
| **Answers lost** | **0** |
| **Answers attached to the wrong field** | **0** |
| Column labels wrong | 0 |
| Answers sitting under a "(removed field)" column (checked present) | 58,929 |

Sanity check that the test can fail (`metrics/mutation-check.sh`): dropping orphaned answers from `deriveResponseColumns` fails the property after 1 test; keying columns by the neighbouring field's id fails after 6. The source is restored afterwards. This tests the reporting and validation code and the schema-edit semantics; it does not drive the React component with random input.

### 3.7 Existing test suite

`npm test`: 16 files, **183 tests, 183 passed (100%)**, 4.6 s. Coverage (v8): 76.8% statements, 66.7% branches, 71.4% functions, 76.6% lines **of the 616 statements in files the tests import**; including every file under `src/` it is 16.6% statements (473 / 2,855), 12.4% branches, 13.0% functions, 16.3% lines. The suite covers `lib/` (validation, permissions, theme, forms, elections, imports) and two shell components; the pages, Server Actions and most client components have no unit tests.
3 of 5 consecutive runs report `Errors 1`: an unhandled `EnvironmentTeardownError` from `sidebar.test.tsx` (worker closing while a console log is pending). All tests still pass. Not fixed.

## 4. Fixes

Each is its own commit on `claude/eloquent-hopper-1vr517`. I changed no feature and no layout; the colour fixes change colour values only (listed).

| Commit | Problem (measured) | Fix | Result |
|---|---|---|---|
| `9231c28` | `/login` layout shift 0.074 on every load (form rendered after hydration because of `useSearchParams` under a `fallback={null}` Suspense). | Read `searchParams` on the server, pass the notice as a prop. | CLS 0.074 → 0.000 (5/5 runs, vitals and first-paint); Lighthouse CLS 0.055 → 0.000. |
| `58dc247`, `b1e3028` | zod shipped to the browser on events, events/[id], public register and members (a 392 KB chunk) because the builder and public form imported constants from a zod module, and the import dialog imported its row schema. | Constants moved to `lib/event-form-constants.ts` (re-exported, no import changes elsewhere); the import-row schema loads when the dialog opens. | 30–38% less first-load JS on 4 routes (table 3.2). |
| `3dc33c5`, `95dc939` | Unreadable derived text could be saved (9,937 / 10,000 random palettes had sub-AA text; 1,589 passed the validator). | Body text chosen by contrast (backgrounds of luminance ≈0.19–0.35 always got sub-AA light text), muted text fades less when needed, button labels and badge ink fall back to pure black/white or body text, and `validateTheme` rejects what is still unreadable. | 0 false passes in 20,000; 0 of 63 already-readable palettes changed. **Behaviour change:** themes that used to save with unreadable text are now rejected, and some backgrounds in the 0.19–0.35 luminance band now get dark text instead of light. |
| `1e91c76` | The builder's Add field menu did nothing when an item was chosen with Enter or Space (the handler was on a `<button>` passed through `render`). A keyboard-only user could not add a field (WCAG 2.1.1). | Put `onClick` on the menu item. | Keyboard flow: fail → pass. |
| `c8a2579` | axe: "Required" switch unnamed below 640 px (4 elements); dues period selector and 3 selects on the member page had no name (4 **critical** per viewport, 8 in all); `role=alert` on a `<ul>` left orphan `<li>`s. | `aria-label`s; `role=alert` moved to a wrapper `div`. | Critical 8 → 0. |
| `d23eafb` | axe colour contrast: date tile month at 80% opacity (3.65:1), neutral badge muted-on-muted (4.22:1, 51 elements on events/[id]), dashboard dues line (3.88:1), builder "Always included" (4.48:1). | Full-strength text colours in those four places. Slightly darker text; layout unchanged. | Serious 128 → 0 (with the next row). |
| `48c0308` | axe `scrollable-region-focusable`: tables that scroll sideways could not be reached by keyboard. | `tabIndex=0` on the shared table container and on the responses table. | included above |
| `e7608c9` | Screen-reader users heard "X was moved over X" and never "Picked up X": dnd-kit fires `onDragOver` over the item itself right after `onDragStart` and the second message replaced the first. | Skip the over-itself message. | "Picked up Gamma." now announced. |

## 5. Bugs and issues found but not fixed

- **Members filter, CLS 0.110 after typing in the search box** (4 of 5 runs): the list is replaced by a shorter result. Expected content change rather than a defect; at load CLS is 0.
- **Top-bar action buttons appear only after hydration** (`TopbarActions` portal, a documented design choice). On `/elections` that button is the LCP at 2.5–2.7 s on throttled mobile; Lighthouse LCP is bimodal on pages with exec buttons.
- **`/events/[id]` is the slowest page** (Lighthouse performance 88; 366 KB of HTML with the fixture data; content paints about 510 ms after the skeleton on throttled mobile). Server time is only 72 ms (median of 15 requests, `metrics/server-timing.mjs`), so it is the size of the document (desktop table and mobile cards both rendered).
- **TTFB of about 440 ms with an 80 ms database round trip**: several sequential queries before the first byte.
- **Keyboard reorder ignores one ArrowUp press** in a sequence (3 presses for 2 moves), and a 24 px `target-size` finding while a row is lifted.
- **Unhandled `EnvironmentTeardownError` in the Vitest run** (above).
- `npm ci` reported 35 npm audit advisories (1 low, 10 moderate, 20 high, 4 critical); I did not look into them.
- Not measured: a non-streamed variant of any route; the real hosted database; Safari/Firefox; INP on real input.

## 6. Reproducing everything

```bash
npm ci
# Postgres 16 running; put DATABASE_URL and AUTH_SECRET in .env (see .env.example)
npx prisma migrate deploy && npm run db:seed
psql "$DATABASE_URL" -f metrics/fixture.sql        # measurement fixture

# unit-level checks (no browser, no server)
npm test
npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=text-summary
npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='src/**/*.{ts,tsx}' --coverage.exclude='src/generated/**'
npx vitest run -c metrics/vitest.config.ts theme-palettes     # writes metrics/results/theme-palettes.json (PALETTES=10000 SEED=20260101)
npx vitest run -c metrics/vitest.config.ts theme-regression
npx vitest run -c metrics/vitest.config.ts form-builder       # FORMS=2000 SEED=20260101
metrics/mutation-check.sh

# production build and servers
npx next build
node metrics/bundle.mjs bundle-after                          # first-load JS + client/server split
metrics/start-server.sh 3100 &                                # local database
node metrics/db-latency-proxy.mjs 5433 5432 40 &              # 40 ms each way
metrics/start-server.sh 3101 "postgresql://USER@localhost:5433/DB" &

# browser measurements (RUNS=5 by default)
metrics/run-all.sh after        # vitals, streaming x4, axe routes, builder + keyboard, first paint, Lighthouse
node metrics/browser/lcp-element.mjs /demo-club/elections
node metrics/server-timing.mjs
node metrics/report.mjs         # regenerates the tables above from metrics/results/raw/
```

To reproduce the "before" numbers, check out `f5c997c`, repeat the build and servers, and run `metrics/run-all.sh before` (and `node metrics/bundle.mjs bundle-before`). `metrics/unit/legacy-theme.ts` is a copy of the pre-fix theme code for the regression check.
Machine load changes timings: run on an idle machine; the browser and server here share 4 cores.

## 7. CV bullets

- On 10,000 random palettes the club-theme validator let through 1,589 of the 9,937 whose text failed WCAG contrast; after my fix, none of 20,000 (two test sets) did.
- Ran 126,962 random edits on event forms holding 15,647 responses: no answer lost or put under the wrong question in 124,683 checks. The test fails when I break the code.
- axe-core audit of every route and the drag-and-drop form builder: 8 critical and 128 serious violations down to 0, and a keyboard-only build-and-reorder test now passes.
- Kept zod out of client bundles, cutting first-load JS 30–38% on events, members and public registration (events 1,282 to 898 KB); login layout shift 0.074 to 0.
- Lighthouse accessibility went from 94–97 to 100 on the 9 routes below it; first-paint recordings of a custom-themed club show no unthemed frames, with or without JavaScript.
