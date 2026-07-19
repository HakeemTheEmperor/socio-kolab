# Platform Sign-up + Email Verification + Password Reset — implementation plan

Standalone account creation at `/signup` (no club membership involved), with
**hard-gate email verification**: an unverified account cannot sign in at all.
Verification works by emailing a single-use link; clicking it marks the account
verified and lands the user on the login page. The same token machinery (in a
separate token slot) powers **password reset** (§9).

Read alongside AGENTS.md — everything below follows the existing conventions
(Server Actions, zod validation in `src/lib/validations/`, edge-safe
`auth.config.ts` vs Node `auth.ts`).

---

## 1. Data model (Prisma)

### 1.1 `User.emailVerified`

```prisma
model User {
  // ...existing fields
  emailVerified DateTime?   // null = not verified; hard gate blocks login
}
```

`DateTime?` (not boolean) — records *when*, matches the Auth.js convention, and
`null` reads naturally as "never".

### 1.2 Single verification token, stored on `User`

One live token per user, as three nullable columns — no separate table:

```prisma
model User {
  // ...existing fields
  verificationTokenHash   String?   @unique // sha256 of the raw token; raw value is never stored
  verificationTokenSentAt DateTime? // drives the resend throttle
  verificationTokenExpiry DateTime?
}
```

- **Hashed at rest**: the email contains the raw token; the DB stores only
  `sha256(raw)`. A leaked DB row cannot verify an account.
- **One token per user by construction**: issuing a new token overwrites the
  columns, which invalidates the previous link with no delete-then-insert
  dance. (A resend always invalidates prior links; only the newest works.)
- The `@unique` on a nullable column is fine in Postgres — NULLs don't collide.
- The three columns travel together: all set, or all null (cleared on consume).

Password reset gets its own, parallel slot (§9) — **never shared** with
verification, so a verification resend can't silently kill a pending reset
link or vice versa:

```prisma
model User {
  // ...existing fields
  resetTokenHash   String?   @unique
  resetTokenSentAt DateTime?
  resetTokenExpiry DateTime?
}
```

### 1.3 Migration + backfill (critical for hard gate)

One migration, two steps:

1. Add the seven columns (`emailVerified` + the verification token trio + the
   reset token trio).
2. **Backfill `emailVerified = createdAt` (or `now()`) for every existing user.**

Without the backfill, the hard gate locks out every seeded, imported, and
club-registered user the moment it ships. Also update:

- `prisma/seed.ts`, `prisma/seed.prod.ts` — create users with
  `emailVerified: new Date()`.
- `scripts/import-members.ts` — imported users get `emailVerified: new Date()`
  (an operator vouched for the address; they already carry
  `mustChangePassword`).

---

## 2. Token lifecycle (`src/lib/verification.ts`)

Small module, written generically over a token *slot* (which trio of columns)
so verification and reset (§9) share one implementation:

- `createVerificationToken(userId)` —
  `crypto.randomBytes(32).toString("base64url")` for the raw token; write
  `verificationTokenHash = sha256(raw)`, `verificationTokenSentAt = now()`,
  `verificationTokenExpiry = now() + 24h` onto the user. Overwriting the
  columns *is* the invalidation of any previous link.
- `consumeVerificationToken(raw)` — one atomic guarded update:
  `updateMany({ where: { verificationTokenHash: sha256(raw), verificationTokenExpiry: { gt: now() } }, data: { emailVerified: now(), verificationTokenHash: null, verificationTokenSentAt: null, verificationTokenExpiry: null } })`.
  `count === 1` → success; `count === 0` → invalid/expired/already-used —
  the caller shows "link invalid or expired" with a re-request path. The
  guarded update makes double-consume impossible without an explicit
  transaction.
- **Resend throttle**: refuse a new token if `verificationTokenSentAt` is
  `< 60s` old (no extra infra).

Unit-test this module (vitest is already set up): hashing round-trip, expiry,
single-use, throttle.

---

## 3. Email sending (`src/lib/email.ts`)

