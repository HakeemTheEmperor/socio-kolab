# Club Portal — Software Design Document

This document is the complete specification for building a student club management portal. Build it exactly as described. Where a decision is not specified, choose the simplest option consistent with the conventions below and note it in a `DECISIONS.md` file at the repo root.

---

## 1. Overview

A web portal for managing a single student club (40–200 members), architected so multi-club support can be enabled later without a rewrite. Core modules for v1: **member management**, **dues tracking (record-keeping only, no payment processing)**, and **event management with RSVP + attendance**.

**Primary users:**
- **Execs** (president, secretary, treasurer, etc.) — manage members, record dues, create events, mark attendance.
- **Members** — view/edit their own profile, see dues status, RSVP to events.

**Non-goals for v1 (do NOT build):** voting/elections, payment gateway integration, file/resource library, notifications/email sending, multi-club onboarding UI, mobile app.

---

## 2. Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript, Server Actions for all mutations. Avoid API routes unless technically required (e.g. auth callbacks).
- **Database:** PostgreSQL (hosted externally — Neon or Supabase). Connection string via `DATABASE_URL` env var.
- **ORM:** Prisma. All schema in `prisma/schema.prisma`, use Prisma Migrate.
- **Auth:** Auth.js (NextAuth v5) with Credentials provider (email + password, bcrypt hashing). Session strategy: JWT.
- **Styling:** Tailwind CSS. Use shadcn/ui for components (tables, dialogs, forms, toasts).
- **Validation:** Zod for all form/server-action input validation.
- **Deployment target:** Vercel. The app must run with only `DATABASE_URL` and `AUTH_SECRET` env vars set.

---

## 3. Architecture Principles

1. **Multi-tenant-ready, single-tenant-deployed.** Every domain table carries `clubId`. For v1, a single club row is seeded and all queries are scoped to it via a helper (`getCurrentClub()`), never hardcoded inline.
2. **Auth identity ≠ membership.** `User` holds login credentials only. All club-related attributes (role, status, department) live on `Membership`.
3. **Roles are club-scoped.** Role is a field on `Membership`, not `User`.
4. **Server-side authorization on every mutation.** Never trust client-side role checks. Every server action starts by resolving the session → membership → role and rejecting unauthorized calls.
5. **Soft state, not deletion.** Members are deactivated (status change), never hard-deleted. Dues and attendance records are immutable history (corrections create new records or update with an audit field).

---

## 4. Data Model (Prisma)

Implement exactly this schema (field names must match; add `createdAt`/`updatedAt` timestamps to all models):

```prisma
model Club {
  id        String   @id @default(cuid())
  name      String
  logoUrl   String?
  settings  Json     @default("{}")
  // settings shape: { duesAmount: number, currency: string ("NGN"),
  //                   currentPeriod: string (e.g. "2026/2027"),
  //                   departments: string[], committees: string[] }
  memberships Membership[]
  events      Event[]
  dues        DuesRecord[]
}

model User {
  id           String  @id @default(cuid())
  email        String  @unique
  name         String
  passwordHash String
  memberships  Membership[]
}

enum Role {
  PRESIDENT
  EXEC
  MEMBER
}

enum MemberStatus {
  ACTIVE
  INACTIVE
  ALUMNI
  PENDING   // registered, awaiting exec approval
}

model Membership {
  id         String       @id @default(cuid())
  club       Club         @relation(fields: [clubId], references: [id])
  clubId     String
  user       User         @relation(fields: [userId], references: [id])
  userId     String
  role       Role         @default(MEMBER)
  status     MemberStatus @default(PENDING)
  department String?
  level      String?      // academic year/level, e.g. "300"
  committee  String?
  phone      String?
  joinedAt   DateTime     @default(now())
  dues       DuesRecord[]
  attendance Attendance[]

  @@unique([clubId, userId])
  @@index([clubId, status])
}

model DuesRecord {
  id           String     @id @default(cuid())
  club         Club       @relation(fields: [clubId], references: [id])
  clubId       String
  membership   Membership @relation(fields: [membershipId], references: [id])
  membershipId String
  period       String     // e.g. "2026/2027"
  amount       Decimal    @db.Decimal(10, 2)
  paidAt       DateTime   @default(now())
  method       String?    // "cash" | "transfer" | "other"
  recordedById String     // membership id of the exec who recorded it
  note         String?

  @@unique([membershipId, period])
  @@index([clubId, period])
}

enum RsvpStatus {
  GOING
  NOT_GOING
  MAYBE
}

model Event {
  id          String   @id @default(cuid())
  club        Club     @relation(fields: [clubId], references: [id])
  clubId      String
  title       String
  description String?
  location    String?
  startsAt    DateTime
  endsAt      DateTime?
  attendance  Attendance[]

  @@index([clubId, startsAt])
}

model Attendance {
  id           String      @id @default(cuid())
  event        Event       @relation(fields: [eventId], references: [id])
  eventId      String
  membership   Membership  @relation(fields: [membershipId], references: [id])
  membershipId String
  rsvp         RsvpStatus?
  checkedInAt  DateTime?
  checkedInById String?    // membership id of exec who checked them in

  @@unique([eventId, membershipId])
}
```

---

## 5. Authorization Matrix

