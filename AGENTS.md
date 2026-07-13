<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Club Portal — project notes

Read [SPEC.md](./SPEC.md) (requirements), [README.md](./README.md) (setup), and
[DECISIONS.md](./DECISIONS.md) (design decisions) before making changes.

Stack gotchas that differ from common tutorials:

- **Next 16**: route protection is `src/proxy.ts` (middleware was renamed to
  "proxy"). `searchParams`/`params` in pages are Promises — `await` them.
- **Prisma 7**: no `url` in the datasource block. The client is generated to
  `src/generated/prisma` (gitignored) and imported via
  `@/generated/prisma/client`; runtime uses the `@prisma/adapter-pg` driver
  adapter (see `src/lib/prisma.ts`). CLI URL lives in `prisma.config.ts`.
- **shadcn/ui is on Base UI, not Radix**: compose with the `render` prop (e.g.
  `<DialogTrigger render={<Button />}>`), not `asChild`. Select `onValueChange`
  yields `string | null`.
- **Auth.js v5**: config is split — `src/auth.config.ts` (edge-safe, used by the
  proxy) and `src/auth.ts` (Credentials + Prisma + bcrypt, Node only).
- All mutations are **Server Actions** in `app/**/actions.ts`, each starting
  with `requireMembership()` + a `can(membership, action)` check
  (`src/lib/permissions.ts`). Never trust client-side role checks.