New infrastructure — the app currently sends no mail.

- **Provider: Resend**, called via plain `fetch` to `https://api.resend.com/emails`
  (no SDK dependency needed).
- **Console fallback for dev**: when `RESEND_API_KEY` is unset, log the
  verification URL to the server console instead of sending. Development and CI
  must never require a mail provider.
- Two functions: `sendVerificationEmail(to, name, verifyUrl)` and
  `sendPasswordResetEmail(to, name, resetUrl)` — plain-text + minimal HTML
  body, from `EMAIL_FROM`.

**Env vars** (document in README + `.env.example`):

| var | purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key; unset → console mode |
| `EMAIL_FROM` | e.g. `Club Portal <noreply@yourdomain>` (domain must be verified in Resend / SPF+DKIM) |
| `APP_URL` | absolute origin for building the link, e.g. `https://portal.example.com` |

---

## 4. Routes & UI

All under `src/app/(public)/` (same group as `/login`).

### 4.1 `/signup` — page + form + action

- `signup/page.tsx` — card shell like the login page (no club branding — this
  is the platform's own door).
- `signup/signup-form.tsx` — client component, `useActionState`, fields:
  **name, email, password** (+ confirm password, validated client+server).
- `signup/actions.ts` — `signupAction`:
  1. Validate with `signupSchema` (new, in `src/lib/validations/auth.ts` —
     reuse the name/email/password pieces of `registerSchema`).
  2. If the email already exists → explicit error
     "An account with this email already exists — sign in instead."
     (Matches the existing per-club behaviour; the app already discloses
     account existence there, so a generic message here would protect nothing.)
  3. `bcrypt.hash(password, 10)` → `prisma.user.create` with
     `emailVerified: null`.
  4. Create token, send verification email.
  5. **Do NOT `signIn`** (hard gate). Return `{ sent: { email } }` and render
     a "Check your email" state in place of the form, with a **Resend** button
     (calls a `resendVerificationAction`, subject to the 60s throttle,
     always responds "sent" regardless of outcome).

### 4.2 `/verify-email` — the link target

`verify-email/route.ts` (GET route handler) or a page — **use a page**
(`verify-email/page.tsx` reading `searchParams` — remember: Promise in Next 16)
so mail-client link prefetchers hitting the URL still render something and the
consume happens in the page's server render exactly once per real visit.

- URL shape: `${APP_URL}/verify-email?token=<raw>`.
- Valid token → consume, then render success + "Sign in" button
  (link to `/login?verified=1`).
- Invalid/expired → render failure state with an email input to request a
  fresh link (posts to `resendVerificationAction`).
- No auto-login on verify: Credentials-only auth has no way to mint a session
  without the password, and silently creating one by hand would bypass
  `authorize()`. One extra login after verifying is acceptable.

### 4.3 Login page changes

- `login/login-form.tsx` — add a "Don't have an account? **Sign up**" link
  (replaces the current comment explaining why there's no register link) and a
  "**Forgot password?**" link to `/forgot-password` (§9).
- Show a success notice when `?verified=1` (and `?reset=1` after a password
  reset).
- Show the **unverified** error state (see §5) with an inline "Resend
  verification email" action.

---

## 5. Hard gate in auth

Two coordinated changes:

### 5.1 `src/auth.ts` — `authorize()`

After the bcrypt check passes (order matters — never reveal verification
status for a wrong password, or it becomes an account-existence oracle):

```ts
if (!user.emailVerified) throw new EmailNotVerifiedError();
```

Where `EmailNotVerifiedError extends CredentialsSignin` with
`code = "email_not_verified"` (Auth.js v5 pattern — the code survives to the
caller; **verify against `node_modules/next/dist/docs/` + the installed
next-auth beta before relying on it**, and fall back to the loginAction-side
check below if the beta swallows custom codes).

### 5.2 `login/actions.ts` — `loginAction`

Distinguish the two failures:

- `CredentialsSignin` with `code === "email_not_verified"` →
  `{ error: "verify", email }` → form renders "Verify your email first" +
  resend button.
- Any other `AuthError` → the existing "Invalid email or password."

Fallback if custom codes don't propagate through the installed beta: on
`AuthError`, re-check `email + password + emailVerified` directly in the
action (it already runs on the server with Prisma access) to pick the message.

### 5.3 What does NOT change

`auth.config.ts` / the proxy stay untouched: an unverified user can never get
a JWT (blocked in `authorize`), so no per-request `emailVerified` check is
needed anywhere else. That's the payoff of the hard gate.

---

## 6. Ripple: the per-club registration flow

`/[clubSlug]/register`'s `registerAction` currently creates a user **and signs
them in immediately**. Under a hard gate that's inconsistent — it would be a
verification bypass.

Change `registerAction` to match:

1. Create user (`emailVerified: null`) + PENDING membership as today.
2. Send verification email; **drop the auto-`signIn`**.
3. Return a "Check your email to finish setting up your account — your
   application to {club} is already in" state.

`joinClubAction` is untouched (the user is already signed in, hence already
verified). Membership approval by execs is independent of email verification —
both must complete before the member gets in, in either order.

---

## 7. Proxy

`authorized()` in `src/auth.config.ts`: allow the new public paths for
signed-out visitors:

- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password`

(Signed-in visitors hitting `/signup` or `/forgot-password` → redirect to
`/clubs`, same treatment as `/login`. `/verify-email` and `/reset-password`
stay reachable when signed in — harmless, and a user may open the link in a
browser with an old session.)

---

## 8. Validation (`src/lib/validations/auth.ts`)

```ts
export const signupSchema = z
  .object({
    name: /* reuse */, email: /* reuse */, password: /* reuse, min 8 */,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match.", path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email: /* reuse */ });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: /* reuse, min 8 */,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match.", path: ["confirmPassword"],
  });
```

---

## 9. Password reset flow

Same machinery as verification (§2's slot-generic token lib + §3's email lib),
with its own token slot (§1.2) and **stricter disclosure rules** — unlike
signup, a reset request must never confirm whether an email has an account
(reset is the classic account-enumeration oracle).

### 9.1 `/forgot-password` — request a link

- `forgot-password/page.tsx` + form (single email field) + action, under
  `(public)`.
- `forgotPasswordAction`:
  1. Validate email shape.
  2. Look up the user. **Whatever the outcome — no account, throttled, or
     sent — respond identically**: "If an account exists for that address,
     we've sent a reset link."
  3. If the user exists and the 60s throttle allows: issue a token into the
     **reset slot** with a **1-hour expiry** (shorter than verification's 24h —
     a reset link is a credential, a verify link is a formality), and send
     `sendPasswordResetEmail` with `${APP_URL}/reset-password?token=<raw>`.
  4. Works for **unverified** accounts too — see 9.3.

### 9.2 `/reset-password?token=…` — set the new password

- `reset-password/page.tsx` — reads `searchParams` (a Promise — `await` it).
  Renders a new-password + confirm form with the token in a hidden field. The
  token is **not consumed on page view** (mail-client prefetchers must not
  burn it); consumption happens only on the form POST.
- `resetPasswordAction`:
  1. Validate with `resetPasswordSchema`.
  2. Atomic guarded update, same shape as §2's consume:
     `updateMany({ where: { resetTokenHash: sha256(token), resetTokenExpiry: { gt: now() } }, data: { passwordHash: await bcrypt.hash(password, 10), resetTokenHash: null, resetTokenSentAt: null, resetTokenExpiry: null, mustChangePassword: false } })`
     (+ `emailVerified` — see 9.3). `count === 1` → success; `count === 0` →
     "This link is invalid or has expired" with a link back to
     `/forgot-password`.
  3. On success redirect to `/login?reset=1`. **No auto-login** — same
     rationale as `/verify-email` (§4.2).
- Clearing `mustChangePassword` is deliberate: the imported-member flag means
  "prove you chose your own password", and a reset does exactly that.

### 9.3 A completed reset also verifies the email

On successful reset, set `emailVerified = now()` if it was still null:
clicking a link mailed to the address is exactly the proof verification asks
for. Without this, an unverified user who resets their password stays locked
out by the hard gate (§5) with no path forward.

### 9.4 Deliberately out of scope

- **No "your password was changed" notification email** — a follow-up once
  templates grow beyond two.

(Session invalidation on password change *is* in scope — handled by the Redis
session allowlist, §10.)

---

## 10. Session invalidation — Redis session allowlist

The verification/reset tokens above are single-use by construction (§2), but
session JWTs are stateless: nothing today can revoke one before its 30-day
expiry. Fix: pair every JWT with a server-side session id in Redis, checked on
every request. Deleting the Redis key kills the session immediately.

### 10.1 Design

- **On sign-in** (`jwt` callback, `if (user)` branch): mint a session id
  (`crypto.randomUUID()`), stamp it into the token as `token.jti`, and write it
  to Redis:
  - Key: `user_token:${userId}`
  - Value: the session id
  - TTL: the session `maxAge` (Auth.js default 30d), so Redis never outlives
    the JWT and abandoned keys clean themselves up.
- **One session per user, by design**: the key is per-*user*, not per-token,
  so a new login overwrites the value — the previous device's JWT now carries
  a stale `jti` and is dead on its next request. This is the intended
  behaviour, not a limitation.
- **On every request** (`jwt` callback, refresh branch): `GET
  user_token:${userId}` and compare with `token.jti`. Mismatch or missing key →
  return `null` — Auth.js drops the session and the proxy's `authorized()`
  sees a signed-out visitor. No separate check in `session()` or the proxy;
  the `jwt` callback runs for both, once is enough.
- **On logout**: delete the key in the `signOut` event.
- **On password reset**: `resetPasswordAction` (§9.2) deletes the key after
  the guarded update succeeds — a successful reset signs out every existing
  session. This closes the gap §9.4 used to defer.

### 10.2 Edge constraint → client choice

The `jwt` callback executes inside the proxy (edge runtime), so the Redis
client must be edge-safe: **`@upstash/redis`** (REST over fetch, no TCP).
`ioredis`/`node-redis` will not run there. Small wrapper in
`src/lib/session-store.ts` (edge-safe, no Prisma/bcrypt imports — same rule as
`auth.config.ts`) with `setSession(userId, jti)`, `getSession(userId)`,
`clearSession(userId)`.

**Env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. When
unset (dev/CI), the wrapper becomes a no-op that always reports "valid" — the
app must never require Redis locally, mirroring §3's console-mode email.

### 10.3 Failure mode: fail-open

If the Redis call throws (outage, timeout), **log a warning and treat the
session as valid**. Fail-closed would turn any Redis blip into a full lockout
of every user; for this app, revocation silently pausing during an outage is
the better trade. The warning must be loud enough to notice
(`console.error` with a distinct prefix, e.g. `[session-store]`).

### 10.4 Cost

One Redis round-trip per matched request through the proxy (single-digit ms
via Upstash REST from edge). That is the price of making stateless JWTs
revocable, paid only once per request by keeping the check solely in the
`jwt` callback.

---

## 11. Build order

Each step leaves the app working, 7 steps. After each, commit with the message
shown (do not squash — one commit per step keeps the gate's dependency order
legible in history):

1. **Schema + migration + backfill** (§1) — inert until the gate lands.
   > `feat(auth): add emailVerified + verification/reset token columns`
   >
   > Adds seven nullable User columns: emailVerified (DateTime, null =
   > unverified) plus two never-shared token slots — verification and
   > reset — each a unique hash + sentAt + expiry, so tokens are stored
   > hashed-at-rest and a resend on one slot can't disturb the other.
   >
   > The migration backfills emailVerified = createdAt for every existing
   > row before the unique indexes are added, so the later hard gate (§5)
   > can't lock out any seeded, imported, or already-registered user.
   >
   > Seeds (seed.ts, seed.prod.ts) and the member importer set
   > emailVerified at creation, since an operator has already vouched for
   > those addresses. Columns are inert until the gate lands.
2. **Token lib + tests** (§2), **email lib** (§3, console mode first).
   > `feat(auth): add slot-generic token lib and Resend email sender`
   >
   > Single-use, hashed-at-rest tokens with 60s resend throttle (vitest
   > covered); email sender via Resend with a console fallback so dev/CI
   > need no mail provider.
3. **`/signup` + `/verify-email` pages/actions** (§4.1–4.2), proxy allowlist (§7).
   > `feat(auth): add signup and email-verification flow`
   >
   > Public /signup and /verify-email pages plus their actions, with the
   > proxy allowlist opening the new public paths. No hard gate yet.
4. **Hard gate** (§5) + login-page states (§4.3) — *only after 1–3 are in*,
   since the gate depends on backfill and on a working verify path.
   > `feat(auth): hard-gate login on email verification`
   >
   > authorize() rejects unverified accounts after the bcrypt check;
   > loginAction distinguishes the unverified state and offers resend.
5. **Per-club register flow alignment** (§6) + **password reset** (§9) — reset
   reuses step 2's machinery and must ship before (or with) the hard gate
   reaches real users, since the gate makes "forgot my password" otherwise
   dead-ended.
   > `feat(auth): align club register with gate and add password reset`
   >
   > registerAction drops its auto-signIn and sends a verification email;
   > adds /forgot-password and /reset-password (non-disclosing, 1h token,
   > a completed reset also verifies the email).
6. **Session allowlist** (§10): `session-store.ts` wrapper (no-op without env),
   `jwt`-callback mint + check, `signOut` delete, reset-action delete.
   > `feat(auth): add Redis session allowlist for JWT revocation`
   >
   > Mints a session id per JWT and validates it against Upstash in the
   > jwt callback (edge-safe, fail-open, one session per user). Logout and
   > password reset now revoke the session; no-op without Redis env.
7. **Wrap-up**: seeds/import updates (§1.3), README + `.env.example` (email +
   Redis vars), DECISIONS.md entry (hard vs. soft gate, token hashing, Resend,
   reset≡verify, one-session-per-user + fail-open rationale), and the manual
   verify pass: signup → console link → verify → login; unverified login
   blocked with resend; expired/reused token; throttle; forgot → reset → login
   (reset of an unverified account verifies it; reset response identical for
   unknown emails); second login kills the first session; logout + revoked
   session bounce to `/login`; existing seeded users still log in.
   > `docs(auth): document signup/verification/reset + env and decisions`
   >
   > README and .env.example gain the email and Redis vars; DECISIONS.md
   > records the hard-gate, token-hashing, Resend, reset≡verify, and
   > one-session-per-user + fail-open rationale. Closes the manual pass.

## 12. Known risks / accepted trade-offs

- **Deliverability is the whole ballgame** for a hard gate: a spam-foldered
  mail = a locked-out user. Mitigations: verified sending domain (SPF/DKIM) in
  Resend before launch, prominent resend affordance, 24h token life.
- **Revocation depends on Redis being up** (§10.3 fail-open): during an
  Upstash outage, revoked sessions keep working until the outage ends. Accepted
  — the alternative (fail-closed) turns any blip into a sitewide lockout.
- **One session per user** (§10.1) means signing in on a second device logs
  out the first. Deliberate; if multi-device is ever wanted, the key flips to
  per-session (`session:${jti}` → userId) without touching the JWT shape.
- **Dev/CI run with the no-op session store** (§10.2): revocation paths are
  only truly exercised against a real Upstash instance — cover them in the
  step-7 manual pass, not just unit tests.
- Email-existence disclosure on signup is accepted for UX, consistent with the
  existing per-club flow. **Reset does not disclose** (§9.1) — the asymmetry
  is intentional: signup discloses to help a returning user, reset would
  disclose to an attacker.
- `next-auth` is a v5 **beta**; §5.1's custom-error-code behaviour must be
  smoke-tested against the installed version (fallback documented in §5.2).
