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

- **No session invalidation on password change.** Sessions are stateless JWTs;
  existing sessions live until expiry. Revoking them needs a token-generation
  field checked per request — noted in §11, not built now.
- **No "your password was changed" notification email** — a follow-up once
  templates grow beyond two.

---

## 10. Build order

Each step leaves the app working:

1. **Schema + migration + backfill** (§1) — inert until the gate lands.
2. **Token lib + tests** (§2), **email lib** (§3, console mode first).
3. **`/signup` + `/verify-email` pages/actions** (§4.1–4.2), proxy allowlist (§7).
4. **Hard gate** (§5) + login-page states (§4.3) — *only after 1–3 are in*,
   since the gate depends on backfill and on a working verify path.
5. **Per-club register flow alignment** (§6).
6. **Password reset** (§9) — pure reuse of steps 1–2's machinery; can land
   any time after step 2, but must ship before (or with) the hard gate reaches
   real users, since the gate makes "forgot my password" otherwise dead-ended.
7. Seeds/import updates (§1.3), README + `.env.example`, DECISIONS.md entry
   (hard vs. soft gate rationale, token hashing, Resend choice, reset≡verify).
8. Manual verify pass: signup → console link → verify → login;
   unverified login blocked with resend; expired/reused token; throttle;
   forgot → reset → login (and reset of an unverified account verifies it);
   reset response identical for unknown emails; existing seeded users still
   log in.

## 11. Known risks / accepted trade-offs

- **Deliverability is the whole ballgame** for a hard gate: a spam-foldered
  mail = a locked-out user. Mitigations: verified sending domain (SPF/DKIM) in
  Resend before launch, prominent resend affordance, 24h token life.
- **Password changes don't revoke existing sessions** (stateless JWTs, §9.4).
  Acceptable at this scale; the fix (a per-user token generation checked in the
  `session`/`jwt` callback) is a known follow-up.
- Email-existence disclosure on signup is accepted for UX, consistent with the
  existing per-club flow. **Reset does not disclose** (§9.1) — the asymmetry
  is intentional: signup discloses to help a returning user, reset would
  disclose to an attacker.
- `next-auth` is a v5 **beta**; §5.1's custom-error-code behaviour must be
  smoke-tested against the installed version (fallback documented in §5.2).
