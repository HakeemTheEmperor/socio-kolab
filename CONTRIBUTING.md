# Contributing to Club Portal

Thanks for your interest in contributing! This project is a multi-club portal
for student clubs, built on Next.js 16, Prisma 7 and Auth.js v5. These
guidelines keep the codebase consistent and reviews fast.

Please read them before opening your first pull request.

---

## Ground rules (read these first)

This repo has some hard-won conventions that differ from common tutorials.
**Before writing any code**, read:

- **[AGENTS.md](./AGENTS.md)** — the stack gotchas that will bite you if you
  assume the "usual" Next.js / Prisma / shadcn. In particular: middleware is
  `src/proxy.ts`, `params`/`searchParams` are Promises, the Prisma client is
  generated to `src/generated/prisma`, shadcn is on Base UI (`render`, not
  `asChild`), and Auth.js config is split edge vs. Node.
- **[SPEC.md](./SPEC.md)** — what the product is supposed to do.
- **[DECISIONS.md](./DECISIONS.md)** — why things are the way they are. If a
  design looks odd, check here before "fixing" it.

The **golden rule of this codebase**: authorization is the boundary, never the
UI or an obscure id. Every mutation is a Server Action in `app/**/actions.ts`
that takes `clubSlug` as its first argument, calls `requireClubAccess(clubSlug)`,
and checks `can(membership, action)`. Never trust a client-side role check, and
never trust the slug — it is always re-resolved server-side. PRs that add a
mutation without this pattern will be asked to change.

---

## Getting set up

You'll need Node.js 20+ and a PostgreSQL database (a local Docker one is fine —
see `docker-compose.yml`). Full setup lives in the [README](./README.md); the
short version:

```bash
git clone git@github.com:HakeemTheEmperor/socio-kolab.git
cd socio-kolab
cp .env.example .env      # then fill in DATABASE_URL and AUTH_SECRET
npm install               # runs `prisma generate` on postinstall
npm run db:migrate        # apply migrations
npm run db:seed           # demo data + seed credentials (see README)
npm run dev               # http://localhost:3000
```

---

## Workflow

We work by pull request off `main`. No one pushes directly to `main`
(it's protected — see the maintainer notes at the bottom).

1. **Open an issue first** for anything non-trivial (a feature, a behaviour
   change, a refactor). It's cheaper to align on the approach in an issue than
   in a rejected PR. Typo fixes and small doc edits can skip straight to a PR.
2. **Fork** the repo (external contributors) or **branch** off `main`
   (maintainers).
3. **Branch naming** follows the existing history — a type prefix and a short
   kebab-case description:
   - `feat/…` — new functionality (`feat/password-reset`)
   - `fix/…` — bug fixes (`fix/switcher-context`)
   - `refactor/…` — internal change, no behaviour change
   - `docs/…` — documentation only
   - `chore/…` — tooling, deps, config
4. **Keep PRs focused.** One logical change per PR. A drive-by refactor mixed
   into a feature makes review harder and history worse.
5. **Open the PR against `main`** with a clear description: what changed, why,
   and how you tested it. Link the issue it closes.

---

## Commits

We use **[Conventional Commits](https://www.conventionalcommits.org/)**, matching
the existing history:

```
type(scope): short imperative summary
```

- **type**: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
- **scope**: the area touched — `clubs`, `events`, `auth`, `ui`, `seed`, etc.
- **summary**: imperative mood, lower case, no trailing period.

Examples from the log:

```
feat(events): exec responses view and CSV export
fix(clubs): make "Start a new club" reachable from the sidebar
docs(auth): document email verification flow
```

Write the message for the reviewer six months from now. Explain the *why* in the
body when the *what* isn't self-evident.

---

## Before you open a PR

Your branch must be green. Run all three locally:

```bash
npm run lint     # ESLint — must pass with no errors
npm run test     # Vitest — must pass
npm run build    # production build — must compile (TypeScript strict)
```

A PR that fails lint, tests, or the build will not be merged until it's green.

- **TypeScript is strict.** No `any` escape hatches, no `@ts-ignore` without a
  comment justifying it.
- **Add tests for new logic**, especially anything in `src/lib/` (permissions,
  validation, token/verification logic, form/response handling). Follow the
  existing `*.test.ts(x)` files. Security-relevant logic (auth, `can()`,
  server-action guards) should not land untested.
- **Validate all input with Zod.** New form/action input gets a schema in
  `src/lib/validations/`. Never `Object.fromEntries(formData)` straight into
  Prisma.

---

## Database changes

- Change `prisma/schema.prisma`, then generate a **migration** with
  `npm run db:migrate` — commit the generated SQL in `prisma/migrations/`.
  Never edit an already-committed migration; add a new one.
- If you add or change a model, update the **seed** (`prisma/seed.ts`) so
  `db:seed` still produces a coherent demo dataset, and the CSV importer /
  prod seed if they're affected.
- Call out any migration that requires a **data backfill** in the PR
  description — a schema change that would break existing rows on deploy needs
  the backfill in the same migration.

---

## Documentation

This project documents its reasoning, and we'd like to keep it that way:

- **User-facing behaviour changed?** Update the [README](./README.md).
- **Made a non-obvious design decision or a deliberate trade-off?** Add an
  entry to [DECISIONS.md](./DECISIONS.md). "I chose X over Y because Z" is
  exactly what belongs there.
- **New env var?** Document it in the README and add it to `.env.example`.

---

## Reporting bugs & requesting features

Open an issue. For bugs, include: what you did, what you expected, what happened,
and the environment (Node version, browser, local vs. deployed). A minimal
reproduction saves everyone time. For features, describe the problem you're
trying to solve, not just the solution you have in mind.

**Security issues**: please do **not** open a public issue. Contact the
maintainer directly so it can be fixed before disclosure.

---

## Code of conduct

Be respectful and constructive. Assume good faith. Reviews are about the code,
not the person. Harassment of any kind isn't tolerated.

---

## Licensing

This project is licensed under the **MIT License** (see [LICENSE](./LICENSE)).
By contributing, you agree that your contributions are licensed under the same
MIT License.

---

## Maintainer notes — branch protection

`main` should be protected so that history can't be rewritten and every change
goes through review. See the setup steps in the pull request / project docs, or
GitHub **Settings → Branches**.