| Action | MEMBER | EXEC | PRESIDENT |
|---|---|---|---|
| View member directory (name, dept, committee only) | ✅ | ✅ | ✅ |
| View full member details (phone, email, dues) | own only | ✅ | ✅ |
| Edit own profile (phone, dept, level) | ✅ | ✅ | ✅ |
| Approve/reject pending members | ❌ | ✅ | ✅ |
| Change member status (active/inactive/alumni) | ❌ | ✅ | ✅ |
| Change member roles | ❌ | ❌ | ✅ |
| Record/edit dues payments | ❌ | ✅ | ✅ |
| View dues dashboard (all members) | ❌ | ✅ | ✅ |
| View own dues status | ✅ | ✅ | ✅ |
| Create/edit/delete events | ❌ | ✅ | ✅ |
| RSVP to events | ✅ | ✅ | ✅ |
| Mark attendance (check-in) | ❌ | ✅ | ✅ |
| Edit club settings | ❌ | ❌ | ✅ |

Implement this as a single `can(membership, action)` helper in `lib/permissions.ts` and use it in every server action and in UI conditionals.

---

## 6. Pages & Flows

All pages behind auth except `/login` and `/register`.

### Auth & Onboarding
- `/register` — email, name, password, phone, department, level. Creates `User` + `Membership` with status `PENDING`. Show "awaiting approval" screen after.
- `/login` — email + password. Redirect to `/dashboard`.
- PENDING members who log in see only a "your membership is awaiting approval" page.

### `/dashboard`
- Members: their dues status for current period, upcoming events (next 3) with RSVP buttons, their profile summary.
- Execs: same, plus stat cards — total active members, pending approvals count (linked), % dues paid for current period, next event RSVP count.

### `/members`
- Table: name, department, level, committee, status. Search by name; filter by status, department, committee.
- Execs see extra columns (email, phone, dues status) and a pending-approvals section at top with Approve/Reject buttons.
- Row click → `/members/[id]` detail page: profile info, dues history, attendance history. Execs can edit status/committee; president can edit role.

### `/dues`  (exec-only)
- Table of all ACTIVE members for the selected period (default: current period from club settings): name, amount paid, date, method, or "Unpaid".
- "Record payment" button per unpaid member → dialog with amount (prefilled from settings), method, optional note.
- Summary header: X of Y paid, total collected.
- CSV export button (client-side generation is fine).

### `/events`
- List of upcoming and past events (tabs). Members can RSVP (going / maybe / not going) on upcoming events.
- Execs: "Create event" button → dialog (title, description, location, start/end).
- `/events/[id]` — details, RSVP list grouped by status. Execs get a check-in view: searchable list of ACTIVE members with a check-in toggle per member; RSVP'd members sorted to top.

### `/settings` (president-only)
- Edit club name, dues amount, currency, current period, departments list, committees list.

### `/profile`
- Edit own name, phone, department, level. Change password.

---

## 7. Seeding

Create `prisma/seed.ts` that:
1. Creates one `Club` ("Demo Club", settings: duesAmount 2000, currency "NGN", currentPeriod "2026/2027", 4 sample departments, 3 sample committees).
2. Creates one PRESIDENT account: `president@club.test` / password `password123` (ACTIVE).
3. Creates one EXEC and 10 MEMBER accounts (ACTIVE, same password), 2 PENDING accounts, varied departments/levels.
4. Marks dues paid for ~60% of active members for the current period.
5. Creates 2 upcoming events and 1 past event with some RSVPs and check-ins.

Also create `scripts/import-members.ts` — reads a CSV (`name,email,phone,department,level`) and bulk-creates User+Membership rows (ACTIVE) with a default password that must be changed on first login (add `mustChangePassword: Boolean @default(false)` to User to support this).

---

## 8. Conventions & Quality Bar

- TypeScript strict mode. No `any`.
- All server actions in `app/**/actions.ts` files, each validated with a Zod schema, each starting with an auth + permission check.
- Loading and empty states for every table/list. Error handling via toast notifications.
- Mobile-responsive — members will use this on phones. Tables collapse to cards on small screens.
- Currency display: format with `Intl.NumberFormat` using the club's currency setting (₦ for NGN).
- Dates: display in `Africa/Lagos` timezone.
- Write a `README.md` covering: env vars, setup, migration, seeding, CSV import usage, and default seed credentials.

## 9. Build Order

Build and verify in this sequence, committing after each phase:
1. Project scaffold, Prisma schema, migration, seed script.
2. Auth (register, login, session, pending-approval gate).
3. Members module (directory, detail, approvals, status/role editing).
4. Dues module (dashboard, record payment, CSV export).
5. Events module (CRUD, RSVP, check-in).
6. Dashboard, settings, profile pages.
7. Polish pass: responsive checks, empty states, README.

## 10. Acceptance Checklist

- [ ] A new visitor can register and sees the pending screen; an exec can approve them; they then get full member access.
- [ ] An exec can record a dues payment and the member sees "Paid" on their dashboard.
- [ ] A member can RSVP to an event; an exec can check them in; the check-in appears in the member's attendance history.
- [ ] A MEMBER-role session cannot invoke exec-only server actions (verify by direct action call, not just hidden UI).
- [ ] Changing `currentPeriod` in settings makes the dues dashboard show everyone as unpaid for the new period while preserving history.
- [ ] The app builds (`next build`) with zero TypeScript errors and runs with only `DATABASE_URL` and `AUTH_SECRET` set.
